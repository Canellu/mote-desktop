import { expect, test } from "bun:test";
import {
  lightsInArea,
  queueOperation,
  reconcileOperations,
  removeOperation,
  reviewOperation,
  runQueuedOperations,
  type MapHueOperation,
  type QueuedHueOperation,
} from "../src/features/home-map/hueOperations";
import { createHueOperationRunner } from "../src/features/home-map/hueRunner";
import type { HomeMapDocument } from "../src/features/home-map/types";
import { validateHomeMap } from "../src/features/home-map/validation";
import type { HueLight, HueRoom, HueZone } from "../src/types/hue";

const zoneId = "00000000-0000-0000-0000-00000000e001";
const kitchenId = "00000000-0000-0000-0000-00000000e002";
const lampId = "00000000-0000-0000-0000-0000000000a1";
const stripId = "00000000-0000-0000-0000-0000000000b2";

function light(id: string, name: string, deviceId: string): HueLight {
  return {
    id,
    deviceId,
    name,
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
  };
}

function room(
  id: string,
  name: string,
  lightIds: string[],
  deviceIds: string[],
): HueRoom {
  return {
    id,
    name,
    class: "living_room",
    resourceType: "room",
    anyOn: true,
    allOn: false,
    brightness: 50,
    lightCount: lightIds.length,
    lightIds,
    deviceIds,
    groupedLightId: `${id}-grouped`,
    accessories: [],
  };
}

function zone(id: string, name: string, lightIds: string[]): HueZone {
  return {
    id,
    name,
    class: "other",
    resourceType: "zone",
    anyOn: false,
    allOn: false,
    brightness: null,
    lightCount: lightIds.length,
    lightIds,
    deviceIds: [],
    groupedLightId: `${id}-grouped`,
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
    floors: [
      {
        id: "ground",
        name: "Ground floor",
        vertices: [
          { id: "v1", x: 0, y: 0 },
          { id: "v2", x: 6, y: 0 },
          { id: "v3", x: 6, y: 4 },
          { id: "v4", x: 0, y: 4 },
        ],
        areas: [
          {
            id: "snug",
            name: "Snug",
            vertexIds: ["v1", "v2", "v3", "v4"],
            target: null,
          },
        ],
        dimensions: [],
        lights: [
          { lightId: lampId, x: 2, y: 2 },
          { lightId: stripId, x: 9, y: 9 },
        ],
      },
    ],
  };
}

const lights = [
  light(lampId, "Reading lamp", "device-a"),
  light(stripId, "Hall strip", "device-b"),
];

const createZone: MapHueOperation = {
  id: "op-1",
  kind: "create-zone",
  areaId: "snug",
  name: "Snug",
  lightIds: [lampId],
};

test("the review list starts from the markers inside the room", () => {
  const map = document();
  const inside = lightsInArea(map.floors[0], map.floors[0].areas[0], lights);
  expect(inside.map((entry) => entry.name)).toEqual(["Reading lamp"]);
});

test("queued work is validated and kept to one change per room", () => {
  const queued = queueOperation([], createZone);
  expect(queued.ok).toBe(true);
  if (!queued.ok) return;
  expect(queued.value[0].status).toEqual({ state: "pending" });
  expect(queueOperation(queued.value, { ...createZone, id: "op-2" })).toEqual({
    ok: false,
    error: "This room already has a queued Hue change to review.",
  });
  expect(queueOperation([], { ...createZone, name: " " })).toEqual({
    ok: false,
    error: "Name the zone.",
  });
  expect(queueOperation([], { ...createZone, lightIds: [] })).toEqual({
    ok: false,
    error: "Choose at least one light for the zone.",
  });
});

test("a queued change can be dropped, a committed one cannot", () => {
  const queued: QueuedHueOperation[] = [
    { operation: createZone, status: { state: "pending" } },
  ];
  expect(removeOperation(queued, "op-1")).toEqual([]);
  const committed: QueuedHueOperation[] = [
    { operation: createZone, status: { state: "done", resourceId: zoneId } },
  ];
  expect(removeOperation(committed, "op-1")).toEqual(committed);
});

