---
doc: 02 — Project Brief (refreshed — Project 01 now built)
project: Wiring & Terminal Diagram Generator
category: Drawing — connection / terminal diagrams
direction: Data → Drawing
feasibility: Medium–High (scoped to terminal-block diagrams)
status: PLANNED — not started; can now reuse Project 01's live model
last_updated: 2026-06-06
supersedes: the pre-build 02_Wiring_Terminal_Diagram_Generator.md
---

# Project 02 — Wiring & Terminal Diagram Generator (refreshed)

> **One line:** Turn a connection list into terminal-block diagrams, wire-numbering, and cable schedules —
> reusing the **now-concrete** component/tag model from Project 01 — with SVG preview + DXF export.

> **What changed since the pre-build brief:** Project 01 is built, so 02's biggest input is no longer
> hypothetical. The shared model is real code, the terminal vocabulary is seeded, and 01's terminal rows
> are literal `EQ_term_*` blocks. Build order unchanged: **after 03.** Deltas flagged **[as-built]**.

---

## 1. The problem (unchanged)

After the panel is laid out (01), every device must be wired: device terminals → strips → field devices,
with consistent wire numbers/specs and a cable schedule. The connections are *data*; the diagram is a
*render* of that data.

## 2. Scoping — hold the line (unchanged)

| Sub-type | Feasibility | In scope? |
|----------|-------------|-----------|
| (a) **Terminal-block diagrams** (X1, X2… strips) | High | ✅ MVP |
| (b) Simple interconnection / loop diagrams | Medium | ✅ v2 |
| (c) Full control schematics / ladder auto-routing | Low | ❌ template-assist only |

(c) is out — auto-routing is a hard, safety-critical layout problem that will be confidently wrong.

## 3. Architecture (applies Overview §2)

```
Connection list          Validated wiring        Deterministic         SVG preview ┐
(Excel / from 01     →    model (JSON)       →    render engine    →    + DXF       ┘ + cable schedule (xlsx)
 component model)        [AI structures +         (NO AI)
                          auto-numbers wires]
```

## 4. **[as-built] Reuse Project 01's model — what's now concrete**

01's model (`web/src/model/types.ts`) gives 02 real, typed inputs:
- **Devices to wire** = 01 `elements` (each `lib_key` + `tag`, e.g. `PLC1`, `K1`).
- **Terminal strips** = 01 `groups` of `kind:"set"` over `term_degson_2c_2_5` / `term_degson_4c_2_5`, with
  an **auto-tag sequence** (`tag_start`/`tag_step`) — this *is* the strip numbering 02 needs.
- **The B-/R-/F-series numbering** (Ref 05 §6) is already how 01 tags sets → offer it as a default wire/
  terminal-numbering convention alongside source-target/sequential.
- **A shared `tag` means the same component** in both tools — keep it the join key.

A small adapter can read a 01 layout JSON → seed 02's `devices` + `terminal_strips` (the terminals that
exist), leaving the engineer to add the *connections*.

## 5. Data schema (unchanged shape)

`wire_numbering` (scheme/prefix/start) · `terminal_strips[]` (id, terminals[]) · `devices[]` (tag,
terminals[]) · `connections[]` (wire_id, from{ref,terminal}, to{ref,terminal}, wire_spec, function, cable)
· `cables[]` · `rules` (max_wires_per_terminal, flag_unconnected). See the original brief for the full
example; it still holds.

## 6. Where AI adds value (unchanged)

Take an unnumbered list → consistent wire IDs per the chosen scheme (source-target / sequential /
potential-based) → **validate hard**: terminals not over `max_wires_per_terminal`, no dangling
device/terminal refs, optional flag of unconnected terminals. Surface issues as review flags; never
auto-"fix" silently. Inferred wire specs must be flagged as inferred (CSA/colour carry safety meaning).

## 7. Rendering

Terminal-block diagram (MVP): each strip a ladder of terminals; per terminal, incoming wire(s) one side,
outgoing the other, labelled with wire ID + spec + destination. One model → **SVG** preview + **DXF**
(layers `TERMINALS`/`WIRES`/`TEXT`/`TITLEBLOCK`) + **cable schedule** (xlsx). **[suggestion]** Reuse 01's
`model → SVG` discipline and, if a Python service is wanted, 01's ezdxf service pattern.

## 8. Phases (unchanged)

1. schema + validation (pure, tested) → 2. wire-numbering engine (pure, per scheme) → 3. terminal-block
SVG renderer → 4. editable model + regenerate → 5. DXF + cable-schedule xlsx → 6. AI structuring pass
(messy list / 01 import → model) → 7. v2 interconnection diagrams + cross-references.

## 9. Key decisions for the build chat

Default wire-numbering scheme (ask the engineer's standard); strip orientation (vertical vs horizontal) +
label density; **how tightly to couple with 01** (import its JSON vs independent Excel) — **[as-built]** a
01-JSON importer is now realistic; cable-schedule columns (match the engineer's template); JS vs Python
(likely JS, or share a Python service with 03).

## 10. Risks (unchanged)

Scope creep into full schematics (#1 — say no to auto-routed ladders); terminal capacity + dangling refs
(validate hard — real errors); inferred wire specs (flag + review); DXF portability (test in GstarCAD);
**tag consistency with 01** (a shared tag must mean the same component).

## 11. How it connects

**← 01:** consumes the live component/tag/terminal model. **→ 03:** the cable schedule/connections can be
checked against extracted drawings. **Shared:** symbol/block library, tag conventions, title block.

## 12. First prompt for a fresh build chat

> "Building Project 02 from the refreshed brief + as-built `00_…` + Ref 05. **Project 01 is already built**
> — reuse its model (`elements` with `lib_key`+`tag`, sets with `tag_start`) and seed 02 from a 01 layout
> JSON where possible. **Scope to terminal-block diagrams (a) for the MVP — no schematic auto-routing.**
> AI only structures + auto-numbers + validates; a deterministic engine renders. Produce `SKILL.md` +
> `CLAUDE.md` first, then the pure-frontend MVP. Start with schema, validation and wire-numbering as
> unit-tested pure functions."
