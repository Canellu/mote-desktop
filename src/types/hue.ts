// Shared Hue API v2-facing frontend types. These mirror the camelCase payloads
// emitted by the Rust commands and preserve Hue resource names where practical.
// All ids are v2 UUIDs and all brightness values are percentages (0-100).

export type HueResourceType =
  | "room"
  | "zone"
  | "grouped_light"
  | "light"
  | "scene"
  | "device"
  | "button"
  | "relative_rotary"
  | "motion"
  | "temperature"
  | "light_level"
  | "camera_motion"
  | "contact"
  | "tamper"
  | "device_power"
  | "zigbee_connectivity"
  | "smart_scene"
  | "switch_input_configuration"
  | "bridge_home"
  | "entertainment"
  | "entertainment_configuration";

export interface HueResourceReference {
  rid: string;
  rtype: HueResourceType;
}

/** Bucket a device is grouped under in the UI. */
export type HueDeviceKind = "light" | "switch" | "sensor";

/** A non-light accessory (switch/remote or sensor) placed in a room. */
export interface HueAccessory {
  /** v2 device UUID. */
  id: string;
  name: string;
  kind: Extract<HueDeviceKind, "switch" | "sensor">;
  productName: string | null;
  reachable: boolean;
}

interface HueRoomZoneBase {
  /** v2 room/zone UUID. */
  id: string;
  name: string;
  /** v2 archetype, e.g. "living_room". */
  class: string;
  resourceType: "room" | "zone";
  anyOn: boolean;
  allOn: boolean;
  brightness: number | null;
  lightCount: number;
  lightIds: string[];
  /** Device children in rooms; empty for zones. */
  deviceIds: string[];
  /** grouped_light resource controlling this room/zone on/brightness. */
  groupedLightId: string | null;
  /** Switches and sensors placed here. Always empty for zones. */
  accessories: HueAccessory[];
}

export interface HueRoom extends HueRoomZoneBase {
  resourceType: "room";
}

export interface HueZone extends HueRoomZoneBase {
  resourceType: "zone";
}

export type HueRoomZone = HueRoom | HueZone;

export interface HueLight {
  id: string;
  /** Owning v2 device UUID. Lights sharing one are heads of one fixture. */
  deviceId: string | null;
  /** Name of the owning device, which names the fixture a head belongs to. */
  deviceName: string | null;
  name: string;
  isOn: boolean;
  brightness: number | null;
  reachable: boolean;
  colorMode: string | null;
  xy: [number, number] | null;
  /** Color temperature in mireds. */
  ct: number | null;
  /** Active effect identifier (e.g. "no_effect", "candle"). */
  effect: string | null;
  /** Effect identifiers this fixture supports. */
  effects: string[];
  /** Active modern effect identifier from effects_v2, when available. */
  effectV2: string | null;
  /** Modern effect identifiers this fixture supports. */
  effectsV2: string[];
  supportsColor: boolean;
  supportsCt: boolean;
  ctMin: number | null;
  ctMax: number | null;
  gamut: [[number, number], [number, number], [number, number]] | null;
  modelId: string | null;
  productName: string | null;
  typeName: string | null;
  swVersion: string | null;
  uniqueId: string | null;
  /** What the light is used for: "functional", "decorative", "mixed", or "unknown". */
  function: string | null;
  /** Behavior configured for a physical power cycle. */
  powerup: HueLightPowerup | null;
}

export type HuePowerupPreset =
  | "safety"
  | "last_on_state"
  | "powerfail"
  | "custom";

export interface HueLightPowerup {
  preset: HuePowerupPreset;
  brightness: number | null;
  mirek: number | null;
  xy: [number, number] | null;
}

export interface HuePosition {
  x: number;
  y: number;
  z: number;
}

export interface HueEntertainmentService {
  id: string;
  type: "entertainment";
  renderer: boolean;
  renderer_reference?: HueResourceReference;
  segments?: {
    segments?: Array<{ start: number; length: number }>;
  };
}

