import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  AutomationRule,
  AutomationSettings,
} from "@/features/automations/model";
import {
  automationNavVariants,
  automationRuleInfo,
} from "@/features/automations/useOpenAutomation";
import { AutomationSettingsEditor } from "@/features/settings-screen/tabs/AutomationsTab";
import type { AutomationSceneOption } from "@/features/settings-screen/components/AutomationScenePicker";
import type { AutomationLightGroup } from "@/features/settings-screen/components/AutomationLightPicker";
import { Lightbulb, Monitor, Sofa, type LucideIcon } from "lucide-react";

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
const lightGroups: AutomationLightGroup[] = [
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
const scenes: AutomationSceneOption[] = [
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

export function AutomationsDemo() {
  const [settings, setSettings] = useState<AutomationSettings>({
    onAir: {
      enabled: false,
      bridgeId: "demo",
      target: null,
      targets: [{ id: "demo-light-0", kind: "light", name: "Office light 1" }],
      mode: "color",
      xy: null,
      mirek: 366,
      scene: null,
      trigger: "microphone_or_camera",
      color: "red",
      brightness: 80,
      ignoredApps: [],
    },
    away: {
      enabled: false,
      bridgeId: "demo",
      target: null,
      targets: [],
      scene: null,
      action: "off",
      dimBrightness: 20,
      includeSleep: true,
      restoreOnReturn: true,
    },
  });
  const [previewRule, setPreviewRule] = useState<AutomationRule | null>(null);
  // Settings owns the title, blurb and back button around the editor, so the
  // gallery stands in for them — otherwise an open automation shows no name.
  const [editing, setEditing] = useState<AutomationRule | null>(null);
  const reduceMotion = useReducedMotion();
  const direction = reduceMotion ? 0 : editing ? 1 : -1;
  return (
    <div className="@container grid min-w-0 gap-3">
      <p className="text-sm text-muted-foreground" role="status">
        Example bridge ·{" "}
        {previewRule
          ? `Previewing ${previewRule === "onAir" ? "on-air" : "PC lock"} settings`
          : "Preview idle"}
        . No real lights are changed.
      </p>
      <div className="flex min-w-0 items-center gap-2 pb-2">
        {editing && (
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2 shrink-0"
            aria-label="Back to automations"
            onClick={() => setEditing(null)}
          >
            <ArrowLeft />
          </Button>
        )}
        <div className="grid min-w-0 flex-1">
          <AnimatePresence initial={false} mode="sync" custom={direction}>
            <motion.div
              key={editing ?? "tab"}
              className="col-start-1 row-start-1 min-w-0 space-y-2"
              custom={direction}
              variants={automationNavVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <h2 className="font-heading text-2xl font-semibold tracking-tight">
                {editing ? automationRuleInfo[editing].title : "Automations"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {editing
                  ? automationRuleInfo[editing].description
                  : "Let lights react to calls and to this PC locking."}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <AutomationSettingsEditor
        settings={settings}
        status={null}
        lightGroups={lightGroups}
        scenes={scenes}
        bridgeId="demo"
        hasPro
        previewError={null}
        editing={editing}
        onEditingChange={setEditing}
        onPreviewRuleChange={setPreviewRule}
        onChange={setSettings}
      />
    </div>
  );
}
