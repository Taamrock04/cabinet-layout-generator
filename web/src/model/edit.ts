/**
 * Pure model-edit helpers — model in, new model out (immutable). No Fabric/DOM.
 *
 * The editor (Fabric) is only a view; every user action routes through one of
 * these so the JSON model stays the single source of truth (CLAUDE.md §5). Each
 * returns a NEW model (structural sharing where cheap) so undo/redo can snapshot.
 */
import type { LayoutModel, Element, Duct, Group, Label, Library } from "./types";
import { libItemSize } from "./resolve";
import { rotatedFootprint } from "./geometry";

export type EntityKind = "element" | "duct" | "group" | "label";

let _uid = 0;
function uid(prefix: string): string {
  _uid += 1;
  return `${prefix}_${Date.now().toString(36)}_${_uid}`;
}

/** Round to a grid step (e.g. 1mm when snap is on, 0.1mm for fine). */
export function snap(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

/** Add a library item as a new element at (x,y) (defaults near plate top-left). */
export function addElement(
  model: LayoutModel,
  libKey: string,
  library: Library,
  x_mm?: number,
  y_mm?: number,
): { model: LayoutModel; id: string } {
  const item = library[libKey];
  const id = uid("e");
  // place just inside the left side-duct by default
  const sideDuct = model.ducts.find((d) => d.x_mm === 0);
  const px = x_mm ?? (sideDuct ? sideDuct.width_mm + 10 : 10);
  const py = y_mm ?? 10;
  const el: Element = {
    id,
    lib_key: libKey,
    tag: "",
    x_mm: px,
    y_mm: py,
    rot_deg: 0,
    gap_before_mm: model.defaults.gap_between_equipment_mm,
    clearance_to_duct_mm: model.defaults.clearance_equipment_to_duct_mm,
    group_id: null,
    locked: false,
  };
  // keep size resolvable even if caller passes an unknown key (validation flags it)
  void (item && libItemSize(item));
  return { model: { ...model, elements: [...model.elements, el] }, id };
}

export function moveEntity(
  model: LayoutModel,
  kind: EntityKind,
  id: string,
  x_mm: number,
  y_mm: number,
): LayoutModel {
  if (kind === "element") {
    const moved = model.elements.find((e) => e.id === id);
    if (!moved) return model;
    // a paired element drags its pair-mates (the locked unit) by the same delta
    const dx = x_mm - moved.x_mm;
    const dy = y_mm - moved.y_mm;
    const pid = moved.pair_id ?? null;
    return {
      ...model,
      elements: model.elements.map((e) => {
        if (e.id === id) return { ...e, x_mm, y_mm };
        if (pid && e.pair_id === pid) return { ...e, x_mm: +(e.x_mm + dx).toFixed(2), y_mm: +(e.y_mm + dy).toFixed(2) };
        return e;
      }),
    };
  }
  if (kind === "duct") {
    return { ...model, ducts: model.ducts.map((d) => (d.id === id ? { ...d, x_mm, y_mm } : d)) };
  }
  if (kind === "group") {
    return { ...model, groups: model.groups.map((g) => (g.id === id ? { ...g, x_mm, y_mm } : g)) };
  }
  if (kind === "label") {
    // labels store an offset from their anchor; convert the dropped absolute pos
    const label = model.labels.find((l) => l.id === id);
    if (!label) return model;
    const host = anchorHost(model, label.anchor);
    const dx = host ? x_mm - host.x_mm : x_mm;
    const dy = host ? y_mm - host.y_mm : y_mm;
    return { ...model, labels: model.labels.map((l) => (l.id === id ? { ...l, dx_mm: +dx.toFixed(2), dy_mm: +dy.toFixed(2) } : l)) };
  }
  return model;
}

/** Resolve a label anchor ("element:id" / "group:id") to its host position. */
export function anchorHost(model: LayoutModel, anchor: string): { x_mm: number; y_mm: number } | null {
  const [kind, refId] = anchor.split(":");
  if (kind === "element") return model.elements.find((e) => e.id === refId) ?? null;
  if (kind === "group") return model.groups.find((g) => g.id === refId) ?? null;
  return null;
}

/** Rotate an element or group to a specific angle (normalized to [0,360)). */
export function setRotation(model: LayoutModel, kind: EntityKind, id: string, deg: number): LayoutModel {
  const rot = ((deg % 360) + 360) % 360;
  if (kind === "element") {
    return { ...model, elements: model.elements.map((e) => (e.id === id ? { ...e, rot_deg: rot } : e)) };
  }
  if (kind === "group") {
    return { ...model, groups: model.groups.map((g) => (g.id === id ? { ...g, rot_deg: rot } : g)) };
  }
  return model;
}

export function updateElement(model: LayoutModel, id: string, patch: Partial<Element>): LayoutModel {
  return { ...model, elements: model.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) };
}

