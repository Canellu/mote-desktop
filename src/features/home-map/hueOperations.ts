import type { HueLight, HueRoomZone } from "@/types/hue";
import { locatePoint } from "./geometry";
import type { HomeMapDocument, MapArea, MapFloor, MapResult } from "./types";

/**
 * Changes that touch the bridge are queued, reviewed, and only sent when the
 * map is saved. Geometry edits never imply one.
 */
export type MapHueOperation =
  | {
      id: string;
      kind: "create-zone";
      /** The map area that will link to the zone once it exists. */
      areaId: string;
      name: string;
      lightIds: string[];
    }
  | {
      id: string;
      kind: "move-devices";
      areaId: string;
      /** An existing Hue room that will receive the devices. */
      roomId: string;
      roomName: string;
      deviceIds: string[];
      /** Named for review: a device can carry several light services. */
      lightIds: string[];
    };

export type MapHueOperationStatus =
  | { state: "pending" }
  | { state: "running" }
  | { state: "done"; resourceId: string | null }
  | { state: "failed"; error: string };

export interface QueuedHueOperation {
  operation: MapHueOperation;
  status: MapHueOperationStatus;
}

export const isUnresolved = (entry: QueuedHueOperation): boolean =>
  entry.status.state !== "done";

/** Lights whose markers sit inside an area, as the starting review list. */
export function lightsInArea(
  floor: MapFloor,
  area: MapArea,
  lights: readonly HueLight[],
): HueLight[] {
  const vertices = new Map(floor.vertices.map((vertex) => [vertex.id, vertex]));
  const ring = area.vertexIds.flatMap((id) => {
    const vertex = vertices.get(id);
    return vertex ? [vertex] : [];
  });
  if (ring.length !== area.vertexIds.length) return [];
  const byId = new Map(lights.map((light) => [light.id, light]));
  return floor.lights
    .filter((placement) => locatePoint(placement, ring) !== "outside")
    .flatMap((placement) => {
      const light = byId.get(placement.lightId);
      return light ? [light] : [];
    });
}

export function queueOperation(
  queue: readonly QueuedHueOperation[],
  operation: MapHueOperation,
): MapResult<QueuedHueOperation[]> {
  if (
    !operation.id.trim() ||
    queue.some((entry) => entry.operation.id === operation.id)
  )
    return { ok: false, error: "This change is already queued." };
  if (operation.kind === "create-zone") {
    if (!operation.name.trim()) return { ok: false, error: "Name the zone." };
    if (operation.lightIds.length === 0)
      return { ok: false, error: "Choose at least one light for the zone." };
  } else if (operation.deviceIds.length === 0)
    return { ok: false, error: "Choose at least one device to move." };
  if (
    queue.some(
      (entry) =>
        isUnresolved(entry) && entry.operation.areaId === operation.areaId,
    )
  )
    return {
      ok: false,
      error: "This room already has a queued Hue change to review.",
    };
  return {
    ok: true,
    value: [...queue, { operation, status: { state: "pending" } }],
  };
}

/** Only unsent work can be dropped; a committed change already exists in Hue. */
export function removeOperation(
  queue: readonly QueuedHueOperation[],
  operationId: string,
): QueuedHueOperation[] {
  return queue.filter(
    (entry) =>
      entry.operation.id !== operationId || entry.status.state === "done",
  );
}

export interface OperationReview {
  summary: string;
  /** Every light the change affects, named for the review list. */
  lightNames: string[];
  warnings: string[];
}

export function reviewOperation(
  operation: MapHueOperation,
  context: {
    lights: readonly HueLight[];
    roomZones: readonly HueRoomZone[];
  },
): OperationReview {
  const name = (id: string) =>
    context.lights.find((light) => light.id === id)?.name ?? id;
  const lightNames = operation.lightIds.map(name);
  if (operation.kind === "create-zone") {
    const clash = context.roomZones.some(
      (candidate) =>
        candidate.resourceType === "zone" &&
        candidate.name.trim().toLowerCase() ===
          operation.name.trim().toLowerCase(),
    );
    return {
      summary: `Create the Hue zone "${operation.name}" with ${lightNames.length} ${
        lightNames.length === 1 ? "light" : "lights"
      }.`,
      lightNames,
      warnings: [
        "The zone will also appear in the Hue app and on your dashboard.",
        "A new zone starts with no scenes.",
        ...(clash ? [`A zone named "${operation.name}" already exists.`] : []),
      ],
    };
  }
  const sourceRooms = [
    ...new Set(
      operation.lightIds.flatMap((lightId) => {
        const room = context.roomZones.find(
          (candidate) =>
            candidate.resourceType === "room" &&
            candidate.lightIds.includes(lightId),
        );
        return room && room.id !== operation.roomId ? [room.name] : [];
      }),
    ),
  ];
  return {
    summary: `Move ${operation.deviceIds.length} ${
      operation.deviceIds.length === 1 ? "device" : "devices"
    } into the Hue room "${operation.roomName}".`,
    lightNames,
    warnings: [
      "Hue rooms contain devices, so every light on a moved device goes with it.",
      ...(sourceRooms.length > 0
        ? [`They leave ${sourceRooms.join(", ")}.`]
        : []),
      "Scenes in the rooms they leave may no longer cover these lights.",
    ],
  };
}

/**
 * Applies the results of committed operations to the map. Successful work is
 * kept even when later operations fail, because those resources now exist.
 */
export function reconcileOperations(
  document: HomeMapDocument,
  queue: readonly QueuedHueOperation[],
): HomeMapDocument {
  let next = document;
  for (const entry of queue) {
    if (entry.status.state !== "done") continue;
    const { operation } = entry;
    const resourceId =
      operation.kind === "create-zone"
        ? entry.status.resourceId
        : operation.roomId;
    if (!resourceId) continue;
    next = {
      ...next,
      floors: next.floors.map((floor) => ({
        ...floor,
        areas: floor.areas.map((area) =>
          area.id === operation.areaId
            ? {
                ...area,
                target: {
                  resourceType:
                    operation.kind === "create-zone"
                      ? ("zone" as const)
                      : ("room" as const),
                  resourceId,
                },
              }
            : area,
        ),
      })),
    };
  }
  return next;
}

/** Returns the created resource's ID, or null when nothing new was created. */
export type HueOperationRunner = (
  operation: MapHueOperation,
) => Promise<string | null>;

/**
 * Runs unresolved work in order and records each result. Later failures never
 * discard earlier successes: those resources already exist on the bridge.
 */
export async function runQueuedOperations(
  queue: readonly QueuedHueOperation[],
  run: HueOperationRunner,
): Promise<QueuedHueOperation[]> {
  const results: QueuedHueOperation[] = [];
  for (const entry of queue) {
    if (entry.status.state === "done") {
      results.push(entry);
      continue;
    }
    try {
      const resourceId = await run(entry.operation);
      results.push({ ...entry, status: { state: "done", resourceId } });
    } catch (error) {
      results.push({
        ...entry,
        status: {
          state: "failed",
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
  return results;
}
