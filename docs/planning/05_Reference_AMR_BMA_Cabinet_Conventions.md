---
doc: 05 — Reference (observed house style) — as-built refresh
title: AMR / BMA Cabinet Layout Conventions & Component Library Seed
source: 8 as-built GA drawings (2026-05-30) + Project 01's realised seed (2026-06)
status: reference data — PARTLY REALISED in Project 01's library
confidence: high on structure/vocabulary; one dimension now measured, rest still estimates
last_updated: 2026-06-06
supersedes: the pre-build 05_Reference_AMR_BMA_Cabinet_Conventions.md
---

# AMR / BMA Cabinet Layout — Conventions & Component Library (as-built)

> **What this is.** The real house style from eight as-built BMA/AMR pump-station GA drawings, now
> cross-referenced with **what Project 01 actually implemented**. The observed conventions (enclosures,
> ducts, band order, tags, title blocks) are unchanged — they're field observations. The **library seed
> (§9)** is updated to the live `web/src/model/library.ts`: corrected keys, one **measured** dimension,
> and the new placed parts (stopper, label plate, custom). Deltas flagged **[as-built]**.

---

## 1. The source drawings (unchanged)

Eight as-builts for BMA (Department of Drainage and Sewerage) pump/drainage SCADA stations by AMR Asia:
`32_station`, `68_station`, `bang_ma`, `suan_dusit` (tall floor); `phai_sing_to`, `suan_dusit_wall`,
`wat_bueng`, `Tunnel-Layout` (wide box). 7 of 8 A4 landscape; `Tunnel-Layout` is A3 and **carries a full
BOM table** (§7). No extractable text layer — read visually. Source CAD: **GstarCAD 2020**.

> **[as-built confirmed]** Generated DXF from Project 01 opens directly in GstarCAD 2020 (units, base
> point, layers, monochrome). The Step-0 spike used the real **IDEC FC6A-D16R1CEE** DXF
> (`FC6A-D16-A4-P00467.dxf`).

---

## 2. Two enclosure form factors (became Project 01's templates)

- **A — Tall floor-standing:** exterior ≈ 2000 H × 800 W; **mounting plate ≈ 1500 mm tall**; 7–9 rows;
  side ducts 60×60. **[as-built]** = the `tall_floor` template (plate 800 × 1500, side duct 60×60).
- **B — Short / wide ventilated box (outdoor):** exterior ≈ 1200 H × 800 W; 4–5 rows; side ducts 40×60;
  INLET/OUTLET/FAN. **[as-built]** = the wide-box template.

Both are the **default enclosure templates** in Project 01's `factory.ts` (side ducts framed automatically).

---

## 3. Wire-duct rules — by form factor (unchanged)

| | Vertical side ducts | Horizontal row ducts |
|---|---|---|
| **Tall floor (A)** | **60 × 60 mm** both sides, full height | **40 × 60 mm** above & below every row |
| **Wide box (B)** | **40 × 60 mm** both sides | **40 × 60 mm** |

A duct frames both vertical sides; a horizontal duct separates every row. Confirm 40×60 (not 40×80) at
production. **[as-built]** Project 01 adds: row ducts auto-span between the side ducts; any duct snaps onto
the plate borders while dragging.

---

## 4. Plate anatomy (universal skeleton, unchanged)

```
┌─[ horizontal duct 40x60 ]──────────────────────────┐
│ V   ███ Row 1: POWER & PROTECTION                 V │
│ e  ─[ duct ]─────────────────────────────────────  e│
│ r   ███ Row 2: CONTROL & COMMS (PLC, I/O, modem)  r │
│ t  ─[ duct ]─────────────────────────────────────  t│
│ |   ███ Row 3: RELAYS                             | │
│ d  ─[ duct ]─────────────────────────────────────  d│
│ u   ███ Row 4..n: TERMINAL BLOCKS (the bulk)      u │
│ c  ─[ duct ]─────────────────────────────────────  c│
│ t   ███ Row n: POWER DISTRIBUTION                 t │
│ 60 ─[ duct ]─────────────────────────────────────  60│
│ x   ▂▂▂ GROUND BAR                                 x │
└────────────────────────────────────────────────────┘
```
Components clip to a 35 mm DIN rail per channel. Tall cabinets carry FAN01/FAN02 above the plate.

---

## 5. Functional row recipe (top → bottom) — the band order (unchanged)

1. **Band 1 — Power & protection:** MCB/MCP, aux breaker (S01), PSU (PS01), fuse holders (FO), SPD + surge
   arrester, thermostat (TS01).
