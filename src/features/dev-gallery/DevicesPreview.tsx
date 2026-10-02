import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTheme } from "@/context/ThemeContext";
import { DevicesTab } from "@/features/settings-screen/tabs/DevicesTab";
import { useFixtureGroupsStore } from "@/stores/FixtureGroupsStore";
import type {
  HueLight,
  HueRoom,
  HueSettingsSummary,
  HueZone,
} from "@/types/hue";
import { Moon, Sun } from "lucide-react";
import { useEffect } from "react";

// Dev-only: Settings > Devices with a made-up home, so its list, fixtures and
// side panels can be checked in both themes without a bridge. Saving and
// deleting reach for the bridge and fail here; everything else works.

const PREVIEW_BRIDGE = "PREVIEW-BRIDGE";

const light = (
  id: string,
  name: string,
  productName: string,
  modelId: string,
  extra: Partial<HueLight> = {},
): HueLight => ({
  id,
  deviceId: `device-${id}`,
  deviceName: name,
  name,
  isOn: true,
  brightness: 60,
  reachable: true,
  colorMode: "ct",
  xy: [0.45, 0.41],
  ct: 370,
  effect: null,
  effects: [],
  effectV2: null,
  effectsV2: [],
  supportsColor: true,
  supportsCt: true,
  ctMin: 153,
  ctMax: 500,
  gamut: null,
  modelId,
  productName,
  typeName: "spot_bulb",
  swVersion: "1.163.1",
  uniqueId: `00:17:88:01:0c:93:9b:${id.slice(-2).padStart(2, "0")}-0b`,
  function: "functional",
  powerup: { preset: "safety", brightness: null, mirek: null, xy: null },
  ...extra,
});

const lights: HueLight[] = [
  light("c1", "Hue Centris ceiling 3", "Hue Centris ceiling", "5060730P7_01", {
    typeName: "ceiling_round",
  }),
  light("s1", "Jenny spot", "Hue Centris spot", "5060730P7_02"),
  light("s2", "Hue Centris spot 8", "Hue Centris spot", "5060730P7_05"),
  light("s3", "Hue Centris spot 10", "Hue Centris spot", "5060730P7_04"),
  light("s4", "Hue Centris spot 11", "Hue Centris spot", "5060730P7_03", {
    reachable: false,
  }),
  light("m1", "Hue ambiance candle 3", "Hue ambiance candle", "LTE002", {
    typeName: "candle_bulb",
    supportsColor: false,
  }),
  light("m2", "Hue ambiance candle 2", "Hue ambiance candle", "LTE002", {
    typeName: "candle_bulb",
    supportsColor: false,
  }),
  light("g1", "Hue Go 1", "Hue Go", "7602031P7", {
    typeName: "hue_go",
    function: "decorative",
    powerup: { preset: "custom", brightness: 30, mirek: 370, xy: null },
  }),
  light("i1", "Hue Infuse ceiling 2", "Hue Infuse ceiling", "915005997301", {
    typeName: "ceiling_round",
  }),
  light("i2", "Hue Infuse ceiling 3", "Hue Infuse ceiling", "915005997301", {
    typeName: "ceiling_round",
  }),
];

const room = (id: string, name: string, lightIds: string[]): HueRoom => ({
  id,
  name,
  class: "living_room",
  resourceType: "room",
  anyOn: true,
  allOn: true,
  brightness: 60,
  lightCount: lightIds.length,
  lightIds,
  deviceIds: lightIds.map((lightId) => `device-${lightId}`),
  groupedLightId: null,
  accessories: [],
});

const zone: HueZone = {
  ...room("z1", "Downstairs", ["g1", "i1", "i2"]),
  resourceType: "zone",
  deviceIds: [],
};

const roomZones = [
  room("r1", "Bathroom", ["m1", "m2"]),
  room("r2", "Bedroom", ["c1", "s1", "s2", "s3", "s4"]),
  {
    ...room("r3", "Living room", ["g1", "i1", "i2"]),
    deviceIds: [
      "device-g1",
      "device-i1",
      "device-i2",
      "device-motion",
      "device-dimmer",
    ],
  },
  zone,
];

