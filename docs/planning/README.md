# Planning — as-built refresh (00–05)

These are **as-built** versions of the original drawing-automation planning corpus, updated to reflect
what **Project 01 — Cabinet Layout Generator** actually became after the Phase-1 build (this repo).

The originals were written *pre-build* ("spec — pre-build"). They were excellent and almost all of it
held up — but the build resolved open questions and added features the spec didn't foresee. These files
record the **real** state so a fresh contributor (or a future build of Project 02/03/04) starts from
reality, not from guesses.

| File | What it is | Status now |
|------|------------|-----------|
| [`00_Drawing_Automation_Overview.md`](00_Drawing_Automation_Overview.md) | Shared foundation for all four projects | **01 built**; 02–04 still planned |
| [`01_Cabinet_Layout_Generator.md`](01_Cabinet_Layout_Generator.md) | Project 01 brief | **As-built — Phase 1 complete** |
| [`02_Wiring_Terminal_Diagram_Generator.md`](02_Wiring_Terminal_Diagram_Generator.md) | Project 02 brief | Planned — now able to reuse 01's real model |
| [`03_Drawing_BOM_Extraction.md`](03_Drawing_BOM_Extraction.md) | Project 03 brief | Planned — 01 now emits clean `EQ_<key>` blocks |
| [`04_Drawing_Set_Automation.md`](04_Drawing_Set_Automation.md) | Project 04 brief | Planned — least affected |
| [`05_Reference_AMR_BMA_Cabinet_Conventions.md`](05_Reference_AMR_BMA_Cabinet_Conventions.md) | Observed house style + library seed | Reference — **partly realised** in 01's seed |

## The biggest deltas the build produced

- **The data model is concrete** (`web/src/model/types.ts`) and grew three fields the spec didn't have:
  `pair_id` (locked units), and `label_plate` / `custom` on rect library items.
- **The IDEC FC6A-D16 was measured at 70.19 × 103.29 mm** from its real DXF — the spec guessed 95 × 90.
- **The library gained placed parts** beyond the spec: a **Stopper** + a **Label-for-Stopper** marker
  plate (a locked pair), and a **Custom part** (a user-sized/named placeholder for parts without a CAD file).
- **The DXF export makes _every_ part a named block** `EQ_<lib_key>` (not only uploaded DXFs) so CAD
  *Count Block* / a BOM can tally them — this materially de-risks **Project 03**.
- **Hosting settled:** editor on **Vercel**, ezdxf service on **Render** (both free). Supabase (Phase 2)
  and share-by-link (Phase 3) are not built yet.
- **AI is off on every path**, exactly as planned; the provider-agnostic socket remains a reservation.

For the live architecture and rules, see the repo root [`SKILL.md`](../../SKILL.md) and
[`CLAUDE.md`](../../CLAUDE.md); for how to use the tool, the in-app [`/guide.html`](../../web/public/guide.html).
