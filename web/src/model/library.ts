/**
 * Seed equipment library + house-style constants, from 05_Reference (AMR/BMA).
 *
 * RULE (CLAUDE.md §0): dimensions flagged `confirm: true` are ESTIMATES and must
 * be replaced with datasheet/measured values before production. The upload flow
 * measures real DXFs and the engineer confirms (SKILL.md §3.1). The FC6A below is
 * already corrected from the Step-0 spike measurement (70.19 × 103.29 mm).
 */
import type { Library, LayoutDefaults } from "./types";

/** DIN modular device width unit (Ref 05 §9). */
export const DIN_MODULE_MM = 18;

/** Standard wire-duct face sizes; dragging the width edge snaps to these. (brief §7 Req5) */
export const STANDARD_DUCT_SIZES: ReadonlyArray<{ w: number; h: number }> = [
  { w: 30, h: 30 },
  { w: 30, h: 40 },
  { w: 40, h: 60 },
  { w: 60, h: 60 },
];

export const DEFAULT_DUCT_LENGTH_MM = 300;

export const DEFAULTS: LayoutDefaults = {
  gap_between_equipment_mm: 0.1,
  clearance_equipment_to_duct_mm: 3,
};

/** The two real enclosure form factors (Ref 05 §2). Plate size + side-duct rule. */
export const ENCLOSURE_TEMPLATES = {
  tall_floor: {
    label: "Tall floor-standing (≈2000×800)",
    plate: { width_mm: 800, height_mm: 1500 },
    side_duct: { width_mm: 60, label_h_mm: 60 }, // 60×60 both sides
    row_duct: { width_mm: 40, label_h_mm: 60 }, // 40×60 (confirm vs 40×80)
  },
  wide_box: {
    label: "Wide ventilated box (≈1200×800)",
    plate: { width_mm: 800, height_mm: 700 },
    side_duct: { width_mm: 40, label_h_mm: 60 }, // 40×60 both sides
    row_duct: { width_mm: 40, label_h_mm: 60 },
  },
} as const;

/**
 * Functional bands, top→bottom — the fixed packing order (Ref 05 §5).
 * Optional auto-pack flows parts into these bands then left→right within each.
 */
export const BANDS = [
  { band: 1, name: "Power & protection" },
  { band: 2, name: "Control & comms (PLC, IO, modem)" },
  { band: 3, name: "Relays" },
  { band: 4, name: "Terminal blocks" },
  { band: 5, name: "Power distribution" },
  { band: 6, name: "Ground bar" },
] as const;

/**
 * Seed parts. `confirm:true` = unconfirmed estimate (replace from datasheet/DXF).
 * Sizes are the device FOOTPRINT in mm (width × height as mounted).
 */
