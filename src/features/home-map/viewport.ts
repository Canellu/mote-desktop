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

const METRIC_STEPS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50, 100] as const;
/** Inches, then feet: 3 in, 6 in, 1 ft, 2 ft, 5 ft, and so on. */
const IMPERIAL_STEPS = [
  0.0762, 0.1524, 0.3048, 0.6096, 1.524, 3.048, 6.096, 15.24, 30.48, 60.96,
] as const;

/**
 * The smallest round step whose lines stay at least `minPixels` apart. Steps
 * are round in the unit on screen, so a foot map never reads 6.56 or 13.12.
 */
export function niceStep(
  scale: number,
  minPixels: number,
  units: "metric" | "imperial" = "metric",
): number {
  const steps = units === "metric" ? METRIC_STEPS : IMPERIAL_STEPS;
  return (
    steps.find((step) => step * scale >= minPixels) ?? steps[steps.length - 1]
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
