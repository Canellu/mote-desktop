import { almostEqual, distance } from "./geometry";
import type { MapFloor, MapResult } from "./types";
import { validateMapFloor } from "./validation";

export type LengthUnit = "m" | "cm" | "ft" | "in";
const METERS_PER_UNIT: Record<LengthUnit, number> = {
  m: 1,
  cm: 0.01,
  ft: 0.3048,
  in: 0.0254,
};

export function convertLength(
  value: number,
  from: LengthUnit,
  to: LengthUnit,
): number {
  return (value * METERS_PER_UNIT[from]) / METERS_PER_UNIT[to];
}

/** Move the endpoint's perpendicular wall chain; shared rooms move together. */
export function setWallLength(
  floor: MapFloor,
  dimensionId: string,
  lengthMeters: number,
  anchor: "start" | "end" = "start",
): MapResult<MapFloor> {
  const initialError = validateMapFloor(floor)[0];
  if (initialError) return { ok: false, error: initialError.message };
  if (!Number.isFinite(lengthMeters) || lengthMeters <= 0)
    return { ok: false, error: "Enter a positive wall length." };
  const dimension = floor.dimensions.find((entry) => entry.id === dimensionId);
  if (!dimension)
    return { ok: false, error: "Select an existing wall dimension." };
  const vertices = new Map(floor.vertices.map((vertex) => [vertex.id, vertex]));
  const start = vertices.get(dimension.startVertexId)!;
  const end = vertices.get(dimension.endVertexId)!;
  const axis = almostEqual(start.y, end.y) ? "x" : "y";
  const fixed = anchor === "start" ? start : end;
  const moving = anchor === "start" ? end : start;
  const delta =
    Math.sign(moving[axis] - fixed[axis]) * lengthMeters -
    (moving[axis] - fixed[axis]);
  const movedIds = new Set([moving.id]);
  // Walk perpendicular edges rather than moving every vertex on the same
  // coordinate line: disconnected rooms must stay where they are.
  let changed = true;
  while (changed) {
    changed = false;
    for (const area of floor.areas) {
      for (let i = 0; i < area.vertexIds.length; i++) {
        const a = vertices.get(area.vertexIds[i])!;
        const b = vertices.get(
          area.vertexIds[(i + 1) % area.vertexIds.length],
        )!;
        if (!almostEqual(a[axis], b[axis])) continue;
        if (movedIds.has(a.id) === movedIds.has(b.id)) continue;
        movedIds.add(a.id);
        movedIds.add(b.id);
        changed = true;
      }
    }
  }
  const result = structuredClone(floor);
  result.vertices = result.vertices.map((vertex) =>
    movedIds.has(vertex.id)
      ? { ...vertex, [axis]: vertex[axis] + delta }
      : vertex,
  );
  const moved = new Map(result.vertices.map((vertex) => [vertex.id, vertex]));
  for (const entry of result.dimensions) {
    const length = distance(
      moved.get(entry.startVertexId)!,
      moved.get(entry.endVertexId)!,
    );
    if (
      entry.id !== dimensionId &&
      entry.locked &&
      !almostEqual(length, entry.lengthMeters)
    )
      return {
        ok: false,
        error: `Release dimension ${entry.id} before changing this wall.`,
      };
    if (!almostEqual(length, entry.lengthMeters)) entry.verified = false;
    entry.lengthMeters = length;
    if (entry.id === dimensionId) entry.locked = true;
  }
  const error = validateMapFloor(result)[0];
  return error
    ? { ok: false, error: error.message }
    : { ok: true, value: result };
}

