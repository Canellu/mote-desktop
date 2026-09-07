import { expect, test } from "bun:test";
import {
  appendOutlineCorner,
  closeOutline,
  constrainCorner,
  floorFromRing,
  outlineCloseError,
  outlineCornerError,
  snapPoint,
} from "../src/features/home-map/outline";
import { addOutlineArea } from "../src/features/home-map/operations";
import type { MapFloor, MapPoint } from "../src/features/home-map/types";
import { listWalls } from "../src/features/home-map/walls";
import { validateMapFloor } from "../src/features/home-map/validation";

function ids() {
  let count = 0;
  return () => `v-${(count += 1)}`;
}

const draw = (points: MapPoint[]) =>
  points.reduce<MapPoint[]>((ring, point) => {
    const next = appendOutlineCorner(ring, point);
    if (!next.ok) throw new Error(next.error);
    return next.value;
  }, []);

test("snapping rounds to the drawing grid", () => {
  expect(snapPoint({ x: 1.234, y: 5.678 })).toEqual({ x: 1.2, y: 5.7 });
  expect(snapPoint({ x: 1.234, y: 5.678 }, 0.5)).toEqual({ x: 1, y: 5.5 });
  expect(snapPoint({ x: 1.234, y: 5.678 }, 0)).toEqual({ x: 1.234, y: 5.678 });
});

test("a wall can be drawn at any angle, or snapped to one", () => {
  expect(constrainCorner(null, { x: 1.04, y: 2.03 })).toEqual({ x: 1, y: 2 });
  // With no angle snap the pointer keeps its own direction.
  const free = constrainCorner({ x: 0, y: 0 }, { x: 3.02, y: 1.44 });
  expect(free).toEqual({ x: 3, y: 1.4 });

  // A right-angle snap reproduces the old behaviour.
  const square = constrainCorner(
    { x: 0, y: 0 },
    { x: 3.02, y: 0.44 },
    { angleDegrees: 90 },
  );
  expect(square.y).toBeCloseTo(0, 6);
  expect(square.x).toBeGreaterThan(2.9);

  // A 45 degree snap keeps a diagonal exactly diagonal.
  const diagonal = constrainCorner(
    { x: 0, y: 0 },
    { x: 3, y: 2.6 },
    { angleDegrees: 45 },
  );
  expect(diagonal.x).toBeCloseTo(diagonal.y, 6);
});

test("corner feedback names the specific drawing problem", () => {
  expect(outlineCornerError([], { x: 0, y: 0 })).toBeNull();
  expect(outlineCornerError([], { x: Number.NaN, y: 0 })).toBe(
    "Corner coordinates must be finite numbers.",
  );
  expect(outlineCornerError([{ x: 0, y: 0 }], { x: 0, y: 0 })).toBe(
    "Move away from the previous corner.",
  );
  // Angled walls are allowed; only degenerate ones are not.
  expect(outlineCornerError([{ x: 0, y: 0 }], { x: 2, y: 2 })).toBeNull();
  expect(outlineCornerError([{ x: 0, y: 0 }], { x: 0.005, y: 0 })).toBe(
    "A wall must be at least one centimeter long.",
  );
  expect(
    outlineCornerError(
      [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
      ],
      { x: 2, y: 0 },
    ),
  ).toBe("A wall cannot double back on itself.");
  expect(
    outlineCornerError(
      [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
      ],
      { x: 0, y: 0 },
    ),
  ).toBe("This outline already has a corner here.");
});

test("a new wall cannot cross an earlier one", () => {
  const drawn = draw([
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 3 },
    { x: 2, y: 3 },
  ]);
  // Continuing past the first wall would cut through the outline.
  expect(outlineCornerError(drawn, { x: 2, y: -2 })).toBe(
    "Walls cannot cross an earlier wall.",
  );
  expect(outlineCornerError(drawn, { x: 2, y: 1 })).toBeNull();
});

test("closing requires three corners and a room that does not cross itself", () => {
  expect(
    outlineCloseError([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
    ]),
  ).toBe("An outline needs at least three corners.");
  // A triangle closes, and so does an outline whose last wall is angled.
  expect(
    outlineCloseError([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
    ]),
  ).toBeNull();
  expect(
    outlineCloseError([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 1, y: 2 },
    ]),
  ).toBeNull();
  expect(
    outlineCloseError([
      { x: 0, y: 0 },
      { x: 4, y: 4 },
      { x: 4, y: 0 },
      { x: 0, y: 4 },
    ]),
  ).not.toBeNull();
  const square = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 3 },
    { x: 0, y: 3 },
  ];
  expect(outlineCloseError(square)).toBeNull();
  expect(closeOutline(square)).toEqual({ ok: true, value: square });
});

