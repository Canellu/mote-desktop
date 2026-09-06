import type { MapPoint } from "./types";

export const MAP_EPSILON = 1e-7;
export const MIN_WALL_METERS = 0.01;
export const MIN_AREA_SQUARE_METERS = 0.01;

export const almostEqual = (a: number, b: number): boolean =>
  Math.abs(a - b) <= MAP_EPSILON;

export const samePoint = (a: MapPoint, b: MapPoint): boolean =>
  almostEqual(a.x, b.x) && almostEqual(a.y, b.y);

export const distance = (a: MapPoint, b: MapPoint): number =>
  Math.hypot(b.x - a.x, b.y - a.y);

export const signedArea = (ring: MapPoint[]): number =>
  ring.reduce((sum, a, index) => {
    const b = ring[(index + 1) % ring.length];
    return sum + a.x * b.y - b.x * a.y;
  }, 0) / 2;

export const isOrthogonalEdge = (a: MapPoint, b: MapPoint): boolean =>
  !samePoint(a, b) && (almostEqual(a.x, b.x) || almostEqual(a.y, b.y));

export const pointOnSegment = (
  point: MapPoint,
  a: MapPoint,
  b: MapPoint,
): boolean => {
  const cross = (point.x - a.x) * (b.y - a.y) - (point.y - a.y) * (b.x - a.x);
  return (
    Math.abs(cross) <= MAP_EPSILON * Math.max(1, distance(a, b)) &&
    point.x >= Math.min(a.x, b.x) - MAP_EPSILON &&
    point.x <= Math.max(a.x, b.x) + MAP_EPSILON &&
    point.y >= Math.min(a.y, b.y) - MAP_EPSILON &&
    point.y <= Math.max(a.y, b.y) + MAP_EPSILON
  );
};

export const locatePoint = (
  point: MapPoint,
  ring: MapPoint[],
): "inside" | "boundary" | "outside" => {
  let inside = false;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (pointOnSegment(point, a, b)) return "boundary";
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside ? "inside" : "outside";
};

export const segmentsIntersect = (
  a: MapPoint,
  b: MapPoint,
  c: MapPoint,
  d: MapPoint,
): boolean => {
  const cross = (p: MapPoint, q: MapPoint, r: MapPoint) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return (
    pointOnSegment(a, c, d) ||
    pointOnSegment(b, c, d) ||
    pointOnSegment(c, a, b) ||
    pointOnSegment(d, a, b) ||
    (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0)
  );
};

/** Returns a user-facing reason without normalizing away invalid geometry. */
export function validateRing(ring: MapPoint[]): string | null {
  if (ring.length < 4) return "A room needs at least four corners.";
  if (ring.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)))
    return "Room coordinates must be finite numbers.";
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (!isOrthogonalEdge(a, b)) return "Walls must be horizontal or vertical.";
    if (distance(a, b) < MIN_WALL_METERS - MAP_EPSILON)
      return "A wall must be at least one centimeter long.";
    for (let j = i + 1; j < ring.length; j++) {
      if (samePoint(a, ring[j])) return "A room cannot repeat a corner.";
      if (j === i + 1 || (i === 0 && j === ring.length - 1)) continue;
      if (segmentsIntersect(a, b, ring[j], ring[(j + 1) % ring.length]))
        return "Room walls cannot cross or touch themselves.";
    }
    const c = ring[(i + 2) % ring.length];
    if (pointOnSegment(c, a, b) || pointOnSegment(a, b, c))
      return "A wall cannot double back on itself.";
  }
  if (Math.abs(signedArea(ring)) < MIN_AREA_SQUARE_METERS - MAP_EPSILON)
    return "A room must cover at least 0.01 square meters.";
  return null;
}

/** Orthogonal polygons overlap iff one open grid cell is inside both. */
export function ringsOverlap(a: MapPoint[], b: MapPoint[]): boolean {
  // A horizontal scan between every corner height also catches identical rooms
  // and overlaps whose vertices all happen to lie on another room's boundary.
  const ys = [...new Set([...a, ...b].map((p) => p.y))].sort((x, y) => x - y);
  const intervals = (ring: MapPoint[], y: number): [number, number][] => {
    const xs: number[] = [];
    ring.forEach((p, i) => {
      const q = ring[(i + 1) % ring.length];
      if (p.y > y !== q.y > y) xs.push(p.x);
    });
    xs.sort((x, z) => x - z);
    return xs.filter((_, i) => i % 2 === 0).map((x, i) => [x, xs[i * 2 + 1]]);
  };
  for (let i = 1; i < ys.length; i++) {
    if (ys[i] - ys[i - 1] <= MAP_EPSILON) continue;
    const y = (ys[i] + ys[i - 1]) / 2;
    const left = intervals(a, y);
    const right = intervals(b, y);
    if (
      left.some(([a0, a1]) =>
        right.some(
          ([b0, b1]) => Math.min(a1, b1) - Math.max(a0, b0) > MAP_EPSILON,
        ),
      )
    )
      return true;
  }
  return false;
}