2. **Band 2 — Control & comms:** PLC CPU, I/O modules (DI→DO/DIO→AI), MODEM and/or POE SWITCH, receptacle.
3. **Band 3 — Relays:** interposing relay sockets.
4. **Bands 4..n — Terminal blocks (bulk):** dense Degson rows, tag-numbered — **[as-built]** plus
   **stoppers / label plates** at row ends.
5. **Band n — Power distribution:** spaced power terminals / fuse holders.
6. **Bottom — Ground bar.**

**[as-built]** The order lives in each library item's `band` field; Project 01's per-row Pack uses it.

---

## 6. Tag / naming vocabulary (unchanged)

`MCB`/`MCP 2P`, `S01`, `PS01`, `FO1/FO2`, `SPD`/Surge Arrester, `TS01`, `FAN01/02`, `PB01`, `PLC01`,
`DI0x`, `DO0x`/`DIO0x`, `AI0x`, `MODEM`, `POE SWITCH`, `RCP01`, `TB0x`, `RL1/RL2/RY`, `B###`/`R###`/`F###`
(terminal-strip series), `GROUND BAR`. These are the defaults Projects 02 (wire numbering) and 03 (block
classification) should recognise.

---

## 7. The real BOM — canonical component set (unchanged reference)

*(verbatim from the `Tunnel-Layout` schedule — the standard SCADA-RTU panel build)*

| Qty | Component | Category |
|----:|-----------|----------|
| 1 | PLC IDEC FC6A-R16CE | PLC CPU |
| 1 | AI Mod IDEC FC6A-J8A1 | Analog input |
| 1 | DI Mod IDEC FC6A-N32B3 | Digital input |
| 1 | DIO Mod IDEC FC6A-M24BR1 | Digital I/O |
| 1 | Modem Robustel R1520-R4 | Cellular router |
| 1 | Switching Supply | 24 VDC PSU |
| 1 | MCP 2P | Main breaker |
| 1 | SPD / 1 Surge Arrester | Surge protection |
| 1 | Ground Bar 6 | Earth bar |
| 1 | Receptacle / 1 Thermostat NO | Service / fan |
| 53 | Relay 220VAC 2C · 8 Relay 24VDC 2C | Interposing relays |
| 102 | Terminal 2.5mm² 2C (Degson) · 25 × 4C | Feed-through terminals |
| 1 | Terminal Block 40 Pin · 2 Terminal Fuse Holder | Terminals |
| 56 | End Cover · 24 End Plate 2C · 6 End Plate 4C · 30 End Stopper Marker | **Accessories** |

> For **Project 03**: these drawings *embed a BOM table* (extraction target + validation), and
> **accessories are real BOM lines**. **[as-built note]** Project 01 now models the **stopper** and its
> **label** as *placed* parts (each its own `EQ_<key>` block), while the negligible-geometry accessories
> (end covers/plates/markers) stay BOM-only.

---

## 8. Title-block fields (for Project 04, unchanged)

Two+ templates: **BMA SCADA** (REMARK · CONTRACTOR · PROJECT · CONTRACT NO · TITLE · SITE LOCATION ·
DESIGN/DRAWN/CHECKED BY · SCALE · JOB NO · SHEET NO · CAD REF · DRAWING NO · REV/DATE/DESCRIPTION) and
**Dept. of Drainage grid** (border grid · DESIGNER · CLIENT · TITLE · SCALE · PROJECT NO · DRAWING NO ·
SHEET · REV), plus a T.PRO CONNECT sub-contractor variant. Title is consistently "EXTERNAL AND INTERNAL
GENERAL ARRANGEMENT". **[as-built note]** Project 01's DXF does **not** yet emit an attributed title-block
block (PDF/page output carries a title *line*); 04 still owns title blocks.

---

## 9. Component library seed (as-built — matches `web/src/model/library.ts`)

**[changed]** Keys use the `_` form actually shipped; the PLC entry is the **measured** FC6A-D16. DIN-module
widths are reliable; others remain `confirm:true` estimates to replace from datasheets.

