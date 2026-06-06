---
doc: 01 — Project Brief (AS-BUILT)
project: Cabinet Layout Generator
category: Drawing — General Arrangement (GA), equipment back-plate
direction: manual editor → drawing (per-row pack optional)
feasibility: High — DELIVERED
status: Phase 1 COMPLETE & deployed (Vercel + Render); Phases 2–3 not started
last_updated: 2026-06-06
supersedes: the pre-build 01_Cabinet_Layout_Generator.md (planning corpus)
repo: github.com/Taamrock04/cabinet-layout-generator
---

# Project 01 — Cabinet Layout Generator (as-built)

> **One line:** A manual-first 2D editor for laying out a control-cabinet equipment back-plate —
> drag/drop real parts onto an adjustable plate, with wire ducts, terminal sets, labels, stoppers,
> custom placeholders and per-element spacing — that exports a real DXF (opens in GstarCAD 2020) plus
> PDF/PNG/SVG, all from one JSON model, on an all-free stack. **Built and live.**

> **What this file is:** the original brief, rewritten to match what was actually built. Deltas from the
> pre-build spec are flagged **[changed]** / **[added]** / **[deferred]**. Architecture & rules live in
> the repo's [`SKILL.md`](../../SKILL.md) and [`CLAUDE.md`](../../CLAUDE.md); usage in [`/guide.html`](../../web/public/guide.html).

---

## 1. The problem (unchanged)

Laying out a control-cabinet back-plate by hand in GstarCAD is slow and repetitive — breakers, PLC/IO,
PSU, relays, terminals on DIN rails, with spacing, clearances, wire ducts — then again for the next
near-identical station. The parts repeat; the rules are consistent. This tool makes placement fast and
the output a real DXF that looks like the as-builts.

---

## 2. What was delivered (Phase 1)

A **manual-first editor**, not "AI draws the panel", not a pure auto-packer:

- ✅ The engineer composes the plate directly (drag, type exact mm, rotate). Explicit control.
- ✅ **Per-row Pack / Center** seed a tidy row from the left duct; never required, never the final word.
- ✅ **AI is off on every path.** Socket reserved (provider-agnostic), `AI_ENABLED` concept only.
- ✅ Output fidelity from the engineer's **uploaded DXF blocks**, re-embedded faithfully on export.
- ✅ **[added] Every part exports as a named block** so CAD *Count Block* / a BOM can tally it.
- ✅ **[added] Stoppers + label plates** (a locked pair) and **custom placeholder parts**.
- ✅ **[added] In-app illustrated user guide**, and **CI** (lint/typecheck/test/build + service smoke).
- ❌ **[deferred]** Supabase multi-user (Phase 2); share-link + `.amrlib` (Phase 3); door/front-panel view;
  type-to-place; parametric symbols; multi-sheet; thermal certification.

---

## 3. Architecture (as-built, all-free, model is the source of truth)

```
BROWSER (React + Fabric.js, on Vercel)              ezdxf SERVICE (FastAPI, on Render)
─ Fabric canvas = THE VIEW: drag/grips/rotate,  →  ─ upload: equipment DXF → clean SVG + measured bbox
  per-gap/clearance, sets, labels, pairs            + retained block
─ holds + mutates ONE JSON layout model (truth) ←  ─ export: model + library → assembled .dxf
─ exports PDF/PNG/SVG in-browser (model→SVG)         (every part a named EQ_<key> block, layered, mono)
                                                   (SUPABASE = Phase 2, not yet wired)
```

**Key rules that de-risked the build (all held):**
- One JSON layout model is the single source of truth; Fabric is only the view. **Every export renders
  from the model**, never the canvas — no editor UI, deterministic, title line composed in.
- The **browser never parses DXF**; the `ezdxf` service does all parse/measure/embed.
- The service is **stateless** and touched **only on DXF upload/export** — cold-start is rare and
  isolated; PDF/PNG/SVG never wait on it. **[changed]** It currently receives the library inline in the
  export request (Phase 2 will pull blocks from Supabase by ID instead).

