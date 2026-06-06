---
doc: 00 — Portfolio Overview / Foundation (as-built refresh)
domain: CAD & Drawing Automation for Automation/IIoT Engineering
audience: a fresh contributor starting (or continuing) a build
owner: Natchanon Katianurak — Automation & System Integration Engineer
status: Project 01 BUILT (Phase 1); Projects 02–04 still planned
last_updated: 2026-06-06
supersedes: the pre-build 00_Drawing_Automation_Overview.md (planning corpus)
---

# Drawing Automation — Portfolio Overview & Technical Foundation (as-built)

> **Read this first.** Shared foundation for four drawing-automation projects. Each has its own brief
> (`01_…`–`04_…`). This file holds the principles, decisions and build order they share. **What changed
> since the pre-build version:** Project 01 is now built and deployed, which confirmed several decisions
> and surfaced a few facts — those are folded in below and flagged **[as-built]**.

---

## 1. Who this is for and the problem

A full-cycle automation engineer (bidding → design → PLC/HMI → commissioning) spends the most time on
**documents** (handled by a separate TOR tool) and **drawings**. This portfolio is the drawings half:

- **Control cabinet / panel layouts** — DIN-rail equipment back-plates (GA drawings). **← Project 01, built.**
- **Wiring & terminal diagrams** — connection diagrams, terminal layouts, cable schedules. (02)
- **Drawing-set housekeeping** — title blocks, revisions, numbering, registers, BOM extraction. (03/04)

Repetitive, rule-driven, currently manual in GstarCAD 2020 — a good automation target, done the right way.

---

## 2. THE core principle (unchanged — and validated by the build)

**The AI does not draw. The AI structures data and writes deterministic code. Deterministic code
produces the drawing. A human reviews the result in CAD.**

```
Messy input            Validated data           Deterministic            Human review
(PDF/Excel/photo/  →   schema (JSON)        →   code (places       →     in GstarCAD →
 text/quote)           [AI extracts]            geometry from data)      final drawing
```

Why it matters for electrical drawings: correctness is **safety-critical**, output must be
**reproducible**, and a wrong drawing is fixed in the **data/rule**, not a pixel. **[as-built]** Project 01
holds this line strictly — equipment can't be free-stretched, sizes change only by typed mm, and the
boundary/overlap checks *warn* rather than silently move geometry. AI is **off on every path**.

Where AI genuinely helps (when later enabled): extracting/structuring fuzzy input, writing generator
code under review, interpreting extracted data, mapping intent to parameters. Never geometry.

---

## 3. The four projects and how they interconnect

| # | Project | Direction | Feasibility | Status |
|---|---------|-----------|-------------|--------|
| 01 | **Cabinet Layout Generator** | Data → Drawing | High | **Built (Phase 1)** |
| 02 | **Wiring & Terminal Diagram Generator** | Data → Drawing | Medium–High | Planned |
| 03 | **Drawing & BOM Extraction** | Drawing → Data | High | Planned |
| 04 | **Drawing-Set Automation** | Batch ops | Very High | Planned |

Shared spine:
- **01 and 02 share the component model.** 01 places components; 02 wires the *same* tagged components.
  **[as-built]** 01's model is concrete (`web/src/model/types.ts`): elements carry `lib_key` + `tag`,
  sets carry a `tag_start`/`tag_step` sequence (the B/R/F series 02 needs).
- **03 is the reverse of 01/02** — reads a drawing back into data. **[as-built]** 01 now exports **every
  part as a named block `EQ_<lib_key>`**, so a drawing it produces is trivially countable by 03.
- **04 operates on the output of all of them** (title blocks, revisions, numbering, registers).
- All four lean on the **shared Component & Symbol Library** (§7), now partly realised in 01's seed.

---

## 4. CAD automation paths (decision confirmed)

Three ways to make/modify CAD programmatically. **[as-built]** Project 01 used **Path A** and it worked
end-to-end into GstarCAD 2020.

- **Path A — DXF generation with code (primary).** Generate DXF directly from the model.
  - **Python `ezdxf`** — mature, MIT, reads + writes DXF, has a rendering add-on. **[as-built]** Project
    01's service runs **ezdxf 1.4.4** on FastAPI; it parses uploaded equipment DXFs and assembles the export.
  - JS DXF libs exist but 01 keeps DXF entirely server-side (the browser never parses DXF).
  - Opens in AutoCAD **and GstarCAD** → tool-independent. Deterministic.
