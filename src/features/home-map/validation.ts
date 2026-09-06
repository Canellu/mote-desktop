import {
  almostEqual,
  distance,
  isOrthogonalEdge,
  pointOnSegment,
  ringsOverlap,
  samePoint,
  validateRing,
  MAP_EPSILON,
} from "./geometry";
import {
  HOME_MAP_SCHEMA_VERSION,
  type HomeMapDocument,
  type MapFloor,
  type MapPoint,
  type MapValidationIssue,
} from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max = 200): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;
const coordinate = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  Math.abs(value) <= 10_000;
const uuid = (value: unknown): boolean =>
  typeof value === "string" &&
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
const list = (value: unknown, max: number): value is unknown[] =>
  Array.isArray(value) && value.length <= max;

/** A dimension may span multiple noded segments of the same straight wall. */
export function hasBoundarySpan(
  floor: MapFloor,
  a: MapPoint,
  b: MapPoint,
): boolean {
  if (!isOrthogonalEdge(a, b)) return false;
  const vertices = new Map(floor.vertices.map((vertex) => [vertex.id, vertex]));
  const vertical = almostEqual(a.x, b.x);
  const axis = (point: MapPoint) => (vertical ? point.y : point.x);
  const fixed = (point: MapPoint) => (vertical ? point.x : point.y);
  const intervals: [number, number][] = [];
  for (const area of floor.areas) {
    for (let i = 0; i < area.vertexIds.length; i++) {
      const p = vertices.get(area.vertexIds[i]);
      const q = vertices.get(area.vertexIds[(i + 1) % area.vertexIds.length]);
      if (
        p &&
        q &&
        almostEqual(fixed(p), fixed(a)) &&
        almostEqual(fixed(q), fixed(a))
      )
        intervals.push([
          Math.min(axis(p), axis(q)),
          Math.max(axis(p), axis(q)),
        ]);
    }
  }
  intervals.sort((x, y) => x[0] - y[0]);
  let covered = Math.min(axis(a), axis(b));
  const end = Math.max(axis(a), axis(b));
  for (const [start, stop] of intervals) {
    if (stop < covered - MAP_EPSILON) continue;
    if (start > covered + MAP_EPSILON) return false;
    covered = Math.max(covered, stop);
    if (covered >= end - MAP_EPSILON) return true;
  }
  return false;
}

