---
doc: SKILL — Cabinet Layout Generator
purpose: Architecture, pipeline, data shapes, and dependencies a fresh contributor needs to build/extend this tool
status: Phase 1 complete — multi-user (Phase 2) not started
last_updated: 2026-06-06
---

# SKILL — Cabinet Layout Generator

> **One line.** A manual-first 2D editor for laying out a control-cabinet equipment back-plate
> (drag/drop real parts onto an adjustable plate, with wire ducts, terminal sets, labels, per-element
> spacing) that exports a real DXF (opens in GstarCAD 2020) plus PDF/PNG/SVG — all from one JSON model,
> on an all-free stack.

This file is the **technical map**. For the *rules the code and AI must obey* (validation, the
"never invent geometry" law, the AI socket, coding conventions), see [`CLAUDE.md`](CLAUDE.md).

The domain conventions baked in below (enclosure sizes, band order, duct rules, the seed library)
come from AMR's internal cabinet-drawing reference. You don't need those documents to work on the
code — the rules that matter are restated here and enforced in `web/src/model/`.

---

## 1. The non-negotiable principle

**AI structures/interprets data. Deterministic code produces geometry. A human reviews in CAD.**
In v1 the AI is **off** (socketed for later — see `CLAUDE.md §1`). Every line, rectangle, text, and
block insert in any export is produced by deterministic code from the validated JSON model. Nothing is
"imagined." This is a safety requirement, not a style choice — a wrong terminal or clearance goes to a
panel shop.

---

## 2. System shape (three tiers, all free)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ BROWSER  — React + Fabric.js editor (Phase 1: Vercel → Phase 2: Cloudflare Pages)     │
│  • Fabric canvas = THE VIEW ONLY (drag/drop, grips, rotate, per-gap/clearance, sets)  │
│  • Holds + mutates the ONE JSON layout model (the source of truth)                    │
│  • Renders model → Fabric objects for editing                                         │
│  • Exports PDF / PNG / SVG entirely in-browser (model → SVG → format)                 │
└───────────────┬───────────────────────────────────────────────┬───────────────────────┘
                │ (DXF upload, DXF export ONLY)                   │ (auth, projects, library)
                ▼                                                 ▼
┌──────────────────────────────────────┐        ┌──────────────────────────────────────┐
│ ezdxf SERVICE — Python + FastAPI      │        │ SUPABASE — free tier   (Phase 2)      │
│ (Render free tier; stateless)         │        │  • Auth: Google + GitHub OAuth        │
│  • UPLOAD: DXF → normalize units/base │        │    + email allowlist + display name   │
│    → clean SVG + measured bbox        │        │  • shared projects + layouts (JSON)   │
│    → retain block for re-embedding    │        │  • shared + project-local library     │
│  • EXPORT: model + block IDs →        │◄──────►│    (raw DXF in Storage + metadata)    │
│    assemble .dxf (re-embed blocks,    │        │  • audit log, share-links             │
│    layered DUCT/EQUIP/TEXT/GROUND)    │        │  • keep-alive cron (avoids 7d pause)  │
│  • Validates token per call + CORS    │        │  • service key server-side only       │
└──────────────────────────────────────┘        └──────────────────────────────────────┘
```

**Why this split**
- **The browser never parses DXF.** ezdxf does all DXF parse/convert/embed — robust for any DXF
  GstarCAD emits (splines/hatches/dims).
- **The ezdxf service is stateless** and touched **only on DXF upload and DXF export** — never during
  editing or PDF/PNG/SVG export. So its free-tier cold-start is rare and isolated; everyday use never
  waits on it. Show a "waking service…" state on first DXF op after idle.
- **One JSON model is the truth.** Fabric is only the view; **every export renders from the model**, so
  output is clean, deterministic, carries the title block, and never contains editor UI (handles/grid).

> **Phase 1 (shipped) is the left + middle tiers only.** Supabase is Phase 2 and not yet wired; the
> editor currently persists layouts as local JSON.

---

## 3. Pipelines (the three flows that matter)

### 3.1 Equipment upload → library
```
user uploads equipment DXF (drag-drop onto the library, or the upload button)
  → ezdxf service: normalize units + base-point, measure bbox, retain block, render clean SVG
  → UI confirm modal: "this part measured 70.19 × 103.29 mm — correct?"   ← MUST confirm before save
  → on confirm: the measured part joins the library (Phase 2: raw DXF + metadata + SVG persisted to Supabase)
