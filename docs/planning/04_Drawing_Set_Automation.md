---
doc: 04 — Project Brief (refreshed — Project 01 now built)
project: Drawing-Set Automation
category: Drawing — housekeeping / batch operations
direction: Batch operations across a drawing set
feasibility: Very High (mostly deterministic tooling)
status: PLANNED — not started; least affected by Project 01
last_updated: 2026-06-06
supersedes: the pre-build 04_Drawing_Set_Automation.md
---

# Project 04 — Drawing-Set Automation (refreshed)

> **One line:** Batch-manage a whole drawing set — update title blocks, manage revisions, renumber sheets,
> generate a drawing register/index — across every sheet at once. The "boring but very high-ROI" project;
> mostly deterministic, least AI, leans on the in-CAD path (Overview §4 Path B).

> **What changed since the pre-build brief:** little. Project 01 is built but is a *single back-plate
> editor* — it does **not** yet emit an attributed title-block block (its PDF/page output carries a title
> *line*, not a CAD title block with named attributes). So **04 still owns title blocks** end to end. Build
> anytime as a quick win. Deltas flagged **[as-built]**.

---

## 1. The problem (unchanged)

A project set is dozens of sheets. Changing project/client/date/designer/rev means editing the title block
on *every* sheet; issuing a revision means adding a revision row across many sheets and bumping numbers;
the register is manual transcription; renumbering after an insert is tedious. All rule-based and repetitive.

## 2. Feasibility (unchanged)

Very high — almost entirely deterministic attribute manipulation: update title-block attributes across
all/selected sheets; revision management (append row + bump current rev); sheet renumbering + "X of Y";
drawing register/index from every sheet's title block; **batch plot to PDF needs AutoCAD/GstarCAD (Path
B)**. AI's role is small (parse a project-info sheet → fields; smart index descriptions). Out of scope:
redesigning title-block geometry (assumes a standard attributed block exists).

## 3. Two paths (this project's main fork — unchanged)

| | Path A — `ezdxf` (DXF) | Path B — AutoLISP in GstarCAD ★ likely |
|---|---|---|
| Edit title-block attributes | ✅ | ✅ (DWG native) |
| Revision tables / numbering / register | ✅ | ✅ |
| **Batch plot to PDF** | ❌ | ✅ |
| Native DWG | needs DWG→DXF→DWG | ✅ |

> **★ GstarCAD 2020:** Path B is viable **via AutoLISP** (title-block edits, revision tables, numbering,
> even batch publish-to-PDF with LISP + `.scr`, Professional edition). Do **not** plan a compiled
> .NET/ObjectARX plugin and expect it to run in GstarCAD (it needs the GRX SDK). So: **Path A (`ezdxf`) for
> attribute/register work, or Path B as AutoLISP inside GstarCAD** — both avoid AutoCAD entirely.

## 4. Data shapes (unchanged)

`title_block_field_map` (PROJECT/CLIENT/DRAWN_BY/CHECKED_BY/DATE/REV/PROJECT_NO + `apply_to`); revision
entry `{rev, date, description, by, apply_to[]}`; generated `register[]` (sheet_no, title, rev, date).
**[as-built]** The attribute map must support the **two real templates** (Ref 05 §8): BMA SCADA and Dept.
of Drainage grid (+ T.PRO CONNECT variant).

## 5. Features (unchanged)

**MVP:** read every sheet's title block; update attributes across all/selected from one form; generate a
register (xlsx, optionally an index sheet). **v2:** revision append + bump; renumbering / "X of Y";
layer/text-style enforcement. **Stretch:** batch plot to PDF (Path B); project-info-sheet → auto-populate
(light AI); register cross-checked against Project 03; watch-folder "issue this revision".

## 6. Phases (unchanged)

1. read title blocks across a set → 2. update attributes (all/selected) → 3. generate register (xlsx) →
4. revision append + numbering → 5. (Path B) batch plot → 6. layer/style enforcement + light AI.

## 7. Key decisions for the build chat

**Path A vs B** (driven by DWG-vs-DXF + whether batch-plot is needed); **exact title-block attribute
names** in the engineer's standard block (get these first — Ref 05 §8 lists field *labels*, not the block's
ATTRIB tags); numbering scheme + "X of Y"; register format (match the engineer's template); distribution
(LISP file vs app).

## 8. Risks (unchanged)

Title block must be a real attributed block (detect + report exploded-text sheets; don't guess positions);
DWG round-trip data loss on Path A (prefer Path B for native DWG); plotting needs CAD; AutoCAD LT has no
LISP (full AutoCAD or GstarCAD Pro); always preview + allow selected-vs-all (explicit-control principle).

## 9. How it connects

**← 03:** title-block/register extraction overlaps — share the register schema and reuse 03's title-block
reader. **→ 01/02:** standardises the title block the generators should emit. **[as-built note]** Since 01
does **not** yet emit an attributed title block, a clean split is: **04 owns title blocks**; if 01/02 ever
add one, use 04's block definition + ATTRIB tags so 04 can batch-edit them. **Shared:** title-block block
definition + attribute naming, register schema.

## 10. First prompt for a fresh build chat

> "Building Project 04 from the refreshed brief + as-built `00_…` + Ref 05. Mostly deterministic batch ops;
> minimal AI. **First decide Path A (`ezdxf`/DXF) vs Path B (AutoLISP in GstarCAD)** — Path B if the set is
> DWG and/or batch-PDF is needed. Get the exact title-block ATTRIB tag names up front (support the two Ref
> 05 §8 templates). Note Project 01 does not yet emit an attributed title block — 04 owns title blocks.
> Produce `SKILL.md` + `CLAUDE.md` first, then the MVP: read all sheets' title blocks → update attributes
> across all/selected → generate a register (xlsx). Always preview; never force-apply to a whole set."
