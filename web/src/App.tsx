import { useEffect, useMemo, useRef, useState } from "react";
import { buildDemo } from "./demo";
import { SEED_LIBRARY, BANDS } from "./model/library";
import type { Library, DxfLibItem } from "./model/types";
import { validate } from "./model/validate";
import { findOverlaps, tightClearances } from "./model/overlap";
import { detectRows, setRowHeight } from "./model/rows";
import {
  addElement, moveEntity, setRotation, deleteEntity,
  updateElement, updateDuct, updateGroup, addSet, addDuct, explodeGroup, addLabel, updateLabel, ductDimsFromBox,
  type EntityKind,
} from "./model/edit";
import { useHistory } from "./editor/useHistory";
import FabricStage, { type Selection, clampZoom } from "./editor/FabricStage";
import UploadModal from "./editor/UploadModal";
import { exportDxf, uploadDxf, ping, type DxfScale, type UploadResult } from "./service/dxfClient";
import { downloadSvg, downloadPng, downloadPdf } from "./export/inBrowser";
import type { Paper } from "./render/page";
import "./App.css";

type Status =
  | { kind: "idle" }
  | { kind: "busy"; label: string }
  | { kind: "done"; label: string }
  | { kind: "error"; message: string };

type Upload =
  | { status: "idle" }
  | { status: "uploading" }
  | { status: "confirm"; result: UploadResult; name: string }
  | { status: "error"; message: string };

