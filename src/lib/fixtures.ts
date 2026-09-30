import type { HueLight, HueRoomZone } from "@/types/hue";

/**
 * One physical product, which is what a person points at in a room. A single
 * Hue device carrying several light services — a spot bar, a two-lamp pendant —
 * is one fixture automatically, since the bridge says so. Products that
 * register every head as its own device, like a Centris plate, are linked by
 * nothing the bridge exposes, so the person groups them by hand. The map, the
 * Devices list, and anything else that shows fixtures all group through here.
 */
export interface Fixture {
  /** The owning device, or the id of a fixture the person created. */
  id: string;
  name: string;
  lights: HueLight[];
  lightIds: string[];
  /** How many bridge devices this fixture stands for. */
  deviceCount: number;
  /** Created by the person, so it can be renamed and ungrouped. */
  custom: boolean;
}

/** A fixture the person created from lights the bridge lists separately. */
export interface FixtureGroup {
  id: string;
  lightIds: string[];
  /** The name the person gave it; absent in groups recorded before naming. */
  name?: string;
}

export interface FixtureGrouping {
  /** Fixtures the person created; these win over the device grouping. */
  overrides?: readonly FixtureGroup[];
}

export type FixtureResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/**
 * Light id to the space that bounds a fixture. A room is where the fixture
 * physically hangs, so it wins; a zone only counts for lights in no room.
 */
export function targetsOfLights(
  roomZones: readonly HueRoomZone[],
): Record<string, string> {
  const targets: Record<string, string> = {};
  const ordered = [
    ...roomZones.filter((target) => target.resourceType !== "room"),
    ...roomZones.filter((target) => target.resourceType === "room"),
  ];
  for (const target of ordered)
    for (const lightId of target.lightIds)
      targets[lightId] = `${target.resourceType}:${target.id}`;
  return targets;
}

/** Groups bridge lights by the device that owns them, and nothing more. */
export function groupDeviceFixtures(lights: readonly HueLight[]): Fixture[] {
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
      custom: false,
    };
  });
}

/**
 * Groups bridge lights into fixtures: the ones the person created first, then
 * every remaining light by the device that owns it, in bridge order.
 */
export function groupFixtures(
  lights: readonly HueLight[],
  grouping: FixtureGrouping = {},
): Fixture[] {
  const claimed = new Set<string>();
  const result: Fixture[] = [];

  for (const group of grouping.overrides ?? []) {
    const members = group.lightIds.flatMap((id) => {
      const light = lights.find((entry) => entry.id === id);
      return light && !claimed.has(light.id) ? [light] : [];
    });
    // A light whose partners were deleted from the bridge stands alone again.
    if (members.length < 2) continue;
    for (const light of members) claimed.add(light.id);
    const owners = new Set(members.map((light) => light.deviceId ?? light.id));
    result.push({
      id: group.id,
      name: group.name?.trim() || suggestedFixtureName(members),
      lights: members,
      lightIds: members.map((light) => light.id),
      deviceCount: owners.size,
      custom: true,
    });
  }

  result.push(
    ...groupDeviceFixtures(lights.filter((light) => !claimed.has(light.id))),
  );
  return result;
}

/**
 * What to call lights grouped by hand: the start their names share, else the
 * start their product names share ("Hue Centris" from its spot and ceiling).
 */
export function suggestedFixtureName(lights: readonly HueLight[]): string {
  const first = lights[0];
  return (
    sharedPrefix(lights.map((light) => light.name)) ||
    sharedPrefix(
      lights.flatMap((light) => (light.productName ? [light.productName] : [])),
    ) ||
    first?.productName?.trim() ||
    first?.name ||
    "Fixture"
  );
}

/**
 * A likely fixture among `lights` for the create dialog to pre-tick, never
 * applied on its own. A multi-part product gives each part its product number
 * plus a part suffix (a Centris ceiling is `5060730P7_01`, its spots `_02`
 * on), so parts of one number in one space are probably one fixture. When a
 * part number repeats, two identical fixtures share the space and nothing says
 * which head belongs to which, so there is no suggestion.
 */
export function suggestFixtureLights(
  lights: readonly HueLight[],
  targetOfLight: Readonly<Record<string, string>>,
): string[] {
  const parts = new Map<string, HueLight[]>();
  for (const light of lights) {
    const match = /^(.+)_(\d{1,2})$/u.exec(light.modelId?.trim() ?? "");
    const target = targetOfLight[light.id];
    if (!match || !target) continue;
    const key = `${target}:${match[1].toUpperCase()}`;
    parts.set(key, [...(parts.get(key) ?? []), light]);
  }
  for (const members of parts.values()) {
    const suffixes = members.map((light) => light.modelId!.trim().slice(-3));
    if (members.length > 1 && new Set(suffixes).size === members.length)
      return members.map((light) => light.id);
  }
  return [];
}

/**
 * Records the fixture `id` as made of `lightIds`, creating it or replacing
 * which lights it holds. A light belongs to one fixture at most, so a light
 * another fixture holds is refused rather than taken from it.
 */
export function saveFixture(
  groups: readonly FixtureGroup[],
  lightIds: readonly string[],
  name: string,
  id: string,
): FixtureResult<FixtureGroup[]> {
  const unique = [...new Set(lightIds)];
  if (unique.length < 2)
    return { ok: false, error: "Choose at least two lights." };
  const taken = new Set(unique);
  if (
    groups.some(
      (group) =>
        group.id !== id && group.lightIds.some((lightId) => taken.has(lightId)),
    )
  )
    return {
      ok: false,
      error:
        "A light you chose is in another fixture. Take it out of that fixture first.",
    };
  const trimmed = name.trim();
  const fixture: FixtureGroup = {
    id,
    lightIds: unique,
    ...(trimmed ? { name: trimmed } : null),
  };
  return {
    ok: true,
    value: groups.some((group) => group.id === id)
      ? groups.map((group) => (group.id === id ? fixture : group))
      : [...groups, fixture],
  };
}

/** Lights no fixture the person made holds yet, in the order given. */
export function freeLights(
  lights: readonly HueLight[],
  groups: readonly FixtureGroup[],
): HueLight[] {
  const held = new Set(groups.flatMap((group) => group.lightIds));
  return lights.filter((light) => !held.has(light.id));
}

/** Removes a fixture the person created; its lights stand on their own again. */
export function ungroupFixture(
  groups: readonly FixtureGroup[],
  fixtureId: string,
): FixtureResult<FixtureGroup[]> {
  if (!groups.some((group) => group.id === fixtureId))
    return { ok: false, error: "That fixture no longer exists." };
  return { ok: true, value: groups.filter((group) => group.id !== fixtureId) };
}

/** Renames a fixture the person created. */
export function renameFixture(
  groups: readonly FixtureGroup[],
  fixtureId: string,
  name: string,
): FixtureResult<FixtureGroup[]> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Enter a name." };
  if (!groups.some((group) => group.id === fixtureId))
    return { ok: false, error: "That fixture no longer exists." };
  return {
    ok: true,
    value: groups.map((group) =>
      group.id === fixtureId ? { ...group, name: trimmed } : group,
    ),
  };
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
  byId: Map<string, Fixture>;
  /** Light id to the fixture it is a head of. */
  ofLight: Map<string, string>;
}

export function indexFixtures(fixtures: readonly Fixture[]): FixtureIndex {
  const byId = new Map<string, Fixture>();
  const ofLight = new Map<string, string>();
  for (const fixture of fixtures) {
    byId.set(fixture.id, fixture);
    for (const id of fixture.lightIds) ofLight.set(id, fixture.id);
  }
  return { byId, ofLight };
}
