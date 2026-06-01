/**
 * Validation — the data model is the contract. (CLAUDE.md §2)
 *
 * We FLAG problems; we never silently coerce. `error` = structurally invalid;
 * `warning` = allowed but worth surfacing (e.g. clearance too tight, off-plate —
 * the "warn-but-allow" boundary rule). The UI shows these; nothing is hidden.
 */
import type { LayoutModel, Library } from "./types";
import { placedBox, boxWithinPlate } from "./geometry";
import { libItemSize } from "./resolve";
import { findOverlaps } from "./overlap";

export type IssueLevel = "error" | "warning";

export interface Issue {
  level: IssueLevel;
  /** Stable code for tests/UX, e.g. "UNRESOLVED_LIB_KEY". */
  code: string;
  message: string;
  /** Offending entity id, when applicable. */
  ref?: string;
}

export function validate(model: LayoutModel, library: Library): Issue[] {
  const issues: Issue[] = [];
  const add = (level: IssueLevel, code: string, message: string, ref?: string) =>
    issues.push({ level, code, message, ref });

  // --- structural: plate origin ---
  if (model.plate.origin !== "top_left") {
    add("error", "BAD_ORIGIN", `plate.origin must be "top_left"`, "plate");
  }
  if (model.plate.width_mm <= 0 || model.plate.height_mm <= 0) {
    add("error", "BAD_PLATE_SIZE", "plate width/height must be > 0", "plate");
  }

  // --- structural: unique ids ---
  const seen = new Set<string>();
  const ids = [
    ...model.ducts.map((d) => d.id),
    ...model.elements.map((e) => e.id),
    ...model.groups.map((g) => g.id),
    ...model.labels.map((l) => l.id),
  ];
  for (const id of ids) {
    if (seen.has(id)) add("error", "DUPLICATE_ID", `duplicate id "${id}"`, id);
    seen.add(id);
  }

  const elementIds = new Set(model.elements.map((e) => e.id));
  const groupIds = new Set(model.groups.map((g) => g.id));

  // --- elements: resolvable lib_key, group ref, size, clearance ---
  const plateSize = { w: model.plate.width_mm, h: model.plate.height_mm };
  for (const el of model.elements) {
    const item = library[el.lib_key];
    if (!item) {
      add("error", "UNRESOLVED_LIB_KEY", `element "${el.id}" lib_key "${el.lib_key}" not in library`, el.id);
      continue;
    }
    if (el.group_id && !groupIds.has(el.group_id)) {
      add("error", "BAD_GROUP_REF", `element "${el.id}" references missing group "${el.group_id}"`, el.id);
    }
    const size = libItemSize(item);
    if (size.w <= 0 || size.h <= 0) {
      add("error", "BAD_SIZE", `element "${el.id}" has non-positive size`, el.id);
    }
    if (el.clearance_to_duct_mm < model.defaults.clearance_equipment_to_duct_mm) {
      add("warning", "CLEARANCE_TIGHT",
        `element "${el.id}" duct clearance ${el.clearance_to_duct_mm}mm < default ${model.defaults.clearance_equipment_to_duct_mm}mm`,
        el.id);
    }
    const box = placedBox({ x: el.x_mm, y: el.y_mm }, size, el.rot_deg);
    if (!boxWithinPlate(box, plateSize)) {
      add("warning", "OFF_PLATE", `element "${el.id}" extends beyond the plate (warn-but-allow)`, el.id);
    }
  }

  // --- groups: resolvable lib_key, count, label ref ---
  for (const g of model.groups) {
    if (!library[g.lib_key]) {
      add("error", "UNRESOLVED_LIB_KEY", `group "${g.id}" lib_key "${g.lib_key}" not in library`, g.id);
    }
    if (g.count <= 0) {
      add("error", "BAD_COUNT", `group "${g.id}" count must be > 0`, g.id);
    }
    if (g.label_id && !model.labels.some((l) => l.id === g.label_id)) {
      add("error", "BAD_LABEL_REF", `group "${g.id}" references missing label "${g.label_id}"`, g.id);
    }
  }

  // --- ducts: positive size, label-only height isolation handled by schema ---
  for (const d of model.ducts) {
    if (d.length_mm <= 0 || d.width_mm <= 0) {
      add("error", "BAD_DUCT_SIZE", `duct "${d.id}" length/width must be > 0`, d.id);
    }
  }

  // --- labels: anchor must resolve ---
  for (const l of model.labels) {
    const [kind, refId] = l.anchor.split(":");
    const ok = kind === "element" ? elementIds.has(refId) : kind === "group" ? groupIds.has(refId) : false;
    if (!ok) {
      add("error", "BAD_ANCHOR", `label "${l.id}" anchor "${l.anchor}" does not resolve`, l.id);
    }
  }

  // --- overlaps: nothing on the plate should overlap (warn-but-allow) ---
  for (const p of findOverlaps(model, library).pairs) {
    add("warning", "OVERLAP", `"${p.a.label}" overlaps "${p.b.label}"`, p.a.id);
  }

  return issues;
}

export function hasErrors(issues: Issue[]): boolean {
  return issues.some((i) => i.level === "error");
}
