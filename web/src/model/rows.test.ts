import { describe, it, expect } from "vitest";
import { detectRows, setRowHeight, centerRowDevices, packRow, rowOverflowMm } from "./rows";
import { addElement } from "./edit";
import { SEED_LIBRARY } from "./library";
import type { LayoutModel } from "./types";

/** Tall plate with two horizontal ducts (40 thick) framing one row. */
function modelWithTwoDucts(): LayoutModel {
  return {
    project: { id: "p", name: "T", panel_tag: "", rev: "A" },
    plate: { width_mm: 800, height_mm: 1000, origin: "top_left" },
    defaults: { gap_between_equipment_mm: 0.1, clearance_equipment_to_duct_mm: 3 },
    ducts: [
      { id: "L", x_mm: 0, y_mm: 0, length_mm: 1000, width_mm: 60, label_h_mm: 60, rot_deg: 90 }, // side
      { id: "H1", x_mm: 60, y_mm: 100, length_mm: 680, width_mm: 40, label_h_mm: 60, rot_deg: 0 },
      { id: "H2", x_mm: 60, y_mm: 400, length_mm: 680, width_mm: 40, label_h_mm: 60, rot_deg: 0 },
    ],
    elements: [], groups: [], labels: [],
    display: { show_row_clearance_dims: true, snap_enabled: true },
  };
}

describe("detectRows", () => {
  it("finds the band between two horizontal ducts (clear space)", () => {
    const rows = detectRows(modelWithTwoDucts());
    expect(rows).toHaveLength(1);
    // top = H1.y + H1.thickness = 100 + 40 = 140; bottom = H2.y = 400; height = 260
    expect(rows[0]).toMatchObject({ topY: 140, bottomY: 400, height: 260 });
  });
});

describe("setRowHeight", () => {
  it("growing a row shifts the bottom duct + below down, leaving the plate untouched", () => {
    let m = modelWithTwoDucts();
    // a device in the row (stays) and one below H2 (shifts)
    m = addElement(m, "relay_24vdc_2c", { relay_24vdc_2c: { lib_key: "relay_24vdc_2c", name: "R", source: "rect", width_mm: 15.5, height_mm: 80 } }, 80, 200).model;
    m = addElement(m, "relay_24vdc_2c", { relay_24vdc_2c: { lib_key: "relay_24vdc_2c", name: "R", source: "rect", width_mm: 15.5, height_mm: 80 } }, 80, 500).model;
    const inRow = m.elements[0]; // y 200 (inside row, above bottom duct 400)
    const below = m.elements[1]; // y 500 (below bottom duct)

    const m2 = setRowHeight(m, 0, 360); // +100
    expect(detectRows(m2)[0].height).toBe(360);
    expect(m2.ducts.find((d) => d.id === "H2")!.y_mm).toBe(500); // 400 + 100
    expect(m2.plate.height_mm).toBe(1000); // PLATE UNCHANGED
    expect(m2.ducts.find((d) => d.id === "L")!.length_mm).toBe(1000); // side duct UNCHANGED
    expect(m2.elements.find((e) => e.id === inRow.id)!.y_mm).toBe(200); // unchanged
    expect(m2.elements.find((e) => e.id === below.id)!.y_mm).toBe(600); // 500 + 100
  });

  it("shrinking pulls the bottom duct up, leaving the plate untouched", () => {
    const m2 = setRowHeight(modelWithTwoDucts(), 0, 160); // 260 -> 160 = -100
    expect(m2.ducts.find((d) => d.id === "H2")!.y_mm).toBe(300);
    expect(m2.plate.height_mm).toBe(1000); // PLATE UNCHANGED
  });

  it("ignores non-positive heights", () => {
    const m = modelWithTwoDucts();
    expect(setRowHeight(m, 0, 0)).toBe(m);
  });
});

