import type { HueLight, HueRoomZone } from "@/types/hue";
import { invoke } from "@tauri-apps/api/core";

export const roomForLight = (
  light: HueLight,
  roomZones: HueRoomZone[],
): string | null =>
  roomZones.find(
    (space) =>
      space.resourceType === "room" &&
      light.deviceId != null &&
      space.deviceIds.includes(light.deviceId),
  )?.id ?? null;

export const zonesForLight = (
  light: HueLight,
  roomZones: HueRoomZone[],
): string[] =>
  roomZones
    .filter(
      (space) =>
        space.resourceType === "zone" && space.lightIds.includes(light.id),
    )
    .map((space) => space.id);

export const updateRoomPlacement = (
  light: HueLight,
  roomZones: HueRoomZone[],
  roomId: string | null,
) => updateRoomPlacementForLights([light], roomZones, roomId);

/**
 * Moves the devices of `lights` into one room (or none). Each room they leave
 * is rewritten once without all of them, since writing it per device from the
 * same snapshot would put back the devices an earlier write removed. Adding
 * reads the room fresh on the bridge, so those run one after another.
 */
export const updateRoomPlacementForLights = async (
  lights: HueLight[],
  roomZones: HueRoomZone[],
  roomId: string | null,
) => {
  const deviceIds = [
    ...new Set(
      lights.flatMap((light) => (light.deviceId ? [light.deviceId] : [])),
    ),
  ];
  if (deviceIds.length === 0) return;

  await Promise.all(
    roomZones
      .filter(
        (space) =>
          space.resourceType === "room" &&
          space.id !== roomId &&
          deviceIds.some((id) => space.deviceIds.includes(id)),
      )
      .map((space) =>
        invoke("update-room-members", {
          roomId: space.id,
          deviceIds: space.deviceIds.filter((id) => !deviceIds.includes(id)),
        }),
      ),
  );

  if (roomId) {
    for (const deviceId of deviceIds)
      await invoke("assign-device-to-room", { deviceId, roomId });
  }
};

export const updateZonesPlacement = (
  light: HueLight,
  roomZones: HueRoomZone[],
  zoneIds: string[],
) => updateZonesPlacementForLights([light], roomZones, zoneIds);

/**
 * Puts `lights` in exactly `zoneIds`. Each zone they leave is rewritten once
 * without all of them; each zone they join gets their devices added one after
 * another, since adding reads the zone fresh on the bridge.
 */
export const updateZonesPlacementForLights = async (
  lights: HueLight[],
  roomZones: HueRoomZone[],
  zoneIds: string[],
) => {
  const lightIds = lights.map((light) => light.id);
  const target = new Set(zoneIds);
  const zones = roomZones.filter((space) => space.resourceType === "zone");

  await Promise.all(
    zones
      .filter(
        (space) =>
          !target.has(space.id) &&
          lightIds.some((id) => space.lightIds.includes(id)),
      )
      .map((space) =>
        invoke("update-zone-members", {
          zoneId: space.id,
          lightIds: space.lightIds.filter((id) => !lightIds.includes(id)),
        }),
      ),
  );

  for (const zoneId of zoneIds) {
    const zone = zones.find((space) => space.id === zoneId);
    const missing = lights.filter(
      (light) => light.deviceId && !zone?.lightIds.includes(light.id),
    );
    for (const deviceId of new Set(missing.map((light) => light.deviceId!)))
      await invoke("assign-device-to-zone", { deviceId, zoneId });
  }
};

export const sameIds = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((id) => right.includes(id));
