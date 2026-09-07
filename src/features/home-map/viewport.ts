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
