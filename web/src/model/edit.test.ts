import { describe, it, expect } from "vitest";
import { addElement, moveEntity, setRotation, deleteEntity, updateElement, snap,
  stepTag, addSet, explodeGroup, addLabel, snapDuctThickness, ductDimsFromBox } from "./edit";
import { newModel } from "./factory";
import { SEED_LIBRARY } from "./library";

describe("snap", () => {
  it("rounds to step, passes through when step<=0", () => {
    expect(snap(12.4, 1)).toBe(12);
    expect(snap(12.6, 1)).toBe(13);
    expect(snap(12.46, 0.1)).toBeCloseTo(12.5);
    expect(snap(12.46, 0)).toBe(12.46);
  });
});

describe("addElement", () => {
  it("adds a resolvable element with defaults and returns its id", () => {
    const m0 = newModel("T", "tall_floor");
    const { model, id } = addElement(m0, "relay_24vdc_2c", SEED_LIBRARY);
    expect(model.elements).toHaveLength(1);
    const el = model.elements[0];
    expect(el.id).toBe(id);
    expect(el.lib_key).toBe("relay_24vdc_2c");
    expect(el.gap_before_mm).toBe(m0.defaults.gap_between_equipment_mm);
    // placed inside the left side duct (60mm) + 10
    expect(el.x_mm).toBe(70);
    expect(m0.elements).toHaveLength(0); // original untouched (immutable)
  });
});

describe("move / rotate / update / delete", () => {
  const base = () => addElement(newModel("T"), "relay_24vdc_2c", SEED_LIBRARY);

  it("moves an element without touching others", () => {
    const { model, id } = base();
    const m2 = moveEntity(model, "element", id, 123.4, 222.2);
    expect(m2.elements[0]).toMatchObject({ x_mm: 123.4, y_mm: 222.2 });
  });

  it("normalizes rotation into [0,360)", () => {
    const { model, id } = base();
    expect(setRotation(model, "element", id, 450).elements[0].rot_deg).toBe(90);
    expect(setRotation(model, "element", id, -90).elements[0].rot_deg).toBe(270);
  });

  it("updates arbitrary fields", () => {
    const { model, id } = base();
    const m2 = updateElement(model, id, { tag: "RL1", gap_before_mm: 5 });
    expect(m2.elements[0]).toMatchObject({ tag: "RL1", gap_before_mm: 5 });
  });

  it("deleting an element also removes labels anchored to it", () => {
    const { model: base0, id } = base();
    const model = { ...base0, labels: [{ id: "L1", text: "x", anchor: `element:${id}` as const, dx_mm: 0, dy_mm: 0, rot_deg: 0 }] };
    const m2 = deleteEntity(model, "element", id);
    expect(m2.elements).toHaveLength(0);
    expect(m2.labels).toHaveLength(0);
  });
});

describe("stepTag", () => {
  it("steps the numeric suffix keeping prefix + zero-pad", () => {
    expect(stepTag("B101", 0)).toBe("B101");
    expect(stepTag("B101", 1)).toBe("B102");
    expect(stepTag("B099", 2)).toBe("B101");
    expect(stepTag("R001", 9)).toBe("R010");
    expect(stepTag("X", 3)).toBe("X3");
  });
});

describe("addSet / explodeGroup", () => {
  it("adds a set group then explodes it into auto-tagged elements", () => {
    const m0 = newModel("T");
    const { model, id } = addSet(m0, "term_degson_2c_2_5", 4, { tag_start: "B101", internal_gap_mm: 0.1 });
    expect(model.groups).toHaveLength(1);

    const ex = explodeGroup(model, id, SEED_LIBRARY);
    expect(ex.groups).toHaveLength(0);
    expect(ex.elements).toHaveLength(4);
    expect(ex.elements.map((e) => e.tag)).toEqual(["B101", "B102", "B103", "B104"]);
    // laid left→right: each after the previous (width 5.2 + gap 0.1)
    expect(ex.elements[1].x_mm).toBeCloseTo(ex.elements[0].x_mm + 5.2 + 0.1);
  });
});

describe("duct resize", () => {
  it("snaps thickness to the nearest standard face", () => {
    expect(snapDuctThickness(33)).toBe(30);
    expect(snapDuctThickness(44)).toBe(40);
    expect(snapDuctThickness(58)).toBe(60);
  });
  it("maps a resized box to length (free) + snapped thickness by orientation", () => {
    // horizontal duct: boxW = length, boxH = thickness
    expect(ductDimsFromBox(0, 712.3, 42)).toEqual({ length_mm: 712.3, width_mm: 40 });
    // vertical duct: boxW = thickness, boxH = length
    expect(ductDimsFromBox(90, 58, 1490.7)).toEqual({ length_mm: 1490.7, width_mm: 60 });
  });
});

describe("addLabel + moveEntity(label)", () => {
  it("creates a label and a move updates its offset from the anchor", () => {
    const { model, id } = addElement(newModel("T"), "mcp_2p", SEED_LIBRARY, 100, 200);
    const { model: m2, id: lid } = addLabel(model, "element", id);
    expect(m2.labels[0]).toMatchObject({ id: lid, anchor: `element:${id}` });
    // drop the label at absolute (120, 190) → offset (20, -10) from the element at (100,200)
    const m3 = moveEntity(m2, "label", lid, 120, 190);
    expect(m3.labels[0]).toMatchObject({ dx_mm: 20, dy_mm: -10 });
  });
});

describe("locked pairs (pair_id)", () => {
  function pair() {
    const a = addElement(newModel("T"), "term_stopper", SEED_LIBRARY, 100, 200);
    const b = addElement(a.model, "term_stopper_label", SEED_LIBRARY, 100, 200);
    let m = updateElement(b.model, a.id, { pair_id: "p1" });
    m = updateElement(m, b.id, { pair_id: "p1" });
    return { m, stopper: a.id, label: b.id };
  }

  it("moving one paired element moves its pair-mate by the same delta", () => {
    const { m, stopper, label } = pair();
    const m2 = moveEntity(m, "element", stopper, 150, 260); // delta +50, +60
    expect(m2.elements.find((e) => e.id === stopper)).toMatchObject({ x_mm: 150, y_mm: 260 });
    expect(m2.elements.find((e) => e.id === label)).toMatchObject({ x_mm: 150, y_mm: 260 });
  });

  it("deleting one of a pair removes the whole unit", () => {
    const { m } = pair();
    expect(deleteEntity(m, "element", m.elements[1].id).elements).toHaveLength(0);
  });

  it("an unpaired element moves alone", () => {
    const a = addElement(newModel("T"), "term_stopper", SEED_LIBRARY, 100, 200);
    const b = addElement(a.model, "mcp_2p", SEED_LIBRARY, 100, 200);
    const m2 = moveEntity(b.model, "element", a.id, 150, 200);
    expect(m2.elements.find((e) => e.id === b.id)).toMatchObject({ x_mm: 100, y_mm: 200 });
  });
});