**Equipment upload → editor → export flow:** upload DXF → service normalises units/base-point, returns an
SVG, measures the bbox, UI confirms *"this part measured 70.19 × 103.29 mm — correct?"* → compose in the
browser → export PDF/PNG/SVG in-browser, DXF via the service.

---

## 4. Data schema — the layout model (as-built, `web/src/model/types.ts`)

```jsonc
{
  "project":  { "id": "uuid", "name": "Pump Station 32", "panel_tag": "MCC-01", "rev": "A" },
  "plate":    { "width_mm": 800, "height_mm": 1500, "origin": "top_left" },
  "defaults": { "gap_between_equipment_mm": 0.1, "clearance_equipment_to_duct_mm": 3 },

  "ducts": [
    { "id": "WW_L", "x_mm": 0,  "y_mm": 0,  "length_mm": 1500, "width_mm": 60, "label_h_mm": 60, "rot_deg": 90 },
    { "id": "WW_1", "x_mm": 60, "y_mm": 40, "length_mm": 680,  "width_mm": 40, "label_h_mm": 60, "rot_deg": 0  }
  ],

  "elements": [
    { "id": "e1", "lib_key": "relay_24vdc_2c", "tag": "RL1",
      "x_mm": 70, "y_mm": 120, "rot_deg": 0,
      "gap_before_mm": 0.1, "clearance_to_duct_mm": 3,
      "group_id": null, "pair_id": null, "locked": false }
  ],

  "groups": [
    { "id": "g1", "kind": "set", "lib_key": "term_degson_2c_2_5", "count": 12,
      "internal_gap_mm": 0.1, "tag_start": "B101", "tag_step": 1,
      "x_mm": 70, "y_mm": 300, "rot_deg": 0, "exploded": false, "label_id": "L1" }
  ],

  "labels":  [ { "id": "L1", "text": "24VDC", "anchor": "group:g1", "dx_mm": 0, "dy_mm": -6, "rot_deg": 0 } ],
  "display": { "show_row_clearance_dims": true, "snap_enabled": true }
}
```

**[added] fields the spec didn't have:**
- `element.pair_id` — elements sharing it are a **locked unit** (move / rotate / delete together) while
  staying distinct for the BOM. Used by "Stopper with Label".

Each `lib_key` resolves against the library (§7). Coordinate convention: editor **top-left**, +y down, mm;
DXF flips to bottom-left in one place.

---

## 5. Per-row pack — *optional* (as-built)

**[changed]** The pre-build "auto-pack a whole plate from a parts list in band order" became a focused,
unit-tested **per-row** tool the engineer triggers:
- **Pack** a row: flow its devices left→right from the left duct with the 0.1 mm gap; overflow returns an
  itemised warning (never silently cropped).
- **Center** a row's devices on the row centreline.
- **Set row height** (push or borrow-from-next mode) by clicking the row's dimension.

The fixed band order (Ref 05 §5) lives in the seed library's `band` field; a full band-order auto-packer
from a raw parts list remains future work.

---

## 6. Rendering & export (one model → Fabric view + four formats)

| Format | How (as-built) | Notes |
|--------|----------------|-------|
| **DXF** | `ezdxf` service assembles the model; **every part is a named block `EQ_<lib_key>`** (uploaded DXFs re-embedded, rect parts a unit rectangle); tags + label/custom centre text are separate TEXT | Layers `PLATE`/`DUCT`/`EQUIP`/`TEXT`/`GROUND`, **all ACI 7 (mono)** so it prints black. **Scale 1:1 or 1:100** (1:100 default); at 1:100 geometry is 1/100 but dimension text reads the real value. Opens in GstarCAD 2020. |
| **PDF** | in-browser: model → SVG → vector PDF (`svg2pdf.js` + `jsPDF`) | Paper **A4/A3** auto fit-to-page; title line "SCALE 1:1X — PAPER SIZE: A3/A4". Vector. |
| **PNG** | in-browser: model → SVG → `<canvas>` → `toBlob` | A4/A3, same title line. |
| **SVG** | in-browser: serialise the model's SVG | Smallest; the showcase drawings in `/docs` are this output. |

