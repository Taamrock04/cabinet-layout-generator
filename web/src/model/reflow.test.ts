import { describe, it, expect } from "vitest";
import { reflowRun, reflowDownstream, type RunMember } from "./reflow";
import type { Element } from "./types";

function el(id: string, x: number, gap = 0.1, rot = 0, locked = false): Element {
  return {
    id, lib_key: "k", tag: id, x_mm: x, y_mm: 100, rot_deg: rot,
    gap_before_mm: gap, clearance_to_duct_mm: 3, group_id: null, locked,
  };
}
const W = 20; // every test part is 20mm wide
const mk = (e: Element): RunMember => ({ el: e, size: { w: W, h: 50 } });

describe("reflowRun", () => {
  it("flows left→right with gap_before after each right edge", () => {
    const members = [mk(el("a", 0)), mk(el("b", 0, 0.1)), mk(el("c", 0, 5))];
    const r = reflowRun(members, 60);
    expect(r[0]).toEqual({ id: "a", x_mm: 60 });           // start
    expect(r[1]).toEqual({ id: "b", x_mm: 60 + 20 + 0.1 }); // after a's right edge + gap
    expect(r[2]).toEqual({ id: "c", x_mm: 80.1 + 20 + 5 }); // after b's right edge + gap
  });

  it("rotated member uses rotated width", () => {
    const rotated = mk(el("a", 0, 0.1, 90)); // 20×50 -> rotated width 50
    const next = mk(el("b", 0, 0.1));
    const r = reflowRun([rotated, next], 0);
    expect(r[1].x_mm).toBeCloseTo(50 + 0.1);
  });

  it("locked member keeps its x and flow continues from its right edge", () => {
    const members = [mk(el("a", 60)), mk(el("locked", 200, 0.1, 0, true)), mk(el("c", 0, 0.1))];
    const r = reflowRun(members, 60);
    expect(r[1]).toEqual({ id: "locked", x_mm: 200 });        // unmoved
    expect(r[2].x_mm).toBeCloseTo(200 + 20 + 0.1);            // flows from locked's right edge
  });
});

describe("reflowDownstream — ISOLATION invariant", () => {
  it("leaves upstream members untouched; only edited+downstream move", () => {
    // a at 60 (w20), b at 80.1, c at 100.2 ; edit c's gap to 10
    const a = el("a", 60);
    const b = el("b", 80.1);
    const c = el("c", 100.2, 10);
    const r = reflowDownstream([mk(a), mk(b), mk(c)], "c");
    expect(r[0]).toEqual({ id: "a", x_mm: 60 });   // unchanged
    expect(r[1]).toEqual({ id: "b", x_mm: 80.1 }); // unchanged
    // c re-anchored after b's right edge (80.1+20) + its new gap 10
    expect(r[2].x_mm).toBeCloseTo(100.1 + 10);
  });

  it("editing the first member re-anchors the whole run from its own position", () => {
    const a = el("a", 60, 0.1);
    const b = el("b", 80.1);
    const r = reflowDownstream([mk(a), mk(b)], "a");
    expect(r[0].id).toBe("a");
    expect(r[1].x_mm).toBeCloseTo(r[0].x_mm + 20 + 0.1);
  });
});
