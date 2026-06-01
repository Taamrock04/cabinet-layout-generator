# Cabinet Layout Generator (Project 01)

Manual-first 2D editor for control-cabinet equipment back-plates → real DXF (GstarCAD 2020)
plus PDF/PNG/SVG. One JSON model is the source of truth; every export renders from it.

Specs live in OneDrive: `Drawing/01 Layout Design/SKILL.md` (architecture) and `CLAUDE.md`
(rules: "never invent geometry", AI socket, validation, conventions). Read those first.

## Layout
```
web/      React (Vite) editor — the JSON model, validation, the model→SVG renderer, UI (Fabric.js, later)
  src/model/    types, geometry, library seed, validate, reflow, factory   (pure, unit-tested)
  src/render/   toSvg — THE single renderer (preview + PDF/PNG/SVG exports)
service/  Python ezdxf service — DXF upload (→SVG+bbox+block) and DXF export (→.dxf)   (Phase 1, next)
shared/   JSON schema + library seed shared by both tiers
```

## Web — dev
```
cd web
npm install
npm run dev         # editor
npm test            # core unit tests (vitest)
npm run typecheck   # tsc --noEmit
```

## Status
Phase 1 in progress. Deterministic core (model + validation + re-flow + geometry + SVG render)
done and tested. Next: the ezdxf service skeleton, then the Fabric.js canvas + exports.
The Step-0 ezdxf round-trip spike passed (see `Drawing/01 Layout Design/spike/`).
