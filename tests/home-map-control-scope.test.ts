import { describe, expect, test } from "bun:test";
import {
  getMapControlScope,
  type MapControlScopeInput,
} from "../src/features/home-map/controlScope";
import type { HomeMapDocument } from "../src/features/home-map/types";
import type { HueLight, HueRoom, HueScene } from "../src/types/hue";

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

function room(overrides: Partial<HueRoom> = {}): HueRoom {
  return {
    id: "living-room",
    name: "Living room",
    class: "living_room",
    resourceType: "room",
    anyOn: true,
    allOn: true,
    brightness: 60,
    lightCount: 4,
    lightIds: ["inside", "outside", "upstairs", "unplaced"],
    deviceIds: [],
    groupedLightId: "living-grouped-light",
    accessories: [],
    ...overrides,
  };
}

function scene(id: string, overrides: Partial<HueScene> = {}): HueScene {
  return {
    id,
    name: "Relax",
    resourceType: "scene",
    group: "living-room",
    sceneType: null,
    status: "Inactive",
    dynamic: false,
    speed: null,
    autoDynamic: null,
    smart: false,
    colors: [],
    actions: [],
    ...overrides,
  };
}

function input(): MapControlScopeInput {
  const target = { resourceType: "room" as const, resourceId: "living-room" };
  const document: HomeMapDocument = {
    schemaVersion: 1,
    id: "home-map",
    bridgeId: "bridge-a",
    name: "Home",
    drawingMode: "sketch",
    units: "metric",
    floors: [
      {
        id: "ground",
        name: "Ground floor",
        vertices: [
          { id: "a", x: 0, y: 0 },
          { id: "b", x: 4, y: 0 },
          { id: "c", x: 4, y: 4 },
          { id: "d", x: 0, y: 4 },
          { id: "e", x: 8, y: 0 },
          { id: "f", x: 8, y: 4 },
        ],
        areas: [
          {
            id: "living",
            name: "Living",
            vertexIds: ["a", "b", "c", "d"],
            target,
          },
          {
            id: "dining",
            name: "Dining",
            vertexIds: ["b", "e", "f", "c"],
            target,
          },
        ],
        dimensions: [],
        lights: [
          { lightId: "inside", x: 2, y: 2 },
          { lightId: "outside", x: 6, y: 2 },
          { lightId: "unrelated", x: 1, y: 1 },
        ],
      },
      {
        id: "upper",
        name: "Upstairs",
        vertices: [
          { id: "a", x: 0, y: 0 },
          { id: "b", x: 4, y: 0 },
          { id: "c", x: 4, y: 4 },
          { id: "d", x: 0, y: 4 },
        ],
        areas: [
          {
            id: "landing",
            name: "Landing",
            vertexIds: ["a", "b", "c", "d"],
            target,
          },
        ],
        dimensions: [],
        lights: [{ lightId: "upstairs", x: 2, y: 2 }],
      },
    ],
  };
  return {
    document,
    floor: document.floors[0],
    area: document.floors[0].areas[0],
    roomZones: [room()],
    lights: ["inside", "outside", "upstairs", "unplaced", "unrelated"].map(
      (id) => light(id),
    ),
    scenes: [scene("relax")],
    syncedLightIds: [],
    bridgeConnected: true,
  };
}

