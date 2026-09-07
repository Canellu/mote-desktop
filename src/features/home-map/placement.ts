import type { HueLight, HueRoomZone } from "@/types/hue";
import { locatePoint } from "./geometry";
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
    return {
      light,
      target,
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
