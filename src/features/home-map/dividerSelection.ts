import { locatePoint } from "./geometry";
import type { MapPoint } from "./types";

export interface DividerAreaCandidate {
  id: string;
  ring: MapPoint[];
}

/** Chooses the room on the pointer's unsnapped side of a wall. */
export function chooseDividerArea(
  areas: readonly DividerAreaCandidate[],
  snappedPoint: MapPoint,
  pointerPoint: MapPoint,
  preferredAreaId?: string | null,
): string | null {
  const touching = areas.filter(
    ({ ring }) => locatePoint(snappedPoint, ring) === "boundary",
  );
  if (touching.length === 0) return null;

  return (
    touching.find(({ ring }) => locatePoint(pointerPoint, ring) === "inside")
      ?.id ??
    touching.find(({ id }) => id === preferredAreaId)?.id ??
    touching[0].id
  );
}

/** Resolves an ambiguous starting wall from the direction of the divider. */
export function chooseDividerAreaFromDirection(
  areas: readonly DividerAreaCandidate[],
  startPoint: MapPoint,
  pointerPoint: MapPoint,
  preferredAreaId?: string | null,
): string | null {
  const dx = pointerPoint.x - startPoint.x;
  const dy = pointerPoint.y - startPoint.y;
  const length = Math.hypot(dx, dy);
  if (length <= 1e-7)
    return chooseDividerArea(areas, startPoint, startPoint, preferredAreaId);

  // One millimeter is enough to cross the boundary without skipping a narrow
  // room. For a shorter divider, sample halfway along it.
  const probeDistance = Math.min(0.001, length / 2);
  const probe = {
    x: startPoint.x + (dx / length) * probeDistance,
    y: startPoint.y + (dy / length) * probeDistance,
  };
  return chooseDividerArea(areas, startPoint, probe, preferredAreaId);
}

export function dividerAreasAtPoint(
  areas: readonly DividerAreaCandidate[],
  point: MapPoint,
): DividerAreaCandidate[] {
  return areas.filter(({ ring }) => locatePoint(point, ring) === "boundary");
}
