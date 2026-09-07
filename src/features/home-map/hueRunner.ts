import { invoke } from "@tauri-apps/api/core";
import type { HueRoomZone } from "@/types/hue";
import type { HueOperationRunner } from "./hueOperations";

/** Sends queued map changes to the bridge through the existing commands. */
export function createHueOperationRunner(
  roomZones: readonly HueRoomZone[],
  call: typeof invoke = invoke,
): HueOperationRunner {
  return async (operation) => {
    if (operation.kind === "create-zone") {
      const created = await call<string>("create-hue-zone", {
        name: operation.name.trim(),
        lightIds: operation.lightIds,
      });
      if (typeof created !== "string" || !created.trim())
        throw new Error("The bridge did not return the created zone.");
      return created;
    }

    const target = roomZones.find(
      (candidate) =>
        candidate.id === operation.roomId && candidate.resourceType === "room",
    );
    if (!target) throw new Error("The target Hue room no longer exists.");
    const moving = new Set(operation.deviceIds);
    // A device belongs to one room, so it leaves its old room first.
    for (const room of roomZones) {
      if (room.resourceType !== "room" || room.id === target.id) continue;
      const remaining = room.deviceIds.filter((id) => !moving.has(id));
      if (remaining.length !== room.deviceIds.length)
        await call("update-room-members", {
          roomId: room.id,
          deviceIds: remaining,
        });
    }
    await call("update-room-members", {
      roomId: target.id,
      deviceIds: [...new Set([...target.deviceIds, ...operation.deviceIds])],
    });
    return null;
  };
}