/** Calibrate an approximate floor around one known wall's first endpoint. */
export function calibrateFloor(
  floor: MapFloor,
  dimensionId: string,
  lengthMeters: number,
): MapResult<MapFloor> {
  const error = validateMapFloor(floor)[0];
  if (error) return { ok: false, error: error.message };
  if (!Number.isFinite(lengthMeters) || lengthMeters <= 0)
    return { ok: false, error: "Enter a positive wall length." };
  if (floor.dimensions.some((dimension) => dimension.locked))
    return {
      ok: false,
      error: "Release locked dimensions before rescaling this floor.",
    };
  const reference = floor.dimensions.find(
    (dimension) => dimension.id === dimensionId,
  );
  if (!reference)
    return { ok: false, error: "Select a known wall to set the scale." };
  const anchor = floor.vertices.find(
    (vertex) => vertex.id === reference.startVertexId,
  )!;
  const factor = lengthMeters / reference.lengthMeters;
  const result = structuredClone(floor);
  for (const point of [...result.vertices, ...result.lights]) {
    point.x = anchor.x + (point.x - anchor.x) * factor;
    point.y = anchor.y + (point.y - anchor.y) * factor;
  }
  for (const dimension of result.dimensions) {
    dimension.lengthMeters *= factor;
    dimension.verified = dimension.id === dimensionId;
    dimension.locked = dimension.id === dimensionId;
  }
  const resultError = validateMapFloor(result)[0];
  return resultError
    ? { ok: false, error: resultError.message }
    : { ok: true, value: result };
}

/** Finds the dimension spanning a wall run, or adds one for it. */
function wallDimensionId(
  floor: MapFloor,
  startVertexId: string,
  endVertexId: string,
  createId: () => string,
): MapResult<{ floor: MapFloor; dimensionId: string }> {
  const vertices = new Map(floor.vertices.map((vertex) => [vertex.id, vertex]));
  const start = vertices.get(startVertexId);
  const end = vertices.get(endVertexId);
  if (!start || !end)
    return { ok: false, error: "Select a wall on this floor." };
  const existing = floor.dimensions.find(
    (dimension) =>
      (dimension.startVertexId === startVertexId &&
        dimension.endVertexId === endVertexId) ||
      (dimension.startVertexId === endVertexId &&
        dimension.endVertexId === startVertexId),
  );
  if (existing) return { ok: true, value: { floor, dimensionId: existing.id } };
  const id = createId();
  if (!id.trim() || floor.dimensions.some((entry) => entry.id === id))
    return { ok: false, error: "Could not assign a unique measurement ID." };
  const next: MapFloor = {
    ...floor,
    dimensions: [
      ...floor.dimensions,
      {
        id,
        startVertexId,
        endVertexId,
        lengthMeters: distance(start, end),
        locked: false,
        verified: false,
      },
    ],
  };
  const error = validateMapFloor(next)[0];
  return error
    ? { ok: false, error: error.message }
    : { ok: true, value: { floor: next, dimensionId: id } };
}

/**
 * Sets an exact length for a wall, measuring it first if it had no dimension.
 * An entered length is the user's own measurement, so it is locked.
 */
export function setWallLengthForWall(
  floor: MapFloor,
  wall: { startVertexId: string; endVertexId: string },
  lengthMeters: number,
  anchor: "start" | "end",
  createId: () => string,
): MapResult<MapFloor> {
  const prepared = wallDimensionId(
    floor,
    wall.startVertexId,
    wall.endVertexId,
    createId,
  );
  if (!prepared.ok) return prepared;
  const result = setWallLength(
    prepared.value.floor,
    prepared.value.dimensionId,
    lengthMeters,
    anchor,
  );
  if (!result.ok) return result;
  return {
    ok: true,
    value: {
      ...result.value,
      dimensions: result.value.dimensions.map((dimension) =>
        dimension.id === prepared.value.dimensionId
          ? { ...dimension, locked: true, verified: true }
          : dimension,
      ),
    },
  };
}

/** Releasing a length lets neighbouring edits change that wall again. */
export function releaseWallLength(
  floor: MapFloor,
  dimensionId: string,
): MapResult<MapFloor> {
  const dimension = floor.dimensions.find((entry) => entry.id === dimensionId);
  if (!dimension) return { ok: false, error: "Select a measured wall." };
  return {
    ok: true,
    value: {
      ...floor,
      dimensions: floor.dimensions.map((entry) =>
        entry.id === dimensionId ? { ...entry, locked: false } : entry,
      ),
    },
  };
}

/** Rescales a sketch around one wall whose real length the user knows. */
export function calibrateFloorFromWall(
  floor: MapFloor,
  wall: { startVertexId: string; endVertexId: string },
  lengthMeters: number,
  createId: () => string,
): MapResult<MapFloor> {
  const prepared = wallDimensionId(
    floor,
    wall.startVertexId,
    wall.endVertexId,
    createId,
  );
  if (!prepared.ok) return prepared;
  return calibrateFloor(
    prepared.value.floor,
    prepared.value.dimensionId,
    lengthMeters,
  );
}