describe("setRowHeight borrow mode", () => {
  // three horizontal ducts (40 thick) -> two rows
  function threeDucts(): LayoutModel {
    const m = modelWithTwoDucts();
    return { ...m, ducts: [...m.ducts, { id: "H3", x_mm: 60, y_mm: 700, length_mm: 680, width_mm: 40, label_h_mm: 60, rot_deg: 0 }] };
  }

  it("growing a row in borrow mode shrinks the next row; total + plate unchanged", () => {
    const m = threeDucts();
    const before = detectRows(m); // row0: 140..400 (260); row1: 440..700 (260)
    expect(before.map((r) => r.height)).toEqual([260, 260]);

    const m2 = setRowHeight(m, 0, 360, "borrow"); // +100 to row0
    const after = detectRows(m2);
    expect(after[0].height).toBe(360);
    expect(after[1].height).toBe(160); // 260 - 100
    expect(m2.plate.height_mm).toBe(1000); // unchanged
    expect(m2.ducts.find((d) => d.id === "H3")!.y_mm).toBe(700); // bottom duct unchanged
    expect(m2.ducts.find((d) => d.id === "H2")!.y_mm).toBe(500); // only the middle duct moved
  });

  it("refuses to borrow more than the next row has", () => {
    const m = threeDucts();
    expect(setRowHeight(m, 0, 600, "borrow")).toBe(m); // needs 340 from a 260 row -> ignored
  });

  it("borrow on the last row falls back to push", () => {
    const m = threeDucts();
    const m2 = setRowHeight(m, 1, 360, "borrow"); // last row, no next -> push
    expect(m2.ducts.find((d) => d.id === "H3")!.y_mm).toBe(800); // pushed down 100
  });
});

describe("packRow", () => {
  // band 140..400, centre 270; left duct 0..60, right duct at x=740
  function rowModel(): LayoutModel {
    const m = modelWithTwoDucts();
    return { ...m, ducts: [...m.ducts, { id: "R", x_mm: 740, y_mm: 0, length_mm: 1000, width_mm: 60, label_h_mm: 60, rot_deg: 90 }] };
  }

  it("flows devices from the left duct (clearance + gap), rail-centred", () => {
    let m = rowModel();
    m = addElement(m, "relay_24vdc_2c", SEED_LIBRARY, 300, 160).model; // 15.5 wide
    m = addElement(m, "relay_24vdc_2c", SEED_LIBRARY, 120, 170).model;
    const { model: m2, overflowMm } = packRow(m, SEED_LIBRARY, 0);
    const xs = m2.elements.map((e) => e.x_mm).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(63);    // leftEdge 60 + clearance 3
    expect(xs[1]).toBeCloseTo(78.6);  // 63 + 15.5 + gap 0.1
    expect(m2.elements.every((e) => e.y_mm === 230)).toBe(true); // rail-centred (270 - 40)
    expect(overflowMm).toBe(0);
  });

  it("reports overflow when devices exceed the space, packing from the left anyway", () => {
    let m = rowModel(); // usable ~ 680mm
    for (let i = 0; i < 8; i += 1) m = addElement(m, "ground_bar_6", SEED_LIBRARY, 100 + i, 180).model; // 120 wide each
    const { model: m2, overflowMm } = packRow(m, SEED_LIBRARY, 0);
    expect(overflowMm).toBeGreaterThan(0);
    expect(rowOverflowMm(m2, SEED_LIBRARY, 0)).toBeGreaterThan(0);
    expect(Math.min(...m2.elements.map((e) => e.x_mm))).toBeCloseTo(63);
  });
});

describe("centerRowDevices", () => {
  it("puts the rail centerline of in-row devices on the row centre", () => {
    // row band 140..400, centre 270; relay h=80, default rail offset 40
    let m = modelWithTwoDucts();
    m = addElement(m, "relay_24vdc_2c", SEED_LIBRARY, 80, 150).model; // centre 190, in band
    m = addElement(m, "relay_24vdc_2c", SEED_LIBRARY, 80, 600).model; // below the row
    const inRow = m.elements[0];
    const below = m.elements[1];

    const m2 = centerRowDevices(m, SEED_LIBRARY, 0);
    // newY = rowCentre(270) - railOffset(40) = 230 -> device centre 230+40 = 270
    expect(m2.elements.find((e) => e.id === inRow.id)!.y_mm).toBe(230);
    expect(m2.elements.find((e) => e.id === below.id)!.y_mm).toBe(600); // untouched
  });
});