```

### 3.2 Compose → live edit (no backend touched)
```
JSON model  ⇄  Fabric.js canvas (render model → objects; user edits → mutate model)
  • undo/redo throughout
  • local re-flow: editing one gap_before_mm shifts only downstream-in-that-run, never the whole plate
  • equipment = move + rotate only (size changes only by typed mm); duct length + plate are the free-drag exceptions
  • ducts snap to plate borders + perpendicular ducts; row ducts auto-span between the side ducts
  • locked pairs (stopper + its coincident label) move / rotate / delete as one unit, via a shared pair_id
  • "Custom part" = a per-instance rect the engineer sizes + names (placeholder for parts without a CAD file)
```

### 3.3 Export
```
DXF  → ezdxf service: assemble model; EVERY part placed as a named block EQ_<lib_key> (uploaded DXFs
        re-embedded, rect/symbol parts a unit rectangle) so CAD Count Block / BOM can tally each part.
        Tags + label/custom centre text are separate TEXT. Layers DUCT/EQUIP/TEXT/GROUND.
        scale chooser 1:1 or 1:100 (default 1:100); at 1:100 geometry is 1/100 size but DIMENSION TEXT
        READS THE REAL VALUE ("1500", not "15"); all layers monochrome (ACI 7) so it prints black. GstarCAD 2020.
PDF  → in-browser: model → SVG → vector PDF (svg2pdf.js + jsPDF); paper A3/A4 auto fit-to-page;
        title prints "SCALE 1:1X — PAPER SIZE: A3/A4"; dimensions read real values. Vector, never raster.
