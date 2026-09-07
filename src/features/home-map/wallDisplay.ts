import { convertLength } from "./measurements";
import type { MapFloor } from "./types";
import type { MapWall } from "./walls";

/** Steps offered in the displayed unit; stored geometry stays in meters. */
export const WALL_STEPS = [0.1, 0.25, 0.5, 1] as const;
export type WallStep = (typeof WALL_STEPS)[number];

export function wallLabel(
  wall: MapWall,
  floor: MapFloor,
  units: "metric" | "imperial",
) {
  const rooms = wall.areaIds.map(
    (id) => floor.areas.find((area) => area.id === id)?.name ?? id,
  );
  const unit = units === "metric" ? "m" : "ft";
  const length = convertLength(wall.lengthMeters, "m", unit);
  return {
    kind: wall.dividing ? "Shared wall" : "Outside wall",
    rooms: rooms.join(" · "),
    length: `${length.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`,
  };
}
