"""ezdxf service — FastAPI. Two jobs only: DXF upload and DXF export.

Stateless w.r.t. layouts; touched ONLY on DXF up/download (SKILL.md §2). Phase 1
runs locally with no auth; Phase 2 will validate the Supabase token per request
and restrict CORS to the frontend domain (CLAUDE.md §5, SKILL.md §7 invariant 8).
"""
from __future__ import annotations

import io
import re
from typing import Any

import ezdxf
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

import dxf_build
import dxf_upload

app = FastAPI(title="Cabinet Layout — ezdxf service", version="0.1.0")

# Phase 1: permissive for local dev. Phase 2: lock to the frontend domain.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "ezdxf": ezdxf.__version__}


@app.post("/upload")
async def upload(file: UploadFile = File(...)) -> dict[str, Any]:
    if not file.filename or not file.filename.lower().endswith(".dxf"):
        raise HTTPException(400, "Expected a .dxf file.")
    data = await file.read()
    try:
        result = dxf_upload.process_upload(data)
    except Exception as exc:  # surface parse errors honestly, never guess
        raise HTTPException(422, f"Could not parse DXF: {exc}") from exc
    if not result.get("ok"):
        raise HTTPException(422, result.get("error", "Upload failed."))
    return result


class ExportRequest(BaseModel):
    model: dict[str, Any]
    library: dict[str, Any]
    scale: float = 1.0  # 1.0 = 1:1, 0.01 = 1:100


def _safe_filename(name: str) -> str:
    """ASCII-safe filename for the Content-Disposition header (latin-1 only)."""
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("_")
    return base or "layout"


@app.post("/export")
def export(req: ExportRequest) -> Response:
    if req.scale not in (1.0, 0.01):
        raise HTTPException(400, "scale must be 1.0 (1:1) or 0.01 (1:100).")
    try:
        doc = dxf_build.assemble(req.model, req.library, req.scale)
        buf = io.StringIO()
        doc.write(buf)
        data = buf.getvalue().encode("utf-8")
    except Exception as exc:  # return a clean error (CORS-headed), never a raw crash
        raise HTTPException(500, f"DXF assembly failed: {exc}") from exc
    name = _safe_filename(str(req.model.get("project", {}).get("name", "layout")))
    return Response(
        content=data,
        media_type="application/dxf",
        headers={"Content-Disposition": f'attachment; filename="{name}.dxf"'},
    )
