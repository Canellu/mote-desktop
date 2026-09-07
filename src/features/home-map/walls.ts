import {
  MAP_EPSILON,
  almostEqual,
  distance,
  pointOnSegment,
  samePoint,
} from "./geometry";
import type { MapFloor, MapResult } from "./types";
import { validateMapFloor } from "./validation";

export interface MapWall {
  /** Stable across renders: the wall's two endpoint IDs, sorted. */
  id: string;
  startVertexId: string;
  endVertexId: string;
  orientation: "horizontal" | "vertical";
  lengthMeters: number;
  /** Every area whose ring uses this segment; more than one means shared. */
  areaIds: string[];
}

const failure = (error: string): MapResult<MapFloor> => ({ ok: false, error });

const wallId = (a: string, b: string) => [a, b].sort().join(":");

/** One entry per wall segment, so a shared boundary is edited once. */
export function listWalls(floor: MapFloor): MapWall[] {
  const vertices = new Map(floor.vertices.map((vertex) => [vertex.id, vertex]));
  const walls = new Map<string, MapWall>();
  for (const area of floor.areas) {
    for (let index = 0; index < area.vertexIds.length; index++) {
      const startId = area.vertexIds[index];
      const endId = area.vertexIds[(index + 1) % area.vertexIds.length];
      const start = vertices.get(startId);
      const end = vertices.get(endId);
      if (!start || !end) continue;
      const id = wallId(startId, endId);
      const existing = walls.get(id);
      if (existing) {
        if (!existing.areaIds.includes(area.id)) existing.areaIds.push(area.id);
        continue;
      }
      walls.set(id, {
        id,
        startVertexId: startId,
        endVertexId: endId,
        orientation: almostEqual(start.x, end.x) ? "vertical" : "horizontal",
        lengthMeters: distance(start, end),
        areaIds: [area.id],
      });
    }
  }
  return [...walls.values()];
}

/**
 * Moves one wall perpendicular to itself. Rooms on both sides follow, because
 * a shared boundary is a single segment rather than two independent walls.
 */
export function moveWall(
  floor: MapFloor,
  wallKey: string,
  deltaMeters: number,
): MapResult<MapFloor> {
  const initial = validateMapFloor(floor)[0];
  if (initial) return failure(initial.message);
  if (!Number.isFinite(deltaMeters))
    return failure("Enter how far to move this wall.");
  const wall = listWalls(floor).find((candidate) => candidate.id === wallKey);
  if (!wall) return failure("Select a wall on this floor.");
  if (Math.abs(deltaMeters) <= MAP_EPSILON) return { ok: true, value: floor };

  const vertices = new Map(floor.vertices.map((vertex) => [vertex.id, vertex]));
  const start = vertices.get(wall.startVertexId)!;
  const end = vertices.get(wall.endVertexId)!;
  const axis = wall.orientation === "vertical" ? "x" : "y";
  // Corners noded along the same segment belong to it and move with it.
  const moving = new Set(
    floor.vertices
      .filter((vertex) => pointOnSegment(vertex, start, end))
      .map((vertex) => vertex.id),
  );

  const result: MapFloor = {
    ...floor,
    vertices: floor.vertices.map((vertex) =>
      moving.has(vertex.id)
        ? { ...vertex, [axis]: vertex[axis] + deltaMeters }
        : { ...vertex },
    ),
    areas: floor.areas.map((area) => ({
      ...area,
      vertexIds: [...area.vertexIds],
      target: area.target ? { ...area.target } : null,
    })),
    dimensions: floor.dimensions.map((dimension) => ({ ...dimension })),
    lights: floor.lights.map((light) => ({ ...light })),
  };

  const moved = new Map(result.vertices.map((vertex) => [vertex.id, vertex]));
  for (const vertex of result.vertices) {
    if (!moving.has(vertex.id)) continue;
    if (
      result.vertices.some(
        (other) => other.id !== vertex.id && samePoint(other, vertex),
      )
    )
      return failure("This wall cannot pass another wall.");
  }
  for (const dimension of result.dimensions) {
    const length = distance(
      moved.get(dimension.startVertexId)!,
      moved.get(dimension.endVertexId)!,
    );
    if (almostEqual(length, dimension.lengthMeters)) continue;
    if (dimension.locked)
      return failure(
        `Release the ${dimension.lengthMeters.toFixed(2)} m wall length before moving this wall.`,
      );
    dimension.lengthMeters = length;
    dimension.verified = false;
  }

  const issue = validateMapFloor(result)[0];
  if (issue) return failure(issue.message);
  // Placements stay where the physical lamp is; the editor flags strays.
  return { ok: true, value: result };
}
