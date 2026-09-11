import type { HueLight } from "@/types/hue";
import type { MapFixtureGroup, MapLightPlacement, MapPoint } from "./types";

/**
 * One physical product, which is what a person points at in a room. Some
 * multi-head fixtures — a spot bar, a two-lamp pendant — are a single Hue
 * device carrying several light services, and the owning device id is the
 * fixture id. Others, like a Centris plate, register every spot as its own
 * device, so those are joined back together by what they are and where they
 * are. Either way, one fixture is one marker and one drag.
 */
export interface MapFixture {
  /** The owning device, or the first device of a product joined back up. */
  id: string;
  name: string;
  lights: HueLight[];
  lightIds: string[];
  /** How many bridge devices this fixture stands for; above one it can split. */
  deviceCount: number;
}

export interface FixtureGrouping {
  /** Light id to the Hue room or zone it answers to, which bounds a product. */
  targetOfLight?: Readonly<Record<string, string>>;
  /** Groups the map records by hand; these win over the automatic ones. */
  overrides?: readonly MapFixtureGroup[];
}

/** Groups bridge lights by the device that owns them, and nothing more. */
export function groupDeviceFixtures(lights: readonly HueLight[]): MapFixture[] {
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
      deviceCount: 1,
    };
  });
}

/**
 * Groups bridge lights into the products a person would point at. Devices come
 * first, then the map's own groups, then the spots and downlights the bridge
 * lists one by one but that hang off a single plate.
 */
export function groupFixtures(
  lights: readonly HueLight[],
  grouping: FixtureGrouping = {},
): MapFixture[] {
  const devices = groupDeviceFixtures(lights);
  const claimed = new Set<string>();
  const result: MapFixture[] = [];

  // A group the map records replaces the automatic answer for its lights.
  for (const override of grouping.overrides ?? []) {
    const members = override.lightIds.flatMap((id) => {
      const light = lights.find((entry) => entry.id === id);
      return light ? [light] : [];
    });
    if (members.length === 0) continue;
    for (const light of members) claimed.add(light.id);
    const devices = new Set(members.map((light) => light.deviceId ?? light.id));
    result.push({
      id: override.id,
      name: devices.size > 1 ? productName(members) : fixtureName(members),
      lights: members,
      lightIds: members.map((light) => light.id),
      deviceCount: devices.size,
    });
  }

  // What is left joins up by product and room, in bridge order.
  const order: string[] = [];
  const buckets = new Map<string, MapFixture[]>();
  for (const device of devices) {
    const free = device.lights.filter((light) => !claimed.has(light.id));
    if (free.length === 0) continue;
    const piece =
      free.length === device.lights.length
        ? device
        : { ...device, lights: free, lightIds: free.map((l) => l.id) };
    const key = productKey(piece, grouping.targetOfLight);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(piece);
    else {
      buckets.set(key, [piece]);
      order.push(key);
    }
  }
  for (const key of order) {
    const pieces = buckets.get(key)!;
    if (pieces.length === 1) {
      result.push(pieces[0]);
      continue;
    }
    const members = pieces.flatMap((piece) => piece.lights);
    result.push({
      id: pieces[0].id,
      name: productName(members),
      lights: members,
      lightIds: members.map((light) => light.id),
      deviceCount: pieces.length,
    });
  }
  return result;
}

/**
 * Archetypes that come as one luminaire with several heads, so several of them
 * with the same name in one room are one product. Portable lamps, light strips
 * and Play bars are each their own thing however they are named, so they are
 * never joined up.
 */
const JOINED_ARCHETYPES = ["spot", "ceiling", "downlight", "pendant"];

/**
 * What makes two devices the same product: the same kind of fixed luminaire,
 * the same Hue space, and a name that starts the same way for at least two
 * words. A lone device gets a key of its own, so it is never joined to
 * anything.
 */
function productKey(
  fixture: MapFixture,
  targetOfLight: Readonly<Record<string, string>> = {},
): string {
  const light = fixture.lights[0];
  const archetype = (light.typeName ?? "").toLowerCase();
  const target = targetOfLight[light.id];
  const stem = nameStem(fixture.name);
  if (
    !target ||
    !stem ||
    !JOINED_ARCHETYPES.some((word) => archetype.includes(word))
  )
    return `device:${fixture.id}`;
  return `product:${target}:${stem}`;
}

/** "Hue Centris spot 7" and "Hue Centris ceiling 2" share the stem it needs. */
function nameStem(name: string): string | null {
  const words = name
    .trim()
    .toLowerCase()
    .split(/\s+/u)
    // Head numbers and letters differ within one product, so they never count.
    .filter((word) => !/^[\d]+$/u.test(word) && word.length > 1);
  return words.length >= 2 ? `${words[0]} ${words[1]}` : null;
}

/**
 * Devices the bridge lists one by one share only the start of their names, so
 * that shared start is what the product is called. The device's own name is a
 * head's name here — "Hue Centris spot 7" — and would name the plate wrongly.
 */
function productName(lights: HueLight[]): string {
  const first = lights[0];
  return (
    sharedPrefix(lights.map((light) => light.name)) ||
    sharedPrefix(
      lights.flatMap((light) => (light.deviceName ? [light.deviceName] : [])),
    ) ||
    first.productName?.trim() ||
    first.name
  );
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
