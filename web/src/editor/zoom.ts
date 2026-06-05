/** Zoom limits (px-per-mm) and a clamp helper, shared by the stage and the toolbar. */
export const MIN_ZOOM = 0.03;
export const MAX_ZOOM = 8;
export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
