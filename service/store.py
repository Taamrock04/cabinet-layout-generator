"""Block store — where uploaded equipment DXFs are retained for re-embedding.

Phase 1: a local folder keyed by id. Phase 2 swaps this implementation for
Supabase Storage (the export pulls part DXFs by id) without touching callers.
The interface is deliberately tiny: put(bytes)->id, path(id)->Path.
"""
from __future__ import annotations

import uuid
from pathlib import Path

_STORE_DIR = Path(__file__).parent / "_blocks"
_STORE_DIR.mkdir(exist_ok=True)


def put(data: bytes, *, suggested_id: str | None = None) -> str:
    """Store raw DXF bytes, return a block id."""
    block_id = suggested_id or uuid.uuid4().hex
    (_STORE_DIR / f"{block_id}.dxf").write_bytes(data)
    return block_id


def path(block_id: str) -> Path:
    p = _STORE_DIR / f"{block_id}.dxf"
    if not p.exists():
        raise KeyError(f"block '{block_id}' not in store")
    return p


def exists(block_id: str) -> bool:
    return (_STORE_DIR / f"{block_id}.dxf").exists()
