/**
 * Rail-snap alignment (pure, testable). When a part is dragged near another, it
 * snaps to sit immediately left/right with the default gap AND with their DIN-rail
 * centerlines aligned — the common mounting reference. (engineer's DIN convention)
 *
 * The rail centerline of a part sits `rail_offset_mm` below its top edge (default:
 * the part's vertical centre). Aligning two parts means their rail centerlines
 * share a y; the row then reads "next x = prev x + footprint width + gap".
 */
import type { LayoutModel, Library, LibItem } from "./types";
import type { Row } from "./rows"; // type-only (no runtime cycle)
import { rotatedFootprint } from "./geometry";
import { libItemSize } from "./resolve";

/** Horizontal edge proximity (mm) that triggers a snap. */
export const SNAP_X_MM = 8;
/** Vertical rail-centerline proximity (mm) gating "same row". */
export const SNAP_RAIL_MM = 60;

export interface SnapResult {
  x: number; // snapped x (= dragX if nothing horizontal snapped)
  y: number; // snapped y (= dragY if nothing vertical snapped)
  seamX: number | null; // draw a vertical guide here when a horizontal snap occurred
  railY: number | null; // draw a horizontal guide here when a vertical snap occurred
}

const norm = (deg: number) => ((deg % 360) + 360) % 360;

/** Distance from a placed element's (rotated) footprint TOP to its rail centerline. */
export function railOffsetWithinFootprint(item: LibItem, rotDeg: number): number {
  const size = libItemSize(item);
  const f = rotatedFootprint(size, rotDeg);
  const off = item.rail_offset_mm ?? size.h / 2; // default: vertical centre
  const a = norm(rotDeg);
  if (a === 0) return off;
  if (a === 180) return size.h - off;
  return f.h / 2; // 90/270: rail concept doesn't rotate cleanly — use centre
}

function footprintW(item: LibItem, rotDeg: number): number {
  return rotatedFootprint(libItemSize(item), rotDeg).w;
}

/** Inner edge just right of the left side duct. */
function leftDuctEdge(model: LayoutModel): number {
  const verts = model.ducts.filter((d) => d.rot_deg % 180 !== 0);
  const left = verts.find((d) => d.x_mm === 0) ?? [...verts].sort((a, b) => a.x_mm - b.x_mm)[0];
  return left ? left.x_mm + left.width_mm : 0;
}

/**
 * Snap the element `draggedId` at top-left (dragX, dragY) while dragging:
 *  - vertical: to the centre of the row band it's over (rail on the row centre);
 *  - horizontal: to the left side duct (its clearance) or adjacent to a neighbour
 *    in the same row (the equipment gap), whichever edge is nearest.
 * Each axis snaps independently; returns null only if neither snaps. `rows` is
 * passed in (from detectRows) to avoid an import cycle.
 */
export function computeSnap(
  model: LayoutModel,
  library: Library,
  draggedId: string,
  dragX: number,
  dragY: number,
  rows: Row[],
): SnapResult | null {
  const D = model.elements.find((e) => e.id === draggedId);
  const dItem = D && library[D.lib_key];
  if (!D || !dItem) return null;

  const gap = model.defaults.gap_between_equipment_mm;
  const size = libItemSize(dItem);
  const f = rotatedFootprint(size, D.rot_deg);
  const dRailOff = railOffsetWithinFootprint(dItem, D.rot_deg);
  const dRailNow = dragY + dRailOff;
  const dCenterY = dragY + f.h / 2;

  // --- vertical: snap to the centre of the band the dragged centre is over ---
  let snapY = dragY;
  let railY: number | null = null;
  const row = rows.find((r) => dCenterY >= r.topY && dCenterY <= r.bottomY);
  if (row) {
    const rowCenter = (row.topY + row.bottomY) / 2;
    if (Math.abs(dRailNow - rowCenter) <= SNAP_RAIL_MM) {
      snapY = +(rowCenter - dRailOff).toFixed(2);
      railY = rowCenter;
    }
  }

  // --- horizontal: nearest of {left duct, a neighbour in the same row} ---
  let snapX = dragX;
  let seamX: number | null = null;
  let bestDist = SNAP_X_MM;

  const leftTarget = leftDuctEdge(model) + D.clearance_to_duct_mm;
  if (Math.abs(dragX - leftTarget) <= bestDist) {
    bestDist = Math.abs(dragX - leftTarget);
    snapX = +leftTarget.toFixed(2);
    seamX = leftDuctEdge(model);
  }

  for (const E of model.elements) {
    if (E.id === draggedId) continue;
    const eItem = library[E.lib_key];
    if (!eItem) continue;
    const eW = footprintW(eItem, E.rot_deg);
    const eRailY = E.y_mm + railOffsetWithinFootprint(eItem, E.rot_deg);
    if (Math.abs(eRailY - dRailNow) > SNAP_RAIL_MM) continue; // not the same row
    const cands: Array<{ x: number; seam: number }> = [
      { x: E.x_mm + eW + gap, seam: E.x_mm + eW }, // right of E
      { x: E.x_mm - gap - f.w, seam: E.x_mm },     // left of E
    ];
    for (const c of cands) {
      const dist = Math.abs(dragX - c.x);
      if (dist <= bestDist) { bestDist = dist; snapX = +c.x.toFixed(2); seamX = c.seam; }
    }
  }

  if (railY === null && seamX === null) return null;
  return { x: snapX, y: snapY, seamX, railY };
}
