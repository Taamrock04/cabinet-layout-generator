"""DXF assembler: (layout model + library) -> ezdxf Document.

This is the deterministic export engine (SKILL.md §3.3 / §6, CLAUDE.md §0/§2/§4).
It NEVER invents geometry — it places exactly what the validated model says.

Conventions honoured here:
  - Editor coords are top-left, +y DOWN, mm. DXF is bottom-left, +y UP.
    The flip happens in ONE function: `_to_dxf`. (CLAUDE.md §4)
  - Layers: PLATE / DUCT / EQUIP / TEXT / GROUND.
  - Text style "ARIAL" (TrueType arial.ttf) — matches the engineer's GstarCAD text.
  - Scale: 1:1 (factor 1.0) or 1:100 (factor 0.01). Geometry is multiplied by the
    factor. (Dimension entities that must read the REAL value are a later feature;
    no dimensions are emitted yet, so the rule does not yet apply — see TODO.)
  - Uploaded `dxf` parts are re-embedded as INSERTs with the rotated-anchor offset
    computed so the rotated footprint's top-left lands exactly where placed
    (the wrinkle the Step-0 spike surfaced).
"""
from __future__ import annotations

import math
from typing import Any

import ezdxf
from ezdxf import bbox
from ezdxf.addons.importer import Importer

import store

LAYERS = {
    "PLATE": 8,
    "DUCT": 5,     # blue
    "EQUIP": 7,    # white/black
    "TEXT": 3,     # green
    "GROUND": 2,   # yellow
}
TEXT_STYLE = "ARIAL"


def _num(v: object) -> str:
    """Format a dimension without a trailing '.0' (e.g. 40.0 -> '40')."""
    f = float(v)
    return str(int(f)) if f.is_integer() else str(f)


# --------------------------- geometry helpers ---------------------------

def rotated_footprint(w: float, h: float, rot_deg: float) -> tuple[float, float]:
    a = rot_deg % 360
    if a in (0, 180):
        return w, h
    if a in (90, 270):
        return h, w
    r = math.radians(a)
    c, s = abs(math.cos(r)), abs(math.sin(r))
    return w * c + h * s, w * s + h * c


def rotate_point(x: float, y: float, rot_deg: float) -> tuple[float, float]:
    r = math.radians(rot_deg % 360)
    cs, sn = math.cos(r), math.sin(r)
    return (x * cs - y * sn, x * sn + y * cs)


def insert_point_for(part_w: float, part_h: float, rot_deg: float,
                     dxf_ll_x: float, dxf_ll_y: float) -> tuple[float, float]:
    """Insert point so a block (local origin at part lower-left) rotated by
    rot_deg has its rotated bbox lower-left at (dxf_ll_x, dxf_ll_y) in DXF space.

    Rotation is about the insert point; we offset the insert point by the
    rotated part's local bbox-min so placement is exact for any angle.
    """
    corners = [(0, 0), (part_w, 0), (part_w, part_h), (0, part_h)]
    rc = [rotate_point(cx, cy, rot_deg) for cx, cy in corners]
    rminx = min(p[0] for p in rc)
    rminy = min(p[1] for p in rc)
    return (dxf_ll_x - rminx, dxf_ll_y - rminy)


# --------------------------- the assembler ---------------------------

