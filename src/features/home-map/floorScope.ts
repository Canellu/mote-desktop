import type { HueLight, HueRoomZone } from "@/types/hue";
import type { HomeMapDocument, MapControlTarget, MapFloor } from "./types";

export interface FloorControlScope {
  /** Distinct Hue rooms and zones linked by this floor's areas. */
  targets: HueRoomZone[];
  /** Unique member lights across those targets, counted once each. */
  lightIds: string[];
  controllableLightIds: string[];
  onCount: number;
  /** Members whose marker is on another floor. */
  offFloorLightIds: string[];
  /** Members with no marker anywhere, so their floor is unknown. */
  unplacedLightIds: string[];
  missingTargetAreaNames: string[];
  /** True only when every member of every target is placed on this floor. */
  exact: boolean;
  disabledReason: string | null;
}

const describeLights = (count: number) =>
  `${count} ${count === 1 ? "light" : "lights"}`;

const sameTarget = (a: MapControlTarget, b: MapControlTarget) =>
  a.resourceId === b.resourceId && a.resourceType === b.resourceType;

/**
 * Describes what a floor-wide action would actually reach. A floor action must
 * never send a grouped command that also covers lights elsewhere, so anything
 * unresolved disables it rather than narrowing it silently.
 */
export function getFloorControlScope({
  document,
  floor,
  roomZones,
  lights,
  syncedLightIds,
  bridgeConnected,
  resourcesLoading = false,
}: {
  document: HomeMapDocument;
  floor: MapFloor;
  roomZones: readonly HueRoomZone[];
  lights: readonly HueLight[];
  syncedLightIds: readonly string[];
  bridgeConnected: boolean;
  resourcesLoading?: boolean;
}): FloorControlScope {
  const linked = floor.areas.flatMap((area) =>
    area.target ? [{ area, target: area.target }] : [],
  );
  const targets: HueRoomZone[] = [];
  const missingTargetAreaNames: string[] = [];
  for (const entry of linked) {
    const found = roomZones.find(
      (candidate) =>
        candidate.id === entry.target.resourceId &&
        candidate.resourceType === entry.target.resourceType,
    );
    if (!found) {
      missingTargetAreaNames.push(entry.area.name);
      continue;
    }
    // Two areas can share one target; the command must be sent once.
    if (
      !targets.some((existing) =>
        sameTarget(
          { resourceId: existing.id, resourceType: existing.resourceType },
          entry.target,
        ),
      )
    )
      targets.push(found);
  }

  const lightIds = [...new Set(targets.flatMap((target) => target.lightIds))];
  const lightById = new Map(lights.map((light) => [light.id, light]));
  const syncedIds = new Set(syncedLightIds);
  const controllableLightIds = lightIds.filter((id) => {
    const light = lightById.get(id);
    return Boolean(light?.reachable) && !syncedIds.has(id);
  });
  const onCount = controllableLightIds.filter(
    (id) => lightById.get(id)?.isOn,
  ).length;

  const placements = new Map(
    document.floors.flatMap((entry) =>
      entry.lights.map((placement) => [placement.lightId, entry.id] as const),
    ),
  );
  const offFloorLightIds = lightIds.filter(
    (id) => placements.has(id) && placements.get(id) !== floor.id,
  );
  const unplacedLightIds = lightIds.filter((id) => !placements.has(id));
  const exact =
    targets.length > 0 &&
    offFloorLightIds.length === 0 &&
    unplacedLightIds.length === 0;

  const disabledReason = resourcesLoading
    ? "Loading Hue resources."
    : !bridgeConnected
      ? "Bridge offline. Reconnect to control lights."
      : targets.length === 0
        ? "No room on this floor is linked to a Hue room or zone."
        : offFloorLightIds.length > 0
          ? `${describeLights(offFloorLightIds.length)} in these rooms ${
              offFloorLightIds.length === 1 ? "sits" : "sit"
            } on another floor, so this would reach beyond ${floor.name}.`
          : unplacedLightIds.length > 0
            ? `${describeLights(unplacedLightIds.length)} in these rooms ${
                unplacedLightIds.length === 1 ? "is" : "are"
              } not placed yet, so this floor's lights cannot be identified.`
            : controllableLightIds.length === 0
              ? "No reachable lights are available outside sync."
              : null;

  return {
    targets,
    lightIds,
    controllableLightIds,
    onCount,
    offFloorLightIds,
    unplacedLightIds,
    missingTargetAreaNames,
    exact,
    disabledReason,
  };
}
