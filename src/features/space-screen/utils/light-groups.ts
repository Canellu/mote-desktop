import { groupFixtures, type Fixture, type FixtureGroup } from "@/lib/fixtures";
import type { HueLight, HueRoomZone, HueZone } from "@/types/hue";

/** Route id for the whole-home page; never collides with a v2 UUID. */
export const ALL_LIGHTS_SPACE_ID = "all-lights";

/** Prefix for a fixture shown as a group, e.g. in the `?inspect=group:` param. */
const FIXTURE_GROUP_PREFIX = "fixture:";

export const isAllLightsSpace = (space: { id: string } | null | undefined) =>
  space?.id === ALL_LIGHTS_SPACE_ID;

export const isFixtureGroup = (space: { id: string } | null | undefined) =>
  space?.id.startsWith(FIXTURE_GROUP_PREFIX) ?? false;

/**
 * A synthetic zone over arbitrary lights, so group controls and the group pane
 * work for the All lights page and fixtures. It has no scenes, accessories or
 * editable metadata; without a grouped_light it writes per light.
 */
const buildLightGroup = (
  id: string,
  name: string,
  archetype: string,
  lights: HueLight[],
  groupedLightId: string | null,
): HueZone => {
  const onLights = lights.filter((light) => light.isOn);
  return {
    id,
    name,
    class: archetype,
    resourceType: "zone",
    anyOn: onLights.length > 0,
    allOn: lights.length > 0 && onLights.length === lights.length,
    brightness:
      onLights.length > 0
        ? onLights.reduce((sum, light) => sum + (light.brightness ?? 0), 0) /
          onLights.length
        : null,
    lightCount: lights.length,
    lightIds: lights.map((light) => light.id),
    deviceIds: [],
    groupedLightId,
    accessories: [],
  };
};

/** Every light, controlled through the bridge_home grouped_light. */
export const buildAllLightsSpace = (
  lights: HueLight[],
  homeGroupedLightId: string | null,
): HueZone =>
  buildLightGroup(
    ALL_LIGHTS_SPACE_ID,
    "All lights",
    "home",
    lights,
    homeGroupedLightId,
  );

export const buildFixtureGroup = (fixture: Fixture): HueZone =>
  buildLightGroup(
    `${FIXTURE_GROUP_PREFIX}${fixture.id}`,
    fixture.name,
    "fixture",
    fixture.lights,
    null,
  );

/** Resolves a `/space/$spaceId` param, including the All lights page. */
export const resolveSpace = (
  id: string | null,
  roomZones: HueRoomZone[],
  lights: HueLight[],
  homeGroupedLightId: string | null,
): HueRoomZone | null => {
  if (id == null) return null;
  if (id === ALL_LIGHTS_SPACE_ID)
    return lights.length > 0
      ? buildAllLightsSpace(lights, homeGroupedLightId)
      : null;
  return roomZones.find((roomZone) => roomZone.id === id) ?? null;
};

/** Resolves a `fixture:<id>` group id to its fixture over every light. */
export const resolveFixtureGroup = (
  groupId: string,
  lights: HueLight[],
  overrides: readonly FixtureGroup[],
): HueZone | null => {
  if (!groupId.startsWith(FIXTURE_GROUP_PREFIX)) return null;
  const fixtureId = groupId.slice(FIXTURE_GROUP_PREFIX.length);
  const fixture = groupFixtures(lights, { overrides }).find(
    (candidate) => candidate.id === fixtureId,
  );
  return fixture && fixture.lights.length > 1
    ? buildFixtureGroup(fixture)
    : null;
};
