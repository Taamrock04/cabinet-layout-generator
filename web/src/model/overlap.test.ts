import { describe, it, expect } from "vitest";
import { findOverlaps } from "./overlap";
import { newModel } from "./factory";
import { addElement, moveEntity } from "./edit";
import { SEED_LIBRARY } from "./library";

describe("findOverlaps", () => {
  it("a fresh model (side ducts only) has no overlaps", () => {
    expect(findOverlaps(newModel("T", "tall_floor"), SEED_LIBRARY).pairs).toHaveLength(0);
  });

  it("flags two elements stacked on the same spot", () => {
    let { model } = addElement(newModel("T"), "mcp_2p", SEED_LIBRARY, 100, 200);
    const a = model.elements[0];
    const added = addElement(model, "mcb_3p", SEED_LIBRARY, 100, 200);
    model = added.model;
    const res = findOverlaps(model, SEED_LIBRARY);
    expect(res.pairs).toHaveLength(1);
    expect(res.ids.has(a.id)).toBe(true);
    expect(res.ids.has(added.id)).toBe(true);
  });

  it("does NOT flag elements that merely touch edge-to-edge", () => {
    // mcp_2p is 36mm wide; place the second exactly at the first's right edge
    const seed = addElement(newModel("T"), "mcp_2p", SEED_LIBRARY, 100, 200);
    const model = moveEntity(seed.model, "element", seed.id, 100, 200);
    const added = addElement(model, "mcp_2p", SEED_LIBRARY, 136, 200);
    expect(findOverlaps(added.model, SEED_LIBRARY).pairs).toHaveLength(0);
  });

  it("flags an element dragged onto a side duct", () => {
    // left side duct occupies x 0..60; place an element overlapping it
    const { model } = addElement(newModel("T", "tall_floor"), "relay_24vdc_2c", SEED_LIBRARY, 50, 300);
    const res = findOverlaps(model, SEED_LIBRARY);
    expect(res.pairs.length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT flag a label plate coincident with its stopper (by design)", () => {
    const a = addElement(newModel("T"), "term_stopper", SEED_LIBRARY, 200, 300);
    const b = addElement(a.model, "term_stopper_label", SEED_LIBRARY, 200, 300); // same spot
    expect(findOverlaps(b.model, SEED_LIBRARY).pairs).toHaveLength(0);
  });
});