- **Path B — In-CAD scripting (AutoLISP / .NET).** Drive CAD itself. AutoLISP ports to GstarCAD Pro;
  compiled .NET/ObjectARX does **not** (GstarCAD uses its own GRX SDK). Best for Project 04 batch ops + plotting.
- **Path C — MCP / live AI control.** Optional interactive layer *after* a deterministic core. Not a foundation.

> **★ GstarCAD 2020 is the engineer's main CAD.** **[as-built confirmed]** DXF produced by `ezdxf` opens
> directly in GstarCAD with correct units, base point, layers and (monochrome) colour — no AutoCAD
> involved. The DXF-first stance paid off exactly as predicted.

---

## 5. DWG vs DXF (unchanged gotcha)

- **DXF** = open, documented; `ezdxf` reads/writes it. **DWG** = AutoCAD's proprietary binary; `ezdxf`
  can't read it directly.
- Bridge: free **ODA File Converter** (DWG↔DXF), or `DXFOUT` / Save-As-DXF in GstarCAD itself.
- Any project touching *existing* drawings (03, 04) must assume DWG input and include a DWG→DXF step.
  Project 01 only **emits** DXF and **ingests** equipment DXF (the engineer exports those from GstarCAD).

---

## 6. Preview architecture — one model, two renderers (built as specified)

```
        ┌─► SVG renderer  → live preview + PDF/PNG/SVG export (browser)
Data ───┤
 model  └─► DXF assembler → downloadable .dxf (ezdxf service)
```

**[as-built]** Project 01 realises this precisely:
- **One renderer** `model → SVG` (`web/src/render/toSvg.ts` + the page composer) feeds the live preview
  *and* the PDF/PNG/SVG exports — they cannot drift apart.
- **One DXF assembler** (`service/dxf_build.py`) is the separate deterministic path.
- **One coordinate transform** (editor top-left ↔ DXF bottom-left) lives in a single function.
- Pure, unit-tested core (re-flow, packing, bbox/rotation, the transform) — **62 tests**, run in CI.

---

## 7. Shared infrastructure — the Component & Symbol Library

Build once, reuse everywhere. **[as-built]** Project 01's seed library is live in
`web/src/model/library.ts`, built from Ref 05 §9. Key facts the build settled:

- **IDEC FC6A-D16R1CEE measured 70.19 × 103.29 mm** from its real DXF (Ref 05 guessed the R16CE at 95 × 90).
  That measured part is `confirm:false`; the rest of the seed is still `confirm:true` estimates.
- The library now also carries **placed accessory parts** the spec didn't list: a **Stopper** (9.5 × 43.2)
  and a same-size **Label-for-Stopper** marker plate, plus a **Custom part** type (user-sized/named placeholder).
- Library item sources implemented: **`rect`** (typed size + optional `label_plate` / `custom` flags) and
  **`dxf`** (uploaded, measured, re-embedded). A **`symbol`** type is defined but not yet drawn
  parametrically (it currently renders as a rectangle) — see Project 01 §13 future work.

Two libraries remain the plan: a **component dimension library** (01) and an **IEC-60617 symbol library**
(02). Modular DIN devices are ≈ 18 mm/module. Keep it portable JSON the user can extend.

---

## 8. Recommended build order (updated)

1. **Project 01 — Cabinet Layout Generator — DONE (Phase 1).** Built the component dimension library and
   the model→SVG/DXF spine the others reuse.
2. **Project 03 — Drawing & BOM Extraction — recommended next.** Independent, high-feasibility, and now
   *much* easier against 01's output (every part is a named `EQ_<key>` block). Gives DXF-parsing muscle + QA.
3. **Project 02 — Wiring & Terminal Diagram Generator.** Reuses 01's live component/tag/set model; start
   with terminal-block diagrams.
4. **Project 04 — Drawing-Set Automation.** Path B / AutoLISP; valuable, least dependent.

---

## 9. Tech stack (as-built defaults)