export const SEED_LIBRARY: Library = {
  // --- Band 2: control & comms ---
  plc_idec_FC6A_R16CE: {
    lib_key: "plc_idec_FC6A_R16CE", source: "rect", name: "PLC IDEC FC6A-R16CE",
    band: 2, width_mm: 95, height_mm: 90, confirm: true,
  },
  // Measured from the Step-0 spike DXF (FC6A-D16) — NOT an estimate.
  plc_idec_FC6A_D16: {
    lib_key: "plc_idec_FC6A_D16", source: "rect", name: "PLC IDEC FC6A-D16R1CEE",
    band: 2, width_mm: 70.19, height_mm: 103.29, confirm: false,
  },
  io_idec_FC6A_J8A1: {
    lib_key: "io_idec_FC6A_J8A1", source: "rect", name: "AI Mod IDEC FC6A-J8A1",
    band: 2, width_mm: 30, height_mm: 90, confirm: true,
  },
  io_idec_FC6A_N32B3: {
    lib_key: "io_idec_FC6A_N32B3", source: "rect", name: "DI Mod IDEC FC6A-N32B3",
    band: 2, width_mm: 30, height_mm: 90, confirm: true,
  },
  io_idec_FC6A_M24BR1: {
    lib_key: "io_idec_FC6A_M24BR1", source: "rect", name: "DIO Mod IDEC FC6A-M24BR1",
    band: 2, width_mm: 30, height_mm: 90, confirm: true,
  },
  modem_robustel_R1520_R4: {
    lib_key: "modem_robustel_R1520_R4", source: "rect", name: "Modem Robustel R1520-R4",
    band: 2, width_mm: 45, height_mm: 90, confirm: true,
  },
  poe_switch: {
    lib_key: "poe_switch", source: "rect", name: "PoE Switch",
    band: 2, width_mm: 60, height_mm: 90, confirm: true,
  },

  // --- Band 1: power & protection ---
  psu_switching_24vdc: {
    lib_key: "psu_switching_24vdc", source: "rect", name: "Switching Supply 24VDC",
    band: 1, width_mm: 40, height_mm: 110, confirm: true,
  },
  mcp_2p: {
    lib_key: "mcp_2p", source: "rect", name: "MCP 2P",
    band: 1, width_mm: 36, height_mm: 85, confirm: false,
  },
  mcb_3p: {
    lib_key: "mcb_3p", source: "rect", name: "MCB 3P",
    band: 1, width_mm: 54, height_mm: 85, confirm: false,
  },
  breaker_aux_S01: {
    lib_key: "breaker_aux_S01", source: "rect", name: "S01 aux breaker",
    band: 1, width_mm: 36, height_mm: 85, confirm: false,
  },
  spd: {
    lib_key: "spd", source: "rect", name: "SPD",
    band: 1, width_mm: 36, height_mm: 85, confirm: true,
  },
  surge_arrester: {
    lib_key: "surge_arrester", source: "rect", name: "Surge Arrester",
    band: 1, width_mm: 18, height_mm: 85, confirm: true,
  },
  fuse_holder: {
    lib_key: "fuse_holder", source: "rect", name: "Fuse Holder",
    band: 1, width_mm: 18, height_mm: 70, confirm: true,
  },
  thermostat_no: {
    lib_key: "thermostat_no", source: "rect", name: "Thermostat NO (TS01)",
    band: 1, width_mm: 45, height_mm: 50, confirm: true,
  },

  // --- Band 3: relays ---
  relay_220vac_2c: {
    lib_key: "relay_220vac_2c", source: "rect", name: "Relay 220VAC 2C",
    band: 3, width_mm: 15.5, height_mm: 80, confirm: true,
  },
  relay_24vdc_2c: {
    lib_key: "relay_24vdc_2c", source: "rect", name: "Relay 24VDC 2C",
    band: 3, width_mm: 15.5, height_mm: 80, confirm: true,
  },

  // --- Band 4: terminal blocks ---
  term_degson_2c_2_5: {
    lib_key: "term_degson_2c_2_5", source: "rect", name: "Degson 2.5mm² 2C",
    band: 4, width_mm: 5.2, height_mm: 50, confirm: true,
  },
  term_degson_4c_2_5: {
    lib_key: "term_degson_4c_2_5", source: "rect", name: "Degson 2.5mm² 4C",
    band: 4, width_mm: 5.2, height_mm: 50, confirm: true,
  },
  term_block_40pin: {
    lib_key: "term_block_40pin", source: "rect", name: "Terminal Block 40-pin",
    band: 4, width_mm: 60, height_mm: 40, confirm: true,
  },
  // End stopper (DIN-rail end bracket). Real dims, so confirm:false.
  term_stopper: {
    lib_key: "term_stopper", source: "rect", name: "Stopper",
    band: 4, width_mm: 9.5, height_mm: 43.2, confirm: false,
  },
  // The label/marker plate that pairs with a stopper — same footprint, centered
  // vertical text. No `band` so it isn't a standalone palette button; it is placed
  // (coincident with a stopper) only via the "Stopper with Label" action, and stays
  // a distinct part so BOM / CAD block-count tallies it as "1 label".
  term_stopper_label: {
    lib_key: "term_stopper_label", source: "rect", name: "Label for Stopper",
    width_mm: 9.5, height_mm: 43.2, confirm: false, label_plate: true,
  },

  // --- Band 5: power distribution ---
  term_fuse_holder: {
    lib_key: "term_fuse_holder", source: "rect", name: "Terminal Fuse Holder",
    band: 5, width_mm: 8, height_mm: 50, confirm: true,
  },

  // --- Band 6: ground ---
  ground_bar_6: {
    lib_key: "ground_bar_6", source: "rect", name: "Ground Bar 6-way",
    band: 6, width_mm: 120, height_mm: 15, confirm: true,
  },
};

/**
 * BOM-only accessories (Ref 05 §9): negligible geometry, but MUST appear in a BOM.
 * Modelled as zero-width items, never placed shapes. (CLAUDE.md / SKILL.md §5)
 */
export const BOM_ONLY_ACCESSORIES = [
  "End Cover (Degson)",
  "End Plate for Degson Terminal 2C",
  "End Plate for Degson Terminal 4C",
  "End Stopper Marker Degson",
] as const;
