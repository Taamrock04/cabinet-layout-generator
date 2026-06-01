/**
 * THE renderer: LayoutModel → SVG string.
 *
 * This single function feeds the live preview AND the PDF/PNG/SVG exports, so
 * "what you see is what you get" and exports never contain editor UI. (SKILL.md
 * §6/§7 invariant 1, CLAUDE.md §5 "One renderer".) The DXF path is separate
 * (the ezdxf service) but is driven by the SAME model.
 *
 * Coordinates are emitted in editor space (top-left, +y down) — which is exactly
 * SVG's own convention, so no Y flip here. The DXF assembler is the only place
 * that flips to bottom-left.
 */
import type { LayoutModel, Library, Element } from "../model/types";
import { libItemSize } from "../model/resolve";
import { rotatedFootprint } from "../model/geometry";

export interface RenderOptions {
  /** Draw selection-free; exports use this. Defaults to a clean render. */
  showGrid?: boolean;
  /** px per mm for the viewBox scale. Default 1 (viewBox is in mm). */
  unitsPerMm?: number;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function tagText(text: string, cx: number, cy: number, rot: number, h = 6): string {
  const t = rot ? ` transform="rotate(${rot} ${cx} ${cy})"` : "";
  return `<text x="${cx}" y="${cy}" font-size="${h}" text-anchor="middle" dominant-baseline="central"${t}>${esc(text)}</text>`;
}

function renderElement(el: Element, library: Library): string {
  const item = library[el.lib_key];
  if (!item) {
    // unresolved — draw a dashed placeholder so the gap is visible, never silent
    return `<rect x="${el.x_mm}" y="${el.y_mm}" width="10" height="10" fill="#fdd" stroke="#c00" stroke-dasharray="2 2"/>`;
  }
  const size = libItemSize(item);
  const f = rotatedFootprint(size, el.rot_deg);
  const cx = el.x_mm + f.w / 2;
  const cy = el.y_mm + f.h / 2;
  const body = `<rect x="${el.x_mm}" y="${el.y_mm}" width="${f.w}" height="${f.h}" fill="#fff" stroke="#222" stroke-width="0.4"/>`;
  const label = el.tag ? tagText(el.tag, cx, cy, 0, 10) : "";
  return `<g data-id="${el.id}" data-layer="EQUIP">${body}${label}</g>`;
}

/**
 * The inner SVG markup for the plate (everything inside the <svg>), in editor
 * mm coordinates. Exposed so the page composer (render/page.ts) can embed it
 * under a transform for paper-sized PDF/PNG output, while `renderToSvg` wraps it
 * for the live preview and the lightweight SVG export.
 */
export function renderPlateBody(model: LayoutModel, library: Library): string {
  const { width_mm: W, height_mm: H } = model.plate;

  const parts: string[] = [];

  // plate outline (PLATE layer)
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#fafafa" stroke="#000" stroke-width="0.8" data-layer="PLATE"/>`);

  // ducts (DUCT) + centered label (TEXT)
  for (const d of model.ducts) {
    const horizontal = d.rot_deg % 180 === 0;
    const w = horizontal ? d.length_mm : d.width_mm;
    const h = horizontal ? d.width_mm : d.length_mm;
    const cx = d.x_mm + w / 2;
    const cy = d.y_mm + h / 2;
    parts.push(`<g data-id="${d.id}" data-layer="DUCT">`);
    parts.push(`<rect x="${d.x_mm}" y="${d.y_mm}" width="${w}" height="${h}" fill="#eef3ff" stroke="#3559b3" stroke-width="0.4"/>`);
    // label matches the as-builts: "WIRE DUCT 40X60 MM"; height ~60% of the duct thickness
    parts.push(tagText(`WIRE DUCT ${d.width_mm}X${d.label_h_mm} MM`, cx, cy, horizontal ? 0 : 90, d.width_mm * 0.6));
    parts.push(`</g>`);
  }

  // groups (sets) — render members left→right with internal gap
  for (const g of model.groups) {
    const item = library[g.lib_key];
    if (!item) continue;
    const size = libItemSize(item);
    const f = rotatedFootprint(size, g.rot_deg);
    parts.push(`<g data-id="${g.id}" data-layer="EQUIP">`);
    let x = g.x_mm;
    for (let i = 0; i < g.count; i += 1) {
      parts.push(`<rect x="${x}" y="${g.y_mm}" width="${f.w}" height="${f.h}" fill="#fff" stroke="#222" stroke-width="0.3"/>`);
      x += f.w + g.internal_gap_mm;
    }
    parts.push(`</g>`);
  }

  // elements
  for (const el of model.elements) parts.push(renderElement(el, library));

  // labels (stopper labels)
  for (const l of model.labels) {
    // anchor resolution for absolute position is done by the editor; here we
    // place by the label's own offset relative to its anchor's origin if present.
    const anchorId = l.anchor.split(":")[1];
    const host =
      model.elements.find((e) => e.id === anchorId) ??
      model.groups.find((gr) => gr.id === anchorId);
    if (!host) continue;
    const x = host.x_mm + l.dx_mm;
    const y = host.y_mm + l.dy_mm;
    parts.push(`<text x="${x}" y="${y}" font-size="10" data-id="${l.id}" data-layer="TEXT">${esc(l.text)}</text>`);
  }

  return parts.join("");
}

export function renderToSvg(model: LayoutModel, library: Library, opts: RenderOptions = {}): string {
  const { width_mm: W, height_mm: H } = model.plate;
  const scale = opts.unitsPerMm ?? 1;
  const wPx = W * scale;
  const hPx = H * scale;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${wPx}" height="${hPx}" viewBox="0 0 ${W} ${H}" font-family="Arial, Helvetica, sans-serif">`,
    renderPlateBody(model, library),
    `</svg>`,
  ].join("");
}
