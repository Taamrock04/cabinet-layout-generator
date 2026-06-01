import { describe, it, expect } from "vitest";
import { validate, hasErrors } from "./validate";
import { newModel } from "./factory";
import { SEED_LIBRARY } from "./library";
import type { LayoutModel } from "./types";

function baseModel(): LayoutModel {
  return newModel("Test", "tall_floor");
}

describe("validate", () => {
  it("a fresh model from the factory is error-free", () => {
    const issues = validate(baseModel(), SEED_LIBRARY);
    expect(hasErrors(issues)).toBe(false);
  });

  it("flags an unresolved lib_key as an error", () => {
    const m = baseModel();
    m.elements.push({
      id: "e1", lib_key: "does_not_exist", tag: "X", x_mm: 70, y_mm: 100, rot_deg: 0,
      gap_before_mm: 0.1, clearance_to_duct_mm: 3, group_id: null, locked: false,
    });
    const issues = validate(m, SEED_LIBRARY);
    expect(issues.some((i) => i.code === "UNRESOLVED_LIB_KEY")).toBe(true);
    expect(hasErrors(issues)).toBe(true);
  });

  it("warns (not errors) on tight clearance and off-plate — warn-but-allow", () => {
    const m = baseModel();
    m.elements.push({
      id: "e1", lib_key: "relay_24vdc_2c", tag: "RL1",
      x_mm: m.plate.width_mm - 2, y_mm: 100, rot_deg: 0,
      gap_before_mm: 0.1, clearance_to_duct_mm: 1, group_id: null, locked: false,
    });
    const issues = validate(m, SEED_LIBRARY);
    expect(issues.some((i) => i.code === "CLEARANCE_TIGHT" && i.level === "warning")).toBe(true);
    expect(issues.some((i) => i.code === "OFF_PLATE" && i.level === "warning")).toBe(true);
    expect(hasErrors(issues)).toBe(false);
  });

  it("flags duplicate ids and bad label anchors", () => {
    const m = baseModel();
    m.elements.push({
      id: "dup", lib_key: "relay_24vdc_2c", tag: "RL1", x_mm: 70, y_mm: 100, rot_deg: 0,
      gap_before_mm: 0.1, clearance_to_duct_mm: 3, group_id: null, locked: false,
    });
    m.labels.push({ id: "dup", text: "x", anchor: "element:nope", dx_mm: 0, dy_mm: 0, rot_deg: 0 });
    const issues = validate(m, SEED_LIBRARY);
    expect(issues.some((i) => i.code === "DUPLICATE_ID")).toBe(true);
    expect(issues.some((i) => i.code === "BAD_ANCHOR")).toBe(true);
  });
});