Row-height **dimensions** are drawn in the right margin (both renderers). Labels are English.

---

## 7. Interaction & editing model (as-built vs the spec's §7)

A Fabric.js v7 editor; every object selectable; undo/redo throughout; multi-select via Shift-click;
arrow-key nudge (1 mm, Shift = 10 mm).

**Req 1 — Gaps & clearances, per-instance.** 0.1 mm default between equipment (`gap_before_mm`, editing one
re-flows only downstream in that local run); ≥ 3 mm duct clearance (`clearance_to_duct_mm`). ✅ Built.

**Req 2 — Library: uploaded DXF + custom rectangles.** **[changed]** Sources implemented:
1. **`dxf`** — upload a part DXF; service measures + retains the block; UI confirms size. ✅
2. **`rect`** — typed size + name. ✅ Two flags were **[added]**: `label_plate` (centred vertical marker
   text, e.g. the stopper label) and `custom` (a user-named placeholder; the part-no is drawn centred and
   **auto-fit so it never overflows**).
3. **`symbol`** — **[deferred]** type exists but currently renders as a rectangle (parametric pilot-lamp /
   push-button / selector are future work).
Equipment is **move + rotate only** — never free-resized by dragging; sizes change by typed mm. Custom
parts are the exception: their width/height are typed per-instance.

**Req 3 — Placement & rotation.** Drag/drop from the sidebar onto the plate, or click to add; numeric mm
fields for exact placement; rotation via **+90°** (and it turns a locked pair as a unit). **[deferred]**
type-to-place; arbitrary-angle UI is via the model but presets dominate.

**Req 4 — Plate.** Freely adjustable width/height; seeded from Ref 05's two form factors. ✅

**Req 5 — Wire ducts.** **[changed/added]** A duct is a rectangle + centred "WIRE DUCT {w}×{h} MM" label.
Length is free-dragged (the one resize exception) or typed; width affects layout. **Added** beyond spec:
ducts **snap exactly onto any of the 4 plate borders** while dragging; new **row ducts auto-span** between
the side ducts; a **Fit width** button re-spans a row duct on demand. (A double-click custom-size dialog
from the spec was not built; width is set in the panel.)

**Req 6 — Rows & clearance.** Rows are auto-detected between horizontal ducts; each row height is
dimensioned in the right margin; **too-tight** clearance is flagged. Row gap adjusts by moving the
horizontal ducts. ✅

**Req 7 — Sets.** Choose a library item, a count, an internal gap, and an auto-tag sequence
(`tag_start`/`tag_step`, e.g. B101…). Inserts as one grouped object; **explode** to edit members. ✅

**Req 8 — Stopper labels.** Editable text anchored to an element/group, moving with its anchor, exported
as DXF TEXT. ✅ **[added]** a distinct **physical** marker: a **Stopper** part + a coincident
**Label-for-Stopper** plate, bound as a locked pair (see §4 `pair_id`).

