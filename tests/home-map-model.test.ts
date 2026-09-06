import { expect, test } from "bun:test";
import {
  locatePoint,
  ringsOverlap,
  signedArea,
  validateRing,
} from "../src/features/home-map/geometry";
import {
  calibrateFloor,
  convertLength,
  setWallLength,
} from "../src/features/home-map/measurements";
import type {
  HomeMapDocument,
  MapFloor,
  MapPoint,
} from "../src/features/home-map/types";
import {
  validateHomeMap,
  validateMapFloor,
} from "../src/features/home-map/validation";

const rectangle = (x = 0, y = 0, w = 4, h = 3): MapPoint[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
const lightId = "00000000-0000-0000-0000-000000000001";
const floor = (): MapFloor => ({
  id: "ground",
  name: "Ground floor",
  vertices: rectangle().map((point, i) => ({ ...point, id: `v${i}` })),
  areas: [
    {
      id: "living",
      name: "Living",
      vertexIds: ["v0", "v1", "v2", "v3"],
      target: null,
    },
  ],
  dimensions: [
    {
      id: "width",
      startVertexId: "v0",
      endVertexId: "v1",
      lengthMeters: 4,
      locked: false,
      verified: false,
    },
  ],
  lights: [{ lightId, x: 1, y: 1 }],
});
const document = (): HomeMapDocument => ({
  schemaVersion: 1,
  id: "home",
  bridgeId: "bridge-a",
  name: "Home",
  drawingMode: "sketch",
  units: "metric",
  floors: [floor()],
});

test("accepts rectangles, collinear shared corners, and concave orthogonal rooms", () => {
  const l = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 2 },
    { x: 2, y: 2 },
    { x: 2, y: 4 },
    { x: 0, y: 4 },
  ];
  expect(validateRing(l)).toBeNull();
  expect(signedArea(l)).toBe(12);
  expect(locatePoint({ x: 3, y: 3 }, l)).toBe("outside");
  expect(locatePoint({ x: 1, y: 3 }, l)).toBe("inside");
  expect(locatePoint({ x: 2, y: 3 }, l)).toBe("boundary");
  expect(
    validateRing([
      ...rectangle().slice(0, 1),
      { x: 2, y: 0 },
      ...rectangle().slice(1),
    ]),
  ).toBeNull();
  expect(validateHomeMap(document())).toEqual([]);
});

test("rejects repeated corners, diagonal walls, tiny slivers, and crossed rings", () => {
  expect(validateRing([...rectangle(), { x: 0, y: 0 }])).not.toBeNull();
  expect(
    validateRing([
      { x: 0, y: 0 },
      { x: 4, y: 1 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ]),
  ).not.toBeNull();
  expect(validateRing(rectangle(0, 0, 0.001, 3))).not.toBeNull();
  expect(
    validateRing([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 2, y: 4 },
      { x: 2, y: -1 },
      { x: 0, y: -1 },
    ]),
  ).not.toBeNull();
});

test("overlap detection distinguishes shared walls from containment and boundary-only vertex overlap", () => {
  expect(ringsOverlap(rectangle(), rectangle(4, 0))).toBe(false);
  expect(ringsOverlap(rectangle(), rectangle())).toBe(true);
  expect(ringsOverlap(rectangle(), rectangle(1, 1, 1, 1))).toBe(true);
  expect(ringsOverlap(rectangle(), rectangle(2, 0))).toBe(true);
  expect(ringsOverlap(rectangle(), rectangle(1, -1, 1, 5))).toBe(true);
});

test("validates unknown storage data, schema versions, UUID references and map-wide placement uniqueness", () => {
  for (const value of [null, [], {}, { ...document(), schemaVersion: 2 }])
    expect(validateHomeMap(value).length).toBeGreaterThan(0);
  const malformed = document();
  const malformedValue = JSON.parse(JSON.stringify(malformed));
  malformedValue.floors[0].areas[0].target = {
    resourceType: ["room"],
    resourceId: lightId,
  };
  expect(validateHomeMap(malformedValue).length).toBeGreaterThan(0);
  const map = document();
  map.floors[0].areas[0].target = {
    resourceType: "room",
    resourceId: "v1-room-7",
  };
  expect(
    validateHomeMap(map).some((issue) => issue.path.endsWith("target")),
  ).toBe(true);
  map.floors[0].areas[0].target = { resourceType: "zone", resourceId: lightId };
  map.floors.push({ ...floor(), id: "upstairs" });
  expect(
    validateHomeMap(map).some((issue) => issue.message.includes("one floor")),
  ).toBe(true);
  map.floors.pop();
  map.floors[0].vertices[0].x = Infinity;
  expect(validateHomeMap(map).length).toBeGreaterThan(0);
});

