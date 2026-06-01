/**
 * Local re-flow (brief §7 Req1, CLAUDE.md §2 "Local re-flow isolation").
 *
 * A "run" is a horizontal sequence of elements that flow left→right sharing a
 * baseline (same band). Editing one element's `gap_before_mm` re-positions ONLY
 * the elements downstream of it WITHIN THAT RUN — never upstream, never other
 * runs, never the whole plate. Get this wrong and the UX breaks.
 *
 * This module is pure: it takes the elements of a single run (already ordered
 * left→right) plus the run's start x, and returns new x positions. The caller
 * groups elements into runs and writes results back into the model.
 */
import type { Element } from "./types";
import type { Size } from "./geometry";
import { rotatedFootprint } from "./geometry";

export interface RunMember {
  el: Element;
  /** Library size (pre-rotation) of this element. */
  size: Size;
}

export interface ReflowResult {
  id: string;
  x_mm: number;
}

/**
 * Compute left→right x positions for one run.
 *
 * Each member sits `gap_before_mm` after the previous member's right edge,
 * using the rotated footprint width. The first member keeps `startX`. A `locked`
 * member keeps its own x and the flow CONTINUES from its right edge (auto-pack
 * and re-flow both honour locked — brief §5/§7).
 */
export function reflowRun(members: RunMember[], startX: number): ReflowResult[] {
  const out: ReflowResult[] = [];
  let cursor = startX;
  members.forEach((m, i) => {
    const w = rotatedFootprint(m.size, m.el.rot_deg).w;
    let x: number;
    if (m.el.locked) {
      x = m.el.x_mm; // locked element stays put...
    } else if (i === 0) {
      x = startX; // ...first non-anchored member anchors the run
    } else {
      x = cursor + m.el.gap_before_mm;
    }
    out.push({ id: m.el.id, x_mm: x });
    cursor = x + w; // next flows from this member's right edge
  });
  return out;
}

/**
 * Re-flow only the members downstream of (and including) the edited element.
 * Members before `editedId` are returned UNCHANGED — isolation guarantee.
 */
export function reflowDownstream(members: RunMember[], editedId: string): ReflowResult[] {
  const idx = members.findIndex((m) => m.el.id === editedId);
  if (idx < 0) return members.map((m) => ({ id: m.el.id, x_mm: m.el.x_mm }));

  // upstream: unchanged
  const upstream = members.slice(0, idx).map((m) => ({ id: m.el.id, x_mm: m.el.x_mm }));

  // downstream run starts at the edited element, anchored after the upstream neighbour
  const prev = members[idx - 1];
  const prevRight = prev
    ? prev.el.x_mm + rotatedFootprint(prev.size, prev.el.rot_deg).w
    : members[idx].el.x_mm - members[idx].el.gap_before_mm;
  const startX = prevRight + members[idx].el.gap_before_mm;

  const downstream = reflowRun(members.slice(idx), startX);
  return [...upstream, ...downstream];
}
