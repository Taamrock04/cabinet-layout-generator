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
import { Canvas, Rect, Textbox, FabricText, Line, loadSVGFromString, util, type FabricObject } from "fabric";
import type { LayoutModel, Library } from "../model/types";
import { libItemSize } from "../model/resolve";
import { rotatedFootprint } from "../model/geometry";
import { snap, anchorHost, type EntityKind } from "../model/edit";
import { computeSnap } from "../model/align";
import { snapDuct } from "../model/ductsnap";
import { rowDims, detectRows } from "../model/rows";
import { contentWidth } from "../render/toSvg";

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
  /** When on, dragging a part near another snaps it adjacent + rail-aligned. */
  alignEnabled: boolean;
  /** Currently-selected entity ids (one => editable; many => multi-select). */
  selectedIds: string[];
  /** Bump this number to trigger a fit-to-view. */
  fitNonce: number;
  /** Ids of entities that overlap something — drawn with a red alert style. */
  overlapIds: Set<string>;
  /** Ids of elements too close to a duct — drawn with an orange caution style. */
  tightIds: Set<string>;
  /** Clicked an entity; `additive` (Shift held) toggles it in the selection. */
  onSelectEntity: (meta: Selection, additive: boolean) => void;
  /** Clicked empty space — clear the selection. */
  onClearSelection: () => void;
  onMove: (kind: EntityKind, id: string, x_mm: number, y_mm: number) => void;
  onZoomChange: (zoom: number) => void;
  /** Duct resized by dragging an edge: new top-left + new box size (mm). */
  onResizeDuct: (id: string, x_mm: number, y_mm: number, boxW: number, boxH: number) => void;
  /** A library part dropped onto the canvas at (x_mm, y_mm). */
  onDropPart: (libKey: string, x_mm: number, y_mm: number) => void;
  /** Clicked a row dimension — open an inline editor at the cursor. */
  onEditRow: (index: number, clientX: number, clientY: number, value: number) => void;
}

type RowDimMeta = { index: number; value: number };

type Meta = { id: string; kind: EntityKind };

