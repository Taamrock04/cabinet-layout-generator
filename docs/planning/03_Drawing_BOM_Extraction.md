---
doc: 03 — Project Brief (refreshed — Project 01 now built)
project: Drawing & BOM Extraction
category: Drawing — read/audit (reverse direction)
direction: Drawing → Data
feasibility: High (for DXF; DWG needs a conversion step)
status: PLANNED — recommended NEXT build; materially de-risked by Project 01
last_updated: 2026-06-06
supersedes: the pre-build 03_Drawing_BOM_Extraction.md
---

# Project 03 — Drawing & BOM Extraction (refreshed)

> **One line:** Read an existing CAD drawing and pull structured data out of it — a BOM, cable schedule,
> points/I-O list, or QA audit — exported to Excel. The **reverse** of 01/02.

> **What changed since the pre-build brief — the big one:** Project 01 now exports **every placed part as a
> named block `EQ_<lib_key>`**. A drawing produced by 01 is therefore *already* clean, countable block
> data — `Count Block` on `EQ_term_degson_2c_2_5` gives the terminal count directly. This makes 03's BOM
> path near-trivial for 01-origin drawings and gives a perfect closed-loop test fixture. Build it **next.**

---

## 1. The problem (unchanged)

Value is locked inside drawings already made: how many of each component, what's on each cable, which I/O
points, whether the drawing is consistent. The drawing already *is* structured data — read it instead of
re-typing.

## 2. Feasibility (unchanged, with a new tailwind)

High for DXF. Deterministic to extract: block inserts (counts), block **attributes** (ATTRIB), text,
layers, title block. AI only *interprets* (classify blocks, map attribute names → BOM columns, reconcile
tags). **[as-built tailwind]** 01-origin drawings expose `EQ_<lib_key>` block names + tag/center TEXT, so
classification is mostly a lookup. **DWG dependency** unchanged: convert DWG→DXF first (ODA File Converter
or `DXFOUT` in GstarCAD).

## 3. Architecture (applies Overview §2)

```
DXF (or DWG→DXF)         Raw entities             Interpreted          BOM / schedule /
upload              →    (blocks, attribs,   →    structured data  →   points / audit (xlsx)
[parse: ezdxf]           text, layers)            [AI cleans/maps]
                         [deterministic]
```

## 4. **[as-built] The `EQ_<lib_key>` convention — a first-class extraction path**

Project 01's assembler (`service/dxf_build.py`) names every part block `EQ_<lib_key>` and keeps tags +
label/custom text as separate TEXT on the `TEXT` layer. So for any 01-origin drawing:

| Block name | Maps to BOM row |
|------------|-----------------|
| `EQ_plc_idec_FC6A_D16` ×1 | PLC IDEC FC6A-D16R1CEE |
| `EQ_term_degson_2c_2_5` ×N | Degson 2.5mm² 2C ×N |
| `EQ_term_stopper` ×N | Stopper ×N |
| `EQ_term_stopper_label` ×N | Label for Stopper ×N |
| `EQ_custom_*` ×1 each | a user placeholder (read its centred TEXT for the part-no) |

Recommended strategy: **(1)** if blocks are `EQ_*`, strip the prefix → `lib_key` → look up Ref 05 §9 for
the BOM row (the seed library doubles as the classifier dictionary). **(2)** else fall back to the general
block-name / attribute classifier (Ref 05 §6 tag patterns + §7 parts) for third-party drawings. Don't
assume every input is 01-origin — but exploit it when it is.

> ⚠ **Custom parts** are each a unique `EQ_custom_<id>` block, so identical placeholders won't auto-aggregate
> by block name. Aggregate them by their centred part-no TEXT instead. (This is the same gap noted in 01 §13.)

## 5. What can be extracted, and into what (unchanged)

Block-insert counts + attributes → **BOM**; wire/line entities + labels → **cable schedule**; I/O symbol
blocks → **points/I-O list**; required-attribute/naming checks → **QA audit**; title-block attributes →
**register row**; two revisions → **revision diff**.

## 6. Data shapes (unchanged)

BOM rows `{tag, qty, part_no, manufacturer, description, source_block}`; QA audit `{blocks_total,
blocks_missing_required_attrib, issues[], tag_naming}`. See the original brief.

## 7. Tech stack (leans Python — unchanged, now with a fixture)

`ezdxf` (Python) for deterministic parsing; ODA File Converter for DWG→DXF; AI only interprets; export via
SheetJS or `openpyxl`. A small Python backend is justified here (HF Spaces / Render free). **[as-built]**
A ready closed-loop fixture: export a layout from 01 → DXF → feed to 03 → assert the BOM matches the model.
03 could even **share 01's existing ezdxf service host**.

## 8. Phases (unchanged)

1. DXF parse → raw entity dump (prove on a real drawing **and** a 01-origin one). 2. BOM aggregation
(group inserts, count; `EQ_*` fast-path). 3. AI interpretation (messy attribute keys → BOM columns;
reconcile tags). 4. QA audit (required-attrib + duplicate-tag + naming). 5. DWG handling (detect + ODA).
6. v2 extractors (cable schedule, points list, register row).

## 9. Key decisions for the build chat

Python vs JS (recommend Python/`ezdxf`); **block→BOM mapping** (now: `EQ_<key>` fast-path + general
fallback); required-attribute set for QA; BOM column schema (match the engineer's BOM/BOQ); DWG flow
(pre-convert vs bundled ODA).

## 10. Risks (unchanged)

DWG≠DXF (#1 surprise — handle early); extraction quality tracks drawing quality (report what couldn't be
read; don't fabricate); inconsistent attribute naming (AI cleanup with a reviewable mapping table);
**never invent BOM rows** (unidentified block ×N, not a hallucinated part number); large drawings (stream
+ progress).

## 11. How it connects

**← 01/02:** reads their (or any) drawings back into data — closes the round-trip; 01's `EQ_*` blocks make
this exact. **→ 04:** title-block/register extraction feeds drawing-set management. **→ TOR tool:**
extracted BOM supports compliance/quantity work. **Shared:** the component library (now also the classifier
dictionary), BOM schema.

## 12. First prompt for a fresh build chat

> "Building Project 03 from the refreshed brief + as-built `00_…` + Ref 05. Direction Drawing→Data. Use
> `ezdxf` (Python); AI only interprets/cleans extracted entities into a BOM/schedule/audit — never invents
> part data. **Exploit Project 01's `EQ_<lib_key>` block naming as a fast BOM path** (strip prefix → Ref 05
> §9 lookup), with a general block/attribute classifier fallback for third-party drawings. Note the
> DWG≠DXF gotcha + an ODA step. Produce `SKILL.md` + `CLAUDE.md` first, then the MVP: upload DXF → block
> counts + attributes → BOM → Excel + a basic QA audit. Start by dumping raw entities from a real DXF
> **and** a 01-exported DXF as a closed-loop fixture."
