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

export const cross = (p: MapPoint, q: MapPoint, r: MapPoint): number =>
  (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);

/** Walls of any angle are allowed; only collinear ones share a run. */
export const areCollinear = (
  a: MapPoint,
  b: MapPoint,
  c: MapPoint,
  d: MapPoint,
): boolean => {
  const length = Math.max(distance(a, b), distance(c, d), 1);
  return (
    Math.abs(cross(a, b, c)) <= MAP_EPSILON * length &&
    Math.abs(cross(a, b, d)) <= MAP_EPSILON * length
  );
};

/** True only when the segments' interiors cross; touching does not count. */
export const segmentsCrossProperly = (
  a: MapPoint,
  b: MapPoint,
  c: MapPoint,
  d: MapPoint,
): boolean =>
  cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;

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
  if (ring.length < 3) return "A room needs at least three corners.";
  if (ring.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)))
    return "Room coordinates must be finite numbers.";
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    // Walls may run at any angle; only degenerate ones are rejected.
    if (samePoint(a, b)) return "A room cannot repeat a corner.";
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

/** A point just inside each wall, used to compare interiors of any shape. */
function interiorSamples(ring: MapPoint[]): MapPoint[] {
  const inward = signedArea(ring) > 0 ? 1 : -1;
  const offset = Math.max(MAP_EPSILON * 10, 1e-4);
  const samples: MapPoint[] = [];
  for (let index = 0; index < ring.length; index++) {
    const a = ring[index];
    const b = ring[(index + 1) % ring.length];
    const length = distance(a, b);
    if (length <= 0) continue;
    const normal = {
      x: (-(b.y - a.y) / length) * inward,
      y: ((b.x - a.x) / length) * inward,
    };
    const point = {
      x: (a.x + b.x) / 2 + normal.x * offset,
      y: (a.y + b.y) / 2 + normal.y * offset,
    };
    if (locatePoint(point, ring) === "inside") samples.push(point);
  }
  return samples;
}

/** Rooms overlap when their interiors meet; a shared wall is not an overlap. */
export function ringsOverlap(a: MapPoint[], b: MapPoint[]): boolean {
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i];
    const a2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const b1 = b[j];
      const b2 = b[(j + 1) % b.length];
      if (segmentsCrossProperly(a1, a2, b1, b2)) return true;
    }
  }
  // Containment and identical shapes cross no walls, so compare interiors too.
  return (
    interiorSamples(a).some((point) => locatePoint(point, b) === "inside") ||
    interiorSamples(b).some((point) => locatePoint(point, a) === "inside")
  );
}
