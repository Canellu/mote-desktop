import { describe, expect, test } from "bun:test";
import { locatePoint } from "../src/features/home-map/geometry";
import {
  getAreaLabelPoint,
  getAreaLabelWidth,
  getMapBounds,
} from "../src/features/home-map/viewGeometry";

describe("map view geometry", () => {
  test("empty bounds remain usable by the map viewport", () => {
    expect(getMapBounds([])).toEqual({ minX: 0, minY: 0, width: 1, height: 1 });
    expect(getAreaLabelPoint([])).toBeNull();
  });

  test("bounds preserve negative coordinates and actual proportions", () => {
    expect(
      getMapBounds([
        { x: -8, y: -6 },
        { x: 2, y: -1 },
      ]),
    ).toEqual({
      minX: -8,
      minY: -6,
      width: 10,
      height: 5,
    });
    expect(getMapBounds([{ x: -4, y: -2 }])).toEqual({
      minX: -4,
      minY: -2,
      width: 0.01,
      height: 0.01,
    });
  });

  test("a rectangular room label is centered regardless of winding", () => {
    const ring = [
      { x: -8, y: -6 },
      { x: 2, y: -6 },
      { x: 2, y: -2 },
      { x: -8, y: -2 },
    ];
    expect(getAreaLabelPoint(ring)).toEqual({ x: -3, y: -4 });
    expect(getAreaLabelPoint([...ring].reverse())).toEqual({ x: -3, y: -4 });
  });

  test("L-shaped rooms place labels inside even when their centroid is outside", () => {
    const ring = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 10 },
      { x: 0, y: 10 },
    ];
    const anchor = getAreaLabelPoint(ring);
    expect(anchor).not.toBeNull();
    expect(locatePoint(anchor!, ring)).toBe("inside");
    const reversedAnchor = getAreaLabelPoint([...ring].reverse());
    expect(locatePoint(reversedAnchor!, ring)).toBe("inside");
  });

  test("a concave room keeps its label away from a narrow corridor", () => {
    const ring = [
      { x: -10, y: -8 },
      { x: -4, y: -8 },
      { x: -4, y: -7 },
      { x: 6, y: -7 },
      { x: 6, y: -6 },
      { x: -4, y: -6 },
      { x: -4, y: -2 },
      { x: -10, y: -2 },
    ];
    const anchor = getAreaLabelPoint(ring)!;
    expect(locatePoint(anchor, ring)).toBe("inside");
    expect(anchor.x).toBeLessThan(-4);
  });

  test("label width uses the walls around the anchor, not the full concave bounds", () => {
    const ring = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(getAreaLabelWidth(ring, { x: 1, y: 6 })).toBe(2);
    expect(getAreaLabelWidth(ring, { x: 7, y: 1 })).toBe(6);
    expect(getAreaLabelWidth([...ring].reverse(), { x: 1, y: 6 })).toBe(2);
    expect(getAreaLabelWidth(ring, { x: 5, y: 5 })).toBe(0);
    expect(getAreaLabelWidth([], { x: 0, y: 0 })).toBe(0);
  });
});
