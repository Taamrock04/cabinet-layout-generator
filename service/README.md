# ezdxf service

Python (FastAPI + ezdxf) service that does the two DXF jobs the browser can't:
**upload** (equipment DXF → measured bbox + clean SVG + retained block) and
**export** (layout model + library → assembled `.dxf` for GstarCAD). Stateless
w.r.t. layouts; touched only on DXF up/download. See `../SKILL.md §3.3`.

## Dev
```
cd service
py -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m uvicorn app:app --reload --port 8000
```
- `GET  /health` — liveness + ezdxf version
- `POST /upload` — multipart `file=<dxf>` → `{ block_ref, width_mm, height_mm, units, svg, confirm_message }`
- `POST /export` — JSON `{ model, library, scale }` (scale 1.0=1:1, 0.01=1:100) → `.dxf` download

## Verify
```
.venv\Scripts\python test_build.py      # builds a demo DXF, re-embeds the real FC6A, audits, asserts placement
```
Render a DXF to PNG for eyeballing (needs matplotlib — use the spike venv):
```
<spike-venv>\python _view.py out_service.dxf out_service.png
```

## Notes / TODO
- Coordinate flip (editor top-left → DXF bottom-left) lives in ONE place: `DxfAssembler._to_dxf`.
- Layers PLATE/DUCT/EQUIP/TEXT/GROUND; text style ARIAL (arial.ttf).
- Scale 1:100 currently scales geometry uniformly. **Dimension text must read the
  REAL value** — applies once dimension entities are emitted (not yet); single hook in `_text`.
- Phase 2: validate Supabase token per request; restrict CORS; swap `store.py` for Supabase Storage.
- Pinned to Python 3.14-compatible wheels; matplotlib excluded (no 3.14 wheel, not needed — native SVG backend).
