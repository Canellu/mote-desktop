/** Mirrors `AutomationSettings` in src-tauri/src/services/automations/settings.rs. */
export type AutomationTargetKind = "light" | "room" | "zone";

export interface AutomationTarget {
  kind: AutomationTargetKind;
  /** A light id, or the `grouped_light` id of a room or zone. */
  id: string;
  name: string;
}

export interface AutomationScene {
  id: string;
  name: string;
}

export type AutomationRule = "onAir" | "away";
export type OnAirMode = "color" | "white" | "scene";

export function automationTargets(settings: {
  targets: AutomationTarget[];
  target: AutomationTarget | null;
}): AutomationTarget[] {
  return settings.targets.length
    ? settings.targets
    : settings.target
      ? [settings.target]
      : [];
}

export function onAirXy(
  settings: Pick<OnAirSettings, "xy" | "color">,
): [number, number] {
  return (
    settings.xy ??
    ({
      red: [0.675, 0.322],
      orange: [0.5614, 0.4156],
      purple: [0.2725, 0.1096],
      blue: [0.1532, 0.0475],
    }[settings.color] as [number, number])
  );
}

export type OnAirTrigger = "microphone_or_camera" | "microphone" | "camera";
export type OnAirColor = "red" | "orange" | "purple" | "blue";
export type AwayAction = "off" | "dim" | "scene";

export interface OnAirSettings {
  enabled: boolean;
  bridgeId: string | null;
  target: AutomationTarget | null;
  targets: AutomationTarget[];
  mode: OnAirMode;
  xy: [number, number] | null;
  mirek: number;
  scene: AutomationScene | null;
  trigger: OnAirTrigger;
  color: OnAirColor;
  brightness: number;
  ignoredApps: string[];
}

export interface AwaySettings {
  enabled: boolean;
  bridgeId: string | null;
  target: AutomationTarget | null;
  targets: AutomationTarget[];
  scene: AutomationScene | null;
  action: AwayAction;
  dimBrightness: number;
  includeSleep: boolean;
  restoreOnReturn: boolean;
}

export interface AutomationSettings {
  onAir: OnAirSettings;
  away: AwaySettings;
}

/** Mirrors `CaptureApp` in capture_use.rs. */
export interface CaptureApp {
  id: string;
  name: string;
  microphone: boolean;
  camera: boolean;
}

/** Mirrors `AutomationStatus` in runtime.rs. Errors may be refusal JSON. */
export interface AutomationStatus {
  onAir: { active: boolean; apps: string[]; error: string | null };
  away: { active: boolean; error: string | null };
  captureApps: CaptureApp[];
}

export const onAirTriggers: { value: OnAirTrigger; label: string }[] = [
  { value: "microphone_or_camera", label: "Microphone or camera" },
  { value: "microphone", label: "Microphone only" },
  { value: "camera", label: "Camera only" },
];

/** Swatches only; the light receives the xy in settings.rs. */
export const onAirColors: {
  value: OnAirColor;
  label: string;
  swatch: string;
}[] = [
  { value: "red", label: "Red", swatch: "#e5484d" },
  { value: "orange", label: "Orange", swatch: "#f76b15" },
  { value: "purple", label: "Purple", swatch: "#8e4ec6" },
  { value: "blue", label: "Blue", swatch: "#0090ff" },
];

export const awayActions: { value: AwayAction; label: string }[] = [
  { value: "off", label: "Turn off" },
  { value: "dim", label: "Dim" },
  { value: "scene", label: "Scene" },
];

const nonPackagedPrefix = "NonPackaged\\";

/** A readable name for a consent-store id, matching `display_name` in capture_use.rs. */
export function captureAppName(id: string): string {
  if (id.startsWith(nonPackagedPrefix)) {
    const path = id.slice(nonPackagedPrefix.length);
    const file = path.split(/[#\\]/).pop() ?? path;
    return file.toLowerCase().endsWith(".exe") ? file.slice(0, -4) : file;
  }
  const family = id.split("_")[0];
  return family.split(".").pop() ?? family;
}
