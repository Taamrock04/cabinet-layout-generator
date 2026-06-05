/**
 * Snap a dragged wire duct to the plate borders (all 4 sides) and to the inner
 * edges of perpendicular ducts. Pure + testable. The dragged duct's box edges are
 * snapped to the nearest target on each axis; moving (not resizing).
 */
import type { LayoutModel } from "./types";

/** Edge-proximity (mm) that triggers a snap. */
export const DUCT_SNAP_MM = 8;

export interface DuctSnap {
  x: number;            // snapped left (= dragLeft if no x snap)
  y: number;            // snapped top (= dragTop if no y snap)
  vGuide: number | null; // x of a vertical guide (an x snap occurred)
  hGuide: number | null; // y of a horizontal guide (a y snap occurred)
}

export function snapDuct(model: LayoutModel, draggedId: string, dragLeft: number, dragTop: number): DuctSnap | null {
  const d = model.ducts.find((x) => x.id === draggedId);
  if (!d) return null;
  const horizontal = d.rot_deg % 180 === 0;
  const w = horizontal ? d.length_mm : d.width_mm;
  const h = horizontal ? d.width_mm : d.length_mm;
  const W = model.plate.width_mm;
  const H = model.plate.height_mm;
  const verts = model.ducts.filter((v) => v.rot_deg % 180 !== 0 && v.id !== draggedId);
  const horizs = model.ducts.filter((v) => v.rot_deg % 180 === 0 && v.id !== draggedId);

  // --- X: snap the left or right edge to a plate side / vertical-duct inner edge ---
  let x = dragLeft;
  let vGuide: number | null = null;
  let bestX = DUCT_SNAP_MM;
  const leftTargets = [0, ...verts.map((v) => v.x_mm + v.width_mm)]; // plate left, vert right edges
  const rightTargets = [W, ...verts.map((v) => v.x_mm)];            // plate right, vert left edges
  for (const t of leftTargets) {
    const dist = Math.abs(dragLeft - t);
    if (dist <= bestX) { bestX = dist; x = t; vGuide = t; }
  }
  for (const t of rightTargets) {
    const dist = Math.abs(dragLeft + w - t);
    if (dist <= bestX) { bestX = dist; x = t - w; vGuide = t; }
  }

  // --- Y: snap the top or bottom edge to a plate edge / horizontal-duct edge ---
  let y = dragTop;
  let hGuide: number | null = null;
  let bestY = DUCT_SNAP_MM;
  const topTargets = [0, ...horizs.map((v) => v.y_mm + v.width_mm)];
  const botTargets = [H, ...horizs.map((v) => v.y_mm)];
  for (const t of topTargets) {
    const dist = Math.abs(dragTop - t);
    if (dist <= bestY) { bestY = dist; y = t; hGuide = t; }
  }
  for (const t of botTargets) {
    const dist = Math.abs(dragTop + h - t);
    if (dist <= bestY) { bestY = dist; y = t - h; hGuide = t; }
  }

  if (vGuide === null && hGuide === null) return null;
  return { x: +x.toFixed(2), y: +y.toFixed(2), vGuide, hGuide };
}
