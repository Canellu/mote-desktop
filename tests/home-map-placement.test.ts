import { expect, test } from "bun:test";
import {
  areaAtPoint,
  findPlacement,
  placeLight,
  unplaceLight,
} from "../src/features/home-map/placement";
import type { HomeMapDocument, MapFloor } from "../src/features/home-map/types";
import { validateHomeMap } from "../src/features/home-map/validation";

const lightA = "00000000-0000-0000-0000-0000000000a1";
const lightB = "00000000-0000-0000-0000-0000000000b2";

/** One 4 x 3 room per floor, so a light can move between floors. */
function floor(id: string, name: string, prefix: string): MapFloor {
  return {
    id,
    name,
    vertices: [
      { id: `${prefix}1`, x: 0, y: 0 },
      { id: `${prefix}2`, x: 4, y: 0 },
      { id: `${prefix}3`, x: 4, y: 3 },
      { id: `${prefix}4`, x: 0, y: 3 },
    ],
    areas: [
      {
        id: `${prefix}area`,
        name: `${name} room`,
        vertexIds: [`${prefix}1`, `${prefix}2`, `${prefix}3`, `${prefix}4`],
        target: null,
      },
    ],
    dimensions: [],
    lights: [],
  };
}

function document(): HomeMapDocument {
  return {
    schemaVersion: 1,
    id: "map",
    bridgeId: "bridge",
    name: "Home",
    drawingMode: "sketch",
    units: "metric",
    floors: [
      floor("ground", "Ground", "g"),
      floor("upstairs", "Upstairs", "u"),
    ],
  };
}

test("placing a light adds one marker to the chosen floor", () => {
  const result = placeLight(document(), "ground", lightA, { x: 1, y: 2 });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(validateHomeMap(result.value)).toEqual([]);
  expect(result.value.floors[0].lights).toEqual([
    { lightId: lightA, x: 1, y: 2 },
  ]);
  expect(result.value.floors[1].lights).toEqual([]);
});

test("placing again moves the marker instead of copying the light", () => {
  const first = placeLight(document(), "ground", lightA, { x: 1, y: 2 });
  expect(first.ok).toBe(true);
  if (!first.ok) return;
  const moved = placeLight(first.value, "ground", lightA, { x: 3, y: 1 });
  expect(moved.ok).toBe(true);
  if (!moved.ok) return;
  expect(moved.value.floors[0].lights).toEqual([
    { lightId: lightA, x: 3, y: 1 },
  ]);
  // A light has one physical marker, so another floor takes it over.
  const upstairs = placeLight(moved.value, "upstairs", lightA, { x: 2, y: 2 });
  expect(upstairs.ok).toBe(true);
  if (!upstairs.ok) return;
  expect(upstairs.value.floors[0].lights).toEqual([]);
  expect(upstairs.value.floors[1].lights).toEqual([
    { lightId: lightA, x: 2, y: 2 },
  ]);
  expect(validateHomeMap(upstairs.value)).toEqual([]);
});

test("placement is rejected for unknown floors and impossible positions", () => {
  expect(placeLight(document(), "attic", lightA, { x: 1, y: 1 })).toEqual({
    ok: false,
    error: "Choose a floor to place this light on.",
  });
  expect(
    placeLight(document(), "ground", lightA, { x: Number.NaN, y: 1 }),
  ).toEqual({
    ok: false,
    error: "Light coordinates must be finite numbers.",
  });
  // The validator still guards ids that are not Hue v2 references.
  expect(
    placeLight(document(), "ground", "not-a-uuid", { x: 1, y: 1 }).ok,
  ).toBe(false);
});

test("unplacing removes the marker only, and reports an unmapped light", () => {
  const placed = placeLight(document(), "ground", lightA, { x: 1, y: 2 });
  expect(placed.ok).toBe(true);
  if (!placed.ok) return;
  const removed = unplaceLight(placed.value, lightA);
  expect(removed.ok).toBe(true);
  if (!removed.ok) return;
  expect(removed.value.floors.every((entry) => entry.lights.length === 0)).toBe(
    true,
  );
  expect(removed.value.floors[0].areas).toEqual(placed.value.floors[0].areas);
  expect(unplaceLight(document(), lightB)).toEqual({
    ok: false,
    error: "This light is not on the map.",
  });
});

test("a placement can be found, and its area described", () => {
  const placed = placeLight(document(), "upstairs", lightB, { x: 2, y: 1 });
  expect(placed.ok).toBe(true);
  if (!placed.ok) return;
  expect(findPlacement(placed.value, lightB)).toEqual({
    floorId: "upstairs",
    point: { x: 2, y: 1 },
  });
  expect(findPlacement(placed.value, lightA)).toBeNull();
  const upstairs = placed.value.floors[1];
  expect(areaAtPoint(upstairs, { x: 2, y: 1 })?.id).toBe("uarea");
  expect(areaAtPoint(upstairs, { x: 9, y: 9 })).toBeNull();
});
