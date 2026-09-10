import { expect, test } from "bun:test";
import {
  insertCorner,
  listWalls,
  mergeCorners,
  moveCorner,
  moveWall,
  nearestCorner,
  removeCorner,
  sharedWallPoint,
  translateWall,
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

/** The two rooms above, with a loose corner partway along the left room's top. */
function floorWithLooseCorner(): MapFloor {
  const added = insertCorner(floor(), { x: 2, y: 0 }, () => "p");
  if (!added.ok) throw new Error(added.error);
  return added.value.floor;
}

test("a wall dragged onto a corner welds into it", () => {
  const base = floorWithLooseCorner();
  const shared = dividingWall(base);
  // b lands exactly on p, which is what releasing a snapped drag does.
  const result = translateWall(base, shared.id, { x: -2, y: 0 });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(validateMapFloor(result.value)).toEqual([]);
  expect(result.value.vertices.some((vertex) => vertex.id === "b")).toBe(false);
  expect(at(result.value, "p")).toMatchObject({ x: 2, y: 0 });
  // Both rooms now meet at the corner the wall was dropped on.
  for (const area of result.value.areas) expect(area.vertexIds).toContain("p");
});

test("a wall moves past a corner instead of stopping at it", () => {
  const base = floorWithLooseCorner();
  const shared = dividingWall(base);
  const result = translateWall(base, shared.id, { x: -3, y: 0 });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(validateMapFloor(result.value)).toEqual([]);
  expect(at(result.value, "b").x).toBeCloseTo(1, 6);
  const left = result.value.areas.find((area) => area.id === "left")!;
  const right = result.value.areas.find((area) => area.id === "right")!;
  // The corner leaves the room the wall shrank and joins the one it grew.
  expect(left.vertexIds).not.toContain("p");
  expect(right.vertexIds).toContain("p");
});

test("a dragged wall can leave its own axis", () => {
  const base = floor();
  const shared = dividingWall(base);
  const result = translateWall(base, shared.id, { x: 1, y: 0.5 });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(validateMapFloor(result.value)).toEqual([]);
  expect(at(result.value, "b")).toMatchObject({ x: 5, y: 0.5 });
  expect(at(result.value, "c")).toMatchObject({ x: 5, y: 3.5 });
  expect(at(result.value, "a")).toMatchObject({ x: 0, y: 0 });
  // The walls that meet the dragged one follow it at an angle.
  const angled = listWalls(result.value).filter(
    (wall) => wall.orientation === "angled",
  );
  expect(angled.length).toBeGreaterThan(0);
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

test("an exact midpoint can be added on an angled shared wall", () => {
  const base: MapFloor = {
    id: "angled",
    name: "Angled floor",
    vertices: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 6, y: 0 },
      { id: "c", x: 4, y: 4 },
      { id: "d", x: 0, y: 4 },
      { id: "e", x: 8, y: 4 },
    ],
    areas: [
      {
        id: "left",
        name: "Left",
        vertexIds: ["a", "b", "c", "d"],
        target: null,
      },
      {
        id: "right",
        name: "Right",
        vertexIds: ["b", "e", "c"],
        target: null,
      },
    ],
    dimensions: [],
    lights: [],
  };
  const result = insertCorner(base, { x: 5, y: 2 }, () => "new");
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(
    result.value.floor.areas.every((area) => area.vertexIds.includes("new")),
  ).toBe(true);
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

test("a corner added on a wall can be removed again", () => {
  const added = insertCorner(floor(), { x: 4, y: 1.5 }, () => "new");
  expect(added.ok).toBe(true);
  if (!added.ok) return;
  const removed = removeCorner(added.value.floor, "new");
  expect(removed.ok).toBe(true);
  if (!removed.ok) return;
  expect(validateMapFloor(removed.value)).toEqual([]);
  expect(removed.value.vertices).toHaveLength(6);
  expect(
    removed.value.areas.every((area) => !area.vertexIds.includes("new")),
  ).toBe(true);
});

test("removing a corner leaves a valid room, and a triangle keeps its three", () => {
  const base = floor();
  // Four corners can lose one: each room becomes a triangle that still fits.
  const trimmed = removeCorner(base, "b");
  expect(trimmed.ok).toBe(true);
  if (!trimmed.ok) return;
  expect(validateMapFloor(trimmed.value)).toEqual([]);
  expect(trimmed.value.areas.every((area) => area.vertexIds.length === 3)).toBe(
    true,
  );
  // A triangle has nothing left to give.
  expect(removeCorner(trimmed.value, "c")).toEqual({
    ok: false,
    error: "A room needs at least three corners.",
  });
  expect(removeCorner(base, "missing")).toEqual({
    ok: false,
    error: "Select a corner on this floor.",
  });
});

test("a corner under a kept length cannot be removed until it is released", () => {
  const added = insertCorner(floor(), { x: 4, y: 1.5 }, () => "new");
  expect(added.ok).toBe(true);
  if (!added.ok) return;
  const locked = {
    ...added.value.floor,
    dimensions: [
      {
        id: "kept",
        startVertexId: "b",
        endVertexId: "new",
        lengthMeters: 1.5,
        locked: true,
        verified: true,
      },
    ],
  };
  expect(removeCorner(locked, "new")).toEqual({
    ok: false,
    error: "Release this wall's kept length before removing a corner.",
  });
});

test("two corners can be merged into one shared corner", () => {
  const added = insertCorner(floor(), { x: 4, y: 1.5 }, () => "new");
  expect(added.ok).toBe(true);
  if (!added.ok) return;
  // Pull the new corner near an existing one, then weld them together.
  const moved = moveCorner(added.value.floor, "new", { x: 4.2, y: 2.9 });
  expect(moved.ok).toBe(true);
  if (!moved.ok) return;
  const merged = mergeCorners(moved.value, "new", "c");
  expect(merged.ok).toBe(true);
  if (!merged.ok) return;
  expect(validateMapFloor(merged.value)).toEqual([]);
  expect(merged.value.vertices.map((vertex) => vertex.id)).not.toContain("new");
  expect(at(merged.value, "c")).toMatchObject({ x: 4, y: 3 });
  expect(merged.value.areas.every((area) => area.vertexIds.includes("c"))).toBe(
    true,
  );
});

test("merges reject the same corner twice, unknown corners, and flattened rooms", () => {
  const base = floor();
  expect(mergeCorners(base, "b", "b")).toEqual({
    ok: false,
    error: "Choose two different corners to merge.",
  });
  expect(mergeCorners(base, "b", "missing")).toEqual({
    ok: false,
    error: "Select two corners on this floor.",
  });
  // Welding two corners of a triangle would leave it with a single wall.
  const trimmed = removeCorner(base, "b");
  expect(trimmed.ok).toBe(true);
  if (!trimmed.ok) return;
  expect(mergeCorners(trimmed.value, "a", "d")).toEqual({
    ok: false,
    error: "Merging these corners would leave a room with no shape.",
  });
});

test("the nearest corner is offered for merging without dragging", () => {
  const added = insertCorner(floor(), { x: 4, y: 2.5 }, () => "new");
  expect(added.ok).toBe(true);
  if (!added.ok) return;
  const nearest = nearestCorner(added.value.floor, "new");
  expect(nearest?.vertexId).toBe("c");
  expect(nearest?.distanceMeters).toBeCloseTo(0.5, 6);
  expect(nearestCorner(added.value.floor, "missing")).toBeNull();
});

test("the combine dot sits in the middle of the boundary two rooms share", () => {
  expect(sharedWallPoint(floor(), "left", "right")).toEqual({ x: 4, y: 1.5 });
  // Order does not matter, and a room shares no boundary with itself.
  expect(sharedWallPoint(floor(), "right", "left")).toEqual({ x: 4, y: 1.5 });
  expect(sharedWallPoint(floor(), "left", "left")).toBeNull();
  expect(sharedWallPoint(floor(), "left", "missing")).toBeNull();

  // A corner dropped on the divider splits it into two shared segments; the
  // dot stays on the middle of the whole run rather than one half of it.
  const added = insertCorner(floor(), { x: 4, y: 2 }, () => "mid");
  expect(added.ok).toBe(true);
  if (!added.ok) return;
  expect(sharedWallPoint(added.value.floor, "left", "right")).toEqual({
    x: 4,
    y: 1.5,
  });
});

test("rooms that only meet at a corner have no wall to combine across", () => {
  const base = floor();
  const diagonal: MapFloor = {
    ...base,
    vertices: [
      ...base.vertices,
      { id: "g", x: 10, y: 6 },
      { id: "h", x: 4, y: 6 },
    ],
    areas: [
      ...base.areas,
      {
        id: "below",
        name: "Study",
        vertexIds: ["c", "f", "g", "h"],
        target: null,
      },
    ],
  };
  // The study meets the living room at the single corner (4, 3).
  expect(sharedWallPoint(diagonal, "left", "below")).toBeNull();
  expect(sharedWallPoint(diagonal, "right", "below")).toEqual({ x: 7, y: 3 });
});
