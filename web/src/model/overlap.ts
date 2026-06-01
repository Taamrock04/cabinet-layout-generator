/**
 * Overlap detection among placed entities (elements, ducts, sets).
 *
 * Nothing on the plate should physically overlap. Per the warn-but-allow rule
 * (CLAUDE.md §2) we DETECT and surface overlaps — the validation panel lists them
 * and the canvas highlights them — without blocking the edit. Labels are ignored
 * (not physical). Touching edges do NOT count (boxesOverlap is strict), so the
 * default 0.1mm gaps and edge-to-edge ducts are fine.
 */
import type { LayoutModel, Library } from "./types";
import { rotatedFootprint, boxesOverlap, type Box } from "./geometry";
import { libItemSize } from "./resolve";
import type { EntityKind } from "./edit";

export interface PlacedBox {
  kind: EntityKind;
  id: string;
  label: string;
  box: Box;
}

export interface OverlapPair {
  a: { kind: EntityKind; id: string; label: string };
  b: { kind: EntityKind; id: string; label: string };
}

export interface OverlapResult {
  pairs: OverlapPair[];
  /** Ids of every entity involved in at least one overlap (for highlighting). */
  ids: Set<string>;
}

/** Axis-aligned footprint boxes for everything physical on the plate. */
export function placedBoxes(model: LayoutModel, library: Library): PlacedBox[] {
  const out: PlacedBox[] = [];

  for (const el of model.elements) {
    const item = library[el.lib_key];
    const size = item ? libItemSize(item) : { w: 10, h: 10 };
    const f = rotatedFootprint(size, el.rot_deg);
    out.push({
      kind: "element", id: el.id,
      label: el.tag || item?.name || el.lib_key,
      box: { x: el.x_mm, y: el.y_mm, w: f.w, h: f.h },
    });
  }

  for (const d of model.ducts) {
    const horizontal = d.rot_deg % 180 === 0;
    const w = horizontal ? d.length_mm : d.width_mm;
    const h = horizontal ? d.width_mm : d.length_mm;
    out.push({
      kind: "duct", id: d.id, label: `duct ${d.id}`,
      box: { x: d.x_mm, y: d.y_mm, w, h },
    });
  }

  for (const g of model.groups) {
    const item = library[g.lib_key];
    if (!item) continue;
    const f = rotatedFootprint(libItemSize(item), g.rot_deg);
    const total = g.count * f.w + (g.count - 1) * g.internal_gap_mm;
    out.push({
      kind: "group", id: g.id, label: `set ${item.name}`,
      box: { x: g.x_mm, y: g.y_mm, w: total, h: f.h },
    });
  }

  return out;
}

export function findOverlaps(model: LayoutModel, library: Library): OverlapResult {
  const boxes = placedBoxes(model, library);
  const pairs: OverlapPair[] = [];
  const ids = new Set<string>();

  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      if (boxesOverlap(a.box, b.box)) {
        pairs.push({
          a: { kind: a.kind, id: a.id, label: a.label },
          b: { kind: b.kind, id: b.id, label: b.label },
        });
        ids.add(a.id);
        ids.add(b.id);
      }
    }
  }
  return { pairs, ids };
}
