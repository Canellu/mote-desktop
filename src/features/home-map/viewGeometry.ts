import { locatePoint, MAP_EPSILON, signedArea } from "./geometry";
import type { MapPoint } from "./types";

export interface MapBounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export function getMapBounds(points: MapPoint[]): MapBounds {
  if (points.length === 0) return { minX: 0, minY: 0, width: 1, height: 1 };
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  return {
    minX,
    minY,
    width: Math.max(0.01, Math.max(...points.map((point) => point.x)) - minX),
    height: Math.max(0.01, Math.max(...points.map((point) => point.y)) - minY),
  };
}

function wallClearance(point: MapPoint, ring: MapPoint[]): number {
  return Math.min(
    ...ring.map((start, index) => {
      const end = ring[(index + 1) % ring.length];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const fraction = Math.max(
        0,
        Math.min(
          1,
          ((point.x - start.x) * dx + (point.y - start.y) * dy) /
            (dx * dx + dy * dy || 1),
        ),
      );
      return Math.hypot(
        point.x - (start.x + fraction * dx),
        point.y - (start.y + fraction * dy),
      );
    }),
  );
}

/** Grid-cell centers guarantee an interior candidate for an orthogonal room. */
export function getAreaLabelPoint(ring: MapPoint[]): MapPoint | null {
  if (ring.length < 4) return null;
  const area = signedArea(ring);
  if (Math.abs(area) <= MAP_EPSILON) return null;
  const centroid = { x: 0, y: 0 };
  for (let index = 0; index < ring.length; index++) {
    const start = ring[index];
    const end = ring[(index + 1) % ring.length];
    const cross = start.x * end.y - end.x * start.y;
    centroid.x += ((start.x + end.x) * cross) / (6 * area);
    centroid.y += ((start.y + end.y) * cross) / (6 * area);
  }
  const xs = [...new Set(ring.map((point) => point.x))].sort((a, b) => a - b);
  const ys = [...new Set(ring.map((point) => point.y))].sort((a, b) => a - b);
  const candidates: MapPoint[] = [centroid];
  for (let x = 1; x < xs.length; x++) {
    for (let y = 1; y < ys.length; y++) {
      candidates.push({
        x: (xs[x - 1] + xs[x]) / 2,
        y: (ys[y - 1] + ys[y]) / 2,
      });
    }
  }
  let best: MapPoint | null = null;
  let clearance = -1;
  for (const candidate of candidates) {
    if (locatePoint(candidate, ring) !== "inside") continue;
    const candidateClearance = wallClearance(candidate, ring);
    if (candidateClearance > clearance + MAP_EPSILON) {
      best = candidate;
      clearance = candidateClearance;
    }
  }
  return best;
}

/** Width centered on the anchor, limited by the nearest wall on either side. */
export function getAreaLabelWidth(ring: MapPoint[], anchor: MapPoint): number {
  if (locatePoint(anchor, ring) !== "inside") return 0;
  let halfWidth = Infinity;
  for (let index = 0; index < ring.length; index++) {
    const start = ring[index];
    const end = ring[(index + 1) % ring.length];
    if (start.y > anchor.y === end.y > anchor.y) continue;
    const x =
      start.x + ((anchor.y - start.y) * (end.x - start.x)) / (end.y - start.y);
    halfWidth = Math.min(halfWidth, Math.abs(anchor.x - x));
  }
  return Number.isFinite(halfWidth) ? halfWidth * 2 : 0;
}
