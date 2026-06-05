/**
 * Rows = the device bands between consecutive horizontal wire ducts (Ref 05 §4).
 * Pure + testable. The editor shows each row's height as a dimension outside the
 * plate and lets you edit it; editing shifts the duct below (and everything below
 * it) so the other rows keep their size and the plate grows/shrinks at that row.
 */
import type { LayoutModel, Duct, Library } from "./types";
import { rotatedFootprint } from "./geometry";
import { libItemSize } from "./resolve";
import { railOffsetWithinFootprint } from "./align";

/** Margin (mm) reserved outside the plate for the row-dimension stack. */
export const ROW_DIM_MARGIN_MM = 90;
/** Where the dimension line sits, measured from the plate's right edge. */
const DIM_LINE_OFFSET_MM = 40;

/** Geometry for one row's dimension annotation (right margin), in plate mm coords. */
export interface RowDim {
  index: number;     // row index (for click-to-edit)
  value: number;     // the height shown
  plateRightX: number; // plate right edge (extension lines start here)
  dimX: number;      // x of the vertical dimension line
  extEndX: number;   // extension-line overshoot past the dim line
  textX: number;     // text anchor x
  topY: number;
  bottomY: number;
  midY: number;
}

/** Dimension specs for every row, for the editor + exports to draw consistently. */
export function rowDims(model: LayoutModel): RowDim[] {
  const W = model.plate.width_mm;
  const dimX = W + DIM_LINE_OFFSET_MM;
  return detectRows(model).map((r) => ({
    index: r.index,
    value: r.height,
    plateRightX: W,
    dimX,
    extEndX: dimX + 8,
    textX: dimX + 12,
    topY: r.topY,
    bottomY: r.bottomY,
    midY: +((r.topY + r.bottomY) / 2).toFixed(2),
  }));
}

export interface Row {
  index: number;
  topDuctId: string;
  bottomDuctId: string;
  /** Row top = bottom edge of the duct above. */
  topY: number;
  /** Row bottom = top edge of the duct below. */
  bottomY: number;
  /** Clear device height between the two ducts. */
  height: number;
}

function horizontalDucts(model: LayoutModel): Duct[] {
  return model.ducts
    .filter((d) => d.rot_deg % 180 === 0)
    .slice()
    .sort((a, b) => a.y_mm - b.y_mm);
}

/** Rows between consecutive horizontal ducts, top→bottom. N ducts → N-1 rows. */
export function detectRows(model: LayoutModel): Row[] {
  const hd = horizontalDucts(model);
  const rows: Row[] = [];
  for (let i = 0; i < hd.length - 1; i += 1) {
    const a = hd[i];
    const b = hd[i + 1];
    const topY = a.y_mm + a.width_mm; // width_mm is the duct's drawn thickness
    const bottomY = b.y_mm;
    rows.push({
      index: rows.length, topDuctId: a.id, bottomDuctId: b.id,
      topY, bottomY, height: +(bottomY - topY).toFixed(1),
    });
  }
  return rows;
}

/**
 * How a row resize reallocates space:
 *  - "push": shift the duct below + everything beneath it (other rows keep their
 *    heights; bottom content may move past the plate edge). Plate unchanged.
 *  - "borrow": move only the duct between this row and the next, so the next row
 *    shrinks/grows by the opposite amount — total height (and the plate) fixed.
 */
export type RowResizeMode = "push" | "borrow";

/**
 * Set row `rowIndex`'s height. The PLATE is always left unchanged (side ducts and
 * plate size untouched). See {@link RowResizeMode} for how rows below react.
 */
export function setRowHeight(
  model: LayoutModel,
  rowIndex: number,
  newHeight: number,
  mode: RowResizeMode = "push",
): LayoutModel {
  const rows = detectRows(model);
  const row = rows[rowIndex];
  if (!row || newHeight <= 0) return model;
  const delta = +(newHeight - row.height).toFixed(2);
  if (delta === 0) return model;

  if (mode === "borrow") {
    const next = rows[rowIndex + 1];
    if (next) {
      // can't borrow more than the next row has (would make it negative)
      if (next.height - delta < 0) return model;
      // move only the duct between the two rows; everything else stays put
      return {
        ...model,
        ducts: model.ducts.map((d) => (d.id === row.bottomDuctId ? { ...d, y_mm: +(d.y_mm + delta).toFixed(2) } : d)),
      };
    }
    // last row: nothing below to borrow from → fall through to push
  }

  const cutY = row.bottomY; // top of the bottom duct: shift things at/below this
  const shift = (y: number) => (y >= cutY ? +(y + delta).toFixed(2) : y);

  return {
    ...model, // plate unchanged
    ducts: model.ducts.map((d) => {
      const horizontal = d.rot_deg % 180 === 0;
      if (horizontal) return { ...d, y_mm: shift(d.y_mm) };
      // vertical (side/feed) ducts: shift only if entirely below the cut; full-height
      // side ducts (which span the cut) are left as-is so the plate frame is unchanged.
      return d.y_mm >= cutY ? { ...d, y_mm: +(d.y_mm + delta).toFixed(2) } : d;
    }),
    elements: model.elements.map((e) => ({ ...e, y_mm: shift(e.y_mm) })),
    groups: model.groups.map((g) => ({ ...g, y_mm: shift(g.y_mm) })),
    // labels are stored as offsets from their anchor, so they follow automatically
  };
}

/* ----------------------------- auto-pack a row ----------------------------- */

interface RowDev {
  id: string;
  w: number;          // footprint width (sets: total span)
  railOff: number;    // rail offset within footprint
  clearance: number;  // clearance to the duct (first device uses this)
  gap: number;        // gap before this device (equipment gap)
  curX: number;       // current x (for ordering)
}

