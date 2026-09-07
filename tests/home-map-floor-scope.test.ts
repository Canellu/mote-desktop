import { expect, test } from "bun:test";
import { getFloorControlScope } from "../src/features/home-map/floorScope";
import type { HomeMapDocument } from "../src/features/home-map/types";
import type { HueLight, HueRoom } from "../src/types/hue";

function light(id: string, overrides: Partial<HueLight> = {}): HueLight {
  return {
    id,
    deviceId: null,
    name: id,
    isOn: true,
    brightness: 60,
    reachable: true,
    colorMode: null,
    xy: null,
    ct: null,
    effect: null,
    effects: [],
    effectV2: null,
    effectsV2: [],
    supportsColor: false,
    supportsCt: false,
    ctMin: null,
    ctMax: null,
    gamut: null,
    modelId: null,
    productName: null,
    typeName: null,
    swVersion: null,
    uniqueId: null,
    function: null,
    powerup: null,
    ...overrides,
  };
}

function room(id: string, lightIds: string[]): HueRoom {
  return {
    id,
    name: id,
    class: "living_room",
    resourceType: "room",
    anyOn: true,
    allOn: true,
    brightness: 60,
    lightCount: lightIds.length,
    lightIds,
    deviceIds: [],
    groupedLightId: `${id}-grouped`,
    accessories: [],
  };
}

/** Ground has two areas; one shares the upstairs target when asked to. */
function document(options: {
  secondTargetId?: string;
  placements?: Record<string, "ground" | "upstairs">;
}): HomeMapDocument {
  const placements = options.placements ?? {};
  const on = (floorId: "ground" | "upstairs") =>
    Object.entries(placements)
      .filter(([, value]) => value === floorId)
      .map(([lightId], index) => ({ lightId, x: 1 + index * 0.5, y: 1 }));
  return {
    schemaVersion: 1,
    id: "map",
    bridgeId: "bridge",
    name: "Home",
    drawingMode: "sketch",
    units: "metric",
    floors: [
      {
        id: "ground",
        name: "Ground floor",
        vertices: [
          { id: "g1", x: 0, y: 0 },
          { id: "g2", x: 6, y: 0 },
          { id: "g3", x: 6, y: 4 },
          { id: "g4", x: 0, y: 4 },
        ],
        areas: [
          {
            id: "lounge-area",
            name: "Lounge",
            vertexIds: ["g1", "g2", "g3", "g4"],
            target: {
              resourceType: "room",
              resourceId: "00000000-0000-0000-0000-00000000l001",
            },
          },
        ],
        dimensions: [],
        lights: on("ground"),
      },
      {
        id: "upstairs",
        name: "Upstairs",
        vertices: [
          { id: "u1", x: 0, y: 0 },
          { id: "u2", x: 6, y: 0 },
          { id: "u3", x: 6, y: 4 },
          { id: "u4", x: 0, y: 4 },
        ],
        areas: [
          {
            id: "bed-area",
            name: "Bedroom",
            vertexIds: ["u1", "u2", "u3", "u4"],
            target: options.secondTargetId
              ? { resourceType: "room", resourceId: options.secondTargetId }
              : null,
          },
        ],
        dimensions: [],
        lights: on("upstairs"),
      },
    ],
  };
}

const loungeId = "00000000-0000-0000-0000-00000000l001";
const scope = (
  map: HomeMapDocument,
  rooms: HueRoom[],
  lights: HueLight[],
  overrides: Partial<Parameters<typeof getFloorControlScope>[0]> = {},
) =>
  getFloorControlScope({
    document: map,
    floor: map.floors[0],
    roomZones: rooms,
    lights,
    syncedLightIds: [],
    bridgeConnected: true,
    ...overrides,
  });

test("a floor action is exact when every member is placed on it", () => {
  const map = document({
    placements: { a: "ground", b: "ground" },
  });
  const result = scope(
    map,
    [room(loungeId, ["a", "b"])],
    [light("a"), light("b", { isOn: false })],
  );
  expect(result.exact).toBe(true);
  expect(result.disabledReason).toBeNull();
  expect(result.targets).toHaveLength(1);
  expect(result.lightIds).toEqual(["a", "b"]);
  expect(result.onCount).toBe(1);
});

test("a member on another floor disables the floor action", () => {
  const map = document({
    placements: { a: "ground", b: "upstairs" },
  });
  const result = scope(
    map,
    [room(loungeId, ["a", "b"])],
    [light("a"), light("b")],
  );
  expect(result.exact).toBe(false);
  expect(result.offFloorLightIds).toEqual(["b"]);
  expect(result.disabledReason).toContain("1 light in these rooms sits");
  expect(result.disabledReason).toContain("Ground floor");
});

test("an unplaced member disables it too, because its floor is unknown", () => {
  const map = document({ placements: { a: "ground" } });
  const result = scope(
    map,
    [room(loungeId, ["a", "b"])],
    [light("a"), light("b")],
  );
  expect(result.unplacedLightIds).toEqual(["b"]);
  expect(result.exact).toBe(false);
  expect(result.disabledReason).toContain(
    "1 light in these rooms is not placed",
  );
});

test("two areas sharing one target count that target and its lights once", () => {
  const map = document({ placements: { a: "ground", b: "ground" } });
  map.floors[0].areas.push({
    id: "second-area",
    name: "Snug",
    vertexIds: ["g1", "g2", "g3", "g4"],
    target: { resourceType: "room", resourceId: loungeId },
  });
  const result = scope(
    map,
    [room(loungeId, ["a", "b"])],
    [light("a"), light("b")],
  );
  expect(result.targets).toHaveLength(1);
  expect(result.lightIds).toEqual(["a", "b"]);
});

test("unavailable resources and unlinked floors are named, not guessed", () => {
  const missing = scope(
    document({ placements: { a: "ground" } }),
    [],
    [light("a")],
  );
  expect(missing.missingTargetAreaNames).toEqual(["Lounge"]);
  expect(missing.disabledReason).toContain("No room on this floor is linked");

  const offline = scope(
    document({ placements: { a: "ground" } }),
    [room(loungeId, ["a"])],
    [light("a")],
    { bridgeConnected: false },
  );
  expect(offline.disabledReason).toContain("Bridge offline");

  const loading = scope(
    document({ placements: { a: "ground" } }),
    [room(loungeId, ["a"])],
    [light("a")],
    { resourcesLoading: true },
  );
  expect(loading.disabledReason).toBe("Loading Hue resources.");
});

test("sync and unreachable members are excluded from what can be controlled", () => {
  const map = document({ placements: { a: "ground", b: "ground" } });
  const result = scope(
    map,
    [room(loungeId, ["a", "b"])],
    [light("a", { reachable: false }), light("b")],
    { syncedLightIds: ["b"] },
  );
  expect(result.lightIds).toEqual(["a", "b"]);
  expect(result.controllableLightIds).toEqual([]);
  expect(result.disabledReason).toContain("No reachable lights");
});
