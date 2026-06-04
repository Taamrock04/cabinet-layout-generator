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

## Run & deploy
- **[RUNNING.md](RUNNING.md)** — run locally (web editor + ezdxf service).
- **[DEPLOY.md](DEPLOY.md)** — deploy to Vercel (frontend) + Render (service).

Quick start (local):
```
cd web && npm run dev        # editor at http://localhost:5180
# in a second terminal, only for DXF:
cd service && .\.venv\Scripts\python.exe -m uvicorn app:app --port 8000
```

## Status
**Phase 1 complete** — single-user editor (drag/drop, move/rotate/type-mm, sets, labels,
ducts with resize/snap, zoom/pan, overlap + clearance warnings), equipment DXF upload, and
all four exports (DXF via service; PDF/PNG/SVG in-browser). Pushed to GitHub; deployable per
DEPLOY.md. Next: Phase 2 (Supabase auth + shared projects/library; move hosting to Cloudflare).
