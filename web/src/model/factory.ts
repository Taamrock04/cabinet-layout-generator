/**
 * Build a fresh layout model from an enclosure template, framed with side ducts
 * per the house style (Ref 05 §3/§4). Used for "New project".
 */
import type { LayoutModel } from "./types";
import { DEFAULTS, ENCLOSURE_TEMPLATES } from "./library";

let _seq = 0;
/** Deterministic-ish id helper (real persistence uses uuids). */
export function nextId(prefix: string): string {
  _seq += 1;
  return `${prefix}${_seq}`;
}

export type EnclosureKey = keyof typeof ENCLOSURE_TEMPLATES;

export function newModel(name: string, enclosure: EnclosureKey = "tall_floor"): LayoutModel {
  const tpl = ENCLOSURE_TEMPLATES[enclosure];
  const { width_mm: W, height_mm: H } = tpl.plate;
  const sd = tpl.side_duct;

  return {
    project: { id: nextId("proj_"), name, panel_tag: "", rev: "A" },
    plate: { width_mm: W, height_mm: H, origin: "top_left" },
    defaults: { ...DEFAULTS },
    ducts: [
      // left + right vertical side ducts, full height
      { id: "WW_L", x_mm: 0, y_mm: 0, length_mm: H, width_mm: sd.width_mm, label_h_mm: sd.label_h_mm, rot_deg: 90 },
      { id: "WW_R", x_mm: W - sd.width_mm, y_mm: 0, length_mm: H, width_mm: sd.width_mm, label_h_mm: sd.label_h_mm, rot_deg: 90 },
    ],
    elements: [],
    groups: [],
    labels: [],
    display: { show_row_clearance_dims: true, snap_enabled: true },
  };
}
