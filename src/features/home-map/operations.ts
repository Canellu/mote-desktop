import {
  MAP_EPSILON,
  MIN_WALL_METERS,
  almostEqual,
  distance,
  isOrthogonalEdge,
  locatePoint,
  pointOnSegment,
  samePoint,
  segmentsIntersect,
  signedArea,
  validateRing,
} from "./geometry";
import type {
  MapArea,
  MapControlTarget,
  MapFloor,
  MapPoint,
  MapResult,
  MapVertex,
} from "./types";
import { hasBoundarySpan, validateMapFloor } from "./validation";

const failure = (error: string): MapResult<MapFloor> => ({ ok: false, error });

function checked(floor: MapFloor): MapResult<MapFloor> {
  const issue = validateMapFloor(floor)[0];
  return issue ? failure(issue.message) : { ok: true, value: floor };
}

function copyFloor(floor: MapFloor): MapFloor {
  return {
    ...floor,
    vertices: floor.vertices.map((vertex) => ({ ...vertex })),
    areas: floor.areas.map((area) => ({
      ...area,
      vertexIds: [...area.vertexIds],
      target: area.target ? { ...area.target } : null,
    })),
    dimensions: floor.dimensions.map((dimension) => ({ ...dimension })),
    lights: floor.lights.map((light) => ({ ...light })),
  };
}

/** Orthogonal intersections contain either one point or an overlapping interval. */
function intersectionPoints(
  a: MapPoint,
  b: MapPoint,
  c: MapPoint,
  d: MapPoint,
): MapPoint[] {
  if (!segmentsIntersect(a, b, c, d)) return [];
  const endpoints = [a, b, c, d].filter(
    (point) => pointOnSegment(point, a, b) && pointOnSegment(point, c, d),
  );
  if (endpoints.length)
    return endpoints.filter(
      (point, index) =>
        !endpoints.slice(0, index).some((other) => samePoint(point, other)),
    );
  return almostEqual(a.x, b.x) ? [{ x: a.x, y: c.y }] : [{ x: c.x, y: a.y }];
}