test("review states what happens in Hue, not only on the map", () => {
  const review = reviewOperation(createZone, {
    lights,
    roomZones: [zone(zoneId, "Snug", [])],
  });
  expect(review.summary).toContain('Create the Hue zone "Snug" with 1 light');
  expect(review.lightNames).toEqual(["Reading lamp"]);
  expect(review.warnings).toContain(
    "The zone will also appear in the Hue app and on your dashboard.",
  );
  expect(review.warnings.some((text) => text.includes("already exists"))).toBe(
    true,
  );

  const move = reviewOperation(
    {
      id: "op-3",
      kind: "move-devices",
      areaId: "snug",
      roomId: kitchenId,
      roomName: "Kitchen",
      deviceIds: ["device-b"],
      lightIds: [stripId],
    },
    {
      lights,
      roomZones: [
        room(kitchenId, "Kitchen", [], []),
        room(
          "00000000-0000-0000-0000-00000000e003",
          "Hallway",
          [stripId],
          ["device-b"],
        ),
      ],
    },
  );
  expect(move.summary).toContain('Move 1 device into the Hue room "Kitchen"');
  expect(move.warnings.some((text) => text.includes("Hallway"))).toBe(true);
  expect(
    move.warnings.some((text) =>
      text.includes("every light on a moved device"),
    ),
  ).toBe(true);
});

test("running keeps every success even when a later change fails", async () => {
  const queue: QueuedHueOperation[] = [
    { operation: createZone, status: { state: "pending" } },
    {
      operation: {
        id: "op-2",
        kind: "move-devices",
        areaId: "other",
        roomId: kitchenId,
        roomName: "Kitchen",
        deviceIds: ["device-b"],
        lightIds: [stripId],
      },
      status: { state: "pending" },
    },
  ];
  const results = await runQueuedOperations(queue, async (operation) => {
    if (operation.kind === "create-zone") return zoneId;
    throw new Error("Bridge is busy.");
  });
  expect(results[0].status).toEqual({ state: "done", resourceId: zoneId });
  expect(results[1].status).toEqual({
    state: "failed",
    error: "Bridge is busy.",
  });

  // Retrying re-runs only the unresolved work.
  const attempted: string[] = [];
  const retried = await runQueuedOperations(results, async (operation) => {
    attempted.push(operation.id);
    return null;
  });
  expect(attempted).toEqual(["op-2"]);
  expect(retried[0].status).toEqual({ state: "done", resourceId: zoneId });
  expect(retried[1].status).toEqual({ state: "done", resourceId: null });
});

test("reconciling links the map to what was actually created", () => {
  const map = document();
  const linked = reconcileOperations(map, [
    { operation: createZone, status: { state: "done", resourceId: zoneId } },
  ]);
  expect(linked.floors[0].areas[0].target).toEqual({
    resourceType: "zone",
    resourceId: zoneId,
  });
  expect(validateHomeMap(linked)).toEqual([]);
  // Unresolved work leaves the map exactly as it was.
  expect(
    reconcileOperations(map, [
      { operation: createZone, status: { state: "failed", error: "no" } },
    ]),
  ).toEqual(map);
});

test("the runner creates a zone and moves devices out of their old room", async () => {
  const calls: { command: string; args: unknown }[] = [];
  const rooms = [
    room(kitchenId, "Kitchen", [], ["device-c"]),
    room(
      "00000000-0000-0000-0000-00000000e003",
      "Hallway",
      [stripId],
      ["device-b"],
    ),
  ];
  const run = createHueOperationRunner(rooms, (async (
    command: string,
    args: unknown,
  ) => {
    calls.push({ command, args });
    return command === "create-hue-zone" ? zoneId : undefined;
  }) as never);

  expect(await run(createZone)).toBe(zoneId);
  expect(calls[0]).toEqual({
    command: "create-hue-zone",
    args: { name: "Snug", lightIds: [lampId] },
  });

  calls.length = 0;
  expect(
    await run({
      id: "op-2",
      kind: "move-devices",
      areaId: "snug",
      roomId: kitchenId,
      roomName: "Kitchen",
      deviceIds: ["device-b"],
      lightIds: [stripId],
    }),
  ).toBeNull();
  expect(calls).toEqual([
    {
      command: "update-room-members",
      args: {
        roomId: "00000000-0000-0000-0000-00000000e003",
        deviceIds: [],
      },
    },
    {
      command: "update-room-members",
      args: { roomId: kitchenId, deviceIds: ["device-c", "device-b"] },
    },
  ]);
});

test("the runner refuses a target room that has gone", async () => {
  const run = createHueOperationRunner([], (async () => undefined) as never);
  await expect(
    run({
      id: "op-2",
      kind: "move-devices",
      areaId: "snug",
      roomId: kitchenId,
      roomName: "Kitchen",
      deviceIds: ["device-b"],
      lightIds: [stripId],
    }),
  ).rejects.toThrow("The target Hue room no longer exists.");
});