describe("Home Map control scope", () => {
  test("uses the complete linked membership regardless of marker geometry", () => {
    const state = input();
    const scope = getMapControlScope(state);
    expect(scope.target).toBe(state.roomZones[0]);
    expect(scope.memberIds).toEqual([
      "inside",
      "outside",
      "upstairs",
      "unplaced",
    ]);
    expect(scope.controllableMembers.map((member) => member.id)).toEqual(
      scope.memberIds,
    );
    expect(scope.outsideAreaCount).toBe(1);
    expect(scope.offFloorCount).toBe(1);
    expect(scope.unplacedCount).toBe(1);
    expect(scope.controlsDisabledReason).toBeNull();

    state.floor.lights[0].x = 10;
    const moved = getMapControlScope(state);
    expect(moved.memberIds).toEqual(scope.memberIds);
    expect(moved.outsideAreaCount).toBe(2);
  });

  test("discloses split areas sharing a target across floors", () => {
    const state = input();
    const scope = getMapControlScope(state);
    expect(scope.sharedAreaCount).toBe(3);
    expect(scope.sharedFloorCount).toBe(2);
    expect(scope.currentFloorAreaIds).toEqual(["living", "dining"]);

    state.floor.areas[1].target = {
      resourceType: "zone",
      resourceId: "living-room",
    };
    const separate = getMapControlScope(state);
    expect(separate.sharedAreaCount).toBe(2);
    expect(separate.currentFloorAreaIds).toEqual(["living"]);
  });

  test("requires both target UUID and resource type and never relinks by name", () => {
    const state = input();
    state.roomZones = [
      { ...room(), resourceType: "zone" },
      room({ id: "replacement-room", name: "Living room" }),
    ];
    const missing = getMapControlScope(state);
    expect(missing.target).toBeNull();
    expect(missing.members).toEqual([]);
    expect(missing.scenes).toEqual([]);
    expect(missing.controlsDisabledReason).toContain("no longer available");
  });

  test("counts missing, offline and syncing members while aggregating available lights", () => {
    const state = input();
    state.roomZones = [
      room({
        lightIds: [
          "inside",
          "outside",
          "upstairs",
          "unplaced",
          "missing",
          "inside",
        ],
      }),
    ];
    state.lights = [
      light("inside", { brightness: 30 }),
      light("outside", { brightness: 90 }),
      light("upstairs", { reachable: false, brightness: 100 }),
      light("unplaced", { brightness: 100 }),
    ];
    state.syncedLightIds = ["unplaced"];
    const scope = getMapControlScope(state);
    expect(scope.memberIds).toHaveLength(5);
    expect(scope.missingLightIds).toEqual(["missing"]);
    expect(scope.offlineCount).toBe(1);
    expect(scope.syncedCount).toBe(1);
    expect(scope.controllableMembers.map((member) => member.id)).toEqual([
      "inside",
      "outside",
    ]);
    expect(scope.anyOn).toBe(true);
    expect(scope.allOn).toBe(true);
    expect(scope.brightness).toBe(60);
    expect(scope.brightnessMixed).toBe(true);
    expect(scope.controlsDisabledReason).toBeNull();
    expect(scope.scenesDisabledReason).toContain("Stop sync");
  });

  test("reports partial power as mixed and ignores stale group aggregates", () => {
    const state = input();
    state.roomZones = [
      room({ lightIds: ["inside", "outside"], anyOn: false, brightness: 100 }),
    ];
    state.lights = [
      light("inside", { brightness: 40 }),
      light("outside", { isOn: false }),
    ];
    const mixed = getMapControlScope(state);
    expect(mixed.anyOn).toBe(true);
    expect(mixed.allOn).toBe(false);
    expect(mixed.brightness).toBe(40);
    expect(mixed.brightnessMixed).toBe(true);

    state.lights = state.lights.map((member) => ({ ...member, isOn: false }));
    const off = getMapControlScope(state);
    expect(off.anyOn).toBe(false);
    expect(off.allOn).toBe(false);
    expect(off.brightness).toBeNull();
    expect(off.brightnessMixed).toBe(false);
  });

  test("only offers saved scenes belonging to the exact current Hue membership", () => {
    const state = input();
    const action = {
      targetId: "inside",
      on: true,
      brightness: 60,
      xy: null,
      mirek: null,
      effect: null,
      effectV2: null,
    };
    state.scenes = [
      scene("target-scene", { actions: [action] }),
      scene("target-without-actions"),
      scene("other-group", { group: "another-room", actions: [action] }),
      scene("ungrouped", { group: null, actions: [action] }),
      scene("outside-target", {
        actions: [{ ...action, targetId: "unrelated" }],
      }),
      scene("smart", { resourceType: "smart_scene", smart: true }),
      scene("smart-flag", { smart: true }),
    ];
    expect(
      getMapControlScope(state).scenes.map((candidate) => candidate.id),
    ).toEqual(["target-scene", "target-without-actions"]);
    state.roomZones = [room({ lightIds: ["outside"] })];
    expect(
      getMapControlScope(state).scenes.map((candidate) => candidate.id),
    ).toEqual(["target-without-actions"]);
  });

  test("disables controls while loading or offline even with retained resources", () => {
    const state = input();
    state.bridgeConnected = false;
    const offline = getMapControlScope(state);
    expect(offline.target).not.toBeNull();
    expect(offline.controlsDisabledReason).toContain("Bridge offline");
    expect(offline.scenesDisabledReason).toBe(offline.controlsDisabledReason);
    state.bridgeConnected = true;
    state.resourcesLoading = true;
    expect(getMapControlScope(state).controlsDisabledReason).toContain(
      "Loading",
    );
  });

  test("disables controls for unlinked, empty or missing group services", () => {
    const state = input();
    state.roomZones = [room({ groupedLightId: null })];
    expect(getMapControlScope(state).controlsDisabledReason).toContain(
      "no group control",
    );
    state.roomZones = [room({ lightIds: [] })];
    expect(getMapControlScope(state).controlsDisabledReason).toContain(
      "no lights",
    );
    state.area.target = null;
    const unlinked = getMapControlScope(state);
    expect(unlinked.controlsDisabledReason).toContain("not linked");
    expect(unlinked.sharedAreaCount).toBe(0);
  });

  test("disables a fully syncing or unreachable group and keeps partial sync power available", () => {
    const state = input();
    state.syncedLightIds = state.roomZones[0].lightIds;
    const syncing = getMapControlScope(state);
    expect(syncing.controlsDisabledReason).toContain("All lights are syncing");
    expect(syncing.anyOn).toBe(false);

    state.syncedLightIds = ["inside"];
    expect(getMapControlScope(state).controlsDisabledReason).toBeNull();
    expect(getMapControlScope(state).scenesDisabledReason).not.toBeNull();
    state.lights = state.lights.map((member) => ({
      ...member,
      reachable: false,
    }));
    expect(getMapControlScope(state).controlsDisabledReason).toContain(
      "No reachable lights",
    );

    state.syncedLightIds = [];
    state.lights = [];
    expect(getMapControlScope(state).missingLightIds).toHaveLength(4);
    expect(getMapControlScope(state).controlsDisabledReason).not.toBeNull();
  });

  test("a marker on the selected wall remains in its scope disclosure", () => {
    const state = input();
    state.floor.lights[1] = { lightId: "outside", x: 4, y: 2 };
    expect(getMapControlScope(state).outsideAreaCount).toBe(0);
  });
});
