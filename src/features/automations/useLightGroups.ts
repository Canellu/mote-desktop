import { getRoomZoneIcon } from "@/features/home-screen/components/room-zone-icons";
import type {
  AutomationLightGroup,
  AutomationLightOption,
} from "@/features/automations/components/AutomationLightPicker";
import type { AutomationSceneOption } from "@/features/automations/components/AutomationScenePicker";
import {
  lightColorHex,
  sceneBrightness,
  sceneBubbleCss,
  sceneHexes,
} from "@/features/space-screen/utils/color-state";
import { getLightIcon } from "@/features/space-screen/utils/light-icons";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import type { HueLight } from "@/types/hue";

/**
 * The lights, rooms, zones, and scenes every automation picks from, grouped
 * the way the pickers show them: each room with its lights, then zones, then
 * lights in no room.
 */
export function useLightGroups(): {
  lightGroups: AutomationLightGroup[];
  sceneOptions: AutomationSceneOption[];
  resourcesLoading: boolean;
} {
  const lights = useHueResourcesStore((s) => s.lights);
  const spaces = useHueResourcesStore((s) => s.roomZones);
  const scenes = useHueResourcesStore((s) => s.scenes);
  const resourcesLoading = useHueResourcesStore((s) => s.isLoading);
  const lightOption = (light: HueLight): AutomationLightOption => ({
    kind: "light",
    id: light.id,
    name: light.name,
    icon: getLightIcon(light.typeName),
    color: light.isOn ? lightColorHex(light) : null,
  });
  const firstActiveColor = (lightIds: string[]) => {
    for (const light of lights) {
      if (!lightIds.includes(light.id) || !light.isOn) continue;
      const color = lightColorHex(light);
      if (color) return color;
    }
    return null;
  };
  const rooms = spaces.filter((space) => space.resourceType === "room");
  const lightGroups: AutomationLightGroup[] = [
    ...rooms.map((room) => ({
      id: room.id,
      name: room.name,
      options: [
        ...(room.groupedLightId
          ? [
              {
                kind: "room" as const,
                id: room.groupedLightId,
                name: room.name,
                label: "Whole room",
                detail: `${room.lightCount} lights`,
                icon: getRoomZoneIcon(room.class),
                color: firstActiveColor(room.lightIds),
              },
            ]
          : []),
        ...lights
          .filter((light) => room.lightIds.includes(light.id))
          .map(lightOption),
      ],
    })),
    {
      id: "zones",
      name: "Zones",
      options: spaces
        .filter((space) => space.resourceType === "zone")
        .flatMap((zone) =>
          zone.groupedLightId
            ? [
                {
                  kind: "zone" as const,
                  id: zone.groupedLightId,
                  name: zone.name,
                  detail: `${zone.lightCount} lights`,
                  icon: getRoomZoneIcon(zone.class),
                  color: firstActiveColor(zone.lightIds),
                },
              ]
            : [],
        ),
    },
    {
      id: "no-room",
      name: "Not in a room",
      options: lights
        .filter(
          (light) => !rooms.some((room) => room.lightIds.includes(light.id)),
        )
        .map(lightOption),
    },
  ].filter((group) => group.options.length > 0);
  const sceneOptions: AutomationSceneOption[] = scenes
    .filter((scene) => scene.resourceType === "scene")
    .map((scene) => ({
      id: scene.id,
      name: scene.name,
      groupId: scene.group ?? "other",
      groupName:
        spaces.find((space) => space.id === scene.group)?.name ?? "Other",
      bubble: sceneBubbleCss(scene),
      tint: sceneHexes(scene)[0] ?? null,
      brightness: sceneBrightness(scene),
    }));
  return { lightGroups, sceneOptions, resourcesLoading };
}
