"""Verification harness for the assembler (run with the service venv).

Exercises both export paths:
  - rect/symbol parts drawn as geometry,
  - an UPLOADED DXF (the real FC6A) re-embedded as a block INSERT, placed at
    rot 0 and rot 90 to prove the rotated-anchor fix (no overlap).
Writes out_service.dxf (+ .svg), audits it, and asserts placement.
"""
from __future__ import annotations

import sys

import ezdxf
from ezdxf import bbox
from ezdxf.addons.drawing import RenderContext, Frontend, layout as dlayout
from ezdxf.addons.drawing import svg as ezsvg

import dxf_build
import dxf_upload

FC6A = r"C:\Users\Natchanon.k\OneDrive - AMR Asia Public Company Limited\Web Project\Drawing\01 Layout Design\sample_parts\FC6A-D16-A4-P00467.dxf"

# 1) upload the real FC6A -> get measured size + a retained block_ref
with open(FC6A, "rb") as f:
    up = dxf_upload.process_upload(f.read())
print("UPLOAD:", up["confirm_message"], "units:", up["units"])
assert up["ok"] and up["units_confirmed"], "FC6A should be mm and parse cleanly"
fc6a_w, fc6a_h, block_ref = up["width_mm"], up["height_mm"], up["block_ref"]

# 2) a library: FC6A as an uploaded dxf part; the rest as rects
library = {
    "plc_idec_FC6A_D16": {"source": "dxf", "name": "PLC FC6A-D16",
                          "width_mm": fc6a_w, "height_mm": fc6a_h, "block_ref": block_ref},
    "psu_switching_24vdc": {"source": "rect", "name": "PSU 24VDC", "width_mm": 40, "height_mm": 110},
    "term_degson_2c_2_5": {"source": "rect", "name": "Degson 2C", "width_mm": 5.2, "height_mm": 50},
}

# 3) a tall-enclosure demo model (mirrors the web demo)
SD = 60.0
PLATE_W, PLATE_H = 800.0, 1500.0
model = {
    "project": {"name": "Service Test"},
    "plate": {"width_mm": PLATE_W, "height_mm": PLATE_H, "origin": "top_left"},
    "ducts": [
        {"id": "WW_L", "x_mm": 0, "y_mm": 0, "length_mm": PLATE_H, "width_mm": SD, "label_h_mm": 60, "rot_deg": 90},
        {"id": "WW_R", "x_mm": PLATE_W - SD, "y_mm": 0, "length_mm": PLATE_H, "width_mm": SD, "label_h_mm": 60, "rot_deg": 90},
        {"id": "WW_top", "x_mm": SD, "y_mm": 110, "length_mm": PLATE_W - 2 * SD, "width_mm": 40, "label_h_mm": 60, "rot_deg": 0},
    ],
    "elements": [
        {"id": "e_plc0", "lib_key": "plc_idec_FC6A_D16", "tag": "PLC01", "x_mm": SD + 10, "y_mm": 170, "rot_deg": 0,
         "gap_before_mm": 0.1, "clearance_to_duct_mm": 3, "group_id": None, "locked": False},
        {"id": "e_plc90", "lib_key": "plc_idec_FC6A_D16", "tag": "PLC02", "x_mm": SD + 200, "y_mm": 170, "rot_deg": 90,
         "gap_before_mm": 0.1, "clearance_to_duct_mm": 3, "group_id": None, "locked": False},
        {"id": "e_psu", "lib_key": "psu_switching_24vdc", "tag": "PS01", "x_mm": SD + 400, "y_mm": 170, "rot_deg": 0,
         "gap_before_mm": 0.1, "clearance_to_duct_mm": 3, "group_id": None, "locked": False},
    ],
    "groups": [
        {"id": "g_term", "kind": "set", "lib_key": "term_degson_2c_2_5", "count": 12,
         "internal_gap_mm": 0.1, "x_mm": SD + 10, "y_mm": 320, "rot_deg": 0},
    ],
    "labels": [
        {"id": "L1", "text": "24VDC", "anchor": "group:g_term", "dx_mm": 0, "dy_mm": -6, "rot_deg": 0},
    ],
}

# 4) assemble at 1:1, save, audit
doc = dxf_build.assemble(model, library, scale=1.0)
doc.saveas("out_service.dxf")
auditor = doc.audit()
print("AUDIT errors:", len(auditor.errors))
assert not auditor.errors, "assembled DXF must audit clean"

# 5) assert the two FC6A INSERTs do NOT overlap (rotated-anchor fix)
msp = doc.modelspace()
inserts = [e for e in msp if e.dxftype() == "INSERT"]
boxes = []
for ins in inserts:
    ext = bbox.extents([ins], fast=False)
    boxes.append((ins.dxf.rotation, ext.extmin, ext.extmax))
    print(f"  INSERT rot={ins.dxf.rotation:>3.0f} ll=({ext.extmin.x:.1f},{ext.extmin.y:.1f}) "
          f"size={ext.size.x:.1f}x{ext.size.y:.1f}")
assert len(inserts) == 2
(_, amin, amax), (_, bmin, bmax) = boxes[0], boxes[1]
overlap = amin.x < bmax.x and amax.x > bmin.x and amin.y < bmax.y and amax.y > bmin.y
assert not overlap, "the two FC6A placements must NOT overlap (rotated-anchor fix)"
print("OK: no overlap between rot0 and rot90 placements")

# 6) verify rot=90 footprint swapped W x H
rot90 = next(b for b in boxes if b[0] == 90)
sw, sh = rot90[2].x - rot90[1].x, rot90[2].y - rot90[1].y
assert abs(sw - fc6a_h) < 0.5 and abs(sh - fc6a_w) < 0.5, "rot90 must swap W x H"
print(f"OK: rot90 footprint {sw:.1f}x{sh:.1f} == swapped {fc6a_h:.1f}x{fc6a_w:.1f}")

# 7) also dump an SVG of the result for eyeballing
backend = ezsvg.SVGBackend()
Frontend(RenderContext(doc), backend).draw_layout(msp)
page = dlayout.Page(0, 0, dlayout.Units.mm, margins=dlayout.Margins.all(0))
open("out_service.svg", "w", encoding="utf-8").write(backend.get_string(page))
print("wrote out_service.dxf + out_service.svg")
print("ALL ASSERTIONS PASSED")
