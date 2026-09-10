import { expect, test } from "bun:test";
import {
  groupFixtures,
  groupFixtureMarkers,
  indexFixtures,
} from "../src/features/home-map/fixtures";
import {
  buildTray,
  findFixturePlacement,
  placeFixture,
  unplaceFixture,
} from "../src/features/home-map/placement";
import type { HomeMapDocument, MapFloor } from "../src/features/home-map/types";
import type { HueLight, HueRoom } from "../src/types/hue";
import { validateHomeMap } from "../src/features/home-map/validation";

const id = (suffix: string) => `00000000-0000-0000-0000-0000000000${suffix}`;
const centris = id("d1");
const lamp = id("d2");
const head1 = id("a1");
const head2 = id("a2");
const head3 = id("a3");
const solo = id("b1");

function light(
  lightId: string,
  name: string,
  deviceId: string | null,
  deviceName: string | null = null,
): HueLight {
  return {
    id: lightId,
    deviceId,
    deviceName,
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
    modelId: null,
    productName: "Hue Centris",
    typeName: null,
    swVersion: null,
    uniqueId: null,
    function: "functional",
    powerup: null,
  };
}

/** A three-head spot bar, plus a plain bulb that owns its own device. */
const lights: HueLight[] = [
  light(head1, "Centris 1", centris),
  light(head2, "Centris 2", centris),
  light(head3, "Centris 3", centris),
  light(solo, "Sofa lamp", lamp),
];

function floor(floorId: string, name: string, prefix: string): MapFloor {
  return {
    id: floorId,
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
    floors: [floor("ground", "Ground", "g"), floor("upstairs", "Up", "u")],
  };
}

test("lights sharing a device are one fixture, named by what they share", () => {
  const fixtures = groupFixtures(lights);
  expect(fixtures).toHaveLength(2);
  expect(fixtures[0].id).toBe(centris);
  expect(fixtures[0].name).toBe("Centris");
  expect(fixtures[0].lightIds).toEqual([head1, head2, head3]);
  // A single head keeps its own name, which reads better than the device's.
  expect(fixtures[1].name).toBe("Sofa lamp");
});

test("a device name wins over the shared start of its heads", () => {
  const named = groupFixtures([
    light(head1, "Centris 1", centris, "Kitchen spots"),
    light(head2, "Centris 2", centris, "Kitchen spots"),
  ]);
  expect(named[0].name).toBe("Kitchen spots");
});

test("a light with no owning device stands alone as its own fixture", () => {
  const fixtures = groupFixtures([light(solo, "Sofa lamp", null)]);
  expect(fixtures[0].id).toBe(solo);
  expect(fixtures[0].lightIds).toEqual([solo]);
});

test("placing a fixture puts every head it carries on that spot", () => {
  const result = placeFixture(
    document(),
    "ground",
    [head1, head2, head3],
    { x: 1, y: 2 },
  );
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(validateHomeMap(result.value)).toEqual([]);
  expect(result.value.floors[0].lights).toEqual([
    { lightId: head1, x: 1, y: 2 },
    { lightId: head2, x: 1, y: 2 },
    { lightId: head3, x: 1, y: 2 },
  ]);
  expect(findFixturePlacement(result.value, [head1, head2, head3])).toEqual({
    floorId: "ground",
    point: { x: 1, y: 2 },
    placedCount: 3,
  });
});

test("moving a fixture to another floor takes all of its heads along", () => {
  const placed = placeFixture(document(), "ground", [head1, head2], {
    x: 1,
    y: 1,
  });
  expect(placed.ok).toBe(true);
  if (!placed.ok) return;
  const moved = placeFixture(placed.value, "upstairs", [head1, head2], {
    x: 2,
    y: 2,
  });
  expect(moved.ok).toBe(true);
  if (!moved.ok) return;
  expect(moved.value.floors[0].lights).toEqual([]);
  expect(moved.value.floors[1].lights).toHaveLength(2);
});

test("heads left apart by older maps report the floor holding most", () => {
  const first = placeFixture(document(), "ground", [head1], { x: 1, y: 1 });
  expect(first.ok).toBe(true);
  if (!first.ok) return;
  const second = placeFixture(first.value, "ground", [head2], { x: 3, y: 1 });
  expect(second.ok).toBe(true);
  if (!second.ok) return;
  const third = placeFixture(second.value, "upstairs", [head3], { x: 2, y: 2 });
  expect(third.ok).toBe(true);
  if (!third.ok) return;
  // Two heads downstairs beat one upstairs, and their centre stands for it.
  expect(findFixturePlacement(third.value, [head1, head2, head3])).toEqual({
    floorId: "ground",
    point: { x: 2, y: 1 },
    placedCount: 2,
  });
});

test("removing a fixture takes every head off the map at once", () => {
  const placed = placeFixture(document(), "ground", [head1, head2, head3], {
    x: 1,
    y: 1,
  });
  expect(placed.ok).toBe(true);
  if (!placed.ok) return;
  const removed = unplaceFixture(placed.value, [head1, head2, head3]);
  expect(removed.ok).toBe(true);
  if (!removed.ok) return;
  expect(removed.value.floors[0].lights).toEqual([]);
  expect(unplaceFixture(document(), [head1])).toEqual({
    ok: false,
    error: "This light is not on the map.",
  });
});

test("the canvas draws one marker per fixture, at the centre of its heads", () => {
  const { ofLight } = indexFixtures(groupFixtures(lights));
  const markers = groupFixtureMarkers(
    [
      { lightId: head1, x: 1, y: 1 },
      { lightId: head2, x: 3, y: 1 },
      { lightId: solo, x: 2, y: 2 },
    ],
    Object.fromEntries(ofLight),
  );
  expect(markers).toEqual([
    { id: centris, point: { x: 2, y: 1 }, heads: 2 },
    { id: lamp, point: { x: 2, y: 2 }, heads: 1 },
  ]);
});

test("the tray lists fixtures, with the room its heads answer to", () => {
  const room: HueRoom = {
    id: id("c1"),
    name: "Kitchen",
    class: "kitchen",
    resourceType: "room",
    anyOn: true,
    allOn: false,
    brightness: 50,
    lightCount: 3,
    lightIds: [head1, head2, head3],
    deviceIds: [centris],
    groupedLightId: null,
    accessories: [],
  };
  const placed = placeFixture(document(), "ground", [head1, head2, head3], {
    x: 1,
    y: 1,
  });
  expect(placed.ok).toBe(true);
  if (!placed.ok) return;
  const tray = buildTray(placed.value, lights, [room]);
  expect(tray).toHaveLength(2);
  expect(tray[0].fixture.name).toBe("Centris");
  expect(tray[0].target?.name).toBe("Kitchen");
  expect(tray[0].splitTarget).toBe(false);
  expect(tray[0].floorId).toBe("ground");
  expect(tray[0].areaName).toBe("Ground room");
  // The bulb sharing no room with the bar is still its own unplaced row.
  expect(tray[1].target).toBeNull();
  expect(tray[1].floorId).toBeNull();
});