**Editor behaviour.** Boundary = **warn-but-allow**; overlap / too-tight / overflow are flagged in a
Validation panel (markers like a stopper label are excluded so coincidence isn't a false overlap). Snap
toggle (1 mm grid) + an **Align** toggle (rail-centreline / neighbour-gap snapping). Zoom at cursor,
drag-to-pan, **Fit**. ✅

---

## 8. Multi-user, data & sharing (Supabase) — **[deferred to Phase 2]**

Not built. The plan stands: Supabase Auth (Google/GitHub + email allowlist + display name); shared
projects + shared/project-local library (raw DXF in Storage + metadata); lightweight audit log;
last-write-wins + "opened by [name]" indicator; required keep-alive cron; `.amrlib` bundle export/import
with a Skip/Overwrite/Cancel conflict modal; share-by-link (SVG snapshot, no-login viewer, 15-day expiry,
PDF/PNG only). Until then the editor saves/loads layouts as **local JSON**.

---

## 9. Stack & hosting (as deployed)

| Layer | Choice | Notes |
|-------|--------|-------|
| Editor | **React 19 + Vite + TS, Fabric.js v7** | free/MIT; **Vitest** for the pure core (62 tests) |
| Static hosting | **Vercel** (Phase 1) → Cloudflare Pages (Phase 2) | Vercel Hobby is non-commercial → move at P2 |
| DXF service | **ezdxf 1.4.4 on FastAPI, Render** | cold-start on idle is fine; CORS via `ALLOWED_ORIGINS` |
| In-browser export | `svg2pdf.js`, `jsPDF` | free/MIT |
| CI | **GitHub Actions** | web lint/typecheck/test/build + service import smoke |
| DB/auth | **Supabase** | Phase 2, not wired |

Config: web reads `VITE_DXF_SERVICE_URL`; the service reads `ALLOWED_ORIGINS`. Anti-lock-in: layouts JSON,
equipment raw DXF.

---

## 10. AI — socketed but OFF (as-built)

No AI on any build/run path. The provider-agnostic socket (a single `assistant` interface +
`AI_ENABLED=false` + provider field) is a **design reservation**, not yet a coded module. When enabled it
will only ever structure messy input into the validated schema (and must pass validation before anything
draws) — never emit geometry.

---

## 11. Build sequence — where we are

- **Step 0 — ezdxf round-trip spike — DONE.** Real FC6A-D16 DXF → ezdxf → SVG → place → DXF → GstarCAD
  2020; units/base-point/fidelity confirmed; **measured 70.19 × 103.29 mm**.
- **Phase 1 — editor + ezdxf service — COMPLETE & deployed** (this repo). Everything in §2/§6/§7.
- **Phase 2 — multi-user — NEXT.** Supabase + move to Cloudflare Pages.
- **Phase 3 — sharing & portability.** Share-link + `.amrlib`.

---

## 12. Risks & gotchas (status)

- **ezdxf round-trip fidelity** → resolved by the spike; export re-embeds each block with the right transform. ✅
- **Free-host cold start** → handled with an offline/"waking" state; non-DXF features unaffected. ✅
- **Exports must render from the model, not the canvas** → held. ✅
- **No free-resize of equipment** → held (custom parts size via typed mm). ✅
- **Local re-flow isolation** → held (unit-tested). ✅
- **Coordinate origin in one place** → held (`geometry.ts` / the assembler's `_to_dxf`). ✅
- **Open DXF endpoint** → CORS restricted; **token validation arrives with Phase-2 auth.** ⏳
- **Supabase 7-day pause** → relevant only at Phase 2 (keep-alive cron planned). ⏳
- **Still-to-confirm dims** → FC6A-D16 now measured; **most seed dims remain `confirm:true` estimates**;
  confirm the 40×60 horizontal duct.

---

## 13. Future concepts (documented, not built)

Parametric `symbol` parts (pilot lamp = circle+cross, push-button, selector); type-to-place quick-add
(`relay x8`); edge-align/grid beyond the current snap/Align toggles; version history with rollback;
password-protected shares; door / front-panel view; group-projects-into-a-job + multi-sheet; BOM
aggregation of identical custom parts by part number; full band-order auto-pack from a parts list.

---

## 14. Needed from the engineer (to harden for production)

- Datasheet/DXF dimensions to replace the remaining `confirm:true` seed estimates (IDEC IO modules,
  Degson 2C/4C, PSU, relays, modem, enclosure templates).
- Confirm the **40×60** horizontal duct.
- The two equipment DXFs for any further library seeding (relay + more IDEC modules).

---

## 15. How it connects (with what's now concrete)

- **→ Project 02 (Wiring):** consume 01's live model — elements (`lib_key`+`tag`), sets with `tag_start`
  (the B/R/F series), and the seed library. Terminal rows in 01 are exactly what 02 wires.
- **→ Project 03 (Extraction):** 01's DXF has **`EQ_<lib_key>` blocks** + tag/center TEXT → near-trivial
  BOM by block count; the classifier dictionary maps `EQ_<lib_key>` → BOM rows. Closes the round-trip.
- **→ TOR tool / 03:** can emit a BOM (set members + Degson accessories).
- **Shared:** the component/symbol library (seeded from Ref 05, live in `web/src/model/library.ts`).
