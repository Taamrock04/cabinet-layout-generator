/**
 * Client for the ezdxf service (the ONLY thing that talks to it).
 *
 * The browser never parses/builds DXF itself (SKILL.md §2). Export POSTs the
 * JSON model + library to the service and downloads the assembled .dxf. The
 * service is on a free host that sleeps on idle, so the first call after idle is
 * slow — callers surface a "waking service…" state.
 */
import type { LayoutModel, Library } from "../model/types";

// Default to 127.0.0.1 (not "localhost") so the browser doesn't resolve to IPv6
// ::1 while uvicorn listens on IPv4 — a common local-dev "Failed to fetch".
const BASE: string =
  (import.meta.env.VITE_DXF_SERVICE_URL as string | undefined) ?? "http://127.0.0.1:8000";

/** 1:1 or 1:100 — the DXF scale chooser (brief §6). */
export type DxfScale = "1:1" | "1:100";
const SCALE_FACTOR: Record<DxfScale, number> = { "1:1": 1.0, "1:100": 0.01 };

export interface UploadResult {
  ok: boolean;
  block_ref: string;
  width_mm: number;
  height_mm: number;
  units: string;
  units_confirmed: boolean;
  svg: string;
  confirm_message: string;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Assemble + download a .dxf for the given model. Throws on failure. */
export async function exportDxf(
  model: LayoutModel,
  library: Library,
  scale: DxfScale,
): Promise<void> {
  // The service only needs size + source + block_ref; drop the (large) inline SVG.
  const leanLibrary = Object.fromEntries(
    Object.entries(library).map(([k, v]) => {
      const { svg_ref: _omit, ...rest } = v as { svg_ref?: string };
      return [k, rest];
    }),
  );
  const res = await fetch(`${BASE}/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, library: leanLibrary, scale: SCALE_FACTOR[scale] }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Export failed (${res.status}). ${detail}`.trim());
  }
  const blob = await res.blob();
  const name = (model.project.name || "layout").replace(/\s+/g, "_");
  triggerDownload(blob, `${name}.dxf`);
}

/** Upload an equipment DXF → measured size + SVG + retained block. */
export async function uploadDxf(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/upload`, { method: "POST", body: form });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Upload failed (${res.status}). ${detail}`.trim());
  }
  return (await res.json()) as UploadResult;
}

/** Quick liveness check (used to show "waking service…" proactively). */
export async function ping(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/health`, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}
