import type { HueLight, HueRoomZone } from "@/types/hue";
import { locatePoint } from "./geometry";
import { getAreaLabelPoint } from "./viewGeometry";
import type {
  HomeMapDocument,
  MapArea,
  MapFloor,
  MapPoint,
  MapResult,
} from "./types";
import { validateHomeMap } from "./validation";

/** A light has one physical marker per map, so placing moves it between floors. */
export function placeLight(
  document: HomeMapDocument,
  floorId: string,
  lightId: string,
  point: MapPoint,
): MapResult<HomeMapDocument> {
  if (!document.floors.some((floor) => floor.id === floorId))
    return { ok: false, error: "Choose a floor to place this light on." };
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
    return { ok: false, error: "Light coordinates must be finite numbers." };
  const next: HomeMapDocument = {
    ...document,
    floors: document.floors.map((floor) => ({
      ...floor,
      lights: [
        ...floor.lights.filter((light) => light.lightId !== lightId),
        ...(floor.id === floorId ? [{ lightId, x: point.x, y: point.y }] : []),
      ],
    })),
  };
  const issue = validateHomeMap(next)[0];
  return issue
    ? { ok: false, error: issue.message }
    : { ok: true, value: next };
}

/** Removing a marker keeps the light itself and its Hue membership. */
export function unplaceLight(
  document: HomeMapDocument,
  lightId: string,
): MapResult<HomeMapDocument> {
  if (
    !document.floors.some((floor) =>
      floor.lights.some((light) => light.lightId === lightId),
    )
  )
    return { ok: false, error: "This light is not on the map." };
  const next: HomeMapDocument = {
    ...document,
    floors: document.floors.map((floor) => ({
      ...floor,
      lights: floor.lights.filter((light) => light.lightId !== lightId),
    })),
  };
  const issue = validateHomeMap(next)[0];
  return issue
    ? { ok: false, error: issue.message }
    : { ok: true, value: next };
}

export interface LightPlacement {
  floorId: string;
  point: MapPoint;
}

export function findPlacement(
  document: HomeMapDocument,
  lightId: string,
): LightPlacement | null {
  for (const floor of document.floors) {
    const placed = floor.lights.find((light) => light.lightId === lightId);
    if (placed)
      return { floorId: floor.id, point: { x: placed.x, y: placed.y } };
  }
  return null;
}

/** The area a marker sits in, which describes it but never decides its scope. */
export function areaAtPoint(floor: MapFloor, point: MapPoint): MapArea | null {
  const vertices = new Map(floor.vertices.map((vertex) => [vertex.id, vertex]));
  for (const area of floor.areas) {
    const ring = area.vertexIds.flatMap((id) => {
      const vertex = vertices.get(id);
      return vertex ? [vertex] : [];
    });
    if (locatePoint(point, ring) !== "outside") return area;
  }
  return null;
}

export interface TrayLight {
  /** A mapped area linked to this light's target, for placing without aiming. */
  suggestedAreaId: string | null;
  suggestedAreaName: string | null;
  suggestedFloorId: string | null;
  suggestedPoint: MapPoint | null;
  light: HueLight;
  /** The Hue room or zone whose membership actually controls this light. */
  target: HueRoomZone | null;
  floorId: string | null;
  floorName: string | null;
  /** The mapped area the marker sits in, which may differ from its target. */
  areaName: string | null;
  outsideTarget: boolean;
}

