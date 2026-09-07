import { expect, test } from "bun:test";
import {
  insertCorner,
  listWalls,
  moveCorner,
  moveWall,
} from "../src/features/home-map/walls";
import type { MapFloor } from "../src/features/home-map/types";
import { validateMapFloor } from "../src/features/home-map/validation";

/**
 * Two rooms sharing the vertical wall at x = 4:
 * left 0..4, right 4..10, both 0..3 deep.
 */
function floor(): MapFloor {
  return {
    id: "ground",
    name: "Ground floor",
    vertices: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 4, y: 0 },
      { id: "c", x: 4, y: 3 },
      { id: "d", x: 0, y: 3 },
      { id: "e", x: 10, y: 0 },
      { id: "f", x: 10, y: 3 },
    ],
    areas: [
      {
        id: "left",
        name: "Living room",
        vertexIds: ["a", "b", "c", "d"],
        target: null,
      },
      {
        id: "right",
        name: "Kitchen",
        vertexIds: ["b", "e", "f", "c"],
        target: null,
      },
    ],
    dimensions: [],
    lights: [],
  };
}

const at = (result: MapFloor, id: string) =>
  result.vertices.find((vertex) => vertex.id === id)!;

const dividingWall = (floorValue = floor()) =>
  listWalls(floorValue).find((wall) => wall.dividing)!;

test("collinear segments form one wall run, with the rooms it borders", () => {
  const walls = listWalls(floor());
  // Two outer runs spanning both rooms, two room-width outer runs, one divider.
  expect(walls).toHaveLength(5);
  const dividing = walls.filter((wall) => wall.dividing);
  expect(dividing).toHaveLength(1);
  expect(dividing[0].orientation).toBe("vertical");
  expect(dividing[0].lengthMeters).toBeCloseTo(3, 6);
  expect([...dividing[0].areaIds].sort()).toEqual(["left", "right"]);
  expect(dividing[0].vertexIds.sort()).toEqual(["b", "c"]);

  // The top boundary is one 10 m wall even though two rooms meet along it.
  const top = walls.find(
    (wall) => wall.orientation === "horizontal" && wall.areaIds.length > 1,
  )!;
  expect(top.dividing).toBe(false);
  expect(top.lengthMeters).toBeCloseTo(10, 6);
  expect(top.vertexIds).toHaveLength(3);
});

test("moving a shared wall resizes both rooms in one edit", () => {
  const shared = dividingWall();
  const result = moveWall(floor(), shared.id, 1.5);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(validateMapFloor(result.value)).toEqual([]);
  expect(at(result.value, "b").x).toBeCloseTo(5.5, 6);
  expect(at(result.value, "c").x).toBeCloseTo(5.5, 6);
  // Walls that do not belong to the moved segment stay where they are.
  expect(at(result.value, "a").x).toBeCloseTo(0, 6);
  expect(at(result.value, "e").x).toBeCloseTo(10, 6);
  expect(at(result.value, "b").y).toBeCloseTo(0, 6);
});

test("an outer wall moves without disturbing the shared boundary", () => {
  const outer = listWalls(floor()).find(
    (wall) =>
      !wall.dividing &&
      wall.areaIds.length === 1 &&
      wall.areaIds[0] === "right" &&
      wall.orientation === "vertical",
  )!;
  const result = moveWall(floor(), outer.id, 2);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(at(result.value, "e").x).toBeCloseTo(12, 6);
  expect(at(result.value, "f").x).toBeCloseTo(12, 6);
  expect(at(result.value, "b").x).toBeCloseTo(4, 6);
});

test("a wall cannot be pushed onto or past another wall", () => {
  const shared = dividingWall();
  expect(moveWall(floor(), shared.id, -4)).toEqual({
    ok: false,
    error: "This wall cannot pass another wall.",
  });
  const past = moveWall(floor(), shared.id, -6);
  expect(past.ok).toBe(false);
  const beyond = moveWall(floor(), shared.id, 7);
  expect(beyond.ok).toBe(false);
});

test("moving a wall updates crossing dimensions and unverifies them", () => {
  const base = floor();
  base.dimensions = [
    {
      id: "width",
      startVertexId: "a",
      endVertexId: "b",
      lengthMeters: 4,
      locked: false,
      verified: true,
    },
    {
      id: "depth",
      startVertexId: "a",
      endVertexId: "d",
      lengthMeters: 3,
      locked: true,
      verified: true,
    },
  ];
  const shared = dividingWall(base);
  const result = moveWall(base, shared.id, 1);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const width = result.value.dimensions.find((entry) => entry.id === "width")!;
  const depth = result.value.dimensions.find((entry) => entry.id === "depth")!;
  expect(width.lengthMeters).toBeCloseTo(5, 6);
  expect(width.verified).toBe(false);
  // An unaffected locked dimension keeps its length and verification.
  expect(depth.lengthMeters).toBeCloseTo(3, 6);
  expect(depth.verified).toBe(true);
  expect(base.vertices.find((vertex) => vertex.id === "b")!.x).toBe(4);
});

