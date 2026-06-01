/**
 * Pure geometry helpers — no DOM, no Fabric. Fully unit-tested.
 *
 * Two responsibilities the rest of the system must NOT duplicate:
 *  1. The rotated bounding box (90°/270° swap W×H) — spacing math uses this. (CLAUDE.md §2)
 *  2. The editor↔DXF coordinate conversion, in EXACTLY ONE place. (CLAUDE.md §4)
 */

export interface Size {
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  /** Top-left corner in editor coords (+y down). */
  x: number;
  y: number;
  w: number;
  h: number;
}

const TWO_PI_DEG = 360;

/** Normalize any angle to [0, 360). */
export function normDeg(deg: number): number {
  return ((deg % TWO_PI_DEG) + TWO_PI_DEG) % TWO_PI_DEG;
}

/**
 * Footprint of a part after rotation, for SPACING purposes.
 *
 * Right-angle rotations swap W×H exactly. Arbitrary angles return the
 * axis-aligned bounding box of the rotated rectangle (a true envelope, so
 * spacing never under-counts). (brief §7 Req3, CLAUDE.md §2)
 */
export function rotatedFootprint(size: Size, rotDeg: number): Size {
  const a = normDeg(rotDeg);
  if (a === 0 || a === 180) return { w: size.w, h: size.h };
  if (a === 90 || a === 270) return { w: size.h, h: size.w };
  const rad = (a * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  return {
    w: size.w * c + size.h * s,
    h: size.w * s + size.h * c,
  };
}

/**
 * Convert an editor Y (top-left origin, +y DOWN) to a DXF Y (bottom-left, +y UP).
 *
 * THE ONLY PLACE this flip is allowed to happen. The DXF assembler calls this;
 * nothing else flips signs. (CLAUDE.md §4, SKILL.md §7 invariant 5.)
 *
 * @param yTop   editor y of the point
 * @param plateHeightMm  plate height (the flip axis)
 */
export function topLeftToBottomLeft(yTop: number, plateHeightMm: number): number {
  return plateHeightMm - yTop;
}

/** Inverse of {@link topLeftToBottomLeft}. Same single-place rule. */
export function bottomLeftToTopLeft(yBottom: number, plateHeightMm: number): number {
  return plateHeightMm - yBottom;
}

/**
 * Axis-aligned box a placed part occupies in editor coords, given its library
 * size, its top-left position, and rotation. Uses the rotated footprint.
 */
export function placedBox(pos: Point, size: Size, rotDeg: number): Box {
  const f = rotatedFootprint(size, rotDeg);
  return { x: pos.x, y: pos.y, w: f.w, h: f.h };
}

/** True if two editor boxes overlap (touching edges do NOT count as overlap). */
export function boxesOverlap(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

/** True if a box lies fully within the plate (warn-but-allow uses the negation). */
export function boxWithinPlate(box: Box, plate: Size): boolean {
  return (
    box.x >= 0 &&
    box.y >= 0 &&
    box.x + box.w <= plate.w &&
    box.y + box.h <= plate.h
  );
}
