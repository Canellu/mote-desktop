import { expect, test } from "bun:test";
import {
  buildCopiedActions,
  capabilitiesFromResource,
  creatablePalette,
  fitActionToLight,
  type LightCapabilities,
} from "../src/features/space-screen/sceneCopy";

const caps = (
  id: string,
  overrides: Partial<LightCapabilities> = {},
): LightCapabilities => ({
  id,
  dimming: true,
  color: false,
  ct: null,
  gradient: false,
  effects: [],
  effectsV2: [],
  ...overrides,
});

const green = { xy: { x: 0.21, y: 0.68 } };
const gradientAction = {
  on: { on: true },
  dimming: { brightness: 60 },
  gradient: {
    points: [{ color: green }, { color: { xy: { x: 0.15, y: 0.2 } } }],
    mode: "interpolated_palette",
    points_capable: 5,
  },
  effects_v2: { action: { effect: "candle" } },
};

test("reads capabilities from a raw light resource", () => {
  expect(
    capabilitiesFromResource({
      id: "a",
      dimming: { brightness: 40 },
      color: { xy: { x: 0.3, y: 0.3 } },
      color_temperature: {
        mirek: 300,
        mirek_schema: { mirek_minimum: 153, mirek_maximum: 454 },
      },
      effects_v2: { action: { effect_values: ["no_effect", "candle"] } },
    }),
  ).toEqual({
    id: "a",
    dimming: true,
    color: true,
    ct: { min: 153, max: 454 },
    gradient: false,
    effects: [],
    effectsV2: ["no_effect", "candle"],
  });
});

test("a white-only light gets a clamped color temperature, not color", () => {
  const action = fitActionToLight(
    { on: { on: true }, dimming: { brightness: 50 }, color: green },
    caps("w", { ct: { min: 153, max: 454 } }),
  );
  expect(action.color).toBeUndefined();
  const mirek = (action.color_temperature as { mirek: number }).mirek;
  expect(Number.isInteger(mirek)).toBe(true);
  expect(mirek).toBeGreaterThanOrEqual(153);
  expect(mirek).toBeLessThanOrEqual(454);
  expect(action.dimming).toEqual({ brightness: 50 });
});

test("a gradient falls back to its first color and drops unsupported effects", () => {
  const action = fitActionToLight(gradientAction, caps("c", { color: true }));
  expect(action.gradient).toBeUndefined();
  expect(action.effects_v2).toBeUndefined();
  expect(action.color).toEqual(green);
});

test("a gradient light keeps only the fields a POST accepts", () => {
  const action = fitActionToLight(
    gradientAction,
    caps("g", { color: true, gradient: true, effectsV2: ["candle"] }),
  );
  expect(action.gradient).toEqual({
    points: [{ color: green }, { color: { xy: { x: 0.15, y: 0.2 } } }],
    mode: "interpolated_palette",
  });
  expect(action.effects_v2).toEqual({ action: { effect: "candle" } });
});

test("an on/off light keeps only its power state", () => {
  expect(
    fitActionToLight(
      { on: { on: false }, dimming: { brightness: 50 }, color: green },
      caps("p", { dimming: false }),
    ),
  ).toEqual({ on: { on: false } });
});

test("lights take actions written for their own kind, in rotation", () => {
  const red = { xy: { x: 0.68, y: 0.31 } };
  const actions = buildCopiedActions(
    [
      { action: { on: { on: true }, color_temperature: { mirek: 400 } } },
      { action: { on: { on: true }, color: green } },
      { action: { on: { on: true }, color: red } },
    ],
    [
      caps("c1", { color: true, ct: { min: 153, max: 500 } }),
      caps("w1", { ct: { min: 153, max: 454 } }),
      caps("c2", { color: true, ct: { min: 153, max: 500 } }),
      caps("c3", { color: true, ct: { min: 153, max: 500 } }),
    ],
  ) as { target: { rid: string }; action: Record<string, unknown> }[];
  expect(actions.map((item) => item.target.rid)).toEqual([
    "c1",
    "w1",
    "c2",
    "c3",
  ]);
  expect(actions[0].action.color).toEqual(green);
  expect(actions[1].action.color_temperature).toEqual({ mirek: 400 });
  expect(actions[2].action.color).toEqual(red);
  expect(actions[3].action.color).toEqual(green);
});

test("palette keeps the required arrays and drops read-only fields", () => {
  expect(
    creatablePalette({
      color: [{ color: green, dimming: { brightness: 70 } }],
      dimming: [],
      color_temperature: [],
      effects: [],
      effects_v2: [],
    }),
  ).toEqual({
    color: [{ color: green, dimming: { brightness: 70 } }],
    dimming: [],
    color_temperature: [],
  });
  expect(creatablePalette({ color: [], dimming: [] })).toBeNull();
});
