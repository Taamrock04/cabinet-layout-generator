import { useMemo, useState } from "react";
import { buildDemo } from "./demo";
import { SEED_LIBRARY } from "./model/library";
import { renderToSvg } from "./render/toSvg";
import { validate } from "./model/validate";
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
  const model = useMemo(() => buildDemo(), []);
  const svg = useMemo(() => renderToSvg(model, SEED_LIBRARY, { unitsPerMm: 0.45 }), [model]);
  const issues = useMemo(() => validate(model, SEED_LIBRARY), [model]);

  const [dxfScale, setDxfScale] = useState<DxfScale>("1:100");
  const [paper, setPaper] = useState<Paper>("A3");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function run(label: string, fn: () => void | Promise<void>) {
    setStatus({ kind: "busy", label });
    try {
      await fn();
      setStatus({ kind: "done", label });
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  const busy = status.kind === "busy";

  return (
    <div className="app">
      <header className="topbar">
        <strong>Cabinet Layout Generator</strong>
        <span className="muted">
          {model.project.name} · plate {model.plate.width_mm}×{model.plate.height_mm} mm
        </span>

        <div className="toolbar">
          <span className="group">
            <label className="field">
              DXF
              <select value={dxfScale} onChange={(e) => setDxfScale(e.target.value as DxfScale)}>
                <option value="1:1">1:1</option>
                <option value="1:100">1:100</option>
              </select>
            </label>
            <button type="button" disabled={busy}
              onClick={() => run("DXF (waking service)", () => exportDxf(model, SEED_LIBRARY, dxfScale))}>
              Export DXF
            </button>
          </span>

          <span className="group">
            <label className="field">
              Paper
              <select value={paper} onChange={(e) => setPaper(e.target.value as Paper)}>
                <option value="A4">A4</option>
                <option value="A3">A3</option>
              </select>
            </label>
            <button type="button" className="ghost" disabled={busy}
              onClick={() => run("PDF", () => downloadPdf(model, SEED_LIBRARY, paper))}>
              PDF
            </button>
            <button type="button" className="ghost" disabled={busy}
              onClick={() => run("PNG", () => downloadPng(model, SEED_LIBRARY, paper))}>
              PNG
            </button>
            <button type="button" className="ghost" disabled={busy}
              onClick={() => run("SVG", () => downloadSvg(model, SEED_LIBRARY))}>
              SVG
            </button>
          </span>

          {status.kind === "busy" && <span className="status">… {status.label}</span>}
          {status.kind === "done" && <span className="status ok">✓ {status.label}</span>}
          {status.kind === "error" && <span className="status err" title={status.message}>✗ {status.message}</span>}
        </div>
      </header>

      <main className="stage">
        {/* Renders straight from the JSON model — the same renderer exports use. */}
        <div className="sheet" dangerouslySetInnerHTML={{ __html: svg }} />
      </main>

      <aside className="panel">
        <h3>Validation</h3>
        {issues.length === 0 ? (
          <p className="ok">No issues — model is clean.</p>
        ) : (
          <ul className="issues">
            {issues.map((i, n) => (
              <li key={n} className={i.level}>
                <code>{i.code}</code> {i.message}
              </li>
            ))}
          </ul>
        )}
        <p className="muted small">
          DXF via the ezdxf service; PDF/PNG/SVG render in-browser. Drag/drop editing comes next.
        </p>
      </aside>
    </div>
  );
}
