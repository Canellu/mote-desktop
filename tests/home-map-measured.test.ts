import { expect, test } from "bun:test";
import {
  calibrateFloorFromWall,
  releaseWallLength,
  setWallLengthForWall,
} from "../src/features/home-map/measurements";
import type { MapFloor } from "../src/features/home-map/types";
import { validateMapFloor } from "../src/features/home-map/validation";
import { listWalls } from "../src/features/home-map/walls";

function ids() {
  let count = 0;
  return () => `dim-${(count += 1)}`;
}

/** Two rooms sharing the wall at x = 4, both 3 m deep. */
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
    lights: [{ lightId: "00000000-0000-0000-0000-000000000001", x: 2, y: 1 }],
  };
}

const at = (result: MapFloor, id: string) =>
  result.vertices.find((vertex) => vertex.id === id)!;
const dividing = (value: MapFloor) => listWalls(value).find((w) => w.dividing)!;

test("entering a length measures an unmeasured wall and locks it", () => {
  const base = floor();
  const wall = dividing(base);
  const result = setWallLengthForWall(base, wall, 5.5, "start", ids());
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(validateMapFloor(result.value)).toEqual([]);
  // The wall is vertical, so its own length is the room depth.
  expect(at(result.value, "c").y).toBeCloseTo(5.5, 6);
  expect(at(result.value, "b").y).toBeCloseTo(0, 6);
  const dimension = result.value.dimensions[0];
  expect(dimension.lengthMeters).toBeCloseTo(5.5, 6);
  expect(dimension.locked).toBe(true);
  expect(dimension.verified).toBe(true);
  expect(base.dimensions).toEqual([]);
});

test("the anchor decides which end of the wall stays put", () => {
  const base = floor();
  const wall = dividing(base);
  const fromEnd = setWallLengthForWall(base, wall, 5, "end", ids());
  expect(fromEnd.ok).toBe(true);
  if (!fromEnd.ok) return;
  // Anchored at the far end, the other end moves instead.
  expect(at(fromEnd.value, "c").y).toBeCloseTo(3, 6);
  expect(at(fromEnd.value, "b").y).toBeCloseTo(-2, 6);
});

test("a second entry reuses the same measurement instead of adding one", () => {
  const base = floor();
  const wall = dividing(base);
  const first = setWallLengthForWall(base, wall, 5, "start", ids());
  expect(first.ok).toBe(true);
  if (!first.ok) return;
  const again = setWallLengthForWall(
    first.value,
    dividing(first.value),
    4,
    "start",
    ids(),
  );
  expect(again.ok).toBe(true);
  if (!again.ok) return;
  expect(again.value.dimensions).toHaveLength(1);
  expect(again.value.dimensions[0].lengthMeters).toBeCloseTo(4, 6);
});

test("a locked length blocks a conflicting entry until it is released", () => {
  const base = floor();
  // One generator, so the second entry cannot reuse the first ID.
  const nextId = ids();
  // Measure the right room's width, then try to restretch the wall it sits on.
  const locked = setWallLengthForWall(
    base,
    { startVertexId: "b", endVertexId: "e" },
    6,
    "start",
    nextId,
  );
  expect(locked.ok).toBe(true);
  if (!locked.ok) return;
  expect(locked.value.dimensions[0].locked).toBe(true);
  const conflict = setWallLengthForWall(
    locked.value,
    { startVertexId: "a", endVertexId: "e" },
    14,
    "start",
    nextId,
  );
  expect(conflict.ok).toBe(false);
  if (!conflict.ok) expect(conflict.error).toContain("Release");

  const released = releaseWallLength(
    locked.value,
    locked.value.dimensions[0].id,
  );
  expect(released.ok).toBe(true);
  if (!released.ok) return;
  expect(released.value.dimensions[0].locked).toBe(false);
  // Releasing a lock keeps the fact that the length was verified.
  expect(released.value.dimensions[0].verified).toBe(true);
  const retried = setWallLengthForWall(
    released.value,
    { startVertexId: "a", endVertexId: "e" },
    14,
    "start",
    nextId,
  );
  expect(retried.ok).toBe(true);
  if (!retried.ok) return;
  expect(at(retried.value, "e").x).toBeCloseTo(14, 6);
  expect(releaseWallLength(base, "missing")).toEqual({
    ok: false,
    error: "Select a measured wall.",
  });
});

test("setting a scale rescales the whole sketch, markers included", () => {
  const base = floor();
  const wall = listWalls(base).find(
    (candidate) =>
      !candidate.dividing && candidate.orientation === "horizontal",
  )!;
  // The wall spans 10 m on the sketch; the user measured 5 m.
  const result = calibrateFloorFromWall(base, wall, 5, ids());
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(validateMapFloor(result.value)).toEqual([]);
  expect(at(result.value, "e").x).toBeCloseTo(5, 6);
  expect(at(result.value, "b").x).toBeCloseTo(2, 6);
  expect(at(result.value, "c").y).toBeCloseTo(1.5, 6);
  expect(result.value.lights[0]).toMatchObject({ x: 1, y: 0.5 });
  const dimension = result.value.dimensions[0];
  expect(dimension.verified).toBe(true);
  expect(dimension.locked).toBe(true);
});

test("measurements refuse impossible lengths and unknown walls", () => {
  const base = floor();
  const wall = dividing(base);
  expect(setWallLengthForWall(base, wall, 0, "start", ids()).ok).toBe(false);
  expect(setWallLengthForWall(base, wall, Number.NaN, "start", ids()).ok).toBe(
    false,
  );
  expect(
    setWallLengthForWall(
      base,
      { startVertexId: "a", endVertexId: "missing" },
      3,
      "start",
      ids(),
    ),
  ).toEqual({ ok: false, error: "Select a wall on this floor." });
  expect(calibrateFloorFromWall(base, wall, -1, ids()).ok).toBe(false);
});
