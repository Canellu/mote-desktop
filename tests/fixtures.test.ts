import { expect, test } from "bun:test";
import {
  freeLights,
  groupFixtures,
  renameFixture,
  saveFixture,
  suggestFixtureLights,
  targetsOfLights,
  ungroupFixture,
} from "../src/lib/fixtures";
import type { HueLight, HueRoom } from "../src/types/hue";

function light(
  id: string,
  name: string,
  productName: string | null,
  modelId: string | null = null,
): HueLight {
  return {
    id,
    deviceId: `device-${id}`,
    deviceName: null,
    name,
    isOn: true,
    brightness: 50,
    reachable: true,
    colorMode: "ct",
    xy: null,
    ct: 366,
    effect: null,
    effects: [],
    effectV2: null,
    effectsV2: [],
    supportsColor: true,
    supportsCt: true,
    ctMin: 153,
    ctMax: 500,
    gamut: null,
    modelId,
    productName,
    typeName: null,
    swVersion: null,
    uniqueId: null,
    function: "functional",
    powerup: null,
  };
}

function room(id: string, lightIds: string[]): HueRoom {
  return {
    id,
    name: id,
    resourceType: "room",
    lightIds,
  } as unknown as HueRoom;
}

/** A bedroom Centris and two Infuses, as a real bridge reports them. */
const lights = [
  light("c", "Hue Centris ceiling 3", "Hue Centris ceiling", "5060730P7_01"),
  light("s1", "Jenny spot", "Hue Centris spot", "5060730P7_02"),
  light("s2", "Hue Centris spot 11", "Hue Centris spot", "5060730P7_03"),
  light("i1", "Hue Infuse ceiling 2", "Hue Infuse ceiling", "915005997301"),
  light("i2", "Hue Infuse ceiling 3", "Hue Infuse ceiling", "915005997301"),
];

test("lights on separate devices are never joined on their own", () => {
  expect(groupFixtures(lights)).toHaveLength(5);
});

test("a fixture the person creates groups its lights and takes its name", () => {
  const created = saveFixture([], ["c", "s1", "s2"], "Bedroom plate", "f1");
  if (!created.ok) throw new Error(created.error);
  const fixtures = groupFixtures(lights, { overrides: created.value });
  expect(fixtures).toHaveLength(3);
  expect(fixtures[0]).toMatchObject({
    id: "f1",
    name: "Bedroom plate",
    lightIds: ["c", "s1", "s2"],
    deviceCount: 3,
    custom: true,
  });
});

test("a fixture needs two lights, and a light belongs to one fixture", () => {
  expect(saveFixture([], ["c"], "", "f1").ok).toBe(false);
  const first = saveFixture([], ["c", "s1"], "", "f1");
  if (!first.ok) throw new Error(first.error);
  // Another fixture can't take a light the first one holds.
  expect(saveFixture(first.value, ["s1", "s2"], "", "f2").ok).toBe(false);
  expect(freeLights(lights, first.value).map((light) => light.id)).toEqual([
    "s2",
    "i1",
    "i2",
  ]);
  // The fixture itself can change which lights it holds, in place.
  const changed = saveFixture(first.value, ["c", "s1", "s2"], "Plate", "f1");
  if (!changed.ok) throw new Error(changed.error);
  expect(changed.value).toEqual([
    { id: "f1", lightIds: ["c", "s1", "s2"], name: "Plate" },
  ]);
});

test("an unnamed fixture is called by what its lights share", () => {
  const created = saveFixture([], ["c", "s1"], "", "f1");
  if (!created.ok) throw new Error(created.error);
  expect(groupFixtures(lights, { overrides: created.value })[0].name).toBe(
    "Hue Centris",
  );
});

test("a fixture can be renamed and ungrouped", () => {
  const created = saveFixture([], ["i1", "i2"], "", "f1");
  if (!created.ok) throw new Error(created.error);
  const renamed = renameFixture(created.value, "f1", "Living room pair");
  if (!renamed.ok) throw new Error(renamed.error);
  expect(renamed.value[0].name).toBe("Living room pair");
  const ungrouped = ungroupFixture(renamed.value, "f1");
  if (!ungrouped.ok) throw new Error(ungrouped.error);
  expect(groupFixtures(lights, { overrides: ungrouped.value })).toHaveLength(5);
});

test("parts of one model number in one room are suggested, never assumed", () => {
  const targetOfLight = targetsOfLights([
    room("bedroom", ["c", "s1", "s2"]),
    room("living", ["i1", "i2"]),
  ]);
  expect(suggestFixtureLights(lights, targetOfLight)).toEqual([
    "c",
    "s1",
    "s2",
  ]);
  // The Infuses share a model but have no part numbers.
  expect(
    suggestFixtureLights(
      lights.filter((entry) => entry.id.startsWith("i")),
      targetOfLight,
    ),
  ).toEqual([]);
});

test("two identical fixtures in one room get no suggestion", () => {
  const twice = [
    ...lights.slice(0, 3),
    light("c2", "Ceiling", "Hue Centris ceiling", "5060730P7_01"),
    light("s3", "Spot", "Hue Centris spot", "5060730P7_02"),
  ];
  const targetOfLight = targetsOfLights([
    room(
      "hall",
      twice.map((entry) => entry.id),
    ),
  ]);
  expect(suggestFixtureLights(twice, targetOfLight)).toEqual([]);
});
