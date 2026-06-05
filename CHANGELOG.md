# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Phase 2 (multi-user): Supabase auth + shared projects/library; move hosting to Cloudflare._

## [0.1.0] — 2026-06-05 — Phase 1

First complete single-user release: a manual-first cabinet back-plate editor that exports a real DXF
plus PDF/PNG/SVG, all rendered from one JSON model.

### Added
- **Editor** — drag/drop parts from a seeded library; move/rotate; resize equipment only by typed mm;
  multi-select (Shift-click), arrow-key nudge, undo/redo; zoom/pan.
- **Wire ducts** — side + row ducts; drag-snap exactly onto any of the 4 plate borders and onto
  perpendicular duct edges; row ducts auto-span between the side ducts on creation, with a one-click
  **Fit width** to re-span.
- **Rows** — auto-detected between ducts, each height dimensioned in the right margin and editable by
  clicking its dimension; **Pack** a row from the left duct; **center** devices vertically.
- **Terminal sets & labels** — auto-tagged sets; anchored labels.
- **Validation** — overlap, too-tight clearance and plate-overflow warnings, each flagged with a
  human-readable message (warn-but-allow, never silently coerced).
- **Exports** — DXF via the ezdxf service (layers DUCT/EQUIP/TEXT/GROUND, 1:1 or 1:100, monochrome so it
  prints black in CAD); PDF/PNG/SVG in-browser, auto-fit to A4/A3 with scale printed in the title line.
- **Equipment DXF upload** — drag-drop a `.dxf` to measure and add a part to the library.
- **ezdxf service** — stateless FastAPI service with `upload` and `export` endpoints.
- **Docs & scaffolding** — README with rendered showcase drawings, SKILL.md, CLAUDE.md, RUNNING.md,
  DEPLOY.md, CONTRIBUTING.md, SECURITY.md, CI workflow, issue/PR templates, MIT license.

### Notes
- AI is socketed but **off** on every path (`AI_ENABLED=false`).
- Library dimensions marked `confirm:true` are estimates pending datasheet/DXF measurement; the IDEC
  FC6A-D16 was measured from its DXF at 70.19 × 103.29 mm.

[Unreleased]: https://github.com/Taamrock04/cabinet-layout-generator/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Taamrock04/cabinet-layout-generator/releases/tag/v0.1.0
