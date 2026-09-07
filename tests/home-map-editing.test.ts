import { expect, test } from "bun:test";
import {
  DEFAULT_SNAP_SETTINGS,
  parseSnapSettings,
  snapWorldPoint,
  type SnapSettings,
} from "../src/features/home-map/snapping";
import type { MapFloor } from "../src/features/home-map/types";
import { validateMapFloor } from "../src/features/home-map/validation";
import {
  clampScale,
  fitViewport,
  panViewport,
  toScreen,
  toWorld,
  zoomViewportAt,
  MAX_MAP_SCALE,
  MIN_MAP_SCALE,
} from "../src/features/home-map/viewport";
import { listWalls, moveCorner } from "../src/features/home-map/walls";

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
    lights: [],
  };
}

const at = (result: MapFloor, id: string) =>
  result.vertices.find((vertex) => vertex.id === id)!;

test("world and screen positions round-trip through the viewport", () => {
  const view = { scale: 40, offsetX: 100, offsetY: 60 };
  expect(toScreen({ x: 2, y: 1 }, view)).toEqual({ x: 180, y: 100 });
  expect(toWorld({ x: 180, y: 100 }, view)).toEqual({ x: 2, y: 1 });
  const panned = panViewport(view, 15, -5);
  expect(toScreen({ x: 2, y: 1 }, panned)).toEqual({ x: 195, y: 95 });
});

test("zooming keeps the point under the pointer in place", () => {
  const view = { scale: 40, offsetX: 100, offsetY: 60 };
  const pointer = { x: 300, y: 200 };
  const before = toWorld(pointer, view);
  const zoomed = zoomViewportAt(view, pointer, 1.25);
  expect(zoomed.scale).toBeCloseTo(50, 6);
  const after = toWorld(pointer, zoomed);
  expect(after.x).toBeCloseTo(before.x, 6);
  expect(after.y).toBeCloseTo(before.y, 6);
});

test("scale stays within usable limits", () => {
  expect(clampScale(1)).toBe(MIN_MAP_SCALE);
  expect(clampScale(10_000)).toBe(MAX_MAP_SCALE);
  const view = { scale: MAX_MAP_SCALE, offsetX: 0, offsetY: 0 };
  expect(zoomViewportAt(view, { x: 10, y: 10 }, 2)).toBe(view);
});

test("fitting centres the floor inside the canvas", () => {
  const view = fitViewport(
    { minX: 0, minY: 0, width: 10, height: 5 },
    { width: 800, height: 400 },
    50,
  );
  const topLeft = toScreen({ x: 0, y: 0 }, view);
  const bottomRight = toScreen({ x: 10, y: 5 }, view);
  expect(topLeft.x).toBeCloseTo(800 - bottomRight.x, 6);
  expect(topLeft.y).toBeCloseTo(400 - bottomRight.y, 6);
  expect(bottomRight.x).toBeLessThanOrEqual(750);
  expect(bottomRight.y).toBeLessThanOrEqual(350);
});

test("snapping off leaves the pointer position untouched", () => {
  const settings: SnapSettings = { ...DEFAULT_SNAP_SETTINGS, enabled: false };
  const result = snapWorldPoint({ x: 1.234, y: 5.678 }, { settings });
  expect(result.point).toEqual({ x: 1.234, y: 5.678 });
  expect(result.guides).toEqual([]);
});

test("snapping rounds to the chosen increment", () => {
  const result = snapWorldPoint(
    { x: 1.234, y: 5.678 },
    { settings: { ...DEFAULT_SNAP_SETTINGS, incrementMeters: 0.25 } },
  );
  expect(result.point).toEqual({ x: 1.25, y: 5.75 });
  expect(
    snapWorldPoint(
      { x: 1.234, y: 5.678 },
      { settings: { ...DEFAULT_SNAP_SETTINGS, incrementMeters: 1 } },
    ).point,
  ).toEqual({ x: 1, y: 6 });
});

test("an existing corner wins over the grid, per axis, with a guide", () => {
  const corners = [{ x: 4.02, y: 9 }];
  const result = snapWorldPoint(
    { x: 4.06, y: 5.678 },
    {
      settings: { ...DEFAULT_SNAP_SETTINGS, incrementMeters: 0.5 },
      corners,
      toleranceMeters: 0.1,
    },
  );
  expect(result.point.x).toBeCloseTo(4.02, 6);
  // The unaligned axis still follows the grid.
  expect(result.point.y).toBeCloseTo(5.5, 6);
  expect(result.guides).toEqual([
    { axis: "x", value: 4.02, through: corners[0] },
  ]);
});

test("corner snapping can be turned off without disabling the grid", () => {
  const result = snapWorldPoint(
    { x: 4.06, y: 5.678 },
    {
      settings: {
        ...DEFAULT_SNAP_SETTINGS,
        snapToCorners: false,
        incrementMeters: 0.5,
      },
      corners: [{ x: 4.02, y: 9 }],
      toleranceMeters: 0.1,
    },
  );
  expect(result.point).toEqual({ x: 4, y: 5.5 });
  expect(result.guides).toEqual([]);
});

test("stored snap settings are validated before use", () => {
  expect(parseSnapSettings(null)).toEqual(DEFAULT_SNAP_SETTINGS);
  expect(parseSnapSettings({ enabled: "yes", incrementMeters: 3 })).toEqual(
    DEFAULT_SNAP_SETTINGS,
  );
  expect(
    parseSnapSettings({
      enabled: false,
      incrementMeters: 0.5,
      showGrid: false,
      snapToCorners: false,
    }),
  ).toEqual({
    enabled: false,
    incrementMeters: 0.5,
    showGrid: false,
    snapToCorners: false,
  });
});

test("dragging a corner moves both walls that meet there", () => {
  const result = moveCorner(floor(), "b", { x: 5, y: -1 });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(validateMapFloor(result.value)).toEqual([]);
  // The shared wall follows on x, the top wall follows on y.
  expect(at(result.value, "b")).toMatchObject({ x: 5, y: -1 });
  expect(at(result.value, "c").x).toBeCloseTo(5, 6);
  expect(at(result.value, "a").y).toBeCloseTo(-1, 6);
  expect(at(result.value, "e").y).toBeCloseTo(-1, 6);
  expect(at(result.value, "d").y).toBeCloseTo(3, 6);
});

test("a corner drag that would collapse a room is refused whole", () => {
  const before = floor();
  const result = moveCorner(before, "b", { x: 0, y: 0 });
  expect(result.ok).toBe(false);
  expect(before.vertices).toEqual(floor().vertices);
});

test("corner drags reject unknown corners and impossible positions", () => {
  expect(moveCorner(floor(), "missing", { x: 1, y: 1 })).toEqual({
    ok: false,
    error: "Select a corner on this floor.",
  });
  expect(moveCorner(floor(), "b", { x: Number.NaN, y: 0 })).toEqual({
    ok: false,
    error: "Corner coordinates must be finite numbers.",
  });
  // Every corner of an orthogonal plan has one wall in each direction.
  const walls = listWalls(floor());
  expect(
    walls.filter(
      (wall) => wall.orientation === "vertical" && wall.vertexIds.includes("b"),
    ),
  ).toHaveLength(1);
});
