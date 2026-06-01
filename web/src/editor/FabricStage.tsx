/**
 * Fabric.js canvas — the VIEW only. It renders the JSON model and reports user
 * edits (move) back via onChange; it never owns truth. (CLAUDE.md §5.)
 *
 * Coordinates: the canvas zoom is set to px-per-mm, so all Fabric object
 * left/top/width are in millimetres — no manual px<->mm math. Equipment can be
 * moved but NOT resized (scaling + rotation controls disabled); rotation is via
 * the properties panel (it swaps the footprint, matching the renderer). (brief §7)
 */
import { useEffect, useRef } from "react";
import { Canvas, Rect, Textbox } from "fabric";
import type { LayoutModel, Library } from "../model/types";
import { libItemSize } from "../model/resolve";
import { rotatedFootprint } from "../model/geometry";
import { snap, type EntityKind } from "../model/edit";

export interface Selection {
  id: string;
  kind: EntityKind;
}

interface Props {
  model: LayoutModel;
  library: Library;
  scale: number; // px per mm
  snapStep: number; // 0 = off
  selectedId: string | null;
  onSelect: (sel: Selection | null) => void;
  onMove: (kind: EntityKind, id: string, x_mm: number, y_mm: number) => void;
}

type Meta = { id: string; kind: EntityKind };

const EQUIP_OPTS = {
  hasControls: false, // no resize/rotate handles — size is mm-typed only
  lockScalingX: true,
  lockScalingY: true,
  lockRotation: true,
  borderColor: "#2f6fed",
  cornerColor: "#2f6fed",
};

export default function FabricStage({ model, library, scale, snapStep, selectedId, onSelect, onMove }: Props) {
  const elRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<Canvas | null>(null);
  // keep latest callbacks without re-running the heavy rebuild effect
  const cbRef = useRef({ onSelect, onMove, snapStep });
  cbRef.current = { onSelect, onMove, snapStep };

  // init once
  useEffect(() => {
    const canvas = new Canvas(elRef.current!, { selection: false, preserveObjectStacking: true });
    canvasRef.current = canvas;

    canvas.on("object:moving", (e) => {
      const step = cbRef.current.snapStep;
      if (step > 0 && e.target) {
        e.target.set({ left: snap(e.target.left ?? 0, step), top: snap(e.target.top ?? 0, step) });
      }
    });
    canvas.on("object:modified", (e) => {
      const meta = (e.target as unknown as { data?: Meta })?.data;
      if (meta && e.target) {
        cbRef.current.onMove(meta.kind, meta.id, +(e.target.left ?? 0).toFixed(2), +(e.target.top ?? 0).toFixed(2));
      }
    });
    const emit = () => {
      const active = canvas.getActiveObject() as unknown as { data?: Meta } | null;
      cbRef.current.onSelect(active?.data ?? null);
    };
    canvas.on("selection:created", emit);
    canvas.on("selection:updated", emit);
    canvas.on("selection:cleared", () => cbRef.current.onSelect(null));

    return () => {
      canvas.dispose();
      canvasRef.current = null;
    };
  }, []);

  // rebuild objects whenever the model or scale changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = model.plate.width_mm;
    const H = model.plate.height_mm;
    canvas.setDimensions({ width: W * scale, height: H * scale });
    canvas.setZoom(scale);
    canvas.remove(...canvas.getObjects());

    // plate (background, not interactive)
    canvas.add(new Rect({
      left: 0, top: 0, width: W, height: H, fill: "#fafafa", stroke: "#000", strokeWidth: 0.8,
      selectable: false, evented: false,
    }));

    const tag = (meta: Meta, o: Rect | Textbox) => {
      (o as unknown as { data: Meta }).data = meta;
      return o;
    };

    // ducts
    for (const d of model.ducts) {
      const horizontal = d.rot_deg % 180 === 0;
      const w = horizontal ? d.length_mm : d.width_mm;
      const h = horizontal ? d.width_mm : d.length_mm;
      const rect = new Rect({
        left: d.x_mm, top: d.y_mm, width: w, height: h,
        fill: "#eef3ff", stroke: "#3559b3", strokeWidth: 0.4,
        ...EQUIP_OPTS,
      });
      canvas.add(tag({ id: d.id, kind: "duct" }, rect));
    }

    // sets (groups) — one block representing the set footprint
    for (const g of model.groups) {
      const item = library[g.lib_key];
      if (!item) continue;
      const f = rotatedFootprint(libItemSize(item), g.rot_deg);
      const total = g.count * f.w + (g.count - 1) * g.internal_gap_mm;
      const rect = new Rect({
        left: g.x_mm, top: g.y_mm, width: total, height: f.h,
        fill: "#ffffff", stroke: "#222", strokeWidth: 0.4, ...EQUIP_OPTS,
      });
      canvas.add(tag({ id: g.id, kind: "group" }, rect));
    }

    // elements
    for (const el of model.elements) {
      const item = library[el.lib_key];
      const f = item ? rotatedFootprint(libItemSize(item), el.rot_deg) : { w: 10, h: 10 };
      const rect = new Rect({
        left: el.x_mm, top: el.y_mm, width: f.w, height: f.h,
        fill: item ? "#ffffff" : "#fdecec",
        stroke: item ? "#222" : "#c00", strokeWidth: 0.4,
        ...EQUIP_OPTS,
      });
      canvas.add(tag({ id: el.id, kind: "element" }, rect));
      if (el.tag) {
        const label = new Textbox(el.tag, {
          left: el.x_mm, top: el.y_mm + f.h / 2 - 3, width: f.w,
          fontSize: 6, fontFamily: "Arial", textAlign: "center",
          selectable: false, evented: false,
        });
        canvas.add(label);
      }
    }

    // restore selection by id
    if (selectedId) {
      const obj = canvas.getObjects().find((o) => (o as unknown as { data?: Meta }).data?.id === selectedId);
      if (obj) canvas.setActiveObject(obj);
    }
    canvas.requestRenderAll();
  }, [model, library, scale, selectedId]);

  return <canvas ref={elRef} />;
}
