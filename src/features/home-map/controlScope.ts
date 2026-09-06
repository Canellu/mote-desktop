import type { HueLight, HueRoomZone, HueScene } from "@/types/hue";
import { locatePoint } from "./geometry";
import type { HomeMapDocument, MapArea, MapFloor, MapPoint } from "./types";

export interface MapControlScopeInput {
  document: HomeMapDocument;
  floor: MapFloor;
  area: MapArea;
  roomZones: readonly HueRoomZone[];
  lights: readonly HueLight[];
  scenes: readonly HueScene[];
  syncedLightIds: readonly string[];
  bridgeConnected: boolean;
  resourcesLoading?: boolean;
}

export interface MapControlScope {
  target: HueRoomZone | null;
  memberIds: string[];
  members: HueLight[];
  /** Reachable, non-sync members used for control availability and display. */
  controllableMembers: HueLight[];
  missingLightIds: string[];
  offlineCount: number;
  syncedCount: number;
  anyOn: boolean;
  allOn: boolean;
  brightness: number | null;
  brightnessMixed: boolean;
  scenes: HueScene[];
  /** All linked areas/floors, including the selection. */
  sharedAreaCount: number;
  sharedFloorCount: number;
  currentFloorAreaIds: string[];
  /** Placed on this floor but outside the selected polygon. */
  outsideAreaCount: number;
  offFloorCount: number;
  /** No physical placement anywhere in the map. */
  unplacedCount: number;
  controlsDisabledReason: string | null;
  scenesDisabledReason: string | null;
}

/** Geometry describes scope to the user; only Hue membership defines commands. */
export function getMapControlScope({
  document,
  floor,
  area,
  roomZones,
  lights,
  scenes,
  syncedLightIds,
  bridgeConnected,
  resourcesLoading = false,
}: MapControlScopeInput): MapControlScope {
  const target =
    roomZones.find(
      (candidate) =>
        candidate.id === area.target?.resourceId &&
        candidate.resourceType === area.target.resourceType,
    ) ?? null;
  const memberIds = [...new Set(target?.lightIds ?? [])];
  const memberIdSet = new Set(memberIds);
  const lightById = new Map(lights.map((light) => [light.id, light]));
  const members = memberIds.flatMap((id) => {
    const light = lightById.get(id);
    return light ? [light] : [];
  });
  const missingLightIds = memberIds.filter((id) => !lightById.has(id));
  const syncedIds = new Set(syncedLightIds);
  const syncedCount = memberIds.filter((id) => syncedIds.has(id)).length;
  const offlineCount = members.filter((light) => !light.reachable).length;
  const controllableMembers = members.filter(
    (light) => light.reachable && !syncedIds.has(light.id),
  );
  const onMembers = controllableMembers.filter((light) => light.isOn);
  const anyOn = onMembers.length > 0;
  const allOn =
    controllableMembers.length > 0 &&
    onMembers.length === controllableMembers.length;
  const brightness = anyOn
    ? onMembers.reduce((sum, light) => sum + (light.brightness ?? 0), 0) /
      onMembers.length
    : null;
  const brightnessMixed =
    anyOn &&
    (!allOn ||
      new Set(onMembers.map((light) => Math.round(light.brightness ?? 0)))
        .size > 1);

  const linkedAreas = document.floors.flatMap((mapFloor) =>
    mapFloor.areas
      .filter(
        (candidate) =>
          area.target != null &&
          candidate.target?.resourceId === area.target.resourceId &&
          candidate.target.resourceType === area.target.resourceType,
      )
      .map((candidate) => ({ floorId: mapFloor.id, areaId: candidate.id })),
  );
  const vertexById = new Map(
    floor.vertices.map((vertex) => [vertex.id, vertex]),
  );
  const ring = area.vertexIds.flatMap((id): MapPoint[] => {
    const vertex = vertexById.get(id);
    return vertex ? [vertex] : [];
  });
  const placements = new Map(
    document.floors.flatMap((mapFloor) =>
      mapFloor.lights.map(
        (placement) =>
          [placement.lightId, { ...placement, floorId: mapFloor.id }] as const,
      ),
    ),
  );
  let outsideAreaCount = 0;
  let offFloorCount = 0;
  let unplacedCount = 0;
  for (const id of memberIds) {
    const placement = placements.get(id);
    if (!placement) unplacedCount++;
    else if (placement.floorId !== floor.id) offFloorCount++;
    else if (
      ring.length !== area.vertexIds.length ||
      locatePoint(placement, ring) === "outside"
    ) {
      outsideAreaCount++;
    }
  }

  const controlsDisabledReason = resourcesLoading
    ? "Loading Hue resources."
    : !area.target
      ? "This map area is not linked to a Hue room or zone."
      : !bridgeConnected
        ? "Bridge offline. Reconnect to control lights."
        : !target
          ? "The linked Hue room or zone is no longer available."
          : !target.groupedLightId
            ? "The linked Hue room or zone has no group control."
            : memberIds.length === 0
              ? "The linked Hue room or zone has no lights."
              : controllableMembers.length === 0
                ? syncedCount === memberIds.length
                  ? "All lights are syncing. Stop sync to control them."
                  : "No reachable lights are available outside sync."
                : null;

  return {
    target,
    memberIds,
    members,
    controllableMembers,
    missingLightIds,
    offlineCount,
    syncedCount,
    anyOn,
    allOn,
    brightness,
    brightnessMixed,
    scenes: target
      ? scenes.filter(
          (scene) =>
            scene.resourceType === "scene" &&
            !scene.smart &&
            scene.group === target.id &&
            scene.actions.every((action) => memberIdSet.has(action.targetId)),
        )
      : [],
    sharedAreaCount: linkedAreas.length,
    sharedFloorCount: new Set(linkedAreas.map((linked) => linked.floorId)).size,
    currentFloorAreaIds: linkedAreas
      .filter((linked) => linked.floorId === floor.id)
      .map((linked) => linked.areaId),
    outsideAreaCount,
    offFloorCount,
    unplacedCount,
    controlsDisabledReason,
    // Quick recall must never fall back to a broad scene while members sync.
    scenesDisabledReason:
      controlsDisabledReason ??
      (syncedCount > 0
        ? "Stop sync to apply scenes to this room or zone."
        : null),
  };
}
