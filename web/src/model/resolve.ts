/**
 * Resolve a library item to its physical size. All three source types
 * (dxf / symbol / rect) carry width_mm + height_mm, so size is uniform.
 * Equipment size is read FROM the library — never editable by drag. (CLAUDE.md §2)
 */
import type { LibItem } from "./types";
import type { Size } from "./geometry";

export function libItemSize(item: LibItem): Size {
  return { w: item.width_mm, h: item.height_mm };
}
