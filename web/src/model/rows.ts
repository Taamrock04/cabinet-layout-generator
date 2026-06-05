/**
 * Rows = the device bands between consecutive horizontal wire ducts (Ref 05 §4).
 * Pure + testable. The editor shows each row's height as a dimension outside the
 * plate and lets you edit it; editing shifts the duct below (and everything below
 * it) so the other rows keep their size and the plate grows/shrinks at that row.
 */
import type { LayoutModel, Duct } from "./types";

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
 * Set row `rowIndex`'s height. The duct below it (and every duct/element/group
 * below) shifts by the delta so the other rows keep their heights. The PLATE is
 * left unchanged — side ducts and plate size are not touched (content may move
 * past the plate edge, which validation flags as warn-but-allow).
 */
export function setRowHeight(model: LayoutModel, rowIndex: number, newHeight: number): LayoutModel {
  const rows = detectRows(model);
  const row = rows[rowIndex];
  if (!row || newHeight <= 0) return model;
  const delta = +(newHeight - row.height).toFixed(2);
  if (delta === 0) return model;

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
