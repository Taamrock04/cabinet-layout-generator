/**
 * Equipment upload confirm dialog (SKILL.md §3.1).
 *
 * After the ezdxf service measures an uploaded DXF, the engineer must CONFIRM the
 * measured size before the part joins the library (or Cancel to abort). Shows the
 * clean SVG the service rendered and warns if units weren't detected as mm.
 */
import { useState } from "react";
import type { UploadResult } from "../service/dxfClient";

interface Props {
  result: UploadResult;
  defaultName: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

export default function UploadModal({ result, defaultName, onConfirm, onCancel }: Props) {
  const [name, setName] = useState(defaultName);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Confirm uploaded part</h3>

        <div className="upload-preview" dangerouslySetInnerHTML={{ __html: result.svg }} />

        <p className="measured">
          Measured <strong>{result.width_mm} × {result.height_mm} mm</strong>
        </p>
        {!result.units_confirmed && (
          <p className="warn-units">
            ⚠ Units not detected as mm (got: {result.units}). Confirm only if the size looks right.
          </p>
        )}

        <label className="prow">
          <span className="plabel">Name</span>
          <input type="text" value={name} autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) onConfirm(name.trim()); }} />
        </label>

        <div className="modal-actions">
          <button type="button" className="danger" onClick={onCancel}>Cancel</button>
          <button type="button" disabled={!name.trim()} onClick={() => onConfirm(name.trim())}>
            Confirm &amp; add to library
          </button>
        </div>
      </div>
    </div>
  );
}