export function updateDuct(model: LayoutModel, id: string, patch: Partial<Duct>): LayoutModel {
  return { ...model, ducts: model.ducts.map((d) => (d.id === id ? { ...d, ...patch } : d)) };
}

/** Inner edges between the left and right vertical (side) ducts. */
function sideInnerEdges(model: LayoutModel): { innerLeft: number; innerRight: number } {
  const verts = model.ducts.filter((d) => d.rot_deg % 180 !== 0);
  const leftV = verts.find((d) => d.x_mm === 0) ?? [...verts].sort((a, b) => a.x_mm - b.x_mm)[0];
  const rightV = verts.length ? verts.reduce((m, d) => (d.x_mm > m.x_mm ? d : m)) : null;
  return {
    innerLeft: leftV ? leftV.x_mm + leftV.width_mm : 0,
    innerRight: rightV ? rightV.x_mm : model.plate.width_mm,
  };
}

/** Add a wire duct. Horizontal row ducts auto-span between the side ducts. */
export function addDuct(model: LayoutModel, orientation: "horizontal" | "vertical"): { model: LayoutModel; id: string } {
  const id = uid("d");
  let duct: Duct;
  if (orientation === "horizontal") {
    const hd = model.ducts.filter((d) => d.rot_deg % 180 === 0).sort((a, b) => a.y_mm - b.y_mm);
    const last = hd[hd.length - 1];
    const y = last ? last.y_mm + last.width_mm + 200 : 100; // 200mm default row below the last
    const { innerLeft, innerRight } = sideInnerEdges(model);
    duct = { id, x_mm: innerLeft, y_mm: y, length_mm: Math.max(100, +(innerRight - innerLeft).toFixed(2)), width_mm: 40, label_h_mm: 60, rot_deg: 0 };
  } else {
    duct = { id, x_mm: Math.round(model.plate.width_mm / 2), y_mm: 0, length_mm: model.plate.height_mm, width_mm: 60, label_h_mm: 60, rot_deg: 90 };
  }
  return { model: { ...model, ducts: [...model.ducts, duct] }, id };
}

/** Re-span a horizontal duct exactly between the side ducts (the "Fit width" action). */
export function fitDuctWidth(model: LayoutModel, ductId: string): LayoutModel {
  const d = model.ducts.find((x) => x.id === ductId);
  if (!d || d.rot_deg % 180 !== 0) return model; // horizontal only
  const { innerLeft, innerRight } = sideInnerEdges(model);
  return updateDuct(model, ductId, { x_mm: innerLeft, length_mm: Math.max(0, +(innerRight - innerLeft).toFixed(2)) });
}

/** Snap a duct's drawn thickness to the standard faces {30,40,60}. (brief §7 Req5) */
export function snapDuctThickness(v: number): number {
  return [30, 40, 60].reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
}

/**
 * Convert a resized duct's box (from an edge drag) to length + thickness.
 * Length runs along the orientation (free); thickness snaps to a standard face.
 */
export function ductDimsFromBox(rotDeg: number, boxW: number, boxH: number): { length_mm: number; width_mm: number } {
  const horizontal = rotDeg % 180 === 0;
  const length = horizontal ? boxW : boxH;
  const thickness = snapDuctThickness(horizontal ? boxH : boxW);
  return { length_mm: +length.toFixed(1), width_mm: thickness };
}

export function updateGroup(model: LayoutModel, id: string, patch: Partial<Group>): LayoutModel {
  return { ...model, groups: model.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) };
}

/** Step an auto-tag like "B101" by n (keeps the prefix and zero-pad width). */
export function stepTag(start: string, n: number): string {
  const m = start.match(/^(.*?)(\d+)$/);
  if (!m) return n === 0 ? start : `${start}${n}`;
  const [, prefix, digits] = m;
  const next = parseInt(digits, 10) + n;
  return `${prefix}${String(next).padStart(digits.length, "0")}`;
}