function dividerError(divider: MapPoint[], ring: MapPoint[]): string | null {
  if (divider.length < 2) return "Draw a divider from one wall to another.";
  if (
    divider.some(
      (point) => !Number.isFinite(point.x) || !Number.isFinite(point.y),
    )
  )
    return "Divider coordinates must be finite numbers.";
  const start = divider[0];
  const end = divider[divider.length - 1];
  if (samePoint(start, end))
    return "A divider must finish on a different wall position.";
  if (
    locatePoint(start, ring) !== "boundary" ||
    locatePoint(end, ring) !== "boundary"
  )
    return "Start and finish the divider on the selected room's walls.";
  if (
    divider.slice(1, -1).some((point) => locatePoint(point, ring) !== "inside")
  )
    return "Keep divider corners inside the selected room.";

  for (let i = 0; i < divider.length - 1; i++) {
    const a = divider[i];
    const b = divider[i + 1];
    if (!isOrthogonalEdge(a, b))
      return "Divider lines must be horizontal or vertical.";
    if (distance(a, b) < MIN_WALL_METERS - MAP_EPSILON)
      return "A divider segment must be at least one centimeter long.";
    if (
      locatePoint({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, ring) !== "inside"
    )
      return "Keep the divider inside the selected room and away from existing walls.";
    for (let j = i + 1; j < divider.length - 1; j++) {
      const intersections = intersectionPoints(
        a,
        b,
        divider[j],
        divider[j + 1],
      );
      if (
        intersections.length &&
        !(
          j === i + 1 &&
          intersections.length === 1 &&
          samePoint(intersections[0], b)
        )
      )
        return "Divider lines cannot cross, touch, or double back on themselves.";
    }
    for (let j = 0; j < ring.length; j++) {
      const intersections = intersectionPoints(
        a,
        b,
        ring[j],
        ring[(j + 1) % ring.length],
      );
      if (
        intersections.length > 1 ||
        intersections.some(
          (point) =>
            !(
              (i === 0 && samePoint(point, start)) ||
              (i === divider.length - 2 && samePoint(point, end))
            ),
        )
      )
        return "A divider may touch existing walls only at its start and finish.";
    }
  }
  return null;
}

function insertWallVertices(
  area: MapArea,
  nodes: MapVertex[],
  vertices: Map<string, MapVertex>,
): MapArea {
  return {
    ...area,
    vertexIds: area.vertexIds.flatMap((id, index) => {
      const a = vertices.get(id)!;
      const b = vertices.get(
        area.vertexIds[(index + 1) % area.vertexIds.length],
      )!;
      return [
        id,
        ...nodes
          .filter(
            (node) =>
              !samePoint(node, a) &&
              !samePoint(node, b) &&
              pointOnSegment(node, a, b),
          )
          .sort((left, right) => distance(a, left) - distance(a, right))
          .map((node) => node.id),
      ];
    }),
  };
}

function boundaryPath(ring: string[], start: string, end: string): string[] {
  const path = [start];
  let index = ring.indexOf(start);
  while (ring[index] !== end) {
    index = (index + 1) % ring.length;
    path.push(ring[index]);
  }
  return path;
}

/** Splits geometry with shared controls; this operation never changes Hue membership. */
export function splitMapArea(
  floor: MapFloor,
  areaId: string,
  divider: MapPoint[],
  newArea: { id: string; name: string },
  createVertexId: () => string,
): MapResult<MapFloor> {
  const input = checked(floor);
  if (!input.ok) return input;
  const area = floor.areas.find((candidate) => candidate.id === areaId);
  if (!area) return failure("Choose a room to divide.");
  if (
    !newArea.id.trim() ||
    floor.areas.some((candidate) => candidate.id === newArea.id)
  )
    return failure("The new room needs a unique ID.");
  if (!newArea.name.trim())
    return failure("Name the new room before dividing.");
  const vertexMap = new Map(
    floor.vertices.map((vertex) => [vertex.id, vertex]),
  );
  const error = dividerError(
    divider,
    area.vertexIds.map((id) => vertexMap.get(id)!),
  );
  if (error) return failure(error);

  const result = copyFloor(floor);
  const nodes: MapVertex[] = [];
  for (const point of divider) {
    let node = result.vertices.find((vertex) => samePoint(vertex, point));
    if (!node) {
      const id = createVertexId();
      if (!id.trim() || result.vertices.some((vertex) => vertex.id === id))
        return failure("Could not assign a unique ID to a divider corner.");
      node = { id, x: point.x, y: point.y };
      result.vertices.push(node);
    }
    nodes.push(node);
  }
  const allVertices = new Map(
    result.vertices.map((vertex) => [vertex.id, vertex]),
  );
  // Shared-wall endpoints must also become vertices of every neighboring room.
  result.areas = result.areas.map((candidate) =>
    insertWallVertices(
      candidate,
      [nodes[0], nodes[nodes.length - 1]],
      allVertices,
    ),
  );
  const nodedArea = result.areas.find((candidate) => candidate.id === areaId)!;
  const start = nodes[0].id;
  const end = nodes[nodes.length - 1].id;
  const interiorIds = nodes.slice(1, -1).map((node) => node.id);
  const firstRing = [
    ...boundaryPath(nodedArea.vertexIds, start, end),
    ...[...interiorIds].reverse(),
  ];
  const secondRing = [
    ...boundaryPath(nodedArea.vertexIds, end, start),
    ...interiorIds,
  ];
  nodedArea.vertexIds = firstRing;
  result.areas.push({
    id: newArea.id,
    name: newArea.name,
    vertexIds: secondRing,
    target: area.target ? { ...area.target } : null,
  });
  // Reuse old divider nodes retained by a previous combine when this line crosses them.
  result.areas = result.areas.map((candidate) =>
    insertWallVertices(candidate, result.vertices, allVertices),
  );
  return checked(result);
}

/** The caller supplies the combined Hue target explicitly, including no target. */
export function combineMapAreas(
  floor: MapFloor,
  areaIds: string[],
  combined: { id: string; name: string; target: MapControlTarget | null },
): MapResult<MapFloor> {
  const input = checked(floor);
  if (!input.ok) return input;
  const selected = new Set(areaIds);
  if (selected.size < 2 || selected.size !== areaIds.length)
    return failure("Select at least two different adjoining rooms to combine.");
  if (areaIds.some((id) => !floor.areas.some((area) => area.id === id)))
    return failure("One of the selected rooms no longer exists.");
  if (
    !combined.id.trim() ||
    floor.areas.some(
      (area) => !selected.has(area.id) && area.id === combined.id,
    )
  )
    return failure("The combined room needs a unique ID.");
  if (!combined.name.trim()) return failure("Name the combined room.");

  const vertices = new Map(floor.vertices.map((vertex) => [vertex.id, vertex]));
  const edges = new Map<
    string,
    { start: string; end: string; areaId: string }
  >();
  const neighbors = new Map(areaIds.map((id) => [id, new Set<string>()]));
  for (const area of floor.areas.filter((candidate) =>
    selected.has(candidate.id),
  )) {
    const ring =
      signedArea(area.vertexIds.map((id) => vertices.get(id)!)) < 0
        ? [...area.vertexIds].reverse()
        : area.vertexIds;
    for (let index = 0; index < ring.length; index++) {
      const start = ring[index];
      const end = ring[(index + 1) % ring.length];
      const key = JSON.stringify([start, end].sort());
      const existing = edges.get(key);
      if (existing) {
        if (existing.start !== end || existing.end !== start)
          return failure("The selected rooms have conflicting walls.");
        neighbors.get(area.id)!.add(existing.areaId);
        neighbors.get(existing.areaId)!.add(area.id);
        edges.delete(key);
      } else edges.set(key, { start, end, areaId: area.id });
    }
  }

  const connected = new Set<string>();
  const pending = [areaIds[0]];
  while (pending.length) {
    const id = pending.pop()!;
    if (connected.has(id)) continue;
    connected.add(id);
    pending.push(...neighbors.get(id)!);
  }
  if (connected.size !== selected.size)
    return failure("Only rooms joined by a shared wall can be combined.");

  const next = new Map<string, string>();
  const previous = new Set<string>();
  for (const edge of edges.values()) {
    if (next.has(edge.start) || previous.has(edge.end))
      return failure(
        "Combining these rooms would create walls that touch themselves.",
      );
    next.set(edge.start, edge.end);
    previous.add(edge.end);
  }
  const start = next.keys().next().value;
  if (!start) return failure("The combined room needs an outside boundary.");
  const ring = [start];
  let current = next.get(start);
  while (current && current !== start && !ring.includes(current)) {
    ring.push(current);
    current = next.get(current);
  }
  if (current !== start || ring.length !== edges.size)
    return failure(
      "Combining these rooms would leave a hole or disconnected boundary.",
    );

  const result = copyFloor(floor);
  const firstSelectedIndex = result.areas.findIndex((area) =>
    selected.has(area.id),
  );
  result.areas = result.areas.filter((area) => !selected.has(area.id));
  result.areas.splice(firstSelectedIndex, 0, {
    ...combined,
    target: combined.target ? { ...combined.target } : null,
    vertexIds: ring,
  });
  const removedDimensions = result.dimensions.filter(
    (dimension) =>
      !hasBoundarySpan(
        result,
        vertices.get(dimension.startVertexId)!,
        vertices.get(dimension.endVertexId)!,
      ),
  );
  if (removedDimensions.some((dimension) => dimension.locked))
    return failure(
      "Release locked dimensions on the dividing wall before combining these rooms.",
    );
  const removedIds = new Set(
    removedDimensions.map((dimension) => dimension.id),
  );
  result.dimensions = result.dimensions.filter(
    (dimension) => !removedIds.has(dimension.id),
  );
  const referencedVertices = new Set([
    ...result.areas.flatMap((area) => area.vertexIds),
    ...result.dimensions.flatMap((dimension) => [
      dimension.startVertexId,
      dimension.endVertexId,
    ]),
  ]);
  result.vertices = result.vertices.filter((vertex) =>
    referencedVertices.has(vertex.id),
  );
  return checked(result);
}

/**
 * Adds a drawn outline as a new room. Corners that land on an existing corner
 * reuse it, and both sides of a touching wall gain every corner along it, so a
 * room drawn against a neighbour shares that boundary instead of overlapping.
 */
export function addOutlineArea(
  floor: MapFloor,
  ring: MapPoint[],
  area: { id: string; name: string; target?: MapControlTarget | null },
  createVertexId: () => string,
): MapResult<MapFloor> {
  const input = checked(floor);
  if (!input.ok) return input;
  const ringError = validateRing(ring);
  if (ringError) return failure(ringError);
  if (!area.id.trim() || floor.areas.some((entry) => entry.id === area.id))
    return failure("The new room needs a unique ID.");
  if (!area.name.trim()) return failure("Name the new room.");

  const result = copyFloor(floor);
  const corners: MapVertex[] = [];
  for (const point of ring) {
    let vertex = result.vertices.find((entry) => samePoint(entry, point));
    if (!vertex) {
      const id = createVertexId();
      if (!id.trim() || result.vertices.some((entry) => entry.id === id))
        return failure("Could not assign a unique ID to a drawn corner.");
      vertex = { id, x: point.x, y: point.y };
      result.vertices.push(vertex);
    }
    corners.push(vertex);
  }
  const vertices = new Map(result.vertices.map((entry) => [entry.id, entry]));
  const drawn: MapArea = {
    id: area.id,
    name: area.name.trim(),
    vertexIds: corners.map((corner) => corner.id),
    target: area.target ? { ...area.target } : null,
  };
  // Neighbouring corners must appear on the drawn room's walls, and the drawn
  // room's corners on theirs, before the floor is valid.
  result.areas = [
    ...result.areas.map((candidate) =>
      insertWallVertices(candidate, corners, vertices),
    ),
    insertWallVertices(drawn, result.vertices, vertices),
  ];
  return checked(result);
}

/** Map names are the user's own labels; Hue names are never changed here. */
export function renameMapArea(
  floor: MapFloor,
  areaId: string,
  name: string,
): MapResult<MapFloor> {
  const input = checked(floor);
  if (!input.ok) return input;
  if (!floor.areas.some((area) => area.id === areaId))
    return failure("Choose a room to rename.");
  if (!name.trim()) return failure("Rooms need a name.");
  if (name.length > 200)
    return failure("A room name can be at most 200 characters.");
  const result = copyFloor(floor);
  const area = result.areas.find((candidate) => candidate.id === areaId)!;
  area.name = name.trim();
  return checked(result);
}

/**
 * Points a mapped area at an existing Hue room or zone, or clears the link.
 * Creating Hue resources is a separate, explicitly reviewed operation.
 */
export function setMapAreaTarget(
  floor: MapFloor,
  areaId: string,
  target: MapControlTarget | null,
): MapResult<MapFloor> {
  const input = checked(floor);
  if (!input.ok) return input;
  if (!floor.areas.some((area) => area.id === areaId))
    return failure("Choose a room to link.");
  const result = copyFloor(floor);
  const area = result.areas.find((candidate) => candidate.id === areaId)!;
  area.target = target ? { ...target } : null;
  const issue = validateMapFloor(result)[0];
  // The validator rejects anything that is not a Hue v2 reference.
  return issue
    ? failure("Choose an existing Hue room or zone.")
    : { ok: true, value: result };
}

/** Removing an area keeps its lights and every Hue resource untouched. */
export function removeMapArea(
  floor: MapFloor,
  areaId: string,
): MapResult<MapFloor> {
  const input = checked(floor);
  if (!input.ok) return input;
  if (!floor.areas.some((area) => area.id === areaId))
    return failure("Choose a room to remove.");
  if (floor.areas.length === 1)
    return failure("A floor keeps at least one room.");
  const result = copyFloor(floor);
  result.areas = result.areas.filter((area) => area.id !== areaId);
  const referenced = new Set(result.areas.flatMap((area) => area.vertexIds));
  const removedDimensions = result.dimensions.filter(
    (dimension) =>
      !referenced.has(dimension.startVertexId) ||
      !referenced.has(dimension.endVertexId),
  );
  if (removedDimensions.some((dimension) => dimension.locked))
    return failure(
      "Release locked wall lengths on this room before removing it.",
    );
  const removedIds = new Set(removedDimensions.map((entry) => entry.id));
  result.dimensions = result.dimensions.filter(
    (dimension) => !removedIds.has(dimension.id),
  );
  result.vertices = result.vertices.filter((vertex) =>
    referenced.has(vertex.id),
  );
  return checked(result);
}