export interface HueEntertainmentConfiguration {
  id: string;
  type: "entertainment_configuration";
  metadata: { name: string };
  configuration_type: "screen" | "monitor" | "music" | "3dspace" | "other";
  status: "active" | "inactive";
  locations: {
    service_locations: Array<{
      service: HueResourceReference;
      positions: HuePosition[];
      equalization_factor?: number;
    }>;
  };
  /** Streaming channels derived by the bridge from the service locations. */
  channels?: Array<{
    channel_id: number;
    position?: HuePosition;
    members?: Array<{ service: HueResourceReference; index?: number }>;
  }>;
}

/** One preset color from a scene action — exactly one field is set. */
export interface SceneColor {
  xy: [number, number] | null;
  /** Color temperature in mireds. */
  mirek: number | null;
}

export interface SceneLightAction {
  targetId: string;
  on: boolean | null;
  brightness: number | null;
  xy: [number, number] | null;
  /** Color temperature in mireds. */
  mirek: number | null;
  effect: string | null;
  effectV2: string | null;
}

export interface HueScene {
  id: string;
  name: string;
  resourceType: "scene" | "smart_scene";
  /** room/zone UUID this scene targets. */
  group: string | null;
  sceneType: string | null;
  status: string | null;
  dynamic: boolean;
  speed: number | null;
  autoDynamic: boolean;
  smart: boolean;
  /** Preset color palette parsed from the scene's per-light actions. */
  colors: SceneColor[];
  /** Per-light scene targets for optimistic scene recall in the UI. */
  actions: SceneLightAction[];
}

export interface HueSettingsSummary {
  bridge: HueSettingsBridge;
  devices: HueSettingsDevice[];
  accessoryServices: HueAccessoryService[];
  switchInputConfigurations: HueSwitchInputConfiguration[];
  deviceDiscoverySupported: boolean;
}

export interface HueSettingsBridge {
  bridgeId: string;
  bridgeIp: string;
  name: string | null;
  productName: string | null;
  modelId: string | null;
  swVersion: string | null;
  applicationKeySaved: boolean;
}

export interface HueSettingsDevice {
  id: string;
  name: string;
  productName: string | null;
  modelId: string | null;
  productArchetype: string | null;
  swVersion: string | null;
  reachable: boolean;
  uniqueId: string | null;
  serviceTypes: string[];
}

export interface HueAccessoryService {
  id: string;
  resourceType: HueResourceType;
  /** Logical control identifier within the owning switch device. */
  controlId: number | null;
  deviceId: string | null;
  deviceName: string | null;
  productName: string | null;
  reachable: boolean;
  enabled: boolean | null;
  value: string | null;
  updated: string | null;
  raw: unknown;
}

export interface HueSwitchInputConfiguration {
  id: string;
  deviceId: string | null;
  deviceName: string | null;
  mode: string | null;
  raw: unknown;
}

/** Resource change pushed from the bridge SSE stream. Matched by v2 `id`. */
export interface HueEventUpdate {
  /** Metadata or membership changed; reload the resource snapshot in each window. */
  resourcesChanged?: boolean;
  /** SSE container kind: update, add, delete, or error. */
  eventType: string | null;
  type: string;
  id: string | null;
  on: boolean | null;
  brightness: number | null;
  /** Live CIE xy chromaticity, when the change carries a color. */
  xy: [number, number] | null;
  /** Live color temperature in mireds, when the change carries one. */
  mirek: number | null;
  colorMode: string | null;
  effect: string | null;
  effectV2: string | null;
  /** Dynamic-palette speed (0-1), when a scene or live dynamics update carries it. */
  speed: number | null;
  /** Whether a dynamic scene auto-starts when recalled as active. */
  autoDynamic: boolean | null;
  /** Entertainment configuration lifecycle state (`active` or `inactive`). */
  status: string | null;
  /** Application id currently owning an entertainment configuration. */
  activeStreamerId: string | null;
  value: string | null;
  /** ISO timestamp of an accessory reading's last change, when carried. */
  updated: string | null;
}
