# CLAUDE.md — rules for building & extending the Cabinet Layout Generator

`SKILL.md` says *what the system is and how it's wired*. This file says *what must always be true* —
the laws the code and (later) the AI obey. Read both before writing code. Both live at the repo root
and are the canonical copies for anyone (human or AI) working in this codebase.

---

## 0. The one law (above all others)

> **The AI never invents geometry, connectivity, or part data. It only structures/interprets input.
> Deterministic code draws. A human reviews the result in CAD.**

Placement, dimensions, and part identity must be exactly what the validated input says — never a
model's guess. A confidently-wrong terminal or clearance ships to a panel shop. If a value is unknown,
it is **flagged for human confirmation**, never silently filled.

---

## 1. AI in v1 — socketed but OFF (provider-agnostic)

- **v1 uses no AI.** The tool is fully functional manual-first. Do not add an AI dependency to any
  build/run path.
- **Socket design** for later:
  - A single **`assistant` interface** with a **deterministic default implementation** (manual entry /
    the future type-to-place parser). All AI lives behind this one module.
  - An **`AI_ENABLED=false`** flag and a **`provider`** field (never hard-wire a vendor).
  - When enabled later, route through a **serverless proxy** with the key in an env var (direct
    from-browser calls hit CORS / key-exposure problems). Plan AI as a separate, likely-paid,
    provider-agnostic key.
- **AI's only ever jobs** when on: structure fuzzy input into the validated schema (parse a messy BOQ
  into typed rows, normalize tag names, infer a type from a part number), interpret extracted data, map
  intent to parameters. **Never** emit coordinates, sizes, or connectivity as ground truth.

---

## 2. Validation rules (the data model is the contract)

Validate on every load, edit-commit, and before every export. Reject or flag — never silently coerce.

**Structural**
- Every `element.lib_key` / `group.lib_key` resolves to a library item; unresolved = error.
- Every `label.anchor` (`element:<id>` / `group:<id>`) points to an existing element/group.
- IDs are unique within their arrays; `group_id` on an element references a real group.
- `plate.origin == "top_left"` (the only editor convention; conversion to DXF bottom-left is §4).

**Dimensional / physical**
- `width_mm`, `height_mm`, `length_mm` > 0. Duct `width_mm` ∈ {30,40,60} faces unless a custom dialog
  value was set; `label_h_mm` is label-only (no geometry — never let it affect layout).
- Equipment size is read from the library, **not** editable by drag. Size changes only via typed mm.
  Reject any attempt to free-resize an equipment element.
- Rotation uses the **rotated bounding box** for spacing (90°/270° swap W×H).
- `gap_between_equipment_mm` default 0.1; `clearance_equipment_to_duct_mm` default ≥3. Per-element
  overrides allowed; clearance below default is **flagged "too tight"**, not blocked.

**Layout integrity**
- Editing one `gap_before_mm` re-flows **only downstream elements in that local run** — assert no other
  run and no upstream element moved.
