import { describe, it, expect } from "vitest";
import { computeSnap, railOffsetWithinFootprint } from "./align";
import { detectRows } from "./rows";
import { newModel } from "./factory";
import { addElement } from "./edit";
import { SEED_LIBRARY } from "./library";
import type { LayoutModel } from "./types";

describe("railOffsetWithinFootprint", () => {
  it("defaults to vertical centre when rail_offset_mm is unset", () => {
    expect(railOffsetWithinFootprint(SEED_LIBRARY.relay_24vdc_2c, 0)).toBe(40); // 80 tall
  });
  it("uses rail_offset_mm when set; flips for 180°", () => {
    const item = { ...SEED_LIBRARY.relay_24vdc_2c, rail_offset_mm: 30 };
    expect(railOffsetWithinFootprint(item, 0)).toBe(30);
    expect(railOffsetWithinFootprint(item, 180)).toBe(50);
  });
});

/** Tall plate with two horizontal ducts (40 thick) -> one row band 140..400 (centre 270). */
function withRow(): LayoutModel {
  const m = newModel("T"); // side ducts WW_L(0,60) WW_R(740,60)
  return {
    ...m,
    ducts: [
      ...m.ducts,
      { id: "H1", x_mm: 60, y_mm: 100, length_mm: 680, width_mm: 40, label_h_mm: 60, rot_deg: 0 },
      { id: "H2", x_mm: 60, y_mm: 400, length_mm: 680, width_mm: 40, label_h_mm: 60, rot_deg: 0 },
    ],
  };
}

describe("computeSnap — horizontal", () => {
  it("snaps adjacent (right) to a neighbour with the equipment gap", () => {
    let m = newModel("T");
    m = addElement(m, "relay_24vdc_2c", SEED_LIBRARY, 100, 200).model; // A (15.5 wide)
    const b = addElement(m, "relay_24vdc_2c", SEED_LIBRARY, 300, 200); m = b.model;
    const s = computeSnap(m, SEED_LIBRARY, b.id, 117, 200, detectRows(m));
    expect(s).not.toBeNull();
    expect(s!.x).toBeCloseTo(115.6); // 100 + 15.5 + 0.1
    expect(s!.seamX).toBeCloseTo(115.5);
  });

  it("snaps to the left side duct at its clearance", () => {
    const { model, id } = addElement(newModel("T"), "relay_24vdc_2c", SEED_LIBRARY, 64, 300);
    const s = computeSnap(model, SEED_LIBRARY, id, 64, 300, detectRows(model));
    expect(s).not.toBeNull();
    expect(s!.x).toBeCloseTo(63);     // leftEdge 60 + clearance 3
    expect(s!.seamX).toBeCloseTo(60); // left duct inner edge
  });
});

describe("computeSnap — vertical (row centre)", () => {
  it("snaps the rail centerline to the row centre when over a band", () => {
    const { model, id } = addElement(withRow(), "relay_24vdc_2c", SEED_LIBRARY, 300, 235);
    const s = computeSnap(model, SEED_LIBRARY, id, 300, 235, detectRows(model));
    expect(s).not.toBeNull();
    expect(s!.y).toBe(230);   // rowCentre 270 - railOffset 40
    expect(s!.railY).toBe(270);
  });

  it("aligns a taller part's rail to the same row centre", () => {
    const { model, id } = addElement(withRow(), "psu_switching_24vdc", SEED_LIBRARY, 300, 200); // 110 tall
    const s = computeSnap(model, SEED_LIBRARY, id, 300, 200, detectRows(model));
    expect(s!.y).toBe(215); // 270 - 55
  });
});

describe("computeSnap — none", () => {
  it("returns null when nothing is near (no row, far from duct/neighbours)", () => {
    const { model, id } = addElement(newModel("T"), "relay_24vdc_2c", SEED_LIBRARY, 400, 300);
    expect(computeSnap(model, SEED_LIBRARY, id, 400, 300, detectRows(model))).toBeNull();
  });
});