/** Checks unknown disk data before any editor or renderer can consume it. */
export function validateMapFloor(value: unknown): MapValidationIssue[] {
  const issues: MapValidationIssue[] = [];
  const issue = (path: string, message: string) =>
    issues.push({ path, message });
  if (!isRecord(value))
    return [{ path: "", message: "Floor must be an object." }];
  if (!text(value.id, 128)) issue("id", "Floor needs an ID.");
  if (!text(value.name))
    issue("name", "Floor needs a name of at most 200 characters.");
  for (const [key, max] of [
    ["vertices", 1024],
    ["areas", 128],
    ["dimensions", 1024],
    ["lights", 1024],
  ] as const)
    if (!list(value[key], max))
      issue(key, `Expected a list with at most ${max} entries.`);
  if (issues.length) return issues;

  const vertices = value.vertices as unknown[];
  const areas = value.areas as unknown[];
  const dimensions = value.dimensions as unknown[];
  const lights = value.lights as unknown[];
  vertices.forEach((v, i) => {
    if (
      !isRecord(v) ||
      !text(v.id, 128) ||
      !coordinate(v.x) ||
      !coordinate(v.y)
    )
      issue(
        `vertices[${i}]`,
        "Vertex needs an ID and finite coordinates within 10,000 meters.",
      );
  });
  areas.forEach((area, i) => {
    if (!isRecord(area)) {
      issue(`areas[${i}]`, "Area must be an object.");
      return;
    }
    if (!text(area.id, 128) || !text(area.name))
      issue(`areas[${i}]`, "Area needs an ID and name.");
    if (
      !list(area.vertexIds, 1024) ||
      area.vertexIds.some((id) => !text(id, 128))
    )
      issue(`areas[${i}].vertexIds`, "Area needs a list of vertex IDs.");
    if (
      area.target !== null &&
      (!isRecord(area.target) ||
        (area.target.resourceType !== "room" &&
          area.target.resourceType !== "zone") ||
        !uuid(area.target.resourceId))
    )
      issue(
        `areas[${i}].target`,
        "Target must be a Hue v2 room/zone reference or null.",
      );
  });
  dimensions.forEach((dim, i) => {
    if (
      !isRecord(dim) ||
      !text(dim.id, 128) ||
      !text(dim.startVertexId, 128) ||
      !text(dim.endVertexId, 128) ||
      typeof dim.lengthMeters !== "number" ||
      !Number.isFinite(dim.lengthMeters) ||
      dim.lengthMeters <= 0 ||
      typeof dim.locked !== "boolean" ||
      typeof dim.verified !== "boolean"
    )
      issue(
        `dimensions[${i}]`,
        "Dimension needs endpoints, positive length, and explicit lock/verification states.",
      );
  });
  lights.forEach((light, i) => {
    if (
      !isRecord(light) ||
      !uuid(light.lightId) ||
      !coordinate(light.x) ||
      !coordinate(light.y)
    )
      issue(
        `lights[${i}]`,
        "Light placement needs a Hue v2 ID and finite coordinates.",
      );
  });
  if (issues.length) return issues;

  const floor = value as unknown as MapFloor;
  for (const key of ["vertices", "areas", "dimensions"] as const) {
    const ids = floor[key].map((item) => item.id);
    if (new Set(ids).size !== ids.length)
      issue(key, "IDs must be unique within a floor.");
  }
  const byId = new Map(floor.vertices.map((vertex) => [vertex.id, vertex]));
  const rings: MapPoint[][] = [];
  floor.areas.forEach((area, index) => {
    if (area.vertexIds.some((id) => !byId.has(id))) {
      issue(`areas[${index}].vertexIds`, "Area references a missing vertex.");
      return;
    }
    const ring = area.vertexIds.map((id) => byId.get(id)!);
    const error = validateRing(ring);
    if (error) issue(`areas[${index}].vertexIds`, error);
    rings.push(ring);
  });
  if (issues.length) return issues;

  for (let i = 0; i < floor.vertices.length; i++) {
    if (
      floor.vertices.slice(i + 1).some((v) => samePoint(v, floor.vertices[i]))
    )
      issue(`vertices[${i}]`, "Coincident corners must share one vertex ID.");
  }
  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i];
    for (let j = 0; j < ring.length; j++) {
      const a = ring[j];
      const b = ring[(j + 1) % ring.length];
      if (
        floor.vertices.some(
          (v) =>
            !samePoint(v, a) && !samePoint(v, b) && pointOnSegment(v, a, b),
        )
      )
        issue(
          `areas[${i}].vertexIds`,
          "Shared walls must include every corner along their boundary.",
        );
    }
    for (let j = i + 1; j < rings.length; j++)
      if (ringsOverlap(ring, rings[j]))
        issue(`areas[${j}]`, "Rooms cannot overlap.");
  }
  floor.dimensions.forEach((dim, index) => {
    const a = byId.get(dim.startVertexId);
    const b = byId.get(dim.endVertexId);
    if (!a || !b || !hasBoundarySpan(floor, a, b))
      issue(
        `dimensions[${index}]`,
        "Dimension must reference a continuous straight wall.",
      );
    else if (!almostEqual(distance(a, b), dim.lengthMeters))
      issue(
        `dimensions[${index}].lengthMeters`,
        "Dimension length must match its wall.",
      );
  });
  if (
    new Set(floor.lights.map((light) => light.lightId)).size !==
    floor.lights.length
  )
    issue("lights", "A light can have only one placement.");
  return issues;
}

export function validateHomeMap(value: unknown): MapValidationIssue[] {
  if (!isRecord(value))
    return [{ path: "", message: "Map must be an object." }];
  const issues: MapValidationIssue[] = [];
  const issue = (path: string, message: string) =>
    issues.push({ path, message });
  if (value.schemaVersion !== HOME_MAP_SCHEMA_VERSION)
    issue(
      "schemaVersion",
      "Unsupported Home Map version. Keep the original file.",
    );
  for (const key of ["id", "bridgeId"] as const)
    if (!text(value[key], 128)) issue(key, "Map and bridge IDs are required.");
  if (!text(value.name))
    issue("name", "Map needs a name of at most 200 characters.");
  if (value.drawingMode !== "sketch" && value.drawingMode !== "measured")
    issue("drawingMode", "Choose sketch or measured drawing.");
  if (value.units !== "metric" && value.units !== "imperial")
    issue("units", "Choose metric or imperial units.");
  if (!list(value.floors, 32) || value.floors.length === 0)
    issue("floors", "Map needs between one and 32 floors.");
  if (issues.length) return issues;
  const map = value as unknown as HomeMapDocument;
  map.floors.forEach((floor, i) =>
    validateMapFloor(floor).forEach((entry) =>
      issue(`floors[${i}]${entry.path ? `.${entry.path}` : ""}`, entry.message),
    ),
  );
  if (issues.length) return issues;
  if (new Set(map.floors.map((floor) => floor.id)).size !== map.floors.length)
    issue("floors", "Floor IDs must be unique.");
  const lights = map.floors.flatMap((floor) =>
    floor.lights.map((light) => light.lightId),
  );
  if (new Set(lights).size !== lights.length)
    issue("floors", "A light can appear on only one floor.");
  return issues;
}
