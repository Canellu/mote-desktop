import type { HueLight } from "@/types/hue";
import type { MapLightPlacement, MapPoint } from "./types";

/**
 * One physical product, which is what a person points at in a room. Multi-head
 * fixtures — a Centris spot bar, a two-lamp pendant — are a single Hue device
 * carrying several light services, so the owning device id is the fixture id.
 */
export interface MapFixture {
  /** The owning device, or the light itself when the bridge names no owner. */
  id: string;
  name: string;
  lights: HueLight[];
  lightIds: string[];
}

/** Groups bridge lights into the products they are heads of, in bridge order. */
export function groupFixtures(lights: readonly HueLight[]): MapFixture[] {
  const order: string[] = [];
  const heads = new Map<string, HueLight[]>();
  for (const light of lights) {
    const id = light.deviceId ?? light.id;
    const existing = heads.get(id);
    if (existing) existing.push(light);
    else {
      heads.set(id, [light]);
      order.push(id);
    }
  }
  return order.map((id) => {
    const members = heads.get(id)!;
    return {
      id,
      name: fixtureName(members),
      lights: members,
      lightIds: members.map((light) => light.id),
    };
  });
}

/** A head's own name reads better than the device's, so single lights keep it. */
function fixtureName(lights: HueLight[]): string {
  const first = lights[0];
  if (lights.length === 1) return first.name;
  return (
    first.deviceName?.trim() ||
    sharedPrefix(lights.map((light) => light.name)) ||
    first.productName?.trim() ||
    first.name
  );
}

/** "Centris 1"/"Centris 2" name one fixture; the shared start is its name. */
function sharedPrefix(names: string[]): string | null {
  let prefix = names[0] ?? "";
  for (const name of names.slice(1)) {
    let index = 0;
    while (
      index < prefix.length &&
      index < name.length &&
      prefix[index] === name[index]
    )
      index++;
    prefix = prefix.slice(0, index);
  }
  // Drop the separator and index the heads differ by, e.g. " 1" or " - left".
  const trimmed = prefix.replace(/[\s\-–—_.:#/]+$/u, "").trim();
  return trimmed.length >= 2 ? trimmed : null;
}

export interface FixtureIndex {
  byId: Map<string, MapFixture>;
  /** Light id to the fixture it is a head of. */
  ofLight: Map<string, string>;
}

export function indexFixtures(fixtures: readonly MapFixture[]): FixtureIndex {
  const byId = new Map<string, MapFixture>();
  const ofLight = new Map<string, string>();
  for (const fixture of fixtures) {
    byId.set(fixture.id, fixture);
    for (const id of fixture.lightIds) ofLight.set(id, fixture.id);
  }
  return { byId, ofLight };
}

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