/** Add a Set (group of `count` identical parts, optionally auto-tagged). */
export function addSet(
  model: LayoutModel,
  libKey: string,
  count: number,
  opts: { internal_gap_mm?: number; tag_start?: string | null; tag_step?: number; x_mm?: number; y_mm?: number } = {},
): { model: LayoutModel; id: string } {
  const id = uid("g");
  const sideDuct = model.ducts.find((d) => d.x_mm === 0);
  const group: Group = {
    id, kind: "set", lib_key: libKey, count: Math.max(1, Math.floor(count)),
    internal_gap_mm: opts.internal_gap_mm ?? model.defaults.gap_between_equipment_mm,
    tag_start: opts.tag_start ?? null, tag_step: opts.tag_step ?? 1,
    x_mm: opts.x_mm ?? (sideDuct ? sideDuct.width_mm + 10 : 10),
    y_mm: opts.y_mm ?? 10, rot_deg: 0, exploded: false, label_id: null,
  };
  return { model: { ...model, groups: [...model.groups, group] }, id };
}

/**
 * Explode a Set into individual elements (positioned left→right with the set's
 * internal gap, auto-tagged from tag_start). The group is removed; a label
 * anchored to it is re-pointed to the first element.
 */
export function explodeGroup(model: LayoutModel, groupId: string, library: Library): LayoutModel {
  const g = model.groups.find((x) => x.id === groupId);
  if (!g) return model;
  const item = library[g.lib_key];
  const size = item ? libItemSize(item) : { w: 10, h: 10 };
  const fw = rotatedFootprint(size, g.rot_deg).w;

  const newEls: Element[] = [];
  let x = g.x_mm;
  for (let i = 0; i < g.count; i += 1) {
    newEls.push({
      id: uid("e"), lib_key: g.lib_key,
      tag: g.tag_start ? stepTag(g.tag_start, i * g.tag_step) : "",
      x_mm: +x.toFixed(2), y_mm: g.y_mm, rot_deg: g.rot_deg,
      gap_before_mm: i === 0 ? model.defaults.gap_between_equipment_mm : g.internal_gap_mm,
      clearance_to_duct_mm: model.defaults.clearance_equipment_to_duct_mm,
      group_id: null, locked: false,
    });
    x += fw + g.internal_gap_mm;
  }

  const firstId = newEls[0]?.id;
  const labels = model.labels.map((l) =>
    l.anchor === `group:${groupId}` && firstId ? { ...l, anchor: `element:${firstId}` as const } : l,
  );
  return {
    ...model,
    groups: model.groups.filter((x) => x.id !== groupId),
    elements: [...model.elements, ...newEls],
    labels,
  };
}

/** Create a stopper label anchored to an element or group. */
export function addLabel(model: LayoutModel, kind: "element" | "group", refId: string): { model: LayoutModel; id: string } {
  const id = uid("L");
  const label: Label = { id, text: "LABEL", anchor: `${kind}:${refId}`, dx_mm: 0, dy_mm: -8, rot_deg: 0 };
  return { model: { ...model, labels: [...model.labels, label] }, id };
}

export function updateLabel(model: LayoutModel, id: string, patch: Partial<Label>): LayoutModel {
  return { ...model, labels: model.labels.map((l) => (l.id === id ? { ...l, ...patch } : l)) };
}

/** Delete an entity; also drops labels anchored to it and clears group refs. */
export function deleteEntity(model: LayoutModel, kind: EntityKind, id: string): LayoutModel {
  if (kind === "element") {
    // deleting one of a locked pair removes the whole unit (no orphan label)
    const target = model.elements.find((e) => e.id === id);
    const pid = target?.pair_id ?? null;
    const removeIds = new Set<string>([id]);
    if (pid) for (const e of model.elements) if (e.pair_id === pid) removeIds.add(e.id);
    const labels = model.labels.filter((l) => {
      const [k, ref] = l.anchor.split(":");
      return !(k === "element" && removeIds.has(ref));
    });
    return { ...model, elements: model.elements.filter((e) => !removeIds.has(e.id)), labels };
  }
  const anchor = `${kind}:${id}`;
  const labels = model.labels.filter((l) => l.anchor !== anchor && l.id !== (kind === "label" ? id : ""));
  if (kind === "duct") {
    return { ...model, ducts: model.ducts.filter((d) => d.id !== id), labels };
  }
  if (kind === "group") {
    return { ...model, groups: model.groups.filter((g) => g.id !== id), labels };
  }
  if (kind === "label") {
    return { ...model, labels: model.labels.filter((l) => l.id !== id) };
  }
  return model;
}

/** Footprint (rotated) of an element, for hit-boxes and snap math. */
export function elementFootprint(el: Element, library: Library): { w: number; h: number } {
  const item = library[el.lib_key];
  if (!item) return { w: 10, h: 10 };
  return rotatedFootprint(libItemSize(item), el.rot_deg);
}