test("an L-shaped outline can be drawn corner by corner and closed", () => {
  const points = draw([
    { x: 0, y: 0 },
    { x: 5, y: 0 },
    { x: 5, y: 2 },
    { x: 8, y: 2 },
    { x: 8, y: 6 },
    { x: 0, y: 6 },
  ]);
  const closed = closeOutline(points);
  expect(closed.ok).toBe(true);
  if (!closed.ok) return;
  const floor = floorFromRing(
    closed.value,
    {
      floorId: "floor-1",
      floorName: "Ground floor",
      areaId: "area-1",
      areaName: "Whole floor",
    },
    ids(),
  );
  expect(floor.ok).toBe(true);
  if (!floor.ok) return;
  expect(validateMapFloor(floor.value)).toEqual([]);
  expect(floor.value.vertices).toHaveLength(6);
  expect(floor.value.areas[0].vertexIds).toHaveLength(6);
  expect(floor.value.dimensions).toEqual([]);
  expect(floor.value.lights).toEqual([]);
});

test("a floor is never built from an invalid ring or blank name", () => {
  const names = {
    floorId: "floor-1",
    floorName: "Ground floor",
    areaId: "area-1",
    areaName: "Whole floor",
  };
  expect(
    floorFromRing(
      [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
      ],
      names,
      ids(),
    ).ok,
  ).toBe(false);
  expect(
    floorFromRing(
      [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
        { x: 0, y: 3 },
      ],
      { ...names, areaName: "  " },
      ids(),
    ),
  ).toEqual({ ok: false, error: "Name this room." });
});

const room = (
  id: string,
  name: string,
  vertexIds: string[],
): MapFloor["areas"][number] => ({ id, name, vertexIds, target: null });

/** One 4 x 3 room, ready for a second room drawn against its right wall. */
function singleRoomFloor(): MapFloor {
  return {
    id: "ground",
    name: "Ground floor",
    vertices: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 4, y: 0 },
      { id: "c", x: 4, y: 3 },
      { id: "d", x: 0, y: 3 },
    ],
    areas: [room("living", "Living room", ["a", "b", "c", "d"])],
    dimensions: [],
    lights: [],
  };
}

test("a drawn room reuses the corners it lands on", () => {
  const result = addOutlineArea(
    singleRoomFloor(),
    [
      { x: 4, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 3 },
      { x: 4, y: 3 },
    ],
    { id: "kitchen", name: "Kitchen" },
    ids(),
  );
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(validateMapFloor(result.value)).toEqual([]);
  // Only the two far corners are new; the shared wall reuses b and c.
  expect(result.value.vertices).toHaveLength(6);
  expect(result.value.areas.map((area) => area.id)).toEqual([
    "living",
    "kitchen",
  ]);
  const shared = listWalls(result.value).filter((wall) => wall.dividing);
  expect(shared).toHaveLength(1);
  expect(shared[0].lengthMeters).toBeCloseTo(3, 6);
});

test("a room drawn against part of a wall nodes both sides", () => {
  const result = addOutlineArea(
    singleRoomFloor(),
    [
      { x: 4, y: 1 },
      { x: 7, y: 1 },
      { x: 7, y: 2 },
      { x: 4, y: 2 },
    ],
    { id: "nook", name: "Nook" },
    ids(),
  );
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(validateMapFloor(result.value)).toEqual([]);
  // The original room gains the two corners where the nook meets its wall.
  const living = result.value.areas.find((area) => area.id === "living")!;
  expect(living.vertexIds).toHaveLength(6);
});

test("a drawn room cannot overlap an existing room or repeat its ID", () => {
  const overlap = addOutlineArea(
    singleRoomFloor(),
    [
      { x: 2, y: 1 },
      { x: 6, y: 1 },
      { x: 6, y: 2 },
      { x: 2, y: 2 },
    ],
    { id: "nook", name: "Nook" },
    ids(),
  );
  expect(overlap).toEqual({ ok: false, error: "Rooms cannot overlap." });
  expect(
    addOutlineArea(
      singleRoomFloor(),
      [
        { x: 4, y: 0 },
        { x: 8, y: 0 },
        { x: 8, y: 3 },
        { x: 4, y: 3 },
      ],
      { id: "living", name: "Second living room" },
      ids(),
    ),
  ).toEqual({ ok: false, error: "The new room needs a unique ID." });
  // A triangle is a valid room; a two-corner outline is not.
  expect(
    addOutlineArea(
      singleRoomFloor(),
      [
        { x: 4, y: 0 },
        { x: 8, y: 0 },
        { x: 8, y: 3 },
      ],
      { id: "kitchen", name: "Kitchen" },
      ids(),
    ).ok,
  ).toBe(true);
  expect(
    addOutlineArea(
      singleRoomFloor(),
      [
        { x: 6, y: 6 },
        { x: 8, y: 6 },
      ],
      { id: "sliver", name: "Sliver" },
      ids(),
    ).ok,
  ).toBe(false);
});

test("a room drawn away from the others stays separate and valid", () => {
  const result = addOutlineArea(
    singleRoomFloor(),
    [
      { x: 6, y: 5 },
      { x: 9, y: 5 },
      { x: 9, y: 8 },
      { x: 6, y: 8 },
    ],
    { id: "shed", name: "Shed" },
    ids(),
  );
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(validateMapFloor(result.value)).toEqual([]);
  expect(listWalls(result.value).filter((wall) => wall.dividing)).toEqual([]);
});
