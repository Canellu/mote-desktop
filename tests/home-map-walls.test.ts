import { expect, test } from "bun:test";
import { listWalls, moveWall } from "../src/features/home-map/walls";
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

test("walls are listed once, with the areas that share them", () => {
  const walls = listWalls(floor());
  expect(walls).toHaveLength(7);
  const shared = walls.filter((wall) => wall.areaIds.length > 1);
  expect(shared).toHaveLength(1);
  expect(shared[0].orientation).toBe("vertical");
  expect(shared[0].lengthMeters).toBeCloseTo(3, 6);
  expect([...shared[0].areaIds].sort()).toEqual(["left", "right"]);
  expect(
    walls.find((wall) => wall.id === shared[0].id)!.startVertexId,
  ).toBeDefined();
});

test("moving a shared wall resizes both rooms in one edit", () => {
  const shared = listWalls(floor()).find((wall) => wall.areaIds.length > 1)!;
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
  const shared = listWalls(floor()).find((wall) => wall.areaIds.length > 1)!;
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
  const shared = listWalls(base).find((wall) => wall.areaIds.length > 1)!;
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
  const shared = listWalls(base).find((wall) => wall.areaIds.length > 1)!;
  const result = moveWall(base, shared.id, 1);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error).toContain("Release");
});

test("moves reject unknown walls, bad distances, and no-ops", () => {
  const base = floor();
  const shared = listWalls(base).find((wall) => wall.areaIds.length > 1)!;
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
