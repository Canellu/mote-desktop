import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { HueLight, HueRoomZone } from "@/types/hue";
import { HomeMapScreen } from "./HomeMapScreen";
import type { HomeMapLighting } from "./lighting";
import { createSampleLighting, summarizeSampleTargets } from "./sampleLighting";

const exampleModes = {
  live: "Live example",
  syncing: "One light syncing",
  offline: "Bridge offline",
  failure: "Simulate failure",
} as const;
type ExampleMode = keyof typeof exampleModes;

export default function HomeMapPreview({
  floorId,
  areaId,
  onSelect,
}: {
  floorId?: string;
  areaId?: string;
  onSelect: (floorId: string, areaId: string | null) => void;
}) {
  const [example, setExample] = useState(() => ({
    ...createSampleLighting(),
    revision: 1,
    error: null as string | null,
  }));
  const [mode, setMode] = useState<ExampleMode>("live");
  const syncedLightIds = mode === "syncing" ? [example.lights[0].id] : [];
  const roomZones = summarizeSampleTargets(example.roomZones, example.lights);

  function actionError(target: HueRoomZone): string | null {
    if (mode === "offline")
      return "Example bridge is offline. Choose Live example to reconnect.";
    if (mode === "failure")
      return "Example command failed. Choose Live example to try again.";
    if (target.lightIds.some((id) => syncedLightIds.includes(id)))
      return "An example light is syncing. Choose Live example to stop sync.";
    return null;
  }

  function updateTarget(
    target: HueRoomZone,
    update: (light: HueLight) => HueLight,
  ) {
    const knownTarget = example.roomZones.find(
      (entry) =>
        entry.id === target.id && entry.resourceType === target.resourceType,
    );
    if (!knownTarget) return;
    const error = actionError(knownTarget);
    setExample((current) => ({
      ...current,
      error,
      revision: current.revision + 1,
      lights: error
        ? current.lights
        : current.lights.map((light) =>
            knownTarget.lightIds.includes(light.id) ? update(light) : light,
          ),
      scenes: error
        ? current.scenes
        : current.scenes.map((scene) =>
            scene.group === knownTarget.id
              ? { ...scene, status: "inactive" }
              : scene,
          ),
    }));
  }

  const lighting: HomeMapLighting = {
    lights: example.lights,
    scenes: example.scenes,
    syncedLightIds,
    bridgeConnected: mode !== "offline",
    resourcesLoading: false,
    hueEventRevision: example.revision,
    error: example.error,
    onRefresh: () => {
      setExample((current) => ({
        ...current,
        error: null,
        revision: current.revision + 1,
      }));
    },
    onToggle: (target, isOn) => {
      updateTarget(target, (light) => ({ ...light, isOn }));
    },
    onBrightness: (target, value) => {
      updateTarget(target, (light) => ({
        ...light,
        isOn: true,
        brightness: Math.max(0, Math.min(100, value)),
      }));
    },
    onScene: async (scene) => {
      const knownScene = example.scenes.find((entry) => entry.id === scene.id);
      const target = example.roomZones.find(
        (entry) => entry.id === knownScene?.group,
      );
      if (!knownScene || !target)
        throw new Error("Example scene is unavailable.");
      const error = actionError(target);
      if (error) {
        setExample((current) => ({
          ...current,
          error,
          revision: current.revision + 1,
        }));
        throw new Error(error);
      }
      const actions = new Map(
        knownScene.actions.map((action) => [action.targetId, action]),
      );
      setExample((current) => ({
        ...current,
        error: null,
        revision: current.revision + 1,
        lights: current.lights.map((light) => {
          const action = actions.get(light.id);
          if (!action || !target.lightIds.includes(light.id)) return light;
          return {
            ...light,
            isOn: action.on ?? light.isOn,
            brightness: action.brightness ?? light.brightness,
            ct: action.mirek ?? light.ct,
            colorMode: "ct",
            xy: null,
          };
        }),
        scenes: current.scenes.map((entry) =>
          entry.group === target.id
            ? {
                ...entry,
                status: entry.id === knownScene.id ? "static" : "inactive",
              }
            : entry,
        ),
      }));
    },
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span id="example-connection-label" className="text-muted-foreground">
          Example connection
        </span>
        <Select
          value={mode}
          onValueChange={(value) => {
            if (!value || !(value in exampleModes)) return;
            setMode(value as ExampleMode);
            setExample((current) => ({
              ...current,
              error: null,
              revision: current.revision + 1,
            }));
          }}
        >
          <SelectTrigger size="sm" aria-labelledby="example-connection-label">
            <SelectValue>{exampleModes[mode]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(exampleModes).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <HomeMapScreen
        map={example.map}
        selectedFloorId={floorId}
        selectedAreaId={areaId}
        onSelect={onSelect}
        roomZones={roomZones}
        lighting={lighting}
        preview
        onOpenSpace={() => {}}
      />
    </div>
  );
}
