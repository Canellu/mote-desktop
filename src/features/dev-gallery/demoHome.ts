import { Lightbulb, Monitor, Sofa, type LucideIcon } from "lucide-react";
import type { AutomationSceneOption } from "@/features/automations/components/AutomationScenePicker";
import type { AutomationLightGroup } from "@/features/automations/components/AutomationLightPicker";

/** An example home for gallery demos: two rooms, a zone, and a few scenes. */
const lightColors = ["#f6c26b", null, "#e2574c", "#f6e7c8", null, "#6b8fe8"];
const demoLights = (room: string, count: number, offset: number) =>
  Array.from({ length: count }, (_, index) => ({
    kind: "light" as const,
    id: `demo-light-${offset + index}`,
    name: `${room} light ${index + 1}`,
    icon: Lightbulb,
    color: lightColors[(offset + index) % lightColors.length],
  }));
const room = (id: string, name: string, icon: LucideIcon, count: number) => ({
  kind: "room" as const,
  id,
  name,
  label: "Whole room",
  detail: `${count} lights`,
  icon,
  color: null,
});
export const demoLightGroups: AutomationLightGroup[] = [
  {
    id: "office",
    name: "Office",
    options: [
      room("demo-office", "Office", Monitor, 3),
      ...demoLights("Office", 3, 0),
    ],
  },
  {
    id: "living",
    name: "Living room",
    options: [
      room("demo-living", "Living room", Sofa, 4),
      ...demoLights("Living room", 4, 3),
    ],
  },
  {
    id: "zones",
    name: "Zones",
    options: [
      {
        kind: "zone",
        id: "demo-zone",
        name: "Downstairs",
        detail: "7 lights",
        icon: Lightbulb,
        color: null,
      },
    ],
  },
];
const palette = (...colors: string[]) =>
  colors.length === 1
    ? colors[0]
    : `linear-gradient(135deg, ${colors.join(", ")})`;
export const demoScenes: AutomationSceneOption[] = [
  ["Concentrate", "demo-office", "Office", ["#e0edf5"], 100],
  ["Read", "demo-office", "Office", ["#f6dcae"], 90],
  ["Nightlight", "demo-office", "Office", ["#f29a4a"], 5],
  ["Relax", "demo-living", "Living room", ["#f2be7c"], 60],
  [
    "Tropical twilight",
    "demo-living",
    "Living room",
    ["#f07a5a", "#8a5cc9", "#3a76d8"],
    70,
  ],
  [
    "Savanna sunset",
    "demo-living",
    "Living room",
    ["#f7a440", "#e2574c", "#b83a6b"],
    80,
  ],
  [
    "Arctic aurora",
    "demo-zone",
    "Downstairs",
    ["#4bd6b8", "#3a8fd8", "#7b5cd6"],
    65,
  ],
  ["Dimmed", "demo-zone", "Downstairs", ["#f4c98b"], 30],
].map(([name, groupId, groupName, colors, brightness], index) => ({
  id: `demo-scene-${index}`,
  name: name as string,
  groupId: groupId as string,
  groupName: groupName as string,
  bubble: palette(...(colors as string[])),
  tint: (colors as string[])[0],
  brightness: brightness as number,
}));