const summary: HueSettingsSummary = {
  bridge: {
    bridgeId: PREVIEW_BRIDGE,
    bridgeIp: "192.168.1.2",
    name: "Home",
    productName: "Hue Bridge",
    modelId: "BSB002",
    swVersion: "1.70",
    applicationKeySaved: true,
  },
  devices: [
    {
      id: "device-motion",
      name: "Hue motion sensor - Living room",
      productName: "Hue motion sensor",
      modelId: "SML001",
      productArchetype: "unknown_archetype",
      swVersion: "2.53.6",
      reachable: true,
      uniqueId: "00:17:88:01:02:0a:1b:2c-02",
      serviceTypes: ["motion", "temperature", "light_level", "device_power"],
    },
    {
      id: "device-dimmer",
      name: "Hue dimmer switch - Living room",
      productName: "Hue dimmer switch",
      modelId: "RWL022",
      productArchetype: "unknown_archetype",
      swVersion: "2.85.1",
      reachable: true,
      uniqueId: "00:17:88:01:0b:7d:78:36-01",
      serviceTypes: [
        "button",
        "device_power",
        "zigbee_connectivity",
        "device_software_update",
      ],
    },
  ],
  accessoryServices: [
    ...[
      { id: 1, value: "short_release", updated: "2026-09-30T21:44:01Z" },
      { id: 2, value: "initial_press", updated: "2026-09-30T17:38:32Z" },
      { id: 3, value: null, updated: null },
      { id: 4, value: "long_release", updated: "2026-09-26T00:28:00Z" },
    ].map((button) => ({
      id: `svc-button-${button.id}`,
      resourceType: "button" as const,
      controlId: button.id,
      deviceId: "device-dimmer",
      deviceName: "Hue dimmer switch - Living room",
      productName: "Hue dimmer switch",
      reachable: true,
      enabled: null,
      value: button.value,
      updated: button.updated,
      raw: {},
    })),
    {
      id: "svc-dimmer-battery",
      resourceType: "device_power",
      controlId: null,
      deviceId: "device-dimmer",
      deviceName: "Hue dimmer switch - Living room",
      productName: "Hue dimmer switch",
      reachable: true,
      enabled: null,
      value: "51",
      updated: null,
      raw: {},
    },
    {
      id: "svc-motion",
      resourceType: "motion",
      controlId: null,
      deviceId: "device-motion",
      deviceName: "Hue motion sensor - Living room",
      productName: "Hue motion sensor",
      reachable: true,
      enabled: true,
      value: "No motion",
      updated: "2026-09-30T16:28:43Z",
      raw: { sensitivity: { status: "set", sensitivity: 2, sensitivity_max: 4 } },
    },
    {
      id: "svc-light-level",
      resourceType: "light_level",
      controlId: null,
      deviceId: "device-motion",
      deviceName: "Hue motion sensor - Living room",
      productName: "Hue motion sensor",
      reachable: true,
      enabled: false,
      value: "409 lx",
      updated: "2026-09-30T21:55:34Z",
      raw: {},
    },
    {
      id: "svc-battery",
      resourceType: "device_power",
      controlId: null,
      deviceId: "device-motion",
      deviceName: "Hue motion sensor - Living room",
      productName: "Hue motion sensor",
      reachable: true,
      enabled: null,
      value: "62",
      updated: null,
      raw: {},
    },
    {
      id: "svc-temperature",
      resourceType: "temperature",
      controlId: null,
      deviceId: "device-motion",
      deviceName: "Hue motion sensor - Living room",
      productName: "Hue motion sensor",
      reachable: true,
      enabled: true,
      value: "24.8",
      updated: null,
      raw: {},
    },
  ],
  switchInputConfigurations: [],
  deviceDiscoverySupported: true,
};

export const DevicesPreview = () => {
  const { resolvedThemeMode, toggleTheme } = useTheme();

  // A fixture made of the bathroom candles, so a made fixture shows too.
  useEffect(() => {
    const store = useFixtureGroupsStore.getState();
    if (!store.groupsByBridge[PREVIEW_BRIDGE])
      store.setGroups(PREVIEW_BRIDGE, [
        { id: "fixture-mirror", lightIds: ["m1", "m2"], name: "Mirror Light" },
      ]);
  }, []);

  return (
    // Laid out like the Settings page: a card surface, a fading scroll area,
    // and the header's bottom space the sticky kind tabs tuck into.
    <ScrollArea
      fade
      className="h-full bg-card"
      viewportClassName="px-6 pb-6 [--settings-scroll-pad-top:1.5rem] pt-(--settings-scroll-pad-top)"
    >
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between pb-8">
          <h1 className="font-heading text-xl font-semibold">
            Devices preview
          </h1>
          <Button variant="outline" onClick={toggleTheme}>
            {resolvedThemeMode === "dark" ? <Sun /> : <Moon />}
            {resolvedThemeMode === "dark" ? "Light" : "Dark"} mode
          </Button>
        </div>
        <DevicesTab
          bridgeId={PREVIEW_BRIDGE}
          summary={summary}
          isLoadingSummary={false}
          lights={lights}
          roomZones={roomZones}
          onDelete={async () => {}}
          onSaveSwitchConfig={async () => {}}
          onRefresh={async () => {}}
        />
      </div>
    </ScrollArea>
  );
};
