import { expect, test } from "bun:test";
import {
  DEFAULT_SNAP_SETTINGS,
  snapWorldPoint,
} from "../src/features/home-map/snapping";

const wall = [{ start: { x: 0, y: 2 }, end: { x: 8, y: 2 } }];

test("a nearby wall wins over the grid and returns its exact projection", () => {
  const result = snapWorldPoint(
    { x: 3.27, y: 2.18 },
    {
      settings: { ...DEFAULT_SNAP_SETTINGS, incrementMeters: 0.5 },
      segments: wall,
      toleranceMeters: 0.25,
    },
  );
  expect(result.point).toEqual({ x: 3.27, y: 2 });
  expect(result.snappedToSegment).toBe(true);
});

test("a wall snap preserves vertical alignment with an existing point", () => {
  const anchor = { x: 4, y: 6 };
  const result = snapWorldPoint(
    { x: 4.08, y: 2.12 },
    {
      settings: { ...DEFAULT_SNAP_SETTINGS, incrementMeters: 0.5 },
      corners: [anchor],
      segments: [{ start: { x: 0, y: 0 }, end: { x: 8, y: 4 } }],
      toleranceMeters: 0.25,
    },
  );
  expect(result.point).toEqual({ x: 4, y: 2 });
  expect(result.guides).toEqual([
    { axis: "x", value: 4, through: anchor },
  ]);
  expect(result.snappedToSegment).toBe(true);
});

test("a wall snap preserves horizontal alignment with an existing point", () => {
  const anchor = { x: 1, y: 3 };
  const result = snapWorldPoint(
    { x: 6.12, y: 3.08 },
    {
      settings: { ...DEFAULT_SNAP_SETTINGS, incrementMeters: 0.5 },
      corners: [anchor],
      segments: [{ start: { x: 4, y: 0 }, end: { x: 8, y: 6 } }],
      toleranceMeters: 0.25,
    },
  );
  expect(result.point).toEqual({ x: 6, y: 3 });
  expect(result.guides).toEqual([
    { axis: "y", value: 3, through: anchor },
  ]);
  expect(result.snappedToSegment).toBe(true);
});

test("a wall outside the pointer tolerance does not catch it", () => {
  const result = snapWorldPoint(
    { x: 3.27, y: 2.3 },
    {
      settings: { ...DEFAULT_SNAP_SETTINGS, incrementMeters: 0.5 },
      segments: wall,
      toleranceMeters: 0.25,
    },
  );
  expect(result.point).toEqual({ x: 3.5, y: 2.5 });
  expect(result.snappedToSegment).toBeUndefined();
});

test("turning snapping off also disables wall snapping", () => {
  const point = { x: 3.27, y: 2.05 };
  expect(
    snapWorldPoint(point, {
      settings: { ...DEFAULT_SNAP_SETTINGS, enabled: false },
      segments: wall,
      toleranceMeters: 0.25,
    }).point,
  ).toEqual(point);
});
