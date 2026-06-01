/**
 * Compose a paper-sized SVG "page" around the plate render, for PDF/PNG export.
 *
 * The drawing auto-fits the chosen paper (A3/A4), the orientation that yields the
 * larger drawing is chosen automatically, and a title line prints the RESULTING
 * scale + paper size, e.g. "SCALE 1:12 — PAPER SIZE: A3". (brief §6.)
 *
 * Everything is in millimetres so the same SVG drives both a vector PDF (svg2pdf
 * into a mm-unit jsPDF) and a rasterised PNG (mm → px at the chosen DPI).
 */
import type { LayoutModel, Library } from "../model/types";
import { renderPlateBody } from "./toSvg";

export type Paper = "A4" | "A3";

/** Portrait dimensions in mm; we may swap for landscape. */
const PAPER_MM: Record<Paper, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
};

const MARGIN_MM = 10;
const TITLE_BAND_MM = 14; // reserved strip at the top for the title line

export interface PageResult {
  /** Full page SVG string, sized in mm. */
  svg: string;
  /** Page size in mm (after orientation choice). */
  pageW: number;
  pageH: number;
  orientation: "portrait" | "landscape";
  /** Denominator N of the fitted scale 1:N (rounded, ≥ 1). */
  scaleN: number;
  titleLine: string;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface Fit {
  pageW: number;
  pageH: number;
  orientation: "portrait" | "landscape";
  scale: number;
}

/** Pick the orientation whose fit-to-page scale is larger (bigger drawing). */
function bestFit(paper: Paper, plateW: number, plateH: number): Fit {
  const base = PAPER_MM[paper];
  const options: Fit[] = [
    { ...orient(base.w, base.h, plateW, plateH), orientation: "portrait" } as Fit,
    { ...orient(base.h, base.w, plateW, plateH), orientation: "landscape" } as Fit,
  ];
  return options[0].scale >= options[1].scale ? options[0] : options[1];
}

function orient(pageW: number, pageH: number, plateW: number, plateH: number) {
  const contentW = pageW - 2 * MARGIN_MM;
  const contentH = pageH - 2 * MARGIN_MM - TITLE_BAND_MM;
  const scale = Math.min(contentW / plateW, contentH / plateH);
  return { pageW, pageH, scale };
}

export function composePageSvg(model: LayoutModel, library: Library, paper: Paper): PageResult {
  const plateW = model.plate.width_mm;
  const plateH = model.plate.height_mm;
  const fit = bestFit(paper, plateW, plateH);
  const scaleN = Math.max(1, Math.round(1 / fit.scale));
  const titleLine = `SCALE 1:${scaleN} — PAPER SIZE: ${paper}`;

  // centre the fitted drawing horizontally within the content area
  const drawnW = plateW * fit.scale;
  const drawnH = plateH * fit.scale;
  const offsetX = (fit.pageW - drawnW) / 2;
  const offsetY = MARGIN_MM + TITLE_BAND_MM + ((fit.pageH - MARGIN_MM - TITLE_BAND_MM - MARGIN_MM) - drawnH) / 2;

  const body = renderPlateBody(model, library);

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fit.pageW}" height="${fit.pageH}" viewBox="0 0 ${fit.pageW} ${fit.pageH}" font-family="Arial, Helvetica, sans-serif">`,
    `<rect x="0" y="0" width="${fit.pageW}" height="${fit.pageH}" fill="#ffffff"/>`,
    // title line
    `<text x="${MARGIN_MM}" y="${MARGIN_MM + 5}" font-size="4.5" fill="#111">${esc(titleLine)}</text>`,
    `<text x="${MARGIN_MM}" y="${MARGIN_MM + 11}" font-size="3.5" fill="#555">${esc(model.project.name)}${model.project.panel_tag ? "  ·  " + esc(model.project.panel_tag) : ""}  ·  Rev ${esc(model.project.rev)}</text>`,
    // the fitted drawing
    `<g transform="translate(${offsetX} ${offsetY}) scale(${fit.scale})">${body}</g>`,
    `</svg>`,
  ].join("");

  return { svg, pageW: fit.pageW, pageH: fit.pageH, orientation: fit.orientation, scaleN, titleLine };
}
