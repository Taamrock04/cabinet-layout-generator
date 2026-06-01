/**
 * In-browser exporters: SVG / PNG / PDF — all from the JSON model via the single
 * renderer (brief §6, CLAUDE.md §5). No server involved (unlike DXF).
 *
 *  - SVG : the lightweight "renders anywhere" serialize of the plate (no page frame).
 *  - PNG : compose a paper page → rasterise via <canvas> at a chosen DPI (capped).
 *  - PDF : compose a paper page → vector PDF via svg2pdf.js into a mm-unit jsPDF.
 */
import { jsPDF } from "jspdf";
import { svg2pdf } from "svg2pdf.js";
import type { LayoutModel, Library } from "../model/types";
import { renderToSvg } from "../render/toSvg";
import { composePageSvg, type Paper } from "../render/page";

const MM_PER_INCH = 25.4;
/** Guard against runaway canvases (≈ A3@300dpi). */
const MAX_CANVAS_PX = 25_000_000;

function safeName(model: LayoutModel): string {
  return (model.project.name || "layout").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "layout";
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Lightweight vector SVG of the plate (editor mm coordinates). */
export function downloadSvg(model: LayoutModel, library: Library): void {
  const svg = renderToSvg(model, library, { unitsPerMm: 1 });
  downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `${safeName(model)}.svg`);
}

function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to rasterise SVG"));
    };
    img.src = url;
  });
}

/** Paper-fitted PNG at the requested DPI (auto-reduced if it would exceed the cap). */
export async function downloadPng(
  model: LayoutModel,
  library: Library,
  paper: Paper,
  dpi = 150,
): Promise<void> {
  const page = composePageSvg(model, library, paper);
  let pxPerMm = dpi / MM_PER_INCH;
  let wPx = Math.round(page.pageW * pxPerMm);
  let hPx = Math.round(page.pageH * pxPerMm);
  if (wPx * hPx > MAX_CANVAS_PX) {
    const k = Math.sqrt(MAX_CANVAS_PX / (wPx * hPx));
    pxPerMm *= k;
    wPx = Math.round(page.pageW * pxPerMm);
    hPx = Math.round(page.pageH * pxPerMm);
  }

  const img = await loadSvgImage(page.svg);
  const canvas = document.createElement("canvas");
  canvas.width = wPx;
  canvas.height = hPx;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, wPx, hPx);
  ctx.drawImage(img, 0, 0, wPx, hPx);

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
  );
  downloadBlob(blob, `${safeName(model)}.png`);
}

/** Paper-fitted vector PDF (svg2pdf into a mm-unit jsPDF). */
export async function downloadPdf(model: LayoutModel, library: Library, paper: Paper): Promise<void> {
  const page = composePageSvg(model, library, paper);
  const pdf = new jsPDF({
    orientation: page.orientation === "landscape" ? "landscape" : "portrait",
    unit: "mm",
    format: paper.toLowerCase(),
  });

  // svg2pdf needs the element in the DOM to measure text/layout; render off-screen.
  const holder = document.createElement("div");
  holder.style.position = "fixed";
  holder.style.left = "-10000px";
  holder.style.top = "0";
  holder.innerHTML = page.svg;
  const el = holder.firstElementChild as SVGSVGElement;
  document.body.appendChild(holder);
  try {
    await svg2pdf(el, pdf, { x: 0, y: 0, width: page.pageW, height: page.pageH });
  } finally {
    holder.remove();
  }
  pdf.save(`${safeName(model)}.pdf`);
}
