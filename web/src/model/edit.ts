/**
 * Pure model-edit helpers — model in, new model out (immutable). No Fabric/DOM.
 *
 * The editor (Fabric) is only a view; every user action routes through one of
 * these so the JSON model stays the single source of truth (CLAUDE.md §5). Each
 * returns a NEW model (structural sharing where cheap) so undo/redo can snapshot.
 */
import type { LayoutModel, Element, Duct, Group, Library } from "./types";
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
    return { ...model, elements: model.elements.map((e) => (e.id === id ? { ...e, x_mm, y_mm } : e)) };
  }
  if (kind === "duct") {
    return { ...model, ducts: model.ducts.map((d) => (d.id === id ? { ...d, x_mm, y_mm } : d)) };
  }
  if (kind === "group") {
    return { ...model, groups: model.groups.map((g) => (g.id === id ? { ...g, x_mm, y_mm } : g)) };
  }
  return model;
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

export function updateGroup(model: LayoutModel, id: string, patch: Partial<Group>): LayoutModel {
  return { ...model, groups: model.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) };
}

/** Delete an entity; also drops labels anchored to it and clears group refs. */
export function deleteEntity(model: LayoutModel, kind: EntityKind, id: string): LayoutModel {
  const anchor = `${kind}:${id}`;
  const labels = model.labels.filter((l) => l.anchor !== anchor && l.id !== (kind === "label" ? id : ""));
  if (kind === "element") {
    return { ...model, elements: model.elements.filter((e) => e.id !== id), labels };
  }
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
