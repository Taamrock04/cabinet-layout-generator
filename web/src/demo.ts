/**
 * A demo layout for visual verification of the renderer in the browser.
 * NOT production — just exercises plate + ducts + a placed part + a set, so we
 * can see the model→SVG path render real geometry. Safe to delete later.
 */
import { newModel } from "./model/factory";
import type { LayoutModel } from "./model/types";

export function buildDemo(): LayoutModel {
  const m = newModel("Demo — Pump Station", "tall_floor");
  const sd = m.ducts[0].width_mm; // side-duct width (60 for tall) = left margin

  // a horizontal row duct (40×60) below the top band
  m.ducts.push({
    id: "WW_top", x_mm: sd, y_mm: 110, length_mm: m.plate.width_mm - 2 * sd,
    width_mm: 40, label_h_mm: 60, rot_deg: 0,
  });

  // the measured IDEC FC6A PLC placed in the control band
  m.elements.push({
    id: "e_plc", lib_key: "plc_idec_FC6A_D16", tag: "PLC01",
    x_mm: sd + 10, y_mm: 170, rot_deg: 0,
    gap_before_mm: 0.1, clearance_to_duct_mm: 3, group_id: null, locked: false,
  });

  // a couple of seed parts to its right
  m.elements.push({
    id: "e_psu", lib_key: "psu_switching_24vdc", tag: "PS01",
    x_mm: sd + 100, y_mm: 170, rot_deg: 0,
    gap_before_mm: 0.1, clearance_to_duct_mm: 3, group_id: null, locked: false,
  });

  // a Degson terminal set ×12, auto-tagged B101..
  m.groups.push({
    id: "g_term", kind: "set", lib_key: "term_degson_2c_2_5", count: 12,
    internal_gap_mm: 0.1, tag_start: "B101", tag_step: 1,
    x_mm: sd + 10, y_mm: 320, rot_deg: 0, exploded: false, label_id: "L_term",
  });
  m.labels.push({
    id: "L_term", text: "24VDC", anchor: "group:g_term", dx_mm: 0, dy_mm: -6, rot_deg: 0,
  });

  return m;
}
