import { useEffect, useMemo, useRef, useState } from "react";
import { buildDemo } from "./demo";
import { SEED_LIBRARY, BANDS } from "./model/library";
import type { Library, DxfLibItem } from "./model/types";
import { validate } from "./model/validate";
import { findOverlaps, tightClearances } from "./model/overlap";
import {
  addElement, moveEntity, setRotation, deleteEntity,
  updateElement, updateDuct, addSet, explodeGroup, addLabel, updateLabel, ductDimsFromBox,
  type EntityKind,
} from "./model/edit";
import { useHistory } from "./editor/useHistory";
import FabricStage, { type Selection, clampZoom } from "./editor/FabricStage";
import UploadModal from "./editor/UploadModal";
import { exportDxf, uploadDxf, type DxfScale, type UploadResult } from "./service/dxfClient";
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
  const [selection, setSelection] = useState<Selection | null>(null);
  const [snapStep, setSnapStep] = useState(0); // 0 = off, 1 = 1mm grid
  const [zoom, setZoom] = useState(0.45); // px per mm (fit-to-view overrides on load)
  const [fitNonce, setFitNonce] = useState(0);
  const [dxfScale, setDxfScale] = useState<DxfScale>("1:100");
  const [paper, setPaper] = useState<Paper>("A3");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [upload, setUpload] = useState<Upload>({ status: "idle" });
  const fileRef = useRef<HTMLInputElement | null>(null);

  const issues = useMemo(() => validate(model, library), [model, library]);
  const overlapIds = useMemo(() => findOverlaps(model, library).ids, [model, library]);
  const tightIds = useMemo(() => tightClearances(model, library), [model, library]);

  const selEl = selection?.kind === "element" ? model.elements.find((e) => e.id === selection.id) ?? null : null;
  const selDuct = selection?.kind === "duct" ? model.ducts.find((d) => d.id === selection.id) ?? null : null;
  const selGroup = selection?.kind === "group" ? model.groups.find((g) => g.id === selection.id) ?? null : null;
  const selLabel = selection?.kind === "label" ? model.labels.find((l) => l.id === selection.id) ?? null : null;

  // Add-Set form state
  const [setLibKey, setSetLibKey] = useState("term_degson_2c_2_5");
  const [setCount, setSetCount] = useState(12);
  const [setTagStart, setSetTagStart] = useState("B101");

  function addPartLabel(kind: "element" | "group", refId: string) {
    const { model: m2, id } = addLabel(model, kind, refId);
    set(m2);
    setSelection({ id, kind: "label" });
  }
  function doAddSet() {
    const { model: m2, id } = addSet(model, setLibKey, setCount, { tag_start: setTagStart || null });
    set(m2);
    setSelection({ id, kind: "group" });
  }
  function dropPart(libKey: string, x: number, y: number) {
    const { model: m2, id } = addElement(model, libKey, library, x, y);
    set(m2);
    setSelection({ id, kind: "element" });
  }
  function resizeDuct(id: string, x: number, y: number, boxW: number, boxH: number) {
    const d = model.ducts.find((dd) => dd.id === id);
    if (!d) return;
    const dims = ductDimsFromBox(d.rot_deg, boxW, boxH);
    set(updateDuct(model, id, { x_mm: +x.toFixed(2), y_mm: +y.toFixed(2), ...dims }));
  }

  function deleteSelected() {
    if (!selection) return;
    set(deleteEntity(model, selection.kind, selection.id));
    setSelection(null);
  }
  function rotateSelected() {
    if (!selection || (selection.kind !== "element" && selection.kind !== "group")) return;
    const cur = selEl?.rot_deg ?? selGroup?.rot_deg ?? 0;
    set(setRotation(model, selection.kind, selection.id, cur + 90));
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA") return;
      if ((e.key === "Delete" || e.key === "Backspace") && selection) { e.preventDefault(); deleteSelected(); }
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
    setSelection({ id, kind: "element" });
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
          </span>
          <span className="group">
            <button type="button" className="icon" title="Zoom out" onClick={() => setZoom((z) => clampZoom(z / 1.25))}>−</button>
            <span className="zoompct" title="Current zoom">{Math.round(zoom * 100)}%</span>
            <button type="button" className="icon" title="Zoom in" onClick={() => setZoom((z) => clampZoom(z * 1.25))}>+</button>
            <button type="button" className="ghost" title="Fit to view" onClick={() => setFitNonce((n) => n + 1)}>Fit</button>
          </span>
          <span className="group">
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
        <button type="button" className="upload-btn" disabled={upload.status === "uploading"}
          onClick={() => fileRef.current?.click()}>
          {upload.status === "uploading" ? "Uploading… (waking service)" : "⬆ Upload equipment DXF"}
        </button>
        {upload.status === "error" && (
          <p className="upload-err">Upload failed: {upload.message} <button type="button" onClick={() => setUpload({ status: "idle" })}>dismiss</button></p>
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
            model={model} library={library} zoom={zoom} snapStep={snapStep}
            fitNonce={fitNonce} overlapIds={overlapIds} tightIds={tightIds}
            selectedId={selection?.id ?? null}
            onSelect={setSelection}
            onMove={(kind: EntityKind, id, x, y) => set(moveEntity(model, kind, id, x, y))}
            onZoomChange={setZoom}
            onResizeDuct={resizeDuct}
            onDropPart={dropPart}
          />
        </div>
      </main>

      <aside className="panel">
        {selEl ? (
          <>
            <h3>Element</h3>
            <Row label="Library"><span className="ro">{library[selEl.lib_key]?.name ?? selEl.lib_key}</span></Row>
            <Field label="Tag" value={selEl.tag} onChange={(v) => set(updateElement(model, selEl.id, { tag: v }))} />
            <Num label="X (mm)" value={selEl.x_mm} onChange={(v) => set(updateElement(model, selEl.id, { x_mm: v }))} />
            <Num label="Y (mm)" value={selEl.y_mm} onChange={(v) => set(updateElement(model, selEl.id, { y_mm: v }))} />
            <Num label="Gap before (mm)" value={selEl.gap_before_mm} step={0.1} onChange={(v) => set(updateElement(model, selEl.id, { gap_before_mm: v }))} />
            <Num label="Duct clearance (mm)" value={selEl.clearance_to_duct_mm} step={0.5} onChange={(v) => set(updateElement(model, selEl.id, { clearance_to_duct_mm: v }))} />
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
              <button type="button" onClick={() => { set(explodeGroup(model, selGroup.id, library)); setSelection(null); }}>Explode</button>
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
