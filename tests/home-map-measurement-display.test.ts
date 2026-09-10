import { expect, test } from "bun:test";
import {
  DEFAULT_MEASUREMENT_DISPLAY,
  getCornerAngles,
  parseMeasurementDisplay,
} from "../src/features/home-map/measurementDisplay";

test("corner angles distinguish the inside from the outside", () => {
  expect(
    getCornerAngles({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 }, 1),
  ).toEqual({ inner: 90, outer: 270 });
  expect(
    getCornerAngles({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }, 1),
  ).toEqual({ inner: 270, outer: 90 });
});

test("corner angles stay correct when the ring winding is reversed", () => {
  expect(
    getCornerAngles({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }, -1),
  ).toEqual({ inner: 90, outer: 270 });
});

test("measurement display settings reject unknown stored values", () => {
  expect(parseMeasurementDisplay(null)).toEqual(DEFAULT_MEASUREMENT_DISPLAY);
  expect(
    parseMeasurementDisplay({ wallLengths: "all", cornerAngles: "both" }),
  ).toEqual({ wallLengths: "all", cornerAngles: "both" });
  expect(
    parseMeasurementDisplay({ wallLengths: "nope", cornerAngles: 42 }),
  ).toEqual(DEFAULT_MEASUREMENT_DISPLAY);
});
