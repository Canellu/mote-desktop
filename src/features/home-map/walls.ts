import {
  MAP_EPSILON,
  almostEqual,
  areCollinear,
  distance,
  pointOnSegment,
  samePoint,
} from "./geometry";
import type { MapFloor, MapPoint, MapResult } from "./types";
import { validateMapFloor } from "./validation";

export interface MapWall {
  /** Stable across renders: the run's two extreme corner IDs, sorted. */
  id: string;
  startVertexId: string;
  endVertexId: string;
  orientation: "horizontal" | "vertical" | "angled";
  lengthMeters: number;
  /** Unit direction from start to end, for angled walls. */
  direction: MapPoint;
  /** Unit normal a move follows, pointing right or down. */
  normal: MapPoint;
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
 * The side a positive move pushes a wall towards: right for walls that run
 * mostly up and down, down for walls that run mostly across.
 */
function wallNormal(direction: MapPoint): MapPoint {
  const normal = { x: direction.y, y: -direction.x };
  const flip =
    Math.abs(normal.x) >= Math.abs(normal.y) ? normal.x < 0 : normal.y < 0;
  return flip ? { x: -normal.x, y: -normal.y } : normal;
}

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
      segments.set(id, { startId, endId, areaIds: [area.id] });
    }
  }

  const walls: MapWall[] = [];
  const used = new Set<string>();
  for (const [id, segment] of segments) {
    if (used.has(id)) continue;
    const from = vertices.get(segment.startId)!;
    const to = vertices.get(segment.endId)!;
    const runIds = new Set([segment.startId, segment.endId]);
    const areaIds = [...segment.areaIds];
    let dividing = segment.areaIds.length > 1;
    used.add(id);
    // Grow along the line while another segment continues from an end corner.
    let extended = true;
    while (extended) {
      extended = false;
      for (const [otherId, other] of segments) {
        if (used.has(otherId)) continue;
        // Segments join a run when they continue along the same line.
        if (
          !areCollinear(
            from,
            to,
            vertices.get(other.startId)!,
            vertices.get(other.endId)!,
          )
        )
          continue;
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
    const along = { x: to.x - from.x, y: to.y - from.y };
    const alongLength = Math.hypot(along.x, along.y) || 1;
    const project = (point: MapPoint) =>
      ((point.x - from.x) * along.x + (point.y - from.y) * along.y) /
      alongLength;
    const ordered = [...runIds]
      .map((vertexId) => vertices.get(vertexId)!)
      .sort((a, b) => project(a) - project(b));
    const start = ordered[0];
    const end = ordered[ordered.length - 1];
    const length = distance(start, end) || 1;
    const direction = {
      x: (end.x - start.x) / length,
      y: (end.y - start.y) / length,
    };
    walls.push({
      id: wallId(start.id, end.id),
      startVertexId: start.id,
      endVertexId: end.id,
      orientation: almostEqual(start.x, end.x)
        ? "vertical"
        : almostEqual(start.y, end.y)
          ? "horizontal"
          : "angled",
      lengthMeters: distance(start, end),
      direction,
      normal: wallNormal(direction),
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
        ? {
            ...vertex,
            x: vertex.x + wall.normal.x * deltaMeters,
            y: vertex.y + wall.normal.y * deltaMeters,
          }
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

/**
 * Moves one corner to a new position. Only the walls that meet there follow,
 * which is what dragging a point in a drawing tool means; every room using
 * that corner keeps sharing it.
 */
export function moveCorner(
  floor: MapFloor,
  vertexId: string,
  target: MapPoint,
): MapResult<MapFloor> {
  const initial = validateMapFloor(floor)[0];
  if (initial) return failure(initial.message);
  const corner = floor.vertices.find((vertex) => vertex.id === vertexId);
  if (!corner) return failure("Select a corner on this floor.");
  if (!Number.isFinite(target.x) || !Number.isFinite(target.y))
    return failure("Corner coordinates must be finite numbers.");
  if (samePoint(corner, target)) return { ok: true, value: floor };

  const result: MapFloor = {
    ...floor,
    vertices: floor.vertices.map((vertex) =>
      vertex.id === vertexId
        ? { ...vertex, x: target.x, y: target.y }
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
  if (
    result.vertices.some(
      (vertex) => vertex.id !== vertexId && samePoint(vertex, target),
    )
  )
    return failure("A corner cannot sit on another corner.");

  const moved = new Map(result.vertices.map((vertex) => [vertex.id, vertex]));
  for (const dimension of result.dimensions) {
    const length = distance(
      moved.get(dimension.startVertexId)!,
      moved.get(dimension.endVertexId)!,
    );
    if (almostEqual(length, dimension.lengthMeters)) continue;
    if (dimension.locked)
      return failure(
        `Release the ${dimension.lengthMeters.toFixed(2)} m wall length before moving this corner.`,
      );
    dimension.lengthMeters = length;
    dimension.verified = false;
  }
  const issue = validateMapFloor(result)[0];
  return issue ? failure(issue.message) : { ok: true, value: result };
}

/**
 * Adds a corner on an existing wall. Every room along that wall gains it, so a
 * shared boundary keeps matching on both sides and the new corner can be
 * dragged away to shape either room.
 */
export function insertCorner(
  floor: MapFloor,
  point: MapPoint,
  createId: () => string,
): MapResult<{ floor: MapFloor; vertexId: string }> {
  const initial = validateMapFloor(floor)[0];
  if (initial) return { ok: false, error: initial.message };
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
    return { ok: false, error: "Corner coordinates must be finite numbers." };
  const vertices = new Map(floor.vertices.map((vertex) => [vertex.id, vertex]));
  if (floor.vertices.some((vertex) => samePoint(vertex, point)))
    return { ok: false, error: "There is already a corner here." };

  const id = createId();
  if (!id.trim() || floor.vertices.some((vertex) => vertex.id === id))
    return { ok: false, error: "Could not assign a unique ID to the corner." };

  let touched = false;
  const areas = floor.areas.map((area) => {
    const vertexIds: string[] = [];
    for (let index = 0; index < area.vertexIds.length; index++) {
      const start = vertices.get(area.vertexIds[index]);
      const end = vertices.get(
        area.vertexIds[(index + 1) % area.vertexIds.length],
      );
      vertexIds.push(area.vertexIds[index]);
      if (!start || !end) continue;
      if (samePoint(start, point) || samePoint(end, point)) continue;
      if (!pointOnSegment(point, start, end)) continue;
      vertexIds.push(id);
      touched = true;
    }
    return { ...area, vertexIds };
  });
  if (!touched) return { ok: false, error: "Click on a wall to add a corner." };

  const result: MapFloor = {
    ...floor,
    vertices: [...floor.vertices, { id, x: point.x, y: point.y }],
    areas,
    dimensions: floor.dimensions.map((dimension) => ({ ...dimension })),
    lights: floor.lights.map((light) => ({ ...light })),
  };
  const issue = validateMapFloor(result)[0];
  return issue
    ? { ok: false, error: issue.message }
    : { ok: true, value: { floor: result, vertexId: id } };
}

function rebuildRings(
  floor: MapFloor,
  rewrite: (vertexIds: string[]) => string[],
): MapFloor {
  return {
    ...floor,
    areas: floor.areas.map((area) => {
      const next = rewrite([...area.vertexIds]);
      // A ring must not repeat a corner in a row after an edit.
      const deduped = next.filter(
        (id, index) => id !== next[(index + 1) % next.length],
      );
      return {
        ...area,
        vertexIds: deduped,
        target: area.target ? { ...area.target } : null,
      };
    }),
    dimensions: floor.dimensions.map((dimension) => ({ ...dimension })),
    lights: floor.lights.map((light) => ({ ...light })),
  };
}

/** Removes a corner from every room that uses it. */
export function removeCorner(
  floor: MapFloor,
  vertexId: string,
): MapResult<MapFloor> {
  const initial = validateMapFloor(floor)[0];
  if (initial) return failure(initial.message);
  if (!floor.vertices.some((vertex) => vertex.id === vertexId))
    return failure("Select a corner on this floor.");
  if (
    floor.areas.some(
      (area) => area.vertexIds.includes(vertexId) && area.vertexIds.length <= 3,
    )
  )
    return failure("A room needs at least three corners.");
  if (
    floor.dimensions.some(
      (dimension) =>
        dimension.locked &&
        (dimension.startVertexId === vertexId ||
          dimension.endVertexId === vertexId),
    )
  )
    return failure("Release this wall's kept length before removing a corner.");

  const result = rebuildRings(floor, (ids) =>
    ids.filter((id) => id !== vertexId),
  );
  result.vertices = floor.vertices
    .filter((vertex) => vertex.id !== vertexId)
    .map((vertex) => ({ ...vertex }));
  result.dimensions = result.dimensions.filter(
    (dimension) =>
      dimension.startVertexId !== vertexId &&
      dimension.endVertexId !== vertexId,
  );
  const issue = validateMapFloor(result)[0];
  return issue ? failure(issue.message) : { ok: true, value: result };
}

/**
 * Welds one corner onto another, so two points become a single shared corner.
 * The surviving corner keeps its position.
 */
export function mergeCorners(
  floor: MapFloor,
  fromVertexId: string,
  intoVertexId: string,
): MapResult<MapFloor> {
  const initial = validateMapFloor(floor)[0];
  if (initial) return failure(initial.message);
  if (fromVertexId === intoVertexId)
    return failure("Choose two different corners to merge.");
  const from = floor.vertices.find((vertex) => vertex.id === fromVertexId);
  const into = floor.vertices.find((vertex) => vertex.id === intoVertexId);
  if (!from || !into) return failure("Select two corners on this floor.");
  if (
    floor.areas.some(
      (area) =>
        area.vertexIds.includes(fromVertexId) &&
        area.vertexIds.includes(intoVertexId) &&
        area.vertexIds.length <= 3,
    )
  )
    return failure("Merging these corners would leave a room with no shape.");
  if (
    floor.dimensions.some(
      (dimension) =>
        dimension.locked &&
        (dimension.startVertexId === fromVertexId ||
          dimension.endVertexId === fromVertexId),
    )
  )
    return failure("Release this wall's kept length before merging corners.");

  const result = rebuildRings(floor, (ids) =>
    ids.map((id) => (id === fromVertexId ? intoVertexId : id)),
  );
  result.vertices = floor.vertices
    .filter((vertex) => vertex.id !== fromVertexId)
    .map((vertex) => ({ ...vertex }));
  result.dimensions = result.dimensions
    .map((dimension) => ({
      ...dimension,
      startVertexId:
        dimension.startVertexId === fromVertexId
          ? intoVertexId
          : dimension.startVertexId,
      endVertexId:
        dimension.endVertexId === fromVertexId
          ? intoVertexId
          : dimension.endVertexId,
    }))
    .filter((dimension) => dimension.startVertexId !== dimension.endVertexId);
  const moved = new Map(result.vertices.map((vertex) => [vertex.id, vertex]));
  for (const dimension of result.dimensions)
    dimension.lengthMeters = distance(
      moved.get(dimension.startVertexId)!,
      moved.get(dimension.endVertexId)!,
    );
  const issue = validateMapFloor(result)[0];
  return issue ? failure(issue.message) : { ok: true, value: result };
}

/** The nearest other corner, used to offer a merge without dragging. */
export function nearestCorner(
  floor: MapFloor,
  vertexId: string,
): { vertexId: string; distanceMeters: number } | null {
  const corner = floor.vertices.find((vertex) => vertex.id === vertexId);
  if (!corner) return null;
  let best: { vertexId: string; distanceMeters: number } | null = null;
  for (const other of floor.vertices) {
    if (other.id === vertexId) continue;
    const gap = distance(corner, other);
    if (!best || gap < best.distanceMeters)
      best = { vertexId: other.id, distanceMeters: gap };
  }
  return best;
}