/** Describes every bridge light against the map, for the placement tray. */
export function buildTray(
  map: HomeMapDocument,
  lights: HueLight[],
  roomZones: HueRoomZone[],
): TrayLight[] {
  return lights.map((light) => {
    const placement = findPlacement(map, light.id);
    const placedFloor = placement
      ? (map.floors.find((entry) => entry.id === placement.floorId) ?? null)
      : null;
    const area =
      placement && placedFloor
        ? areaAtPoint(placedFloor, placement.point)
        : null;
    const target =
      roomZones.find((candidate) => candidate.lightIds.includes(light.id)) ??
      null;
    const suggested = target
      ? (map.floors.flatMap((entry) =>
          entry.areas
            .filter(
              (candidate) =>
                candidate.target?.resourceId === target.id &&
                candidate.target.resourceType === target.resourceType,
            )
            .map((candidate) => ({ floor: entry, area: candidate })),
        )[0] ?? null)
      : null;
    const suggestedPoint = suggested
      ? getAreaLabelPoint(
          suggested.area.vertexIds.flatMap((id) => {
            const vertex = suggested.floor.vertices.find(
              (entry) => entry.id === id,
            );
            return vertex ? [vertex] : [];
          }),
        )
      : null;
    return {
      light,
      target,
      suggestedAreaId: suggested?.area.id ?? null,
      suggestedAreaName: suggested?.area.name ?? null,
      suggestedFloorId: suggested?.floor.id ?? null,
      suggestedPoint,
      floorId: placement?.floorId ?? null,
      floorName: placedFloor?.name ?? null,
      areaName: area?.name ?? null,
      // A marker describes where the lamp is; only membership decides scope.
      outsideTarget: Boolean(
        area &&
        target &&
        area.target &&
        !(
          area.target.resourceId === target.id &&
          area.target.resourceType === target.resourceType
        ),
      ),
    };
  });
}

/** Floors are added empty; the draw tool gives the first room its shape. */
export function addFloor(
  document: HomeMapDocument,
  floor: { id: string; name: string },
): MapResult<HomeMapDocument> {
  if (
    !floor.id.trim() ||
    document.floors.some((entry) => entry.id === floor.id)
  )
    return { ok: false, error: "The new floor needs a unique ID." };
  if (!floor.name.trim()) return { ok: false, error: "Name this floor." };
  const next: HomeMapDocument = {
    ...document,
    floors: [
      ...document.floors,
      {
        id: floor.id,
        name: floor.name.trim(),
        vertices: [],
        areas: [],
        dimensions: [],
        lights: [],
      },
    ],
  };
  const issue = validateHomeMap(next)[0];
  return issue
    ? { ok: false, error: issue.message }
    : { ok: true, value: next };
}

export function renameFloor(
  document: HomeMapDocument,
  floorId: string,
  name: string,
): MapResult<HomeMapDocument> {
  if (!document.floors.some((floor) => floor.id === floorId))
    return { ok: false, error: "Choose a floor to rename." };
  if (!name.trim()) return { ok: false, error: "Floors need a name." };
  const next: HomeMapDocument = {
    ...document,
    floors: document.floors.map((floor) =>
      floor.id === floorId ? { ...floor, name: name.trim() } : floor,
    ),
  };
  const issue = validateHomeMap(next)[0];
  return issue
    ? { ok: false, error: issue.message }
    : { ok: true, value: next };
}

/** Says what a floor takes with it, so removal is never a surprise. */
export function describeFloorRemoval(
  document: HomeMapDocument,
  floorId: string,
): { roomNames: string[]; lightCount: number } | null {
  const floor = document.floors.find((entry) => entry.id === floorId);
  if (!floor) return null;
  return {
    roomNames: floor.areas.map((area) => area.name),
    lightCount: floor.lights.length,
  };
}

/** Removing a floor unplaces its markers; Hue resources are untouched. */
export function removeFloor(
  document: HomeMapDocument,
  floorId: string,
): MapResult<HomeMapDocument> {
  if (!document.floors.some((floor) => floor.id === floorId))
    return { ok: false, error: "Choose a floor to remove." };
  if (document.floors.length === 1)
    return { ok: false, error: "A map keeps at least one floor." };
  const next: HomeMapDocument = {
    ...document,
    floors: document.floors.filter((floor) => floor.id !== floorId),
  };
  const issue = validateHomeMap(next)[0];
  return issue
    ? { ok: false, error: issue.message }
    : { ok: true, value: next };
}
