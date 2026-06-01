import { useMemo, useState } from "react";
import { buildDemo } from "./demo";
import { SEED_LIBRARY } from "./model/library";
import { renderToSvg } from "./render/toSvg";
import { validate } from "./model/validate";
import { exportDxf, type DxfScale } from "./service/dxfClient";
import "./App.css";

type ExportState =
  | { kind: "idle" }
  | { kind: "exporting" }
  | { kind: "error"; message: string }
  | { kind: "done" };

export default function App() {
  const model = useMemo(() => buildDemo(), []);
  const svg = useMemo(() => renderToSvg(model, SEED_LIBRARY, { unitsPerMm: 0.45 }), [model]);
  const issues = useMemo(() => validate(model, SEED_LIBRARY), [model]);

  const [scale, setScale] = useState<DxfScale>("1:100");
  const [exp, setExp] = useState<ExportState>({ kind: "idle" });

  async function handleExport() {
    setExp({ kind: "exporting" });
    try {
      await exportDxf(model, SEED_LIBRARY, scale);
      setExp({ kind: "done" });
    } catch (e) {
      setExp({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <strong>Cabinet Layout Generator</strong>
        <span className="muted">
          {model.project.name} · plate {model.plate.width_mm}×{model.plate.height_mm} mm
        </span>

        <div className="toolbar">
          <label className="field">
            DXF scale
            <select value={scale} onChange={(e) => setScale(e.target.value as DxfScale)}>
              <option value="1:1">1:1</option>
              <option value="1:100">1:100</option>
            </select>
          </label>
          <button type="button" onClick={handleExport} disabled={exp.kind === "exporting"}>
            {exp.kind === "exporting" ? "Exporting… (waking service)" : "Export DXF"}
          </button>
          {exp.kind === "done" && <span className="status ok">✓ downloaded</span>}
          {exp.kind === "error" && <span className="status err" title={exp.message}>✗ {exp.message}</span>}
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
          DXF exports via the ezdxf service. PDF/PNG/SVG (in-browser) and drag/drop editing come next.
        </p>
      </aside>
    </div>
  );
}
