import { useEffect, useMemo, useState } from "react";
import { buildDemo } from "./demo";
import { SEED_LIBRARY } from "./model/library";
import { BANDS } from "./model/library";
import { validate } from "./model/validate";
import {
  addElement, moveEntity, setRotation, deleteEntity,
  updateElement, updateDuct, type EntityKind,
} from "./model/edit";
import { useHistory } from "./editor/useHistory";
import FabricStage, { type Selection, clampZoom } from "./editor/FabricStage";
import { exportDxf, type DxfScale } from "./service/dxfClient";
import { downloadSvg, downloadPng, downloadPdf } from "./export/inBrowser";
import type { Paper } from "./render/page";
import "./App.css";

type Status =
  | { kind: "idle" }
  | { kind: "busy"; label: string }
  | { kind: "done"; label: string }
  | { kind: "error"; message: string };

export default function App() {
  const { model, set, undo, redo, canUndo, canRedo } = useHistory(buildDemo());
  const [selection, setSelection] = useState<Selection | null>(null);
  const [snapStep, setSnapStep] = useState(0); // 0 = off, 1 = 1mm grid
  const [zoom, setZoom] = useState(0.45); // px per mm (fit-to-view overrides on load)
  const [fitNonce, setFitNonce] = useState(0);
  const [dxfScale, setDxfScale] = useState<DxfScale>("1:100");
  const [paper, setPaper] = useState<Paper>("A3");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const issues = useMemo(() => validate(model, SEED_LIBRARY), [model]);

  const selEl = selection?.kind === "element" ? model.elements.find((e) => e.id === selection.id) ?? null : null;
  const selDuct = selection?.kind === "duct" ? model.ducts.find((d) => d.id === selection.id) ?? null : null;
  const selGroup = selection?.kind === "group" ? model.groups.find((g) => g.id === selection.id) ?? null : null;

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

  // keyboard: Delete, Ctrl+Z / Ctrl+Shift+Z|Ctrl+Y
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
    const { model: m2, id } = addElement(model, libKey, SEED_LIBRARY);
    set(m2);
    setSelection({ id, kind: "element" });
  }

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
            <button type="button" disabled={busy} onClick={() => run("DXF (waking service)", () => exportDxf(model, SEED_LIBRARY, dxfScale))}>Export DXF</button>
          </span>
          <span className="group">
            <label className="field">Paper
              <select value={paper} onChange={(e) => setPaper(e.target.value as Paper)}>
                <option value="A4">A4</option><option value="A3">A3</option>
              </select>
            </label>
            <button type="button" className="ghost" disabled={busy} onClick={() => run("PDF", () => downloadPdf(model, SEED_LIBRARY, paper))}>PDF</button>
            <button type="button" className="ghost" disabled={busy} onClick={() => run("PNG", () => downloadPng(model, SEED_LIBRARY, paper))}>PNG</button>
            <button type="button" className="ghost" disabled={busy} onClick={() => run("SVG", () => downloadSvg(model, SEED_LIBRARY))}>SVG</button>
          </span>
          {status.kind === "busy" && <span className="status">… {status.label}</span>}
          {status.kind === "done" && <span className="status ok">✓ {status.label}</span>}
          {status.kind === "error" && <span className="status err" title={status.message}>✗ {status.message}</span>}
        </div>
      </header>

      <aside className="library">
        <h3>Library</h3>
        {BANDS.map((band) => {
          const items = Object.values(SEED_LIBRARY).filter((it) => it.band === band.band);
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
        <p className="muted small">* size is an unconfirmed estimate (replace via datasheet/DXF upload).</p>
      </aside>

      <main className="stage">
        <div className="sheet">
          <FabricStage
            model={model} library={SEED_LIBRARY} zoom={zoom} snapStep={snapStep}
            fitNonce={fitNonce}
            selectedId={selection?.id ?? null}
            onSelect={setSelection}
            onMove={(kind: EntityKind, id, x, y) => set(moveEntity(model, kind, id, x, y))}
            onZoomChange={setZoom}
          />
        </div>
      </main>

      <aside className="panel">
        {selEl ? (
          <>
            <h3>Element</h3>
            <Row label="Library"><span className="ro">{SEED_LIBRARY[selEl.lib_key]?.name ?? selEl.lib_key}</span></Row>
            <Field label="Tag" value={selEl.tag} onChange={(v) => set(updateElement(model, selEl.id, { tag: v }))} />
            <Num label="X (mm)" value={selEl.x_mm} onChange={(v) => set(updateElement(model, selEl.id, { x_mm: v }))} />
            <Num label="Y (mm)" value={selEl.y_mm} onChange={(v) => set(updateElement(model, selEl.id, { y_mm: v }))} />
            <Num label="Gap before (mm)" value={selEl.gap_before_mm} step={0.1} onChange={(v) => set(updateElement(model, selEl.id, { gap_before_mm: v }))} />
            <Num label="Duct clearance (mm)" value={selEl.clearance_to_duct_mm} step={0.5} onChange={(v) => set(updateElement(model, selEl.id, { clearance_to_duct_mm: v }))} />
            <Row label="Rotation"><span className="ro">{selEl.rot_deg}°</span> <button type="button" onClick={rotateSelected}>+90°</button></Row>
            <button type="button" className="danger" onClick={deleteSelected}>Delete</button>
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
            <Row label="Library"><span className="ro">{SEED_LIBRARY[selGroup.lib_key]?.name ?? selGroup.lib_key}</span></Row>
            <Num label="X (mm)" value={selGroup.x_mm} onChange={(v) => set({ ...model, groups: model.groups.map((g) => g.id === selGroup.id ? { ...g, x_mm: v } : g) })} />
            <Num label="Y (mm)" value={selGroup.y_mm} onChange={(v) => set({ ...model, groups: model.groups.map((g) => g.id === selGroup.id ? { ...g, y_mm: v } : g) })} />
            <Row label="Rotation"><span className="ro">{selGroup.rot_deg}°</span> <button type="button" onClick={rotateSelected}>+90°</button></Row>
            <button type="button" className="danger" onClick={deleteSelected}>Delete</button>
          </>
        ) : (
          <p className="muted small">Select an item on the plate to edit it, or click a library part to add one.</p>
        )}

        <h3 className="mt">Validation</h3>
        {issues.length === 0 ? <p className="ok">No issues — model is clean.</p> : (
          <ul className="issues">
            {issues.map((i, n) => <li key={n} className={i.level}><code>{i.code}</code> {i.message}</li>)}
          </ul>
        )}
      </aside>
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
