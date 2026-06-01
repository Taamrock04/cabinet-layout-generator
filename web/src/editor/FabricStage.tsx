/**
 * Fabric.js canvas — the VIEW only. Renders the JSON model and reports user
 * edits (move) back via onMove; it never owns truth. (CLAUDE.md §5.)
 *
 * Zoom/pan use Fabric's viewport transform: the canvas fills the workspace and we
 * zoom/pan within it (no DOM scrolling). Object coordinates stay in millimetres
 * regardless of zoom/pan, so move/snap math is unaffected. Equipment can be moved
 * but NOT resized (handles disabled); rotation is via the properties panel. (brief §7)
 *
 *  - mouse wheel       → zoom at the cursor
 *  - drag empty space  → pan
 *  - zoom buttons/Fit  → driven by the `zoom` / `fitNonce` props from App
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

export const MIN_ZOOM = 0.03;
export const MAX_ZOOM = 8;
export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

interface Props {
  model: LayoutModel;
  library: Library;
  zoom: number; // px per mm
  snapStep: number; // 0 = off
  selectedId: string | null;
  /** Bump this number to trigger a fit-to-view. */
  fitNonce: number;
  onSelect: (sel: Selection | null) => void;
  onMove: (kind: EntityKind, id: string, x_mm: number, y_mm: number) => void;
  onZoomChange: (zoom: number) => void;
}

type Meta = { id: string; kind: EntityKind };

const EQUIP_OPTS = {
  hasControls: false, // no resize/rotate handles — size is mm-typed only
  lockScalingX: true,
  lockScalingY: true,
  lockRotation: true,
  borderColor: "#2f6fed",
};

/** Re-apply zoom keeping the content point under (ax,ay) fixed (ax/ay in canvas px). */
function applyZoom(canvas: Canvas, z: number, ax: number, ay: number) {
  const vpt = canvas.viewportTransform.slice() as [number, number, number, number, number, number];
  const old = vpt[0];
  const cx = (ax - vpt[4]) / old;
  const cy = (ay - vpt[5]) / old;
  vpt[0] = z; vpt[3] = z;
  vpt[4] = ax - cx * z;
  vpt[5] = ay - cy * z;
  canvas.setViewportTransform(vpt);
}

