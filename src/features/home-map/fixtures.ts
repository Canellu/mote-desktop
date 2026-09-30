import type { MapPoint, MapLightPlacement } from "./types";

// Fixture grouping is shared with the Devices list; the map adds markers.
export {
  groupDeviceFixtures,
  groupFixtures,
  indexFixtures,
  type Fixture as MapFixture,
  type FixtureGrouping,
  type FixtureIndex,
} from "@/lib/fixtures";

export interface FixtureMarker {
  /** The fixture id, which is the owning Hue device. */
  id: string;
  point: MapPoint;
  /** Heads of that product placed here, drawn as the one marker. */
  heads: number;
}

/**
 * One product is one marker. Heads placed separately before fixtures existed
 * can sit slightly apart, so their centre stands for the whole fixture.
 */
export function groupFixtureMarkers(
  placements: readonly MapLightPlacement[],
  fixtureOf: Record<string, string>,
): FixtureMarker[] {
  const order: string[] = [];
  const heads = new Map<string, MapPoint[]>();
  for (const placement of placements) {
    const id = fixtureOf[placement.lightId] ?? placement.lightId;
    const points = heads.get(id);
    if (points) points.push(placement);
    else {
      heads.set(id, [placement]);
      order.push(id);
    }
  }
  return order.map((id) => {
    const points = heads.get(id)!;
    return {
      id,
      point: {
        x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
        y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
      },
      heads: points.length,
    };
  });
}
