import { describe, it, expect } from "vitest";
import { snapDuct } from "./ductsnap";
import type { LayoutModel } from "./types";

function model(): LayoutModel {
  return {
    project: { id: "p", name: "T", panel_tag: "", rev: "A" },
    plate: { width_mm: 800, height_mm: 1000, origin: "top_left" },
    defaults: { gap_between_equipment_mm: 0.1, clearance_equipment_to_duct_mm: 3 },
    ducts: [
      { id: "L", x_mm: 0, y_mm: 0, length_mm: 1000, width_mm: 60, label_h_mm: 60, rot_deg: 90 },     // left side
      { id: "R", x_mm: 740, y_mm: 0, length_mm: 1000, width_mm: 60, label_h_mm: 60, rot_deg: 90 },   // right side
      { id: "H", x_mm: 60, y_mm: 500, length_mm: 680, width_mm: 40, label_h_mm: 60, rot_deg: 0 },    // a horizontal duct
    ],
    elements: [], groups: [], labels: [],
    display: { show_row_clearance_dims: true, snap_enabled: true },
  };
}

describe("snapDuct", () => {
  it("snaps a vertical duct's left edge to the plate left border", () => {
    const m = model();
    const s = snapDuct(m, "L", 4, 0); // dragged 4mm in from x=0
    expect(s).not.toBeNull();
    expect(s!.x).toBe(0);       // left edge to plate left
    expect(s!.vGuide).toBe(0);
  });

  it("snaps a vertical duct's right edge to the plate right border", () => {
    const m = model();
    const s = snapDuct(m, "R", 736, 0); // right side duct (w=60) near right border (right edge target 800 -> x=740)
    expect(s!.x).toBe(740);
  });

  it("snaps a horizontal duct's ends to the side ducts (exact fit)", () => {
    const m = model();
    // H is 680 wide = the 60..740 span, so dragging near 63 snaps it to butt both sides
    const s = snapDuct(m, "H", 63, 500);
    expect(s!.x).toBe(60);                  // left edge at the left side duct
    expect([60, 740]).toContain(s!.vGuide); // a guide at one of the two seams
  });

  it("snaps a horizontal duct's top to the plate top border", () => {
    const m = model();
    const s = snapDuct(m, "H", 60, 5);
    expect(s!.y).toBe(0);
    expect(s!.hGuide).toBe(0);
  });

  it("returns null when nothing is near", () => {
    const m = model();
    expect(snapDuct(m, "H", 300, 300)).toBeNull();
  });
});