export default function FabricStage(props: Props) {
  const { model, library, zoom, selectedId, fitNonce } = props;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const elRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<Canvas | null>(null);
  // latest values for event handlers without re-binding
  const ref = useRef(props);
  ref.current = props;

  function fitToView() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cw = canvas.getWidth();
    const ch = canvas.getHeight();
    const W = ref.current.model.plate.width_mm;
    const H = ref.current.model.plate.height_mm;
    if (cw <= 0 || ch <= 0) return;
    const pad = 24;
    const z = clampZoom(Math.min((cw - 2 * pad) / W, (ch - 2 * pad) / H));
    canvas.setViewportTransform([z, 0, 0, z, (cw - W * z) / 2, (ch - H * z) / 2]);
    canvas.requestRenderAll();
    ref.current.onZoomChange(z);
  }

  // init once
  useEffect(() => {
    const canvas = new Canvas(elRef.current!, {
      selection: false,
      preserveObjectStacking: true,
      backgroundColor: "#eef0f2",
    });
    canvasRef.current = canvas;

    // size to the workspace; refit isn't forced on resize (only dimensions update)
    const sizeToWrap = () => {
      const w = wrapRef.current?.clientWidth ?? 800;
      const h = wrapRef.current?.clientHeight ?? 600;
      canvas.setDimensions({ width: w, height: h });
    };
    // Auto-fit once, as soon as the canvas has real dimensions (layout settles
    // after mount, so the first ResizeObserver tick is when fit is meaningful).
    let didInitialFit = false;
    const tryInitialFit = () => {
      if (!didInitialFit && canvas.getWidth() > 1 && canvas.getHeight() > 1) {
        didInitialFit = true;
        fitToView();
      }
    };
    sizeToWrap();
    const ro = new ResizeObserver(() => { sizeToWrap(); tryInitialFit(); canvas.requestRenderAll(); });
    if (wrapRef.current) ro.observe(wrapRef.current);

    // move snapping (object space = mm)
    canvas.on("object:moving", (e) => {
      const step = ref.current.snapStep;
      if (step > 0 && e.target) {
        e.target.set({ left: snap(e.target.left ?? 0, step), top: snap(e.target.top ?? 0, step) });
      }
    });
    canvas.on("object:modified", (e) => {
      const meta = (e.target as unknown as { data?: Meta })?.data;
      if (meta && e.target) {
        ref.current.onMove(meta.kind, meta.id, +(e.target.left ?? 0).toFixed(2), +(e.target.top ?? 0).toFixed(2));
      }
    });
    const emit = () => {
      const active = canvas.getActiveObject() as unknown as { data?: Meta } | null;
      ref.current.onSelect(active?.data ?? null);
    };
    canvas.on("selection:created", emit);
    canvas.on("selection:updated", emit);
    canvas.on("selection:cleared", () => ref.current.onSelect(null));

    // wheel = zoom at cursor
    canvas.on("mouse:wheel", (opt) => {
      const ev = opt.e as WheelEvent;
      ev.preventDefault();
      ev.stopPropagation();
      const next = clampZoom(canvas.getZoom() * 0.999 ** ev.deltaY);
      applyZoom(canvas, next, ev.offsetX, ev.offsetY);
      canvas.requestRenderAll();
      ref.current.onZoomChange(next); // App state stays in sync; effect below no-ops
    });

    // drag empty space = pan
    let panning = false;
    let lastX = 0;
    let lastY = 0;
    canvas.on("mouse:down", (opt) => {
      if (!opt.target) {
        panning = true;
        canvas.setCursor("grabbing");
        lastX = (opt.e as MouseEvent).clientX;
        lastY = (opt.e as MouseEvent).clientY;
      }
    });
    canvas.on("mouse:move", (opt) => {
      if (!panning) return;
      const e = opt.e as MouseEvent;
      const vpt = canvas.viewportTransform;
      vpt[4] += e.clientX - lastX;
      vpt[5] += e.clientY - lastY;
      canvas.setViewportTransform(vpt);
      lastX = e.clientX;
      lastY = e.clientY;
    });
    canvas.on("mouse:up", () => { panning = false; });

    // also attempt right after layout, in case ResizeObserver hasn't ticked yet
    requestAnimationFrame(() => { sizeToWrap(); tryInitialFit(); });

    return () => {
      ro.disconnect();
      canvas.dispose();
      canvasRef.current = null;
    };
  }, []);

  // apply zoom from the buttons (skip if already applied by the wheel handler)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (Math.abs(canvas.getZoom() - zoom) < 1e-6) return;
    applyZoom(canvas, zoom, canvas.getWidth() / 2, canvas.getHeight() / 2);
    canvas.requestRenderAll();
  }, [zoom]);

  // fit-to-view on demand
  useEffect(() => { if (fitNonce > 0) fitToView(); }, [fitNonce]);

  // rebuild objects whenever the model changes (does NOT touch zoom/pan)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.remove(...canvas.getObjects());

    const W = model.plate.width_mm;
    const H = model.plate.height_mm;
    canvas.add(new Rect({
      left: 0, top: 0, width: W, height: H, fill: "#fafafa", stroke: "#000", strokeWidth: 0.8,
      selectable: false, evented: false,
    }));

    const tag = (meta: Meta, o: Rect) => { (o as unknown as { data: Meta }).data = meta; return o; };

    for (const d of model.ducts) {
      const horizontal = d.rot_deg % 180 === 0;
      const w = horizontal ? d.length_mm : d.width_mm;
      const h = horizontal ? d.width_mm : d.length_mm;
      canvas.add(tag({ id: d.id, kind: "duct" }, new Rect({
        left: d.x_mm, top: d.y_mm, width: w, height: h,
        fill: "#eef3ff", stroke: "#3559b3", strokeWidth: 0.4, ...EQUIP_OPTS,
      })));
    }

    for (const g of model.groups) {
      const item = library[g.lib_key];
      if (!item) continue;
      const f = rotatedFootprint(libItemSize(item), g.rot_deg);
      const total = g.count * f.w + (g.count - 1) * g.internal_gap_mm;
      canvas.add(tag({ id: g.id, kind: "group" }, new Rect({
        left: g.x_mm, top: g.y_mm, width: total, height: f.h,
        fill: "#ffffff", stroke: "#222", strokeWidth: 0.4, ...EQUIP_OPTS,
      })));
    }

    for (const el of model.elements) {
      const item = library[el.lib_key];
      const f = item ? rotatedFootprint(libItemSize(item), el.rot_deg) : { w: 10, h: 10 };
      canvas.add(tag({ id: el.id, kind: "element" }, new Rect({
        left: el.x_mm, top: el.y_mm, width: f.w, height: f.h,
        fill: item ? "#ffffff" : "#fdecec", stroke: item ? "#222" : "#c00", strokeWidth: 0.4, ...EQUIP_OPTS,
      })));
      if (el.tag) {
        canvas.add(new Textbox(el.tag, {
          left: el.x_mm, top: el.y_mm + f.h / 2 - 3, width: f.w,
          fontSize: 6, fontFamily: "Arial", textAlign: "center", selectable: false, evented: false,
        }));
      }
    }

    if (selectedId) {
      const obj = canvas.getObjects().find((o) => (o as unknown as { data?: Meta }).data?.id === selectedId);
      if (obj) canvas.setActiveObject(obj);
    }
    canvas.requestRenderAll();
  }, [model, library, selectedId]);

  return (
    <div ref={wrapRef} className="canvas-wrap">
      <canvas ref={elRef} />
    </div>
  );
}
