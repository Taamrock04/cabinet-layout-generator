import { describe, it, expect } from "vitest";
import { computeSnap, railOffsetWithinFootprint } from "./align";
import { newModel } from "./factory";
import { addElement } from "./edit";
import { SEED_LIBRARY } from "./library";
import type { Library } from "./types";

describe("railOffsetWithinFootprint", () => {
  it("defaults to vertical centre when rail_offset_mm is unset", () => {
    const item = SEED_LIBRARY.relay_24vdc_2c; // 80mm tall
    expect(railOffsetWithinFootprint(item, 0)).toBe(40);
  });
  it("uses rail_offset_mm when set; flips for 180°", () => {
    const item = { ...SEED_LIBRARY.relay_24vdc_2c, rail_offset_mm: 30 };
    expect(railOffsetWithinFootprint(item, 0)).toBe(30);
    expect(railOffsetWithinFootprint(item, 180)).toBe(50); // height(80) - 30
  });
});

describe("computeSnap", () => {
  // two relays (15.5 x 80); place A, drag B near A's right edge
  function setup(lib: Library = SEED_LIBRARY) {
    let m = newModel("T");
    const a = addElement(m, "relay_24vdc_2c", lib, 100, 200); m = a.model;
    const b = addElement(m, "relay_24vdc_2c", lib, 300, 260); m = b.model; // elsewhere
    return { m, aId: a.id, bId: b.id };
  }

  it("snaps the dragged part adjacent (right) with the gap, rail-aligned", () => {
    const { m, bId } = setup();
    // drag B so its left edge is ~near A.right (100+15.5=115.5) and rail near A's
    const snap = computeSnap(m, SEED_LIBRARY, bId, 117, 205);
    expect(snap).not.toBeNull();
    expect(snap!.x).toBeCloseTo(115.5 + 0.1); // A.x + A.width + gap
    expect(snap!.y).toBe(200); // same rail centre => same y (equal heights, centre offset)
    expect(snap!.guide.side).toBe("right");
    expect(snap!.guide.seamX).toBeCloseTo(115.5);
  });

  it("returns null when too far horizontally", () => {
    const { m, bId } = setup();
    expect(computeSnap(m, SEED_LIBRARY, bId, 300, 205)).toBeNull();
  });

  it("returns null when in a different row (rail far apart)", () => {
    const { m, bId } = setup();
    // near A.right in x, but 200mm below in y => different row
    expect(computeSnap(m, SEED_LIBRARY, bId, 117, 450)).toBeNull();
  });

  it("aligns rail centerlines for parts of different height", () => {
    // A = PSU (height 110), B = relay (height 80); both default centre offsets
    let m = newModel("T");
    const a = addElement(m, "psu_switching_24vdc", SEED_LIBRARY, 100, 200); m = a.model;
    const b = addElement(m, "relay_24vdc_2c", SEED_LIBRARY, 300, 230); m = b.model;
    const psuW = 40, gap = 0.1;
    const snap = computeSnap(m, SEED_LIBRARY, b.id, 100 + psuW + 2, 230);
    expect(snap).not.toBeNull();
    expect(snap!.x).toBeCloseTo(100 + psuW + gap);
    // A rail centre = 200 + 55 = 255; B offset = 40 => B.y = 255 - 40 = 215
    expect(snap!.y).toBe(215);
  });
});
