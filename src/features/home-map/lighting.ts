import type { HueLight, HueRoomZone, HueScene } from "@/types/hue";

/** Existing Hue actions injected separately from the map's geometry. */
export interface HomeMapLighting {
  lights: HueLight[];
  scenes: HueScene[];
  syncedLightIds: string[];
  bridgeConnected: boolean;
  resourcesLoading: boolean;
  hueEventRevision: number;
  error: string | null;
  onToggle: (target: HueRoomZone, on: boolean) => void;
  onBrightness: (
    target: HueRoomZone,
    value: number,
    phase: "live" | "final",
  ) => void;
  onScene: (scene: HueScene) => Promise<void>;
  onRefresh?: () => void;
}