PNG  → in-browser: model → SVG → <canvas> → toBlob; A3/A4.
SVG  → in-browser: serialize the model's SVG (smallest; also reused for a future share-by-link snapshot).
```

---

## 4. The data model (single source of truth)

One JSON document per layout. Everything placed is a selectable element with position + rotation;
gaps, clearances, ducts, groups, labels are first-class. (Implemented in `web/src/model/types.ts`.)

```json
{
  "project": { "id": "uuid", "name": "Pump Station 32", "panel_tag": "MCC-01", "rev": "A" },
  "plate":   { "width_mm": 800, "height_mm": 1500, "origin": "top_left" },
  "defaults":{ "gap_between_equipment_mm": 0.1, "clearance_equipment_to_duct_mm": 3 },

  "ducts": [
    { "id": "WW_L", "x_mm": 0,  "y_mm": 0,  "length_mm": 1500, "width_mm": 60, "label_h_mm": 60, "rot_deg": 90 },
    { "id": "WW_1", "x_mm": 60, "y_mm": 40, "length_mm": 300,  "width_mm": 40, "label_h_mm": 60, "rot_deg": 0  }
  ],

  "elements": [
    { "id": "e1", "lib_key": "relay_24vdc_2c", "tag": "RL1",
      "x_mm": 70, "y_mm": 120, "rot_deg": 0,
      "gap_before_mm": 0.1, "clearance_to_duct_mm": 3,
      "group_id": null, "locked": false }
  ],

  "groups": [
    { "id": "g1", "kind": "set", "lib_key": "term_degson_2c_2_5", "count": 12,
      "internal_gap_mm": 0.1, "tag_start": "B101", "tag_step": 1,
      "x_mm": 70, "y_mm": 300, "rot_deg": 0, "exploded": false, "label_id": "L1" }
  ],

  "labels": [
    { "id": "L1", "text": "24VDC", "anchor": "group:g1",   "dx_mm": 0, "dy_mm": -6, "rot_deg": 0 }
  ],

  "display": { "show_row_clearance_dims": true, "snap_enabled": true }
}
```

**Field notes:**
- `plate.origin = "top_left"` — editor convention. DXF is bottom-left; convert in **exactly one place** (`CLAUDE.md §4`).
- `gap_before_mm` is per-element; editing it re-flows only downstream in that local run.
- `clearance_to_duct_mm` overrides the global default per element.
- Duct `width_mm` snaps to the house faces (custom via dialog); `label_h_mm` is **label-only** (no geometry).
  `length_mm` is the only geometry that may be free-dragged (besides the plate).
- Group `kind:"set"` inserts as one object; `exploded:true` lets members be edited individually.
- Element `pair_id` (optional): elements sharing it are a **locked unit** — they move / rotate / delete
  together (e.g. a stopper + its coincident label) — while staying distinct parts for the BOM.
- Label `anchor` is `element:<id>` or `group:<id>`; the label moves with its anchor; exported as DXF TEXT.

### Library item shapes (resolved by `lib_key`)
```json
{ "lib_key": "...", "source": "dxf",  "width_mm": 95, "height_mm": 90, "block_ref": "<id>", "svg_ref": "..." }
{ "lib_key": "...", "source": "rect", "width_mm": 60, "height_mm": 40, "name": "Terminal Block 40 Pin" }
{ "lib_key": "...", "source": "rect", "width_mm": 9.5, "height_mm": 43.2, "name": "Label for Stopper", "label_plate": true }
{ "lib_key": "...", "source": "rect", "width_mm": 60, "height_mm": 40, "name": "ACME-XR500", "custom": true }
```
- `dxf` — service holds block + SVG + measured size.
- `rect` — typed width/height/name; the part `tag` is drawn above.
- `rect` + `label_plate` — marker plate: the tag is drawn **centered + vertical** (the stopper label).
- `rect` + `custom` — a user-defined placeholder; its `name` (model/part-no) is drawn **centered, auto-fit**
  so it never overflows, with the tag still above. One unique library item is created per placement.

The seed library lives in `web/src/model/library.ts`. Replace every `confirm:true` dimension with
datasheet values before production use.

---

## 5. Domain rules baked in

- **Two enclosure templates:** Tall floor — plate ≈ **800 × 1500 mm**, 7–9 rows, side ducts **60×60**;
  Wide box — exterior ≈ 1200×800, 4–5 rows, side ducts **40×60**. Horizontal row ducts **40×60**.
- **Fixed band order top→bottom** (the default for auto-pack): Power & protection → Control/comms
  (PLC, IO, modem) → Relays → Terminal blocks (bulk) → Power distribution → Ground bar.
- **DIN module ≈ 18 mm/module.** Components clip to a 35 mm top-hat rail.
- **Terminal accessories:** the **Stopper** (9.5 × 43.2) and its **Label** marker plate are *placed*
  parts (Band 4) — drawn and individually counted. Accessories with negligible geometry (end covers,
  end plates, stopper-markers) stay **BOM-only** — they count in a BOM but are not placed shapes.

**Auto-pack (optional):** flow components left→right within the fixed bands; 0.1 mm gap, ≥3 mm to ducts;
honor `locked`; validate plate fit and report overflow itemized (never silently crop). It only seeds a
draft the engineer then edits — never required, never the final word.

---

## 6. Tech stack & dependencies

| Layer | Choice | Notes |
|-------|--------|-------|
| Editor frontend | **React 19 + Vite + TypeScript** | Fabric.js v7 canvas; imports SVG as true vector objects |
| In-browser export | **svg2pdf.js + jsPDF** | vector PDF; PNG via canvas `toBlob`; SVG via serialize |
| DXF service | **Python + FastAPI + ezdxf 1.4.4** | DXF read/write; native SVG backend + Pillow (no matplotlib) |
| Tests | **Vitest** (web) | pure model/render core, no DOM dependency |
| Backend/DB/storage/auth | **Supabase** free tier *(Phase 2)* | pauses after 7d idle → keep-alive cron |
| Static hosting | **Vercel (P1) → Cloudflare Pages (P2)** | move the finished multi-user tool to Cloudflare |

**All free, every layer.** Keep data portable: layouts as JSON, equipment as raw DXF (anti-lock-in).

---

## 7. Hard invariants (break these and the tool is wrong)

1. **Render exports from the JSON model, not the canvas** — or output picks up editor UI / pixel artifacts.
2. **Never AI-generate geometry/connectivity/part data** — only place/structure validated input.
3. **No free-resize of equipment** — size only via typed mm. Only duct length and the plate free-drag.
   Rotated footprint uses the **rotated bounding box** (90° swaps W×H).
4. **Local re-flow isolation** — editing one `gap_before_mm` shifts only downstream-in-that-run, never global.
5. **Coordinate origin converted in exactly one place** — editor top-left ↔ DXF bottom-left.
6. **DXF places every part as a named block** `EQ_<lib_key>` (uploaded DXFs re-embedded, rect/symbol a
   unit rectangle) with the correct transform; layered DUCT/EQUIP/TEXT/GROUND; tags/centre text separate.
7. **At 1:100 the geometry scales but dimension text reads the real value.**
8. **ezdxf service validates the token + restricts CORS** — it is not an open DXF endpoint.
9. **Plate boundary = warn-but-allow** (flag overflow; don't silently block or overlap).
10. **Degrade gracefully** — the editor + in-browser exports work with no backend at all.

---

## 8. Build sequence

- **Step 0 — ezdxf round-trip SPIKE — done.** FC6A-D16 DXF → ezdxf → SVG → place → export DXF → opened
  in GstarCAD 2020; units, base point and fidelity confirmed.
- **Phase 1 — editor + ezdxf service — complete.** JSON model + Fabric canvas + library (rect +
  uploaded-DXF via service) + ducts (length drag / width snap / border-snap / auto-span) + sets + labels
  + per-gap/clearance editing + rows with dimensions + packing + stopper/label locked pairs + custom
  placeholder parts + all exports (DXF = every part a named block). Hosted on Vercel + Render.
- **Phase 2 — multi-user (next):** Supabase auth (Google/GitHub + allowlist + display name) + shared
  projects + shared/project-local library + audit log + keep-alive cron. Move frontend to **Cloudflare
  Pages** (settle host/domain before wiring OAuth).
- **Phase 3 — sharing & portability:** share-by-link (SVG snapshot, no-login viewer, expiry) + `.amrlib`
  bundle export/import.

---

## 9. Repo layout

```
cabinet-layout-generator/
  README.md                 ← product overview (with rendered showcase drawings)
  SKILL.md                  ← this file — architecture & data shapes
  CLAUDE.md                 ← the rules: never invent geometry, AI socket, validation, conventions
  RUNNING.md  DEPLOY.md     ← run locally / deploy to Vercel + Render
  docs/                     ← showcase SVGs used by the README (rendered from the model)
  web/                      ← React (Vite) editor — model + view + in-browser exports
    src/model/              ← JSON layout model: types, validation, re-flow, packing, geometry  (pure, unit-tested)
    src/render/             ← toSvg + page composer — THE single renderer (preview + PDF/PNG/SVG)
    src/editor/             ← Fabric.js view bindings + upload modal + undo/redo
    src/export/             ← in-browser PDF/PNG/SVG
    src/service/            ← thin client for the ezdxf service
  service/                  ← Python ezdxf service (upload → SVG+bbox+block; export → .dxf); FastAPI
  shared/                   ← JSON schema + component library seed shared by both tiers
```

---

## 10. Still to confirm

- Replace remaining `confirm:true` library dimensions (IDEC IO modules, Degson 2C/4C, PSU, relay,
  modem, enclosure templates) with datasheet/DXF-measured values before production use.
- Confirm horizontal duct is **40×60** (not 40×80) for the house style.