- **Editor:** **React 19 + Vite + TypeScript**, **Fabric.js v7** canvas, **Vitest** for the pure core.
- **DXF service:** **Python + FastAPI + ezdxf 1.4.4** (native SVG backend + Pillow; no matplotlib), two
  stateless endpoints (`upload`, `export`).
- **In-browser export:** `svg2pdf.js` + `jsPDF` (PDF), canvas `toBlob` (PNG), serialize (SVG).
- **Spreadsheet I/O (02/03/04):** SheetJS (`xlsx`) — proven in the TOR tool.
- **AI layer:** provider-agnostic, **off**; route through a serverless proxy when enabled.
- **DB/storage/auth (Phase 2):** **Supabase** free tier — not yet wired.
- **Hosting:** **[as-built]** editor on **Vercel**, ezdxf service on **Render** (both free). Cloudflare
  Pages is the Phase-2 move (before OAuth). CI: **GitHub Actions** (lint/typecheck/test/build + service smoke).

---

## 10. Deployment & hosting — all-free stack (as deployed)

**Principle:** every layer free. **[as-built]** Project 01 runs on:
- **Static frontend** → **Vercel** (free Hobby). ⚠ Hobby is *non-commercial*; the Phase-2 plan moves the
  multi-user tool to **Cloudflare Pages** (free **and** commercial-OK). Hosting is per-project.
- **ezdxf service** → **Render** free tier (FastAPI). Cold-starts on idle — the editor shows a "waking
  service…" / offline state and **every non-DXF feature works without it**.
- **Database / storage** → **Supabase** free tier, **Phase 2** (auth + shared projects/library + audit +
  keep-alive cron). Until then the editor persists layouts as local JSON.

**Anti-lock-in:** layouts are JSON, equipment is raw DXF — portable if any free tier changes.

---

## 11. Working conventions (carried, with build lessons)

- **Doc-first.** Each project gets a `SKILL.md` (architecture) + `CLAUDE.md` (rules). **[as-built]** 01's
  live in the repo root and proved their worth across a long build.
- **Free-first, every layer.** Held.
- **Deployment reality.** Browser→cloud-AI hits CORS/key exposure → proxy it. Vercel static needs the
  right config. (01: env `VITE_DXF_SERVICE_URL`; service env `ALLOWED_ORIGINS` for CORS.)
- **Explicit control + human review.** Every drawing is editable/regenerable; never opaque.
- **Never let AI invent geometry/connectivity/part data.** Held strictly.
- **Spike the riskiest loop first.** **[as-built]** The Step-0 ezdxf round-trip (real FC6A DXF → ezdxf →
  SVG → place → DXF → GstarCAD) was done first and de-risked the whole build — and is where the
  70.19 × 103.29 measurement came from.
- **Phase the build.** **[as-built]** 01 shipped Phase 1 (single-user editor + all exports) before any
  auth/DB — exactly as planned; Phases 2/3 remain.
- **One model is the source of truth; render exports from it, not the canvas.** Held.
- **New lesson — make every part a countable block.** 01 emits `EQ_<lib_key>` blocks for *all* parts (not
  just uploaded DXFs). This was beyond the original spec and directly de-risks Project 03's BOM extraction.
- **Settle host/domain before OAuth.** Still true for Phase 2.

---

## 12. Glossary

Unchanged from the original (TOR, BOQ/BOM, GA, DIN rail, MCB, PSU, I/O list, wiring list, terminal strip,
wireway, title block, DXF/DWG, ezdxf, IEC 60617, ODA File Converter, MCP). Two additions from 01:
- **Locked pair** — two distinct parts (e.g. stopper + label) bound by a `pair_id` that move/rotate/delete
  as one unit but count separately.
- **`EQ_<lib_key>` block** — the named DXF block every placed part becomes, so CAD *Count Block* tallies it.

---

## 13. How to kick off the next build (02, 03 or 04)

> "I'm an automation engineer. Attached is the as-built portfolio overview (`00_…`), the brief for Project
> NN, and Ref 05. **Project 01 is already built** (this repo) — reuse its data model / library / DXF
> conventions where relevant. Read the core principle (AI structures data + writes deterministic code; code
> draws) and the working conventions. Produce a `SKILL.md` + `CLAUDE.md` for Project NN before code, then
> build the MVP. Default to the free, no-key path."