/** Left inner edge (right of the left side duct) and right limit (left of the right side duct). */
function rowEdges(model: LayoutModel): { leftEdge: number; rightLimit: number } {
  const verts = model.ducts.filter((d) => d.rot_deg % 180 !== 0);
  const left = verts.find((d) => d.x_mm === 0) ?? [...verts].sort((a, b) => a.x_mm - b.x_mm)[0];
  const leftEdge = left ? left.x_mm + left.width_mm : 0;
  const right = verts.length ? verts.reduce((m, d) => (d.x_mm > m.x_mm ? d : m)) : null;
  const rightLimit = right ? right.x_mm : model.plate.width_mm;
  return { leftEdge, rightLimit };
}

/** Devices (elements + sets) whose centre falls in the row band, ordered left→right. */
function rowDevices(model: LayoutModel, library: Library, row: Row): RowDev[] {
  const out: RowDev[] = [];
  const inBand = (y: number, h: number) => y + h / 2 >= row.topY && y + h / 2 <= row.bottomY;
  for (const e of model.elements) {
    const item = library[e.lib_key];
    if (!item) continue;
    const f = rotatedFootprint(libItemSize(item), e.rot_deg);
    if (inBand(e.y_mm, f.h)) out.push({ id: e.id, w: f.w, railOff: railOffsetWithinFootprint(item, e.rot_deg), clearance: e.clearance_to_duct_mm, gap: e.gap_before_mm, curX: e.x_mm });
  }
  for (const g of model.groups) {
    const item = library[g.lib_key];
    if (!item) continue;
    const f = rotatedFootprint(libItemSize(item), g.rot_deg);
    if (inBand(g.y_mm, f.h)) out.push({ id: g.id, w: g.count * f.w + (g.count - 1) * g.internal_gap_mm, railOff: railOffsetWithinFootprint(item, g.rot_deg), clearance: model.defaults.clearance_equipment_to_duct_mm, gap: model.defaults.gap_between_equipment_mm, curX: g.x_mm });
  }
  return out.sort((a, b) => a.curX - b.curX);
}

function neededWidth(devs: RowDev[]): number {
  if (devs.length === 0) return 0;
  let w = devs[0].clearance; // first device's clearance from the left duct
  devs.forEach((d, i) => { w += (i > 0 ? d.gap : 0) + d.w; });
  return w;
}

/** How far a row's devices exceed the space between the side ducts (0 if they fit). */
export function rowOverflowMm(model: LayoutModel, library: Library, rowIndex: number): number {
  const row = detectRows(model)[rowIndex];
  if (!row) return 0;
  const devs = rowDevices(model, library, row);
  if (devs.length === 0) return 0;
  const { leftEdge, rightLimit } = rowEdges(model);
  return +Math.max(0, leftEdge + neededWidth(devs) - rightLimit).toFixed(1);
}

export interface PackResult {
  model: LayoutModel;
  overflowMm: number;
}

/**
 * Auto-pack a row: flow its devices left→right from the left duct (each device's
 * clearance, then the equipment gap between), rail-centred on the row. Packs from
 * the left even if they overflow the right duct; the overflow amount is returned.
 */
export function packRow(model: LayoutModel, library: Library, rowIndex: number): PackResult {
  const row = detectRows(model)[rowIndex];
  if (!row) return { model, overflowMm: 0 };
  const devs = rowDevices(model, library, row);
  if (devs.length === 0) return { model, overflowMm: 0 };
  const { leftEdge, rightLimit } = rowEdges(model);
  const rowCenter = (row.topY + row.bottomY) / 2;

  const nx: Record<string, number> = {};
  const ny: Record<string, number> = {};
  let x = leftEdge + devs[0].clearance;
  devs.forEach((d, i) => {
    if (i > 0) x += d.gap;
    nx[d.id] = +x.toFixed(2);
    ny[d.id] = +(rowCenter - d.railOff).toFixed(2);
    x += d.w;
  });

  return {
    model: {
      ...model,
      elements: model.elements.map((e) => (e.id in nx ? { ...e, x_mm: nx[e.id], y_mm: ny[e.id] } : e)),
      groups: model.groups.map((g) => (g.id in nx ? { ...g, x_mm: nx[g.id], y_mm: ny[g.id] } : g)),
    },
    overflowMm: +Math.max(0, x - rightLimit).toFixed(1),
  };
}

/**
 * Vertically centre the devices in a row: each element/set whose centre falls
 * within the row band has its rail centerline placed on the row's centre line.
 * (For parts with the default rail offset this centres the part geometrically.)
 */
export function centerRowDevices(model: LayoutModel, library: Library, rowIndex: number): LayoutModel {
  const row = detectRows(model)[rowIndex];
  if (!row) return model;
  const rowCenter = (row.topY + row.bottomY) / 2;
  const inBand = (y: number, h: number) => {
    const c = y + h / 2;
    return c >= row.topY && c <= row.bottomY;
  };
  return {
    ...model,
    elements: model.elements.map((e) => {
      const item = library[e.lib_key];
      if (!item) return e;
      const f = rotatedFootprint(libItemSize(item), e.rot_deg);
      return inBand(e.y_mm, f.h) ? { ...e, y_mm: +(rowCenter - railOffsetWithinFootprint(item, e.rot_deg)).toFixed(2) } : e;
    }),
    groups: model.groups.map((g) => {
      const item = library[g.lib_key];
      if (!item) return g;
      const f = rotatedFootprint(libItemSize(item), g.rot_deg);
      return inBand(g.y_mm, f.h) ? { ...g, y_mm: +(rowCenter - railOffsetWithinFootprint(item, g.rot_deg)).toFixed(2) } : g;
    }),
  };
}