test("a locked length must be released before its wall moves", () => {
  const base = floor();
  base.dimensions = [
    {
      id: "width",
      startVertexId: "a",
      endVertexId: "b",
      lengthMeters: 4,
      locked: true,
      verified: true,
    },
  ];
  const shared = dividingWall(base);
  const result = moveWall(base, shared.id, 1);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error).toContain("Release");
});

test("moves reject unknown walls, bad distances, and no-ops", () => {
  const base = floor();
  const shared = dividingWall(base);
  expect(moveWall(base, "missing:wall", 1)).toEqual({
    ok: false,
    error: "Select a wall on this floor.",
  });
  expect(moveWall(base, shared.id, Number.NaN)).toEqual({
    ok: false,
    error: "Enter how far to move this wall.",
  });
  expect(moveWall(base, shared.id, 0)).toEqual({ ok: true, value: base });
});

/** One long boundary faced by two stacked rooms, as in a kitchen/dining pair. */
function tJunctionFloor(): MapFloor {
  return {
    id: "ground",
    name: "Ground floor",
    vertices: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 6, y: 0 },
      { id: "m", x: 6, y: 3 },
      { id: "c", x: 6, y: 5 },
      { id: "d", x: 0, y: 5 },
      { id: "e", x: 10, y: 0 },
      { id: "f", x: 10, y: 3 },
      { id: "g", x: 10, y: 5 },
    ],
    areas: [
      {
        id: "living",
        name: "Living room",
        vertexIds: ["a", "b", "m", "c", "d"],
        target: null,
      },
      {
        id: "kitchen",
        name: "Kitchen",
        vertexIds: ["b", "e", "f", "m"],
        target: null,
      },
      {
        id: "dining",
        name: "Dining",
        vertexIds: ["m", "f", "g", "c"],
        target: null,
      },
    ],
    dimensions: [],
    lights: [],
  };
}

test("a boundary faced by two rooms moves as one wall", () => {
  const walls = listWalls(tJunctionFloor());
  const boundary = walls.find(
    (wall) => wall.dividing && wall.orientation === "vertical",
  )!;
  expect(boundary.lengthMeters).toBeCloseTo(5, 6);
  expect(boundary.vertexIds).toHaveLength(3);
  expect([...boundary.areaIds].sort()).toEqual(["dining", "kitchen", "living"]);

  const result = moveWall(tJunctionFloor(), boundary.id, 0.5);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  // Moving part of the run would have left a diagonal wall.
  expect(validateMapFloor(result.value)).toEqual([]);
  for (const id of ["b", "m", "c"])
    expect(at(result.value, id).x).toBeCloseTo(6.5, 6);
  expect(at(result.value, "e").x).toBeCloseTo(10, 6);
});

test("a corner can be added on a wall, on both of its rooms", () => {
  const base = floor();
  const shared = dividingWall(base);
  const result = insertCorner(base, { x: 4, y: 1.5 }, () => "new");
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(validateMapFloor(result.value.floor)).toEqual([]);
  expect(result.value.vertexId).toBe("new");
  // Both rooms along the shared wall gain the corner, so they still match.
  for (const area of result.value.floor.areas)
    expect(area.vertexIds).toContain("new");
  expect(result.value.floor.vertices).toHaveLength(7);
  // The wall is still one run until the new corner is moved off its line.
  const walls = listWalls(result.value.floor);
  expect(walls.find((wall) => wall.id === shared.id)?.vertexIds).toHaveLength(
    3,
  );
  expect(base.vertices).toHaveLength(6);
});

test("adding a corner off a wall, or on an existing one, is refused", () => {
  const base = floor();
  expect(insertCorner(base, { x: 2, y: 1.5 }, () => "new")).toEqual({
    ok: false,
    error: "Click on a wall to add a corner.",
  });
  expect(insertCorner(base, { x: 4, y: 0 }, () => "new")).toEqual({
    ok: false,
    error: "There is already a corner here.",
  });
  expect(insertCorner(base, { x: Number.NaN, y: 0 }, () => "new").ok).toBe(
    false,
  );
});

test("a corner added on a wall can then be dragged into an angle", () => {
  const added = insertCorner(floor(), { x: 4, y: 1.5 }, () => "new");
  expect(added.ok).toBe(true);
  if (!added.ok) return;
  const moved = moveCorner(added.value.floor, "new", { x: 5.5, y: 1.5 });
  expect(moved.ok).toBe(true);
  if (!moved.ok) return;
  expect(validateMapFloor(moved.value)).toEqual([]);
  expect(at(moved.value, "new")).toMatchObject({ x: 5.5, y: 1.5 });
  // The straight run became two walls that meet at the new corner.
  const runs = listWalls(moved.value).filter((wall) => wall.dividing);
  expect(runs).toHaveLength(2);
});