export default function App() {
  const { model, set, undo, redo, canUndo, canRedo } = useHistory(buildDemo());
  const [library, setLibrary] = useState<Library>(() => ({ ...SEED_LIBRARY }));
  const [selections, setSelections] = useState<Selection[]>([]);
  const [snapStep, setSnapStep] = useState(0); // 0 = off, 1 = 1mm grid
  const [alignEnabled, setAlignEnabled] = useState(true); // rail-snap on drag
  const [zoom, setZoom] = useState(0.45); // px per mm (fit-to-view overrides on load)
  const [fitNonce, setFitNonce] = useState(0);
  const [dxfScale, setDxfScale] = useState<DxfScale>("1:100");
  const [paper, setPaper] = useState<Paper>("A3");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [upload, setUpload] = useState<Upload>({ status: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const [rowEdit, setRowEdit] = useState<{ index: number; x: number; y: number; value: number } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function commitRowEdit(v: number) {
    if (rowEdit && v > 0) set(setRowHeight(model, rowEdit.index, v));
    setRowEdit(null);
  }

  function acceptDroppedFile(files: FileList) {
    const f = [...files].find((file) => file.name.toLowerCase().endsWith(".dxf"));
    if (f) handleFile(f);
    else setUpload({ status: "error", message: "Please drop a single .dxf file." });
  }

  // live ezdxf-service availability (DXF upload/export need it; PDF/PNG/SVG don't)
  const [svc, setSvc] = useState<"checking" | "online" | "offline">("checking");
  const checkSvc = async () => {
    setSvc((s) => (s === "online" ? s : "checking"));
    setSvc((await ping()) ? "online" : "offline");
  };
  useEffect(() => {
    let alive = true;
    const run = async () => { const ok = await ping(); if (alive) setSvc(ok ? "online" : "offline"); };
    run();
    const t = setInterval(run, 20000); // re-check every 20s
    return () => { alive = false; clearInterval(t); };
  }, []);

  const issues = useMemo(() => validate(model, library), [model, library]);
  const overlapIds = useMemo(() => findOverlaps(model, library).ids, [model, library]);
  const tightIds = useMemo(() => tightClearances(model, library), [model, library]);
  const rows = useMemo(() => detectRows(model), [model]);

  // exactly-one selection drives the per-entity editor; >1 shows a multi panel
  const single = selections.length === 1 ? selections[0] : null;
  const multi = selections.length > 1;
  const selectedIds = useMemo(() => selections.map((s) => s.id), [selections]);
  const selEl = single?.kind === "element" ? model.elements.find((e) => e.id === single.id) ?? null : null;
  const selDuct = single?.kind === "duct" ? model.ducts.find((d) => d.id === single.id) ?? null : null;
  const selGroup = single?.kind === "group" ? model.groups.find((g) => g.id === single.id) ?? null : null;
  const selLabel = single?.kind === "label" ? model.labels.find((l) => l.id === single.id) ?? null : null;

  /** Click on an entity: additive (Shift) toggles it; otherwise selects just it. */
  function selectEntity(meta: Selection, additive: boolean) {
    setSelections((cur) => {
      if (!additive) return [meta];
      return cur.some((s) => s.id === meta.id) ? cur.filter((s) => s.id !== meta.id) : [...cur, meta];
    });
  }

  // Add-Set form state
  const [setLibKey, setSetLibKey] = useState("term_degson_2c_2_5");
  const [setCount, setSetCount] = useState(12);
  const [setTagStart, setSetTagStart] = useState("B101");

  function addPartLabel(kind: "element" | "group", refId: string) {
    const { model: m2, id } = addLabel(model, kind, refId);
    set(m2);
    setSelections([{ id, kind: "label" }]);
  }
  function doAddSet() {
    const { model: m2, id } = addSet(model, setLibKey, setCount, { tag_start: setTagStart || null });
    set(m2);
    setSelections([{ id, kind: "group" }]);
  }
  function doAddDuct(orientation: "horizontal" | "vertical") {
    const { model: m2, id } = addDuct(model, orientation);
    set(m2);
    setSelections([{ id, kind: "duct" }]);
  }
  function dropPart(libKey: string, x: number, y: number) {
    const { model: m2, id } = addElement(model, libKey, library, x, y);
    set(m2);
    setSelections([{ id, kind: "element" }]);
  }
  function resizeDuct(id: string, x: number, y: number, boxW: number, boxH: number) {
    const d = model.ducts.find((dd) => dd.id === id);
    if (!d) return;
    const dims = ductDimsFromBox(d.rot_deg, boxW, boxH);
    set(updateDuct(model, id, { x_mm: +x.toFixed(2), y_mm: +y.toFixed(2), ...dims }));
  }

  /** Delete every selected object in one action. */
  function deleteSelected() {
    if (selections.length === 0) return;
    let m = model;
    for (const s of selections) m = deleteEntity(m, s.kind, s.id);
    set(m);
    setSelections([]);
  }
  function rotateSelected() {
    if (!single || (single.kind !== "element" && single.kind !== "group")) return;
    const cur = selEl?.rot_deg ?? selGroup?.rot_deg ?? 0;
    set(setRotation(model, single.kind, single.id, cur + 90));
  }
  /** Move every selected object by (dx,dy) mm — arrow-key nudge. */
  function nudge(dx: number, dy: number) {
    if (selections.length === 0) return;
    let m = model;
    const r = (n: number) => +n.toFixed(2);
    for (const s of selections) {
      if (s.kind === "element") { const e = m.elements.find((x) => x.id === s.id); if (e) m = updateElement(m, s.id, { x_mm: r(e.x_mm + dx), y_mm: r(e.y_mm + dy) }); }
      else if (s.kind === "duct") { const d = m.ducts.find((x) => x.id === s.id); if (d) m = updateDuct(m, s.id, { x_mm: r(d.x_mm + dx), y_mm: r(d.y_mm + dy) }); }
      else if (s.kind === "group") { const g = m.groups.find((x) => x.id === s.id); if (g) m = updateGroup(m, s.id, { x_mm: r(g.x_mm + dx), y_mm: r(g.y_mm + dy) }); }
      else if (s.kind === "label") { const l = m.labels.find((x) => x.id === s.id); if (l) m = updateLabel(m, s.id, { dx_mm: r(l.dx_mm + dx), dy_mm: r(l.dy_mm + dy) }); }
    }
    set(m);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA") return;
      const arrows: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
      };
      if ((e.key === "Delete" || e.key === "Backspace") && selections.length) { e.preventDefault(); deleteSelected(); }
      else if (arrows[e.key] && selections.length) {
        e.preventDefault();
        const stepMm = e.shiftKey ? 10 : 1; // Shift = coarse (10mm), otherwise 1mm
        nudge(arrows[e.key][0] * stepMm, arrows[e.key][1] * stepMm);
      }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function run(label: string, fn: () => void | Promise<void>) {
    setStatus({ kind: "busy", label });
    try { await fn(); setStatus({ kind: "done", label }); }
    catch (e) { setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) }); }
  }
  const busy = status.kind === "busy";

  function addPart(libKey: string) {
    const { model: m2, id } = addElement(model, libKey, library);
    set(m2);
    setSelections([{ id, kind: "element" }]);
  }

  async function handleFile(file: File) {
    setUpload({ status: "uploading" });
    try {
      const result = await uploadDxf(file);
      setUpload({ status: "confirm", result, name: file.name.replace(/\.dxf$/i, "") });
    } catch (e) {
      setUpload({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }
  function confirmUpload(name: string) {
    if (upload.status !== "confirm") return;
    const key = `up_${Date.now().toString(36)}`;
    const item: DxfLibItem = {
      lib_key: key, name, source: "dxf",
      width_mm: upload.result.width_mm, height_mm: upload.result.height_mm,
      block_ref: upload.result.block_ref, svg_ref: upload.result.svg,
    };
    setLibrary((l) => ({ ...l, [key]: item }));
    setUpload({ status: "idle" });
  }

  const uploadedItems = Object.values(library).filter((it) => it.source === "dxf");

  return (
    <div className="app">
      <header className="topbar">
        <strong>Cabinet Layout Generator</strong>
        <span className="muted">{model.project.name} · {model.plate.width_mm}×{model.plate.height_mm} mm</span>

        <div className="toolbar">
          <span className="group">
            <button type="button" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">↶</button>
            <button type="button" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">↷</button>
            <label className="field">
              <input type="checkbox" checked={snapStep > 0} onChange={(e) => setSnapStep(e.target.checked ? 1 : 0)} />
              Snap 1mm
            </label>
            <label className="field" title="Snap a dragged part adjacent to its neighbour with the 0.1mm gap, aligned to the rail centerline">
              <input type="checkbox" checked={alignEnabled} onChange={(e) => setAlignEnabled(e.target.checked)} />
              Align
            </label>
          </span>
          <span className="group">
            <button type="button" className="icon" title="Zoom out" onClick={() => setZoom((z) => clampZoom(z / 1.25))}>−</button>
            <span className="zoompct" title="Current zoom">{Math.round(zoom * 100)}%</span>
            <button type="button" className="icon" title="Zoom in" onClick={() => setZoom((z) => clampZoom(z * 1.25))}>+</button>
            <button type="button" className="ghost" title="Fit to view" onClick={() => setFitNonce((n) => n + 1)}>Fit</button>
          </span>
          <span className="group">
            <button type="button" className={`svc svc-${svc}`} onClick={checkSvc}
              title={
                svc === "online" ? "ezdxf service online — DXF upload/export available (click to re-check)"
                  : svc === "offline" ? "ezdxf service offline — DXF disabled; PDF/PNG/SVG still work (click to retry)"
                    : "checking ezdxf service…"
              }>
              <span className="dot" /> DXF service: {svc}
            </button>
            <label className="field">DXF
              <select value={dxfScale} onChange={(e) => setDxfScale(e.target.value as DxfScale)}>
                <option value="1:1">1:1</option><option value="1:100">1:100</option>
              </select>
            </label>
            <button type="button" disabled={busy} onClick={() => run("DXF (waking service)", () => exportDxf(model, library, dxfScale))}>Export DXF</button>
          </span>
          <span className="group">
            <label className="field">Paper
              <select value={paper} onChange={(e) => setPaper(e.target.value as Paper)}>
                <option value="A4">A4</option><option value="A3">A3</option>
              </select>
            </label>
            <button type="button" className="ghost" disabled={busy} onClick={() => run("PDF", () => downloadPdf(model, library, paper))}>PDF</button>
            <button type="button" className="ghost" disabled={busy} onClick={() => run("PNG", () => downloadPng(model, library, paper))}>PNG</button>
            <button type="button" className="ghost" disabled={busy} onClick={() => run("SVG", () => downloadSvg(model, library))}>SVG</button>
          </span>
          {status.kind === "busy" && <span className="status">… {status.label}</span>}
          {status.kind === "done" && <span className="status ok">✓ {status.label}</span>}
          {status.kind === "error" && <span className="status err" title={status.message}>✗ {status.message}</span>}
        </div>
      </header>

      <aside className="library">
        <h3>Library</h3>

        <input ref={fileRef} type="file" accept=".dxf" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
        <button type="button" className={`upload-btn${dragOver ? " dragover" : ""}`} disabled={upload.status === "uploading"}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); acceptDroppedFile(e.dataTransfer.files); }}>
          {upload.status === "uploading" ? "Uploading… (waking service)"
            : dragOver ? "⬇ Drop .dxf here"
              : "⬆ Upload equipment DXF (or drop a .dxf here)"}
        </button>
        {upload.status === "error" && (
          <p className="upload-err">Upload failed: {upload.message} <button type="button" onClick={() => setUpload({ status: "idle" })}>dismiss</button></p>
        )}
        {svc === "offline" && upload.status !== "error" && (
          <p className="upload-hint">⚠ DXF service offline — start it (port 8000) to upload/export. PDF/PNG/SVG work without it.</p>
        )}

        {uploadedItems.length > 0 && (
          <div className="band">
            <div className="band-name">Uploaded parts</div>
            {uploadedItems.map((it) => (
              <button key={it.lib_key} type="button" className="lib-item" title={`${it.width_mm}×${it.height_mm} mm`}
                draggable onDragStart={(e) => e.dataTransfer.setData("text/lib-key", it.lib_key)}
                onClick={() => addPart(it.lib_key)}>
                {it.name}
              </button>
            ))}
          </div>
        )}

        {BANDS.map((band) => {
          const items = Object.values(library).filter((it) => it.band === band.band);
          if (items.length === 0) return null;
          return (
            <div key={band.band} className="band">
              <div className="band-name">{band.band}. {band.name}</div>
              {items.map((it) => (
                <button key={it.lib_key} type="button" className="lib-item" title={`${it.width_mm}×${it.height_mm} mm`}
                  onClick={() => addPart(it.lib_key)}>
                  {it.name}{it.confirm ? " *" : ""}
                </button>
              ))}
            </div>
          );
        })}
        <div className="addset">
          <div className="band-name">Objects</div>
          <button type="button" className="lib-item" onClick={() => doAddDuct("horizontal")}>+ Wire duct (row)</button>
          <button type="button" className="lib-item" onClick={() => doAddDuct("vertical")}>+ Wire duct (vertical)</button>
        </div>

        <div className="addset">
          <div className="band-name">Add a set</div>
          <select value={setLibKey} onChange={(e) => setSetLibKey(e.target.value)}>
            {Object.values(library).map((it) => <option key={it.lib_key} value={it.lib_key}>{it.name}</option>)}
          </select>
          <div className="addset-row">
            <label>× <input type="number" min={1} value={setCount} onChange={(e) => setSetCount(Math.max(1, parseInt(e.target.value) || 1))} /></label>
            <label>tag <input type="text" value={setTagStart} onChange={(e) => setSetTagStart(e.target.value)} placeholder="B101" /></label>
          </div>
          <button type="button" className="lib-item" onClick={doAddSet}>Add set ×{setCount}</button>
        </div>

        <p className="muted small">* size is an unconfirmed estimate (replace via datasheet/DXF upload).</p>
      </aside>

      <main className="stage">
        <div className="sheet">
          <FabricStage
            model={model} library={library} zoom={zoom} snapStep={snapStep} alignEnabled={alignEnabled}
            fitNonce={fitNonce} overlapIds={overlapIds} tightIds={tightIds}
            selectedIds={selectedIds}
            onSelectEntity={selectEntity}
            onClearSelection={() => setSelections([])}
            onMove={(kind: EntityKind, id, x, y) => set(moveEntity(model, kind, id, x, y))}
            onZoomChange={setZoom}
            onResizeDuct={resizeDuct}
            onDropPart={dropPart}
            onEditRow={(index, x, y, value) => setRowEdit({ index, x, y, value })}
          />
        </div>
      </main>

      <aside className="panel">
        {multi ? (
          <>
            <h3>{selections.length} objects selected</h3>
            <p className="muted small">Shift-click to add/remove. Use arrow keys to nudge (Shift = 10mm), or delete them all.</p>
            <button type="button" className="danger" onClick={deleteSelected}>Delete {selections.length} objects</button>
          </>
        ) : selEl ? (
          <>
            <h3>Element</h3>
            <Row label="Library"><span className="ro">{library[selEl.lib_key]?.name ?? selEl.lib_key}</span></Row>
            <Field label="Tag" value={selEl.tag} onChange={(v) => set(updateElement(model, selEl.id, { tag: v }))} />
            <Num label="X (mm)" value={selEl.x_mm} onChange={(v) => set(updateElement(model, selEl.id, { x_mm: v }))} />
            <Num label="Y (mm)" value={selEl.y_mm} onChange={(v) => set(updateElement(model, selEl.id, { y_mm: v }))} />
            <Num label="Gap before (mm)" value={selEl.gap_before_mm} step={0.1} onChange={(v) => set(updateElement(model, selEl.id, { gap_before_mm: v }))} />
            <Num label="Duct clearance (mm)" value={selEl.clearance_to_duct_mm} step={0.5} onChange={(v) => set(updateElement(model, selEl.id, { clearance_to_duct_mm: v }))} />
            <Num label="Rail offset (mm)" step={0.5}
              value={library[selEl.lib_key]?.rail_offset_mm ?? ((library[selEl.lib_key]?.height_mm ?? 0) / 2)}
              onChange={(v) => setLibrary((l) => ({ ...l, [selEl.lib_key]: { ...l[selEl.lib_key], rail_offset_mm: v } }))} />
            <Row label="Rotation"><span className="ro">{selEl.rot_deg}°</span> <button type="button" onClick={rotateSelected}>+90°</button></Row>
            <div className="panel-actions">
              <button type="button" onClick={() => addPartLabel("element", selEl.id)}>+ Label</button>
              <button type="button" className="danger" onClick={deleteSelected}>Delete</button>
            </div>
          </>
        ) : selDuct ? (
          <>
            <h3>Wire duct</h3>
            <Num label="X (mm)" value={selDuct.x_mm} onChange={(v) => set(updateDuct(model, selDuct.id, { x_mm: v }))} />
            <Num label="Y (mm)" value={selDuct.y_mm} onChange={(v) => set(updateDuct(model, selDuct.id, { y_mm: v }))} />
            <Num label="Length (mm)" value={selDuct.length_mm} onChange={(v) => set(updateDuct(model, selDuct.id, { length_mm: v }))} />
            <Num label="Width (mm)" value={selDuct.width_mm} onChange={(v) => set(updateDuct(model, selDuct.id, { width_mm: v }))} />
            <Num label="Label H (mm)" value={selDuct.label_h_mm} onChange={(v) => set(updateDuct(model, selDuct.id, { label_h_mm: v }))} />
            <button type="button" className="danger" onClick={deleteSelected}>Delete</button>
          </>
        ) : selGroup ? (
          <>
            <h3>Set ×{selGroup.count}</h3>
            <Row label="Library"><span className="ro">{library[selGroup.lib_key]?.name ?? selGroup.lib_key}</span></Row>
            <Num label="X (mm)" value={selGroup.x_mm} onChange={(v) => set({ ...model, groups: model.groups.map((g) => g.id === selGroup.id ? { ...g, x_mm: v } : g) })} />
            <Num label="Y (mm)" value={selGroup.y_mm} onChange={(v) => set({ ...model, groups: model.groups.map((g) => g.id === selGroup.id ? { ...g, y_mm: v } : g) })} />
            <Num label="Count" value={selGroup.count} onChange={(v) => set({ ...model, groups: model.groups.map((g) => g.id === selGroup.id ? { ...g, count: Math.max(1, Math.floor(v)) } : g) })} />
            <Num label="Internal gap (mm)" value={selGroup.internal_gap_mm} step={0.1} onChange={(v) => set({ ...model, groups: model.groups.map((g) => g.id === selGroup.id ? { ...g, internal_gap_mm: v } : g) })} />
            <Row label="Rotation"><span className="ro">{selGroup.rot_deg}°</span> <button type="button" onClick={rotateSelected}>+90°</button></Row>
            <div className="panel-actions">
              <button type="button" onClick={() => addPartLabel("group", selGroup.id)}>+ Label</button>
              <button type="button" onClick={() => { set(explodeGroup(model, selGroup.id, library)); setSelections([]); }}>Explode</button>
              <button type="button" className="danger" onClick={deleteSelected}>Delete</button>
            </div>
          </>
        ) : selLabel ? (
          <>
            <h3>Label</h3>
            <Field label="Text" value={selLabel.text} onChange={(v) => set(updateLabel(model, selLabel.id, { text: v }))} />
            <Row label="Anchored to"><span className="ro">{selLabel.anchor}</span></Row>
            <p className="muted small">Drag the label on the plate to reposition it relative to its part.</p>
            <button type="button" className="danger" onClick={deleteSelected}>Delete</button>
          </>
        ) : (
          <>
            <h3>Plate</h3>
            <Num label="Width (mm)" value={model.plate.width_mm} onChange={(v) => v > 0 && set({ ...model, plate: { ...model.plate, width_mm: v } })} />
            <Num label="Height (mm)" value={model.plate.height_mm} onChange={(v) => v > 0 && set({ ...model, plate: { ...model.plate, height_mm: v } })} />
            <p className="muted small">Adjust the mounting-plate size, then press <strong>Fit</strong> to recenter the view. Select an item to edit it, or click/drag a library part to add one.</p>

            {rows.length > 0 && (
              <>
                <h3 className="mt">Rows ({rows.length})</h3>
                <p className="muted small">Height of each device band (between horizontal ducts). Changing one moves the duct below it and shifts everything below.</p>
                {rows.map((r, i) => (
                  <Num key={i} label={`Row ${i + 1} (mm)`} value={r.height} step={5}
                    onChange={(v) => v > 0 && set(setRowHeight(model, i, v))} />
                ))}
              </>
            )}
          </>
        )}

        <h3 className="mt">Validation</h3>
        {issues.length === 0 ? <p className="ok">No issues — model is clean.</p> : (
          <ul className="issues">
            {issues.map((i, n) => <li key={n} className={i.level}><code>{i.code}</code> {i.message}</li>)}
          </ul>
        )}
      </aside>

      {upload.status === "confirm" && (
        <UploadModal result={upload.result} defaultName={upload.name}
          onConfirm={confirmUpload} onCancel={() => setUpload({ status: "idle" })} />
      )}

      {rowEdit && (
        <input className="rowedit" type="number" autoFocus defaultValue={rowEdit.value}
          style={{ left: rowEdit.x, top: rowEdit.y }}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRowEdit(parseFloat((e.target as HTMLInputElement).value));
            else if (e.key === "Escape") setRowEdit(null);
          }}
          onBlur={(e) => commitRowEdit(parseFloat(e.target.value))} />
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="prow"><span className="plabel">{label}</span><span className="pval">{children}</span></div>;
}
function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <Row label={label}><input type="text" value={value} onChange={(e) => onChange(e.target.value)} /></Row>;
}
function Num({ label, value, step = 1, onChange }: { label: string; value: number; step?: number; onChange: (v: number) => void }) {
  return <Row label={label}><input type="number" step={step} value={value} onChange={(e) => { const n = parseFloat(e.target.value); if (!Number.isNaN(n)) onChange(n); }} /></Row>;
}