const EQUIP_OPTS = {
  // Fabric v6 defaults origin to center; we position everything by its TOP-LEFT
  // (matching the model + the SVG renderer), so pin origin explicitly.
  originX: "left" as const,
  originY: "top" as const,
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
  const { model, library, zoom, selectedIds, fitNonce, overlapIds, tightIds } = props;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const elRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<Canvas | null>(null);
  // latest values for event handlers without re-binding
  const ref = useRef(props);
  ref.current = props;
  // bumped each rebuild so stale async SVG loads can be discarded
  const genRef = useRef(0);

  function fitToView() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cw = canvas.getWidth();
    const ch = canvas.getHeight();
    const W = contentWidth(ref.current.model); // include the row-dimension margin
    const H = ref.current.model.plate.height_mm;
    if (cw <= 0 || ch <= 0) return;
    const pad = 24;
    const z = clampZoom(Math.min((cw - 2 * pad) / W, (ch - 2 * pad) / H));
    canvas.setViewportTransform([z, 0, 0, z, (cw - W * z) / 2, (ch - H * z) / 2]);
    canvas.requestRenderAll();
    ref.current.onZoomChange(z);
  }

  /**
   * Reflect the current selection WITHOUT recreating objects (so it never
   * interrupts a drag): a single selection uses Fabric's active object (border +
   * duct handles); multiple show dashed overlays. Re-applied after a rebuild too.
   */
  function applySelection(canvas: Canvas) {
    canvas.getObjects()
      .filter((o) => (o as unknown as { __selHL?: boolean }).__selHL)
      .forEach((o) => canvas.remove(o));
    const ids = ref.current.selectedIds;
    const sel = new Set(ids);
    const objs = canvas.getObjects().filter((o) => sel.has((o as unknown as { data?: Meta }).data?.id ?? ""));
    if (ids.length === 1 && objs[0]) {
      if (canvas.getActiveObject() !== objs[0]) canvas.setActiveObject(objs[0]);
    } else {
      if (canvas.getActiveObject()) canvas.discardActiveObject();
      for (const o of objs) {
        const hl = new Rect({
          left: o.left, top: o.top,
          width: (o.width ?? 0) * (o.scaleX ?? 1), height: (o.height ?? 0) * (o.scaleY ?? 1),
          originX: "left", originY: "top",
          fill: "transparent", stroke: "#2f6fed", strokeWidth: 1.5, strokeDashArray: [5, 4],
          selectable: false, evented: false,
        });
        (hl as unknown as { __selHL: boolean }).__selHL = true;
        canvas.add(hl);
      }
    }
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

    // transient snap guides (orange seam + rail centerline)
    const clearGuides = () => {
      canvas.getObjects().filter((o) => (o as unknown as { __guide?: boolean }).__guide).forEach((o) => canvas.remove(o));
    };
    const drawGuides = (seamX: number | null, railY: number | null) => {
      const W = ref.current.model.plate.width_mm;
      const H = ref.current.model.plate.height_mm;
      const mk = (props: object) => { const r = new Rect({ fill: "#e08600", selectable: false, evented: false, originX: "left", originY: "top", ...props }); (r as unknown as { __guide: boolean }).__guide = true; return r; };
      if (seamX !== null) canvas.add(mk({ left: seamX - 0.3, top: 0, width: 0.6, height: H }));  // seam (vertical)
      if (railY !== null) canvas.add(mk({ left: 0, top: railY - 0.3, width: W, height: 0.6 }));   // rail centerline (horizontal)
    };

    // move snapping (object space = mm): rail-snap to a neighbour, else grid
    canvas.on("object:moving", (e) => {
      const t = e.target;
      if (!t) return;
      clearGuides();
      const meta = (t as unknown as { data?: Meta }).data;
      if (ref.current.alignEnabled && meta?.kind === "duct") {
        const s = snapDuct(ref.current.model, meta.id, t.left ?? 0, t.top ?? 0);
        if (s) {
          t.set({ left: s.x, top: s.y });
          drawGuides(s.vGuide, s.hGuide);
          return;
        }
      }
      if (ref.current.alignEnabled && meta?.kind === "element") {
        const s = computeSnap(ref.current.model, ref.current.library, meta.id, t.left ?? 0, t.top ?? 0, detectRows(ref.current.model));
        if (s) {
          t.set({ left: s.x, top: s.y });
          drawGuides(s.seamX, s.railY);
          return;
        }
      }
      const step = ref.current.snapStep;
      if (step > 0) t.set({ left: snap(t.left ?? 0, step), top: snap(t.top ?? 0, step) });
    });
    canvas.on("object:modified", (e) => {
      const t = e.target;
      const meta = (t as unknown as { data?: Meta })?.data;
      if (!meta || !t) return;
      const scaled = Math.abs((t.scaleX ?? 1) - 1) > 1e-4 || Math.abs((t.scaleY ?? 1) - 1) > 1e-4;
      if (meta.kind === "duct" && scaled) {
        const boxW = (t.width ?? 0) * (t.scaleX ?? 1);
        const boxH = (t.height ?? 0) * (t.scaleY ?? 1);
        ref.current.onResizeDuct(meta.id, +(t.left ?? 0).toFixed(2), +(t.top ?? 0).toFixed(2), boxW, boxH);
      } else {
        ref.current.onMove(meta.kind, meta.id, +(t.left ?? 0).toFixed(2), +(t.top ?? 0).toFixed(2));
      }
    });
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
      const rd = (opt.target as unknown as { rowdim?: RowDimMeta })?.rowdim;
      if (rd) {
        const ev = opt.e as MouseEvent;
        ref.current.onEditRow(rd.index, ev.clientX, ev.clientY, rd.value);
        return; // don't pan or change selection
      }
      const meta = (opt.target as unknown as { data?: Meta })?.data;
      if (meta) {
        // selection is driven here (not Fabric's group selection): Shift = additive
        ref.current.onSelectEntity(meta, !!(opt.e as MouseEvent).shiftKey);
      }
      if (!opt.target) {
        ref.current.onClearSelection();
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
    canvas.on("mouse:up", () => { panning = false; clearGuides(); canvas.requestRenderAll(); });

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
    const gen = ++genRef.current;
    canvas.remove(...canvas.getObjects());

    const W = model.plate.width_mm;
    const H = model.plate.height_mm;
    canvas.add(new Rect({
      left: 0, top: 0, width: W, height: H, fill: "#fafafa", stroke: "#000", strokeWidth: 0.8,
      selectable: false, evented: false, originX: "left", originY: "top",
    }));

    const tag = (meta: Meta, o: Rect) => { (o as unknown as { data: Meta }).data = meta; return o; };
    // alert styles: red = overlapping something; orange = too close to a duct
    const styleFor = (id: string) =>
      overlapIds.has(id) ? { stroke: "#e00000", strokeWidth: 1.2, fill: "#fde2e2" }
        : tightIds.has(id) ? { stroke: "#e08600", strokeWidth: 1.0, fill: "#fff3e0" }
          : {};

    for (const d of model.ducts) {
      const horizontal = d.rot_deg % 180 === 0;
      const w = horizontal ? d.length_mm : d.width_mm;
      const h = horizontal ? d.width_mm : d.length_mm;
      const ductRect = new Rect({
        left: d.x_mm, top: d.y_mm, width: w, height: h, originX: "left", originY: "top",
        fill: "#eef3ff", stroke: "#3559b3", strokeWidth: 0.4,
        hasControls: true, lockRotation: true, lockScalingFlip: true,
        borderColor: "#3559b3", cornerColor: "#3559b3", cornerSize: 9, transparentCorners: false,
        ...styleFor(d.id),
      });
      // edge handles only: drag the ends for length, the sides for thickness
      ductRect.setControlsVisibility({ mtr: false, tl: false, tr: false, bl: false, br: false, ml: true, mr: true, mt: true, mb: true });
      canvas.add(tag({ id: d.id, kind: "duct" }, ductRect));
      // label on the canvas too, matching the export: "WIRE DUCT 40X60 MM"
      canvas.add(new Textbox(`WIRE DUCT ${d.width_mm}X${d.label_h_mm} MM`, {
        left: d.x_mm + w / 2, top: d.y_mm + h / 2,
        originX: "center", originY: "center",
        width: horizontal ? w : h, fontSize: d.width_mm * 0.6,
        fontFamily: "Arial", textAlign: "center", angle: horizontal ? 0 : 90,
        selectable: false, evented: false,
      }));
    }

    for (const g of model.groups) {
      const item = library[g.lib_key];
      if (!item) continue;
      const f = rotatedFootprint(libItemSize(item), g.rot_deg);
      const total = g.count * f.w + (g.count - 1) * g.internal_gap_mm;
      canvas.add(tag({ id: g.id, kind: "group" }, new Rect({
        left: g.x_mm, top: g.y_mm, width: total, height: f.h,
        fill: "#ffffff", stroke: "#222", strokeWidth: 0.4, ...EQUIP_OPTS, ...styleFor(g.id),
      })));
    }

    for (const el of model.elements) {
      const item = library[el.lib_key];
      const f = item ? rotatedFootprint(libItemSize(item), el.rot_deg) : { w: 10, h: 10 };
      canvas.add(tag({ id: el.id, kind: "element" }, new Rect({
        left: el.x_mm, top: el.y_mm, width: f.w, height: f.h,
        fill: item ? "#ffffff" : "#fdecec", stroke: item ? "#222" : "#c00", strokeWidth: 0.4, ...EQUIP_OPTS, ...styleFor(el.id),
      })));
      // overlay the real uploaded geometry on top of the footprint rect (visual only)
      if (item && item.source === "dxf" && item.svg_ref && !overlapIds.has(el.id) && !tightIds.has(el.id)) {
        const cx = el.x_mm + f.w / 2;
        const cy = el.y_mm + f.h / 2;
        loadSVGFromString(item.svg_ref).then((res) => {
          if (gen !== genRef.current) return; // a newer rebuild happened; discard
          const objs = (res.objects ?? []).filter((o): o is FabricObject => !!o);
          if (objs.length === 0) return;
          const grp = util.groupSVGElements(objs);
          const bw = grp.width || item.width_mm;
          const bh = grp.height || item.height_mm;
          grp.set({
            originX: "center", originY: "center", left: cx, top: cy,
            angle: el.rot_deg, scaleX: item.width_mm / bw, scaleY: item.height_mm / bh,
            selectable: false, evented: false,
          });
          canvas.add(grp);
          canvas.requestRenderAll();
        }).catch(() => { /* fall back to the rect */ });
      }
      if (el.tag) {
        const tagH = 10;
        const gap = 2.5;
        const rotated = el.tag.length * tagH * 0.62 > f.w; // wider than part -> rotate
        canvas.add(new FabricText(el.tag, {
          fontSize: tagH, fontFamily: "Arial", fill: "#111",
          selectable: false, evented: false,
          originX: "left", originY: "bottom",
          left: rotated ? el.x_mm + tagH * 0.75 : el.x_mm,
          top: el.y_mm - gap,
          angle: rotated ? -90 : 0,
        }));
      }
    }

    // stopper labels — selectable + draggable (drop -> offset from anchor)
    for (const l of model.labels) {
      const host = anchorHost(model, l.anchor);
      if (!host) continue;
      const t = new FabricText(l.text, {
        left: host.x_mm + l.dx_mm, top: host.y_mm + l.dy_mm,
        fontSize: 10, fontFamily: "Arial", fill: "#1a7f37", angle: l.rot_deg,
        originX: "left", originY: "top",
        hasControls: false, lockScalingX: true, lockScalingY: true, lockRotation: true,
        borderColor: "#2f6fed",
      });
      canvas.add(tag({ id: l.id, kind: "label" }, t as unknown as Rect));
    }

    // row-height dimensions in the right margin (non-interactive)
    for (const d of rowDims(model)) {
      const lopt = { stroke: "#333", strokeWidth: 0.4, selectable: false, evented: false };
      canvas.add(new Line([d.plateRightX, d.topY, d.extEndX, d.topY], lopt));
      canvas.add(new Line([d.plateRightX, d.bottomY, d.extEndX, d.bottomY], lopt));
      canvas.add(new Line([d.dimX, d.topY, d.dimX, d.bottomY], lopt));
      // architectural tick marks at each end (short 45° strokes)
      canvas.add(new Line([d.dimX - 3, d.topY + 3, d.dimX + 3, d.topY - 3], lopt));
      canvas.add(new Line([d.dimX - 3, d.bottomY + 3, d.dimX + 3, d.bottomY - 3], lopt));
      canvas.add(new FabricText(String(d.value), {
        left: d.textX, top: d.midY, originX: "left", originY: "center",
        fontSize: 16, fontFamily: "Arial", fill: "#111", selectable: false, evented: false,
      }));
      // invisible click target over the whole dimension strip → inline edit
      const hit = new Rect({
        left: d.plateRightX, top: d.topY, width: d.textX + 50 - d.plateRightX, height: d.bottomY - d.topY,
        originX: "left", originY: "top", fill: "rgba(47,111,237,0.001)",
        selectable: false, evented: true, hoverCursor: "pointer",
      });
      (hit as unknown as { rowdim: RowDimMeta }).rowdim = { index: d.index, value: d.value };
      canvas.add(hit);
    }

    applySelection(canvas); // re-apply selection visuals onto the fresh objects
    canvas.requestRenderAll();
    // NOTE: selectedIds is intentionally NOT a dependency — selection changes must
    // not recreate objects (that interrupts an in-progress drag). See the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, library, overlapIds, tightIds]);

  // update selection visuals on selection change, without recreating objects
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    applySelection(canvas);
    canvas.requestRenderAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const libKey = e.dataTransfer.getData("text/lib-key");
    const canvas = canvasRef.current;
    if (!libKey || !canvas || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const vpt = canvas.viewportTransform;
    const mmX = (px - vpt[4]) / vpt[0];
    const mmY = (py - vpt[5]) / vpt[3];
    ref.current.onDropPart(libKey, +mmX.toFixed(2), +mmY.toFixed(2));
  }

  return (
    <div ref={wrapRef} className="canvas-wrap"
      onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
      <canvas ref={elRef} />
    </div>
  );
}