- Plate fit: on overflow, return an **itemized** message (what didn't fit, by how much). Boundary is
  **warn-but-allow** — flag, never silently crop or overlap.
- Auto-pack must honor `locked` elements and flow the rest around them.

**Export integrity**
- Exports render from the JSON model, never the canvas. Assert no editor artifacts (selection handles,
  grid, snap guides) appear in output.
- DXF: blocks re-embedded as INSERTs with correct transform; layers `DUCT` / `EQUIP` / `TEXT` / `GROUND`.
- At scale 1:100, geometry is written at 1/100 size but **dimension text strings carry the real value**.
- Coordinate origin converted in **exactly one place** (§4).

---

## 3. AI structuring rules (for when the socket is turned on — write the prompt to these)

When/if AI is enabled, its output is **always** the validated JSON schema (SKILL.md §4) and must pass
§2 validation before anything is drawn. Prompt rules:
- **Extract, don't invent.** Map only values present in the input. Unknown dimension/part → emit a
  `confirm: true` marker and a human-readable note; never fabricate a number.
- **Normalize, flag conflicts.** Standardize tag names to the observed vocabulary; when two inputs
  disagree, surface both and flag — do not pick silently.
- **Type inference is a suggestion, not a fact.** Inferring a component type from a part number is
  allowed, but the type and any datasheet dimension is presented for human confirmation.
- **No connectivity.** This is a layout tool; AI never asserts wiring.
- Output strictly machine-parseable JSON; on uncertainty, prefer omission + a flag over a guess.

---

## 4. Coordinate & units conventions

- **Internal model & editor:** origin **top-left**, +x right, +y **down**, units **millimetres** (mm),
  one decimal place meaningful (0.1 mm gaps).
- **DXF output:** origin **bottom-left**, +y **up**. Convert top-left↔bottom-left in **one** function
  used by the DXF assembler only — never scatter sign flips.
- **Scale:** model is always real mm. The 1:1 / 1:100 chooser affects only the DXF geometry write
  factor; **dimension text always prints the real mm value**. PDF/PNG auto-fit the chosen paper and
  print the resulting scale in the title line.
- **Rotation:** degrees, snap presets 0/90/180/270 plus arbitrary; spacing math uses the rotated bbox.

---

## 5. Coding conventions

- **Model is the source of truth; everything derives from it.** Fabric.js is a view binding only.
  Mutations go model→view, never read geometry back out of the canvas for export.
- **One renderer: model → SVG.** Preview, PDF, PNG, and SVG export all share this single renderer so
  what you see is what you get. DXF is the separate deterministic assembler (ezdxf service).
- **Pure, testable core.** Re-flow, auto-pack, bbox/rotation math, and the coordinate transform are
  pure functions with unit tests — no Fabric or DOM dependency. The riskiest logic must be testable
  without the UI.
- **ezdxf service is stateless and minimal.** Two endpoints only: `upload` (DXF → SVG + bbox + retained
  block) and `export` (model + block IDs → assembled .dxf). It validates the auth token and restricts
  CORS. Keep it free-host-friendly (cold start tolerated; show "waking service…").
- **Free + portable, every layer.** No paid dependency on any path. Layouts persist as JSON, equipment
  as raw DXF — nothing traps the engineer if a free tier changes.
- **Degrade gracefully.** The editor + in-browser exports work with no backend; ezdxf asleep →
  everything except DXF still works.
- **Explicit control + human review.** Every generated drawing is reviewable and override-able (edit
  data, drag, regenerate). Never opaque.
- **Match the surrounding code.** Comment density, naming, and idiom follow the file being edited.

---

## 6. Phasing discipline (ship the core before the machinery)

Build the single-user editor + exports first (**Phase 1 — complete**), then auth/DB/sharing (Phase 2),
then share-link + bundle (Phase 3). Same final scope, far less risk, value sooner. Do **not** wire OAuth
before the final host/domain is settled (callbacks are per-domain). The ezdxf round-trip was spiked
(Step 0) before building UI around it.

---

## 7. Definition of done for a v1 feature

- Renders identically in editor preview and in exports (because both come from the model).
- Validates per §2; bad input is flagged with a human-readable message, never silently coerced.
- No AI on any path; if it touches the socket, `AI_ENABLED=false` still works fully.
- DXF (where relevant) opens correctly in **GstarCAD 2020** with right units/base-point/layers.
- Pure core logic has unit tests; coordinate transform exercised in both directions.

---

## 8. Resolved decisions (were open at scaffold time)

- **Frontend framework:** **React + Vite + TypeScript** (matches the sibling TOR tool).
- **ezdxf host:** **Render free tier** (FastAPI). Frontend on **Vercel** for Phase 1.
- **Step-0 spike:** done with **IDEC FC6A-D16R1CEE** (`FC6A-D16-A4-P00467.dxf`); round-trip into
  GstarCAD 2020 passed.
- **Datasheet dimensions:** FC6A-D16 **measured 70.19 × 103.29 mm** (now `confirm:false`).

**Still open**
- Remaining `confirm:true` library dimensions (IDEC IO modules, Degson 2C/4C, PSU, relays, modem,
  enclosure templates) are estimates — replace with datasheet/DXF-measured values before production use.
- Confirm horizontal duct is **40×60** (not 40×80) for the house style.
