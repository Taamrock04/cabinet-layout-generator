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
import { rotatedFootprint } from "./geometry";
import { libItemSize } from "./resolve";

/** Horizontal edge proximity (mm) that triggers a snap. */
export const SNAP_X_MM = 8;
/** Vertical rail-centerline proximity (mm) gating "same row". */
export const SNAP_RAIL_MM = 60;

export interface SnapGuide {
  /** x of the seam between the two parts (vertical guide). */
  seamX: number;
  /** y of the shared rail centerline (horizontal guide). */
  railY: number;
  /** which side of the target the dragged part landed on. */
  side: "left" | "right";
}
export interface SnapResult {
  x: number;
  y: number;
  guide: SnapGuide;
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

/**
 * Snap target for the element `draggedId` at top-left (dragX, dragY). Returns the
 * snapped position + guide, or null if nothing is near enough.
 */
export function computeSnap(
  model: LayoutModel,
  library: Library,
  draggedId: string,
  dragX: number,
  dragY: number,
): SnapResult | null {
  const D = model.elements.find((e) => e.id === draggedId);
  const dItem = D && library[D.lib_key];
  if (!D || !dItem) return null;

  const gap = model.defaults.gap_between_equipment_mm;
  const dW = footprintW(dItem, D.rot_deg);
  const dRailOff = railOffsetWithinFootprint(dItem, D.rot_deg);
  const dRailNow = dragY + dRailOff;

  let best: { x: number; y: number; seamX: number; railY: number; side: "left" | "right"; dist: number } | null = null;

  for (const E of model.elements) {
    if (E.id === draggedId) continue;
    const eItem = library[E.lib_key];
    if (!eItem) continue;
    const eW = footprintW(eItem, E.rot_deg);
    const eRailY = E.y_mm + railOffsetWithinFootprint(eItem, E.rot_deg);
    if (Math.abs(eRailY - dRailNow) > SNAP_RAIL_MM) continue; // not the same row

    const snappedY = eRailY - dRailOff;
    const rightX = E.x_mm + eW + gap; // D sits to the right of E
    const leftX = E.x_mm - gap - dW; // D sits to the left of E
    const rightDist = Math.abs(dragX - rightX);
    const leftDist = Math.abs(dragX - leftX);
    const cand = rightDist <= leftDist
      ? { x: rightX, seamX: E.x_mm + eW, side: "right" as const, dist: rightDist }
      : { x: leftX, seamX: E.x_mm, side: "left" as const, dist: leftDist };

    if (cand.dist <= SNAP_X_MM && (!best || cand.dist < best.dist)) {
      best = { x: cand.x, y: snappedY, seamX: cand.seamX, railY: eRailY, side: cand.side, dist: cand.dist };
    }
  }

  if (!best) return null;
  return { x: +best.x.toFixed(2), y: +best.y.toFixed(2), guide: { seamX: best.seamX, railY: best.railY, side: best.side } };
}
