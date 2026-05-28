/**
 * Single renderer-owned adapter seam for all preload bridge access.
 *
 * Renderer code imports `api` from here instead of touching `window.api`
 * directly. Tests mock this module to control the preload boundary without
 * touching the global.
 */
export const api = window.api
