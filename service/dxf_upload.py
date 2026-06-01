"""Upload handling: equipment DXF -> measured bbox + clean SVG + retained block.

Mirrors the Step-0 spike. Returns what the upload-confirm modal needs:
the measured footprint (engineer confirms before it joins the library) and an
SVG for the editor view. The raw DXF is retained in the store for re-embedding
on export. Units are normalized: if $INSUNITS is unset we flag it for the UI
(never silently assume mm). (SKILL.md §3.1, CLAUDE.md §0)
"""
from __future__ import annotations

from typing import Any

import ezdxf
from ezdxf import bbox
from ezdxf.addons.drawing import RenderContext, Frontend, layout as dlayout
from ezdxf.addons.drawing import svg as ezsvg

import store


def process_upload(data: bytes) -> dict[str, Any]:
    # Store first, then readfile from disk — ezdxf.readfile detects the DXF
    # encoding ($DWGCODEPAGE / BOM) reliably, unlike decoding bytes ourselves.
    block_id = store.put(data)
    doc = ezdxf.readfile(str(store.path(block_id)))
    msp = doc.modelspace()

    insunits = int(doc.header.get("$INSUNITS", 0))
    ext = bbox.extents(msp, fast=False)
    if not ext.has_data:
        return {"ok": False, "error": "No drawable geometry found in DXF."}

    width_mm = round(ext.size.x, 3)
    height_mm = round(ext.size.y, 3)

    # render a clean SVG for the editor (native backend, no matplotlib)
    ctx = RenderContext(doc)
    backend = ezsvg.SVGBackend()
    Frontend(ctx, backend).draw_layout(msp)
    page = dlayout.Page(0, 0, dlayout.Units.mm, margins=dlayout.Margins.all(0))
    svg_str = backend.get_string(page)

    return {
        "ok": True,
        "block_ref": block_id,
        "width_mm": width_mm,
        "height_mm": height_mm,
        "units": "mm" if insunits == 4 else f"insunits={insunits}",
        "units_confirmed": insunits == 4,  # if False, UI must ask the engineer
        "svg": svg_str,
        # the confirm-modal message (engineer confirms/denies before saving)
        "confirm_message": f"This part measured {width_mm} x {height_mm} mm. Correct?",
    }