```jsonc
{
  // Band 2 — control & comms
  "plc_idec_FC6A_R16CE":    { "band": 2, "width_mm": 95,    "height_mm": 90,     "confirm": true },
  "plc_idec_FC6A_D16":      { "band": 2, "width_mm": 70.19, "height_mm": 103.29, "confirm": false }, // MEASURED from DXF
  "io_idec_FC6A_J8A1":      { "band": 2, "width_mm": 30,    "height_mm": 90,     "confirm": true },
  "io_idec_FC6A_N32B3":     { "band": 2, "width_mm": 30,    "height_mm": 90,     "confirm": true },
  "io_idec_FC6A_M24BR1":    { "band": 2, "width_mm": 30,    "height_mm": 90,     "confirm": true },
  "modem_robustel_R1520_R4":{ "band": 2, "width_mm": 45,    "height_mm": 90,     "confirm": true },
  "poe_switch":             { "band": 2, "width_mm": 60,    "height_mm": 90,     "confirm": true },

  // Band 1 — power & protection
  "psu_switching_24vdc":    { "band": 1, "width_mm": 40, "height_mm": 110, "confirm": true },
  "mcp_2p":                 { "band": 1, "width_mm": 36, "height_mm": 85,  "confirm": false },
  "mcb_3p":                 { "band": 1, "width_mm": 54, "height_mm": 85,  "confirm": false },
  "breaker_aux_S01":        { "band": 1, "width_mm": 36, "height_mm": 85,  "confirm": false },
  "spd":                    { "band": 1, "width_mm": 36, "height_mm": 85,  "confirm": true },
  "surge_arrester":         { "band": 1, "width_mm": 18, "height_mm": 85,  "confirm": true },
  "fuse_holder":            { "band": 1, "width_mm": 18, "height_mm": 70,  "confirm": true },
  "thermostat_no":          { "band": 1, "width_mm": 45, "height_mm": 50,  "confirm": true },

  // Band 3 — relays
  "relay_220vac_2c":        { "band": 3, "width_mm": 15.5, "height_mm": 80, "confirm": true },
  "relay_24vdc_2c":         { "band": 3, "width_mm": 15.5, "height_mm": 80, "confirm": true },

  // Band 4 — terminal blocks  (+ the new placed accessories)
  "term_degson_2c_2_5":     { "band": 4, "width_mm": 5.2,  "height_mm": 50,   "confirm": true },
  "term_degson_4c_2_5":     { "band": 4, "width_mm": 5.2,  "height_mm": 50,   "confirm": true },
  "term_block_40pin":       { "band": 4, "width_mm": 60,   "height_mm": 40,   "confirm": true },
  "term_stopper":           { "band": 4, "width_mm": 9.5,  "height_mm": 43.2, "confirm": false }, // [added] end bracket
  "term_stopper_label":     {            "width_mm": 9.5,  "height_mm": 43.2, "confirm": false, "label_plate": true }, // [added] marker (no band; placed via "Stopper with Label")

  // Band 5 / 6
  "term_fuse_holder":       { "band": 5, "width_mm": 8,   "height_mm": 50, "confirm": true },
  "ground_bar_6":           { "band": 6, "width_mm": 120, "height_mm": 15, "confirm": true },

  // user-created at runtime: source "rect" + "custom": true — sized & named per instance (no CAD file)
  "_accessories_bom_only":  ["End Cover (Degson)", "End Plate 2C", "End Plate 4C", "End Stopper Marker"]
}
```

**[as-built] new library concepts:**
- `label_plate: true` on a rect — draws its tag **centred + vertical** (the stopper marker plate).
- `custom: true` on a rect — a **placeholder device** the engineer sizes/names; its part-no is drawn
  **centred + auto-fit**. One unique library item per placement.
- BOM-only accessories still take negligible geometry — not placed shapes.

---

## 10. How this maps to the four projects (updated)

- **Project 01 — realised.** Two enclosure templates (§2), duct rules (§3), band order (§5), seed library
  (§9) are all live in code; the FC6A-D16 dimension is now measured.
- **Project 03 — strengthened.** Block-classification dictionary (§6 tags + §7 parts) **plus** 01's
  `EQ_<lib_key>` block naming — a drawing from 01 is countable by block name out of the box.
- **Project 02 — concrete inputs.** B-/R-/F-series numbering (§6) and the relay/terminal vocabulary; 01's
  sets carry the `tag_start` sequence to reuse.
- **Project 04 — unchanged.** Two title-block templates (§8); 01 doesn't yet emit an attributed title block.

---

## 11. Variations & open questions (status)

1. **Duct size** — confirm 40×60 (still open). 2. **Row count** varies 4–9 (order fixed). 3. **Template
variants** — ≥ 3 + sub-contractor. 4. **Module dimensions** — FC6A-D16 measured; the rest still
`confirm:true`. 5. **PoE/modem mix** varies per station.
