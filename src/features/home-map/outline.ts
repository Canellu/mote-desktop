import {
  MAP_EPSILON,
  MIN_WALL_METERS,
  almostEqual,
  distance,
  samePoint,
  segmentsIntersect,
  validateRing,
} from "./geometry";
import type { MapFloor, MapPoint, MapResult, MapVertex } from "./types";
import { validateMapFloor } from "./validation";

/** Drawing snaps to a coarse grid; stored geometry stays in meters. */
export const DEFAULT_SNAP_METERS = 0.1;

// Rounding to the grid reintroduces binary noise; keep millimeter precision.
const snapValue = (value: number, snap: number) =>
  snap > 0
    ? Math.round((Math.round(value / snap) * snap) / 1e-6) * 1e-6
    : value;

export function snapPoint(
  point: MapPoint,
  snapMeters = DEFAULT_SNAP_METERS,
): MapPoint {
  return {
    x: snapValue(point.x, snapMeters),
    y: snapValue(point.y, snapMeters),
  };
}

/**
 * Places the next corner. Walls may run at any angle; an angle increment
 * snaps the direction from the previous corner, and 90 degrees reproduces the
 * old right-angle drawing.
 */
export function constrainCorner(
  previous: MapPoint | null,
  point: MapPoint,
  options: { snapMeters?: number; angleDegrees?: number | null } = {},
): MapPoint {
  const { snapMeters = DEFAULT_SNAP_METERS, angleDegrees = null } = options;
  if (!previous) return snapPoint(point, snapMeters);
  if (!angleDegrees || angleDegrees <= 0) return snapPoint(point, snapMeters);
  const dx = point.x - previous.x;
  const dy = point.y - previous.y;
  const length = Math.hypot(dx, dy);
  if (length < MAP_EPSILON) return snapPoint(point, snapMeters);
  const step = (angleDegrees * Math.PI) / 180;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  // Snap the length along the chosen direction so the grid still applies.
  const snappedLength =
    snapMeters > 0
      ? Math.max(snapMeters, Math.round(length / snapMeters) * snapMeters)
      : length;
  return {
    x: previous.x + Math.cos(angle) * snappedLength,
    y: previous.y + Math.sin(angle) * snappedLength,
  };
}

/** Explains why a corner cannot extend the outline, for feedback while drawing. */
export function outlineCornerError(
  points: readonly MapPoint[],
  next: MapPoint,
): string | null {
  if (!Number.isFinite(next.x) || !Number.isFinite(next.y))
    return "Corner coordinates must be finite numbers.";
  if (points.length === 0) return null;
  const last = points[points.length - 1];
  if (samePoint(last, next)) return "Move away from the previous corner.";
  // Name the reused corner before the geometry of the wall reaching it.
  if (points.some((point) => samePoint(point, next)))
    return "This outline already has a corner here.";
  if (distance(last, next) < MIN_WALL_METERS - MAP_EPSILON)
    return "A wall must be at least one centimeter long.";
  if (
    points.length >= 2 &&
    almostEqual(
      (next.x - last.x) * (last.y - points[points.length - 2].y) -
        (next.y - last.y) * (last.x - points[points.length - 2].x),
      0,
    )
  )
    return "A wall cannot double back on itself.";
  // The new wall may touch only the corner it starts from.
  for (let index = 0; index < points.length - 2; index++) {
    if (segmentsIntersect(last, next, points[index], points[index + 1]))
      return "Walls cannot cross an earlier wall.";
  }
  return null;
}

export function appendOutlineCorner(
  points: readonly MapPoint[],
  next: MapPoint,
): MapResult<MapPoint[]> {
  const error = outlineCornerError(points, next);
  return error ? { ok: false, error } : { ok: true, value: [...points, next] };
}

/** Explains why the outline cannot close yet; null means Enter finishes it. */
export function outlineCloseError(points: readonly MapPoint[]): string | null {
  if (points.length < 3) return "An outline needs at least three corners.";
  return validateRing([...points]);
}

export function closeOutline(
  points: readonly MapPoint[],
): MapResult<MapPoint[]> {
  const error = outlineCloseError(points);
  return error ? { ok: false, error } : { ok: true, value: [...points] };
}

/** One drawn outline becomes a floor holding a single room. */
export function floorFromRing(
  ring: readonly MapPoint[],
  names: {
    floorId: string;
    floorName: string;
    areaId: string;
    areaName: string;
  },
  createId: () => string,
): MapResult<MapFloor> {
  const error = validateRing([...ring]);
  if (error) return { ok: false, error };
  if (!names.floorName.trim()) return { ok: false, error: "Name this floor." };
  if (!names.areaName.trim()) return { ok: false, error: "Name this room." };
  const vertices: MapVertex[] = ring.map((point) => ({
    x: point.x,
    y: point.y,
    id: createId(),
  }));
  const floor: MapFloor = {
    id: names.floorId,
    name: names.floorName.trim(),
    vertices,
    areas: [
      {
        id: names.areaId,
        name: names.areaName.trim(),
        vertexIds: vertices.map((vertex) => vertex.id),
        target: null,
      },
    ],
    dimensions: [],
    lights: [],
  };
  const issue = validateMapFloor(floor)[0];
  return issue
    ? { ok: false, error: issue.message }
    : { ok: true, value: floor };
}
