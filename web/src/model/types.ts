/**
 * The layout model — the SINGLE SOURCE OF TRUTH.
 *
 * Fabric.js is only a view; every export (DXF/PDF/PNG/SVG) renders from THIS model,
 * never from the canvas. See SKILL.md §4 and CLAUDE.md §2.
 *
 * Units: millimetres (mm) throughout. Origin: top-left, +x right, +y DOWN
 * (the editor convention). Conversion to DXF bottom-left happens in exactly one
 * place — see geometry.ts `topLeftToBottomLeft`. (CLAUDE.md §4.)
 */

export type RotDeg = number; // degrees; presets 0/90/180/270 but any angle allowed

/** Where a label is pinned. */
export type LabelAnchor = `element:${string}` | `group:${string}`;

export interface ProjectMeta {
  id: string;
  name: string;
  panel_tag: string;
  rev: string;
}

export interface Plate {
  width_mm: number;
  height_mm: number;
  /** Editor convention; the only supported value. */
  origin: "top_left";
}

export interface LayoutDefaults {
  /** Default gap between adjacent equipment (QC/hardware tolerance). */
  gap_between_equipment_mm: number;
  /** Default minimum clearance from equipment to a wire duct. */
  clearance_equipment_to_duct_mm: number;
}

export interface Duct {
  id: string;
  x_mm: number;
  y_mm: number;
  /** Runs along the duct's orientation; the only geometry that may be free-dragged. */
  length_mm: number;
  /** Drawn thickness across the run; snaps to standard sizes. Affects layout. */
  width_mm: number;
  /** LABEL-ONLY second number ("40x60") — never affects geometry. (brief §7 Req5) */
  label_h_mm: number;
  rot_deg: RotDeg;
}

export interface Element {
  id: string;
  /** Resolves against the equipment library. */
  lib_key: string;
  tag: string;
  x_mm: number;
  y_mm: number;
  rot_deg: RotDeg;
  /** Per-instance gap before this element in its local run (overrides default). */
  gap_before_mm: number;
  /** Per-instance duct clearance (overrides default). */
  clearance_to_duct_mm: number;
  /** Non-null if this element belongs to an (exploded) group. */
  group_id: string | null;
  locked: boolean;
}

export interface Group {
  id: string;
  kind: "set";
  lib_key: string;
  count: number;
  internal_gap_mm: number;
  /** Optional auto-tag sequence, e.g. "B101". */
  tag_start: string | null;
  tag_step: number;
  x_mm: number;
  y_mm: number;
  rot_deg: RotDeg;
  /** When true, members become individually editable Elements. */
  exploded: boolean;
  label_id: string | null;
}

export interface Label {
  id: string;
  text: string;
  anchor: LabelAnchor;
  dx_mm: number;
  dy_mm: number;
  rot_deg: RotDeg;
}

export interface DisplayPrefs {
  show_row_clearance_dims: boolean;
  snap_enabled: boolean;
}

export interface LayoutModel {
  project: ProjectMeta;
  plate: Plate;
  defaults: LayoutDefaults;
  ducts: Duct[];
  elements: Element[];
  groups: Group[];
  labels: Label[];
  display: DisplayPrefs;
}

/* ----------------------------- Library items ----------------------------- */

/** Common fields for every library entry. */
interface LibItemBase {
  lib_key: string;
  /** Display name (for sidebar + BOM). */
  name: string;
  /** Functional band 1..6 (Ref 05 §5), used by optional auto-pack. */
  band?: number;
  /** True while a dimension is an unconfirmed estimate (Ref 05 §9). */
  confirm?: boolean;
  /**
   * Distance (mm) from the part's TOP edge down to the DIN-rail centerline — the
   * common mounting reference parts align to. Undefined = the part's vertical
   * centre (height/2). Used by the editor's rail-snap alignment. (brief §7 / DIN)
   */
  rail_offset_mm?: number;
}

/** Uploaded DXF: the ezdxf service holds block + SVG + measured size. */
export interface DxfLibItem extends LibItemBase {
  source: "dxf";
  width_mm: number;
  height_mm: number;
  /** Storage id of the retained DXF block (re-embedded on DXF export). */
  block_ref: string;
  /** Reference/inline SVG for the editor view. */
  svg_ref: string;
}

/** Built-in parametric symbol, drawn identically in SVG and DXF. */
export interface SymbolLibItem extends LibItemBase {
  source: "symbol";
  symbol: "pilot_lamp" | "push_button" | "selector";
  width_mm: number;
  height_mm: number;
}

/** Custom rectangle: typed size + name that auto-fits inside (wraps, never overflows). */
export interface RectLibItem extends LibItemBase {
  source: "rect";
  width_mm: number;
  height_mm: number;
}

export type LibItem = DxfLibItem | SymbolLibItem | RectLibItem;

/** Keyed by lib_key. */
export type Library = Record<string, LibItem>;