class DxfAssembler:
    def __init__(self, model: dict[str, Any], library: dict[str, Any], scale: float = 1.0):
        self.model = model
        self.library = library
        self.scale = scale
        self.plate_h = float(model["plate"]["height_mm"])
        self.doc = ezdxf.new("R2018", setup=True)
        self.doc.units = ezdxf.units.MM
        for name, color in LAYERS.items():
            if name not in self.doc.layers:
                self.doc.layers.add(name, color=color)
        if TEXT_STYLE not in self.doc.styles:
            self.doc.styles.add(TEXT_STYLE, font="arial.ttf")
        self.msp = self.doc.modelspace()
        self._imported_blocks: dict[str, str] = {}  # lib_key -> block name

    # the ONE place the top-left -> bottom-left flip + scale happens
    def _to_dxf(self, x_mm: float, y_top_mm: float) -> tuple[float, float]:
        return (x_mm * self.scale, (self.plate_h - y_top_mm) * self.scale)

    def _s(self, v: float) -> float:
        return v * self.scale

    def _rect(self, x_top_left: float, y_top: float, w: float, h: float, layer: str) -> None:
        # editor top-left rect -> four DXF corners (flip via lower-left)
        x0, y0 = self._to_dxf(x_top_left, y_top + h)  # lower-left
        x1, y1 = x0 + self._s(w), y0 + self._s(h)
        self.msp.add_lwpolyline(
            [(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)],
            dxfattribs={"layer": layer},
        )

    def _text(self, s: str, cx_mm: float, cy_top_mm: float, height_mm: float,
              rot_deg: float = 0, layer: str = "TEXT",
              align: ezdxf.enums.TextEntityAlignment = ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER) -> None:
        x, y = self._to_dxf(cx_mm, cy_top_mm)
        t = self.msp.add_text(
            s, dxfattribs={"layer": layer, "height": self._s(height_mm),
                           "style": TEXT_STYLE, "rotation": rot_deg},
        )
        t.set_placement((x, y), align=align)

    def _line(self, x1: float, y1: float, x2: float, y2: float, layer: str = "TEXT") -> None:
        a = self._to_dxf(x1, y1)
        b = self._to_dxf(x2, y2)
        self.msp.add_line(a, b, dxfattribs={"layer": layer})

    # ----- row dimensions (right margin) -----

    def _row_dims(self) -> None:
        ducts = self.model.get("ducts", [])
        horiz = sorted(
            [d for d in ducts if float(d.get("rot_deg", 0)) % 180 == 0],
            key=lambda d: float(d["y_mm"]),
        )
        if len(horiz) < 2:
            return
        W = float(self.model["plate"]["width_mm"])
        dim_x = W + 40
        ml = ezdxf.enums.TextEntityAlignment.MIDDLE_LEFT
        for a, b in zip(horiz, horiz[1:]):
            top_y = float(a["y_mm"]) + float(a["width_mm"])
            bottom_y = float(b["y_mm"])
            value = round(bottom_y - top_y, 1)
            self._line(W, top_y, dim_x + 8, top_y)          # extension lines
            self._line(W, bottom_y, dim_x + 8, bottom_y)
            self._line(dim_x, top_y, dim_x, bottom_y)        # dimension line
            self._line(dim_x - 3, top_y + 3, dim_x + 3, top_y - 3)      # ticks
            self._line(dim_x - 3, bottom_y + 3, dim_x + 3, bottom_y - 3)
            self._text(_num(value), dim_x + 12, (top_y + bottom_y) / 2, 16, align=ml)

    # ----- parts -----

    def _import_block(self, lib_key: str, block_ref: str) -> str:
        if lib_key in self._imported_blocks:
            return self._imported_blocks[lib_key]
        src = ezdxf.readfile(str(store.path(block_ref)))
        ext = bbox.extents(src.modelspace(), fast=False)
        block_name = f"EQ_{lib_key}"
        block = self.doc.blocks.new(name=block_name)
        importer = Importer(src, self.doc)
        for e in src.modelspace():
            importer.import_entity(e, block)
        importer.finalize()
        # normalize base point to part lower-left so placement is predictable
        block.block.dxf.base_point = (ext.extmin.x, ext.extmin.y, 0)
        self._imported_blocks[lib_key] = block_name
        return block_name

    def _place_element(self, el: dict[str, Any]) -> None:
        item = self.library.get(el["lib_key"])
        if item is None:
            return  # validation already flags unresolved keys; never invent
        w, h = float(item["width_mm"]), float(item["height_mm"])
        rot = float(el.get("rot_deg", 0))
        fw, fh = rotated_footprint(w, h, rot)
        x, y_top = float(el["x_mm"]), float(el["y_mm"])

        if item["source"] == "dxf" and item.get("block_ref"):
            block_name = self._import_block(el["lib_key"], item["block_ref"])
            # desired footprint lower-left in DXF coords
            ll_x, ll_y = self._to_dxf(x, y_top + fh)
            ins_x, ins_y = insert_point_for(self._s(w), self._s(h), rot, ll_x, ll_y)
            self.msp.add_blockref(
                block_name, (ins_x, ins_y),
                dxfattribs={"layer": "EQUIP", "rotation": rot,
                            "xscale": self.scale, "yscale": self.scale},
            )
        else:
            # rect / symbol: draw the footprint rectangle + tag
            self._rect(x, y_top, fw, fh, "EQUIP")
            tag = el.get("tag")
            if tag:
                # top-left of the part, 2.5mm above; rotate if wider than the part
                bl = ezdxf.enums.TextEntityAlignment.BOTTOM_LEFT
                tag_h, gap = 10.0, 2.5
                if len(tag) * tag_h * 0.62 <= fw:
                    self._text(tag, x, y_top - gap, tag_h, align=bl)
                else:
                    self._text(tag, x + tag_h * 0.75, y_top - gap, tag_h, rot_deg=90, align=bl)

    def _place_group(self, g: dict[str, Any]) -> None:
        item = self.library.get(g["lib_key"])
        if item is None:
            return
        w, h = float(item["width_mm"]), float(item["height_mm"])
        fw, fh = rotated_footprint(w, h, float(g.get("rot_deg", 0)))
        x = float(g["x_mm"])
        y_top = float(g["y_mm"])
        gap = float(g.get("internal_gap_mm", 0.1))
        for _ in range(int(g["count"])):
            self._rect(x, y_top, fw, fh, "EQUIP")
            x += fw + gap

    def _place_duct(self, d: dict[str, Any]) -> None:
        horizontal = float(d.get("rot_deg", 0)) % 180 == 0
        w = float(d["length_mm"]) if horizontal else float(d["width_mm"])
        h = float(d["width_mm"]) if horizontal else float(d["length_mm"])
        self._rect(float(d["x_mm"]), float(d["y_mm"]), w, h, "DUCT")
        # label matches the as-builts: "WIRE DUCT 40X60 MM"; height ~60% of thickness
        label = f"WIRE DUCT {_num(d['width_mm'])}X{_num(d['label_h_mm'])} MM"
        self._text(label, float(d["x_mm"]) + w / 2, float(d["y_mm"]) + h / 2,
                   float(d["width_mm"]) * 0.6, rot_deg=0 if horizontal else 90)

    def _place_label(self, l: dict[str, Any]) -> None:
        kind, ref = l["anchor"].split(":")
        host = None
        if kind == "element":
            host = next((e for e in self.model["elements"] if e["id"] == ref), None)
        elif kind == "group":
            host = next((g for g in self.model["groups"] if g["id"] == ref), None)
        if host is None:
            return
        x = float(host["x_mm"]) + float(l.get("dx_mm", 0))
        y = float(host["y_mm"]) + float(l.get("dy_mm", 0))
        self._text(l["text"], x, y, 10, rot_deg=float(l.get("rot_deg", 0)))

    def build(self) -> ezdxf.document.Drawing:
        p = self.model["plate"]
        self._rect(0, 0, float(p["width_mm"]), float(p["height_mm"]), "PLATE")
        for d in self.model.get("ducts", []):
            self._place_duct(d)
        for g in self.model.get("groups", []):
            self._place_group(g)
        for e in self.model.get("elements", []):
            self._place_element(e)
        for l in self.model.get("labels", []):
            self._place_label(l)
        self._row_dims()
        return self.doc


def assemble(model: dict[str, Any], library: dict[str, Any], scale: float = 1.0):
    return DxfAssembler(model, library, scale).build()
