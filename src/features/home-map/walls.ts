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
  /** Stable across renders: the run's two extreme corner IDs, sorted. */
  id: string;
  startVertexId: string;
  endVertexId: string;
  orientation: "horizontal" | "vertical";
  lengthMeters: number;
  /** Every corner along the run, including the corners between segments. */
  vertexIds: string[];
  /** Every area bordering the run, on either side. */
  areaIds: string[];
  /** True when part of the run separates two rooms rather than facing outside. */
  dividing: boolean;
}

const failure = (error: string): MapResult<MapFloor> => ({ ok: false, error });

const wallId = (a: string, b: string) => [a, b].sort().join(":");

/**
 * One entry per straight boundary run. Segments that continue in the same
 * line are one wall: moving only part of a straight boundary would leave a
 * diagonal, which orthogonal plans cannot represent.
 */
export function listWalls(floor: MapFloor): MapWall[] {
  const vertices = new Map(floor.vertices.map((vertex) => [vertex.id, vertex]));
  const segments = new Map<
    string,
    {
      startId: string;
      endId: string;
      orientation: "horizontal" | "vertical";
      areaIds: string[];
    }
  >();
  for (const area of floor.areas) {
    for (let index = 0; index < area.vertexIds.length; index++) {
      const startId = area.vertexIds[index];
      const endId = area.vertexIds[(index + 1) % area.vertexIds.length];
      const start = vertices.get(startId);
      const end = vertices.get(endId);
      if (!start || !end) continue;
      const id = wallId(startId, endId);
      const existing = segments.get(id);
      if (existing) {
        if (!existing.areaIds.includes(area.id)) existing.areaIds.push(area.id);
        continue;
      }
      segments.set(id, {
        startId,
        endId,
        orientation: almostEqual(start.x, end.x) ? "vertical" : "horizontal",
        areaIds: [area.id],
      });
    }
  }

  const walls: MapWall[] = [];
  const used = new Set<string>();
  for (const [id, segment] of segments) {
    if (used.has(id)) continue;
    const orientation = segment.orientation;
    const axis = orientation === "vertical" ? "y" : "x";
    const fixed = orientation === "vertical" ? "x" : "y";
    const line = vertices.get(segment.startId)![fixed];
    const runIds = new Set([segment.startId, segment.endId]);
    const areaIds = [...segment.areaIds];
    let dividing = segment.areaIds.length > 1;
    used.add(id);
    // Grow along the line while another segment continues from an end corner.
    let extended = true;
    while (extended) {
      extended = false;
      for (const [otherId, other] of segments) {
        if (used.has(otherId) || other.orientation !== orientation) continue;
        if (!almostEqual(vertices.get(other.startId)![fixed], line)) continue;
        if (!runIds.has(other.startId) && !runIds.has(other.endId)) continue;
        runIds.add(other.startId);
        runIds.add(other.endId);
        for (const areaId of other.areaIds)
          if (!areaIds.includes(areaId)) areaIds.push(areaId);
        dividing = dividing || other.areaIds.length > 1;
        used.add(otherId);
        extended = true;
      }
    }
    const ordered = [...runIds]
      .map((vertexId) => vertices.get(vertexId)!)
      .sort((a, b) => a[axis] - b[axis]);
    const start = ordered[0];
    const end = ordered[ordered.length - 1];
    walls.push({
      id: wallId(start.id, end.id),
      startVertexId: start.id,
      endVertexId: end.id,
      orientation,
      lengthMeters: distance(start, end),
      vertexIds: ordered.map((vertex) => vertex.id),
      areaIds,
      dividing,
    });
  }
  return walls;
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
  // Every corner on the run moves, including corners shared with other rooms.
  const moving = new Set([
    ...wall.vertexIds,
    ...floor.vertices
      .filter((vertex) => pointOnSegment(vertex, start, end))
      .map((vertex) => vertex.id),
  ]);

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