test("rejects missing/shared duplicate corners and un-noded T junctions", () => {
  const value = floor();
  value.areas[0].vertexIds[0] = "missing";
  expect(validateMapFloor(value)[0].message).toContain("missing");
  value.areas[0].vertexIds[0] = "v0";
  value.vertices.push({ id: "junction", x: 2, y: 0 });
  expect(
    validateMapFloor(value).some((issue) =>
      issue.message.includes("every corner"),
    ),
  ).toBe(true);
  value.areas[0].vertexIds.splice(1, 0, "junction");
  expect(validateMapFloor(value)).toEqual([]);
  value.vertices.push({ id: "duplicate", x: 2, y: 0 });
  expect(
    validateMapFloor(value).some((issue) =>
      issue.message.includes("Coincident"),
    ),
  ).toBe(true);
});

test("dimensions span noded straight walls and must match actual geometry", () => {
  const value = floor();
  value.vertices.push({ id: "middle", x: 2, y: 0 });
  value.areas[0].vertexIds.splice(1, 0, "middle");
  expect(validateMapFloor(value)).toEqual([]);
  value.dimensions[0].lengthMeters = 5;
  expect(validateMapFloor(value)[0].message).toContain("match");
  value.dimensions[0].endVertexId = "v2";
  expect(validateMapFloor(value)[0].message).toContain("straight wall");
});

test("measured width edits preserve orthogonality and source data", () => {
  const before = floor();
  const result = setWallLength(before, "width", 6);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.value.vertices.map(({ x, y }) => ({ x, y }))).toEqual(
    rectangle(0, 0, 6, 3),
  );
  expect(result.value.dimensions[0]).toMatchObject({
    lengthMeters: 6,
    locked: true,
  });
  expect(result.value.lights).toEqual(before.lights);
  expect(before).toEqual(floor());
  expect(validateMapFloor(result.value)).toEqual([]);
});

test("changing a shared wall updates both rooms and refuses a conflicting locked dimension", () => {
  const before = floor();
  before.vertices.push({ id: "v4", x: 8, y: 0 }, { id: "v5", x: 8, y: 3 });
  before.areas.push({
    id: "kitchen",
    name: "Kitchen",
    vertexIds: ["v1", "v4", "v5", "v2"],
    target: null,
  });
  before.dimensions.push({
    id: "kitchen-width",
    startVertexId: "v1",
    endVertexId: "v4",
    lengthMeters: 4,
    locked: true,
    verified: true,
  });
  expect(setWallLength(before, "width", 6)).toEqual({
    ok: false,
    error: "Release dimension kitchen-width before changing this wall.",
  });
  before.dimensions[1].locked = false;
  const result = setWallLength(before, "width", 6);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.value.dimensions[1]).toMatchObject({
    lengthMeters: 2,
    verified: false,
  });
  expect(result.value.vertices.find((vertex) => vertex.id === "v4")!.x).toBe(8);
  expect(validateMapFloor(result.value)).toEqual([]);
});

test("unit conversion and calibration preserve physical scale including light positions", () => {
  expect(convertLength(1, "ft", "m")).toBe(0.3048);
  expect(convertLength(12, "in", "ft")).toBeCloseTo(1, 12);
  expect(convertLength(convertLength(3.75, "m", "ft"), "ft", "m")).toBeCloseTo(
    3.75,
    12,
  );
  const before = floor();
  const result = calibrateFloor(before, "width", 8);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.value.vertices.map(({ x, y }) => ({ x, y }))).toEqual(
    rectangle(0, 0, 8, 6),
  );
  expect(result.value.lights[0]).toMatchObject({ x: 2, y: 2 });
  expect(result.value.dimensions[0]).toMatchObject({
    lengthMeters: 8,
    locked: true,
    verified: true,
  });
  expect(calibrateFloor(result.value, "width", 4).ok).toBe(false);
  expect(before).toEqual(floor());
});
