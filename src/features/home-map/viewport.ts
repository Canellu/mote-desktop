import type { MapPoint } from "./types";
import type { MapBounds } from "./viewGeometry";

/** Pixels per meter, and the screen position of world origin. */
export interface MapViewport {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export const MIN_MAP_SCALE = 4;
export const MAX_MAP_SCALE = 400;

const STEPS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50, 100] as const;

/**
 * The smallest round step whose lines stay at least `minPixels` apart. Round
 * values keep the grid, the rulers, and geometry drawn at whole metres aligned
 * at every zoom level.
 */
export function niceStep(scale: number, minPixels: number): number {
  return (
    STEPS.find((step) => step * scale >= minPixels) ?? STEPS[STEPS.length - 1]
  );
}

export const clampScale = (scale: number): number =>
  Math.min(MAX_MAP_SCALE, Math.max(MIN_MAP_SCALE, scale));

export const toScreen = (point: MapPoint, view: MapViewport): MapPoint => ({
  x: point.x * view.scale + view.offsetX,
  y: point.y * view.scale + view.offsetY,
});

export const toWorld = (point: MapPoint, view: MapViewport): MapPoint => ({
  x: (point.x - view.offsetX) / view.scale,
  y: (point.y - view.offsetY) / view.scale,
});

export const panViewport = (
  view: MapViewport,
  dx: number,
  dy: number,
): MapViewport => ({
  ...view,
  offsetX: view.offsetX + dx,
  offsetY: view.offsetY + dy,
});

/** Keeps the world point under the pointer fixed while the scale changes. */
export function zoomViewportAt(
  view: MapViewport,
  screenPoint: MapPoint,
  factor: number,
): MapViewport {
  const scale = clampScale(view.scale * factor);
  if (scale === view.scale) return view;
  const anchor = toWorld(screenPoint, view);
  return {
    scale,
    offsetX: screenPoint.x - anchor.x * scale,
    offsetY: screenPoint.y - anchor.y * scale,
  };
}

/** A floor with no geometry yet gets a workable metre scale, not a huge zoom. */
export const DEFAULT_MAP_SCALE = 40;

export function emptyViewport(size: {
  width: number;
  height: number;
}): MapViewport {
  return {
    scale: DEFAULT_MAP_SCALE,
    offsetX: size.width / 2,
    offsetY: size.height / 2,
  };
}

export function fitViewport(
  bounds: MapBounds,
  size: { width: number; height: number },
  padding = 48,
): MapViewport {
  const usableWidth = Math.max(1, size.width - padding * 2);
  const usableHeight = Math.max(1, size.height - padding * 2);
  const scale = clampScale(
    Math.min(usableWidth / bounds.width, usableHeight / bounds.height),
  );
  return {
    scale,
    offsetX: (size.width - bounds.width * scale) / 2 - bounds.minX * scale,
    offsetY: (size.height - bounds.height * scale) / 2 - bounds.minY * scale,
  };
}
