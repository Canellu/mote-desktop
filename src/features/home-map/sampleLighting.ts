import type { HueLight, HueRoomZone, HueScene } from "@/types/hue";
import { locatePoint } from "./geometry";
import { sampleHomeMap } from "./sampleMap";
import { validateHomeMap } from "./validation";

const exampleId = (kind: number, index: number) =>
  `00000000-0000-0000-${String(kind).padStart(4, "0")}-${String(index).padStart(12, "0")}`;

const lightNames: Record<string, string[]> = {
  "Living room": ["Sofa lamp", "TV lightstrip"],
  Kitchen: ["Kitchen ceiling", "Counter lightstrip"],
  Dining: ["Dining pendant", "Sideboard lamp"],
  Hallway: ["Hall ceiling", "Entry lamp"],
  Bedroom: ["Bedside left", "Bedside right"],
  Bathroom: ["Bathroom ceiling", "Mirror light"],
  Office: ["Desk lamp", "Office ceiling"],
  "Guest room": ["Guest bedside", "Guest ceiling"],
  Landing: ["Landing ceiling", "Stair light"],
};

function exampleLight(id: string, name: string, index: number): HueLight {
  return {
    id,
    deviceId: exampleId(20, index),
    deviceName: name,
    name,
    isOn: index % 4 !== 0,
    brightness: index % 2 === 0 ? 65 : 45,
    reachable: true,
    colorMode: "ct",
    xy: null,
    ct: 366,
    effect: "no_effect",
    effects: [],
    effectV2: null,
    effectsV2: [],
    supportsColor: true,
    supportsCt: true,
    ctMin: 153,
    ctMax: 500,
    gamut: null,
    modelId: "example-color-light",
    productName: "Example color light",
    typeName: "Extended color light",
    swVersion: null,
    uniqueId: null,
    function: "mixed",
    powerup: null,
  };
}

/** Every preview mount gets independent geometry and synthetic Hue resources. */
export function createSampleLighting() {
  const map = structuredClone(sampleHomeMap);
  const lights: HueLight[] = [];
  const targets = new Map<string, HueRoomZone>();

  for (const floor of map.floors) {
    const vertices = new Map(
      floor.vertices.map((vertex) => [vertex.id, vertex]),
    );
    for (const area of floor.areas) {
      const shared = area.name === "Living room" || area.name === "Dining";
      const key = shared ? "Lounge" : `${floor.id}:${area.id}`;
      const index = targets.size + 1;
      const target: HueRoomZone = targets.get(key) ?? {
        id: exampleId(10, index),
        name: shared ? "Lounge" : area.name,
        class: shared ? "living_room" : "other",
        resourceType: shared ? "zone" : "room",
        anyOn: false,
        allOn: false,
        brightness: null,
        lightCount: 0,
        lightIds: [],
        deviceIds: [],
        groupedLightId: exampleId(11, index),
        accessories: [],
      };
      targets.set(key, target);
      area.target = {
        resourceType: target.resourceType,
        resourceId: target.id,
      };
      const ring = area.vertexIds.map((id) => vertices.get(id)!);
      const placements = floor.lights.filter(
        (placement) => locatePoint(placement, ring) === "inside",
      );
      placements.forEach((placement, index) => {
        const light = exampleLight(
          placement.lightId,
          lightNames[area.name]?.[index] ?? `${area.name} light ${index + 1}`,
          lights.length + 1,
        );
        lights.push(light);
        target.lightIds.push(light.id);
        if (target.resourceType === "room" && light.deviceId)
          target.deviceIds.push(light.deviceId);
      });
    }
  }

  // This extra member makes the shared Lounge control's full scope visible.
  const unplaced = exampleLight(
    exampleId(3, 1),
    "Reading lamp",
    lights.length + 1,
  );
  lights.push(unplaced);
  targets.get("Lounge")!.lightIds.push(unplaced.id);

  const roomZones = summarizeSampleTargets([...targets.values()], lights);
  const presets = [
    { name: "Relax", brightness: 45, mirek: 400 },
    { name: "Bright", brightness: 100, mirek: 250 },
    { name: "Evening", brightness: 20, mirek: 450 },
  ];
  const scenes: HueScene[] = roomZones.flatMap((target, targetIndex) =>
    presets.map((preset, presetIndex) => ({
      id: exampleId(12, targetIndex * presets.length + presetIndex + 1),
      name: preset.name,
      resourceType: "scene",
      group: target.id,
      sceneType: "static",
      status: "inactive",
      dynamic: false,
      speed: null,
      autoDynamic: false,
      smart: false,
      colors: [{ xy: null, mirek: preset.mirek }],
      actions: target.lightIds.map((id) => ({
        targetId: id,
        on: true,
        brightness: preset.brightness,
        xy: null,
        mirek: preset.mirek,
        effect: null,
        effectV2: null,
      })),
    })),
  );

  const issues = validateHomeMap(map);
  if (issues.length)
    throw new Error(`Invalid example Home Map: ${issues[0].message}`);

  return { map, roomZones, lights, scenes };
}

export function summarizeSampleTargets(
  targets: HueRoomZone[],
  lights: HueLight[],
): HueRoomZone[] {
  const byId = new Map(lights.map((light) => [light.id, light]));
  return targets.map((target) => {
    const members = target.lightIds.flatMap((id) => {
      const light = byId.get(id);
      return light ? [light] : [];
    });
    const onLights = members.filter((light) => light.isOn);
    const dimmable = onLights.filter((light) => light.brightness !== null);
    return {
      ...target,
      lightCount: target.lightIds.length,
      anyOn: onLights.length > 0,
      allOn: members.length > 0 && onLights.length === members.length,
      brightness: dimmable.length
        ? dimmable.reduce((sum, light) => sum + light.brightness!, 0) /
          dimmable.length
        : 0,
    };
  });
}
