import { describe, it, expect } from "vitest";
import { addElement, moveEntity, setRotation, deleteEntity, updateElement, snap } from "./edit";
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
    let { model, id } = base();
    model = { ...model, labels: [{ id: "L1", text: "x", anchor: `element:${id}`, dx_mm: 0, dy_mm: 0, rot_deg: 0 }] };
    const m2 = deleteEntity(model, "element", id);
    expect(m2.elements).toHaveLength(0);
    expect(m2.labels).toHaveLength(0);
  });
});
