import { SensorBatteryGauge } from "@/components/SensorReadingPill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getLightIcon } from "@/features/space-screen/utils/light-icons";
import { useHue } from "@/context/HueContext";
import {
  freeLights,
  groupFixtures,
  renameFixture,
  saveFixture,
  suggestFixtureLights,
  targetsOfLights,
  ungroupFixture,
  type Fixture,
  type FixtureGroup,
  type FixtureResult,
} from "@/lib/fixtures";
import { CONTROL_SURFACE_CLASS } from "@/lib/control-surface";
import { cn } from "@/lib/utils";
import {
  useFixtureGroups,
  useFixtureGroupsStore,
} from "@/stores/FixtureGroupsStore";
import type {
  HueAccessoryService,
  HueLight,
  HueRoomZone,
  HueSettingsDevice,
  HueSettingsSummary,
  HueSwitchInputConfiguration,
} from "@/types/hue";
import {
  ChevronRight,
  CircleX,
  Cpu,
  FilterX,
  Layers,
  Loader2,
  Radar,
  Search,
  ToggleRight,
} from "lucide-react";
import { Fragment, useMemo, useRef, useState } from "react";
import { SegmentedControl } from "../components/SegmentedControl";
import { EmptyText } from "../components/EmptyText";
import { SETTINGS_EXPANDABLE_CARD } from "../constants";
import {
  DetailsFrame,
  DetailsSection,
  DetailsSheet,
} from "../components/DetailsSheet";
import { FixtureDialog } from "../components/FixtureDialog";
import { LightSettingsFields } from "../components/LightSettingsFields";
import {
  MIXED,
  useLightSettings,
  type LightSettings,
} from "../components/useLightSettings";
import { LightHero } from "@/features/light-settings/LightHero";
import { DeviceStatusList } from "../components/DeviceStatusList";
import {
  ExpandableRow,
  ExpandableRowGroup,
} from "@/components/ui/expandable-row";
import { DeviceSettingsPanel } from "../components/DeviceSettingsPanel";
import { RemoveResourceSection } from "@/features/space-screen/components/RemoveResourceSection";
import type { DeleteResource, SaveSwitchConfig } from "../types";
import { classifyDevice } from "../utils/devices";
import { humanize, isRecord } from "../utils/format";

/** Reachability filter applied to the device list before grouping. */
type DeviceStatusFilter = "all" | "reachable" | "unreachable";

const deviceStatusItems: Record<DeviceStatusFilter, string> = {
  all: "All statuses",
  reachable: "Reachable",
  unreachable: "Unreachable",
};

/** The kinds of device, as the tabs along the top, in display order. */
type DeviceKindTab = "lights" | "switches" | "sensors" | "other";

// Labels only, so the four fit on one row at the narrowest window.
const DEVICE_KIND_TABS: ReadonlyArray<{
  value: DeviceKindTab;
  label: string;
}> = [
  { value: "lights", label: "Lights" },
  { value: "switches", label: "Switches" },
  { value: "sensors", label: "Sensors" },
  { value: "other", label: "Other" },
];

/**
 * What the Devices tab was showing, kept for the session so that leaving for a
 * full-screen editor and coming back returns to the same tab and panel.
 */
const devicesTabMemory: { kind: DeviceKindTab; openId: string | null } = {
  kind: "lights",
  openId: null,
};

/** Devices of one kind on the bridge, before any search or filter. */
const totalOfKind = (
  summary: HueSettingsSummary | null,
  kind: "switch" | "sensor" | null,
) =>
  (summary?.devices ?? []).filter((device) => {
    const found = classifyDevice(device);
    return kind
      ? found === kind
      : found !== "light" && found !== "switch" && found !== "sensor";
  }).length;

/** Bucket key for devices/lights not placed in any room. */
const UNASSIGNED_KEY = "__unassigned";

/** A by-room bucket of items, used to subdivide each type section. */
interface RoomGroup<T> {
  key: string;
  title: string;
  items: T[];
}

/**
 * Buckets items by the room their owning device belongs to, preserving room
 * store order. Items whose device isn't placed in a room fall into a trailing
 * "Unassigned" bucket. Empty rooms are dropped.
 */
const groupByRoom = <T,>(
  items: T[],
  getDeviceId: (item: T) => string | null | undefined,
  rooms: HueRoomZone[],
): RoomGroup<T>[] => {
  const roomByDeviceId = new Map<string, HueRoomZone>();
  for (const room of rooms)
    for (const deviceId of room.deviceIds) roomByDeviceId.set(deviceId, room);

  const buckets = new Map<string, RoomGroup<T>>();
  for (const room of rooms)
    buckets.set(room.id, { key: room.id, title: room.name, items: [] });
  const unassigned: T[] = [];

  for (const item of items) {
    const deviceId = getDeviceId(item);
    const room = deviceId ? roomByDeviceId.get(deviceId) : undefined;
    if (room) buckets.get(room.id)!.items.push(item);
    else unassigned.push(item);
  }

  const groups = [...buckets.values()].filter(
    (group) => group.items.length > 0,
  );
  if (unassigned.length > 0) {
    groups.push({
      key: UNASSIGNED_KEY,
      title: "Unassigned",
      items: unassigned,
    });
  }
  return groups;
};

export const DevicesTab = ({
  bridgeId: bridgeIdOverride,
  summary: bridgeSummary,
  isLoadingSummary,
  lights,
  roomZones,
  onDelete,
  onSaveSwitchConfig,
  onRefresh,
}: {
  /** The bridge whose fixtures to show; the active one by default. */
  bridgeId?: string;
  summary: HueSettingsSummary | null;
  isLoadingSummary: boolean;
  lights: HueLight[];
  roomZones: HueRoomZone[];
  onDelete: DeleteResource;
  onSaveSwitchConfig: SaveSwitchConfig;
  onRefresh: () => Promise<void>;
}) => {
  // The bridge reports itself as a device; it has its own page under
  // Connections, so it isn't listed here.
  const summary = useMemo(
    () =>
      bridgeSummary && {
        ...bridgeSummary,
        devices: bridgeSummary.devices.filter(
          (device) => !isBridgeDevice(device),
        ),
      },
    [bridgeSummary],
  );
  const [deviceQuery, setDeviceQuery] = useState("");
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatusFilter>("all");

  // One kind of device at a time, each as its full list of rooms.
  const [kind, setKindState] = useState<DeviceKindTab>(devicesTabMemory.kind);
  const setKind = (next: DeviceKindTab) => {
    devicesTabMemory.kind = next;
    setKindState(next);
  };

  const accessoryServicesByDevice = useMemo(() => {
    const map = new Map<string, HueAccessoryService[]>();
    for (const service of summary?.accessoryServices ?? []) {
      if (!service.deviceId) continue;
      const current = map.get(service.deviceId) ?? [];
      current.push(service);
      map.set(service.deviceId, current);
    }
    return map;
  }, [summary?.accessoryServices]);
  const switchConfigsByDevice = useMemo(() => {
    const map = new Map<string, HueSwitchInputConfiguration[]>();
    for (const config of summary?.switchInputConfigurations ?? []) {
      if (!config.deviceId) continue;
      const current = map.get(config.deviceId) ?? [];
      current.push(config);
      map.set(config.deviceId, current);
    }
    return map;
  }, [summary?.switchInputConfigurations]);

  // Search + reachability narrow the lists before either grouping runs, so the
  // two views (by type / by room) and the result counter all stay consistent.
  const query = deviceQuery.trim().toLowerCase();
  // Search the human-facing fields only. Model numbers and Zigbee IDs are
  // deliberately excluded: their digits (e.g. "7602031P7") collide with name
  // searches like "hue go 2" and produce confusing false matches.
  const filteredLights = useMemo(
    () =>
      lights.filter(
        (light) =>
          matchesStatus(light.reachable, deviceStatus) &&
          matchesQuery(query, [light.name, light.productName, light.typeName]),
      ),
    [lights, deviceStatus, query],
  );
  const filteredDevices = useMemo(
    () =>
      (summary?.devices ?? []).filter(
        (device) =>
          matchesStatus(device.reachable, deviceStatus) &&
          matchesQuery(query, [
            device.name,
            device.productName,
            device.productArchetype,
            ...device.serviceTypes,
          ]),
      ),
    [summary?.devices, deviceStatus, query],
  );

  // Lights have their own rich panel (sourced from the store), so the device
  // groups cover the rest: switches, sensors, and anything uncategorised.
  const deviceGroups = useMemo(() => {
    const switches: HueSettingsDevice[] = [];
    const sensors: HueSettingsDevice[] = [];
    const other: HueSettingsDevice[] = [];
    for (const device of filteredDevices) {
      const kind = classifyDevice(device);
      if (kind === "switch") switches.push(device);
      else if (kind === "sensor") sensors.push(device);
      else if (kind !== "light") other.push(device);
    }
    return { switches, sensors, other };
  }, [filteredDevices]);

  // Each type section is subdivided by room, mapping each item to the room its
  // owning device belongs to. Lights map via their `deviceId`; switches/sensors
  // are devices themselves and map by their own id.
  const rooms = useMemo(
    () => roomZones.filter((roomZone) => roomZone.resourceType === "room"),
    [roomZones],
  );
  // Lights are listed as fixtures. The bridge only knows devices, so a product
  // whose heads are separate devices, like a Centris, is grouped by the person
  // and kept per bridge, which the map shares.
  const { bridgeId: activeBridgeId } = useHue();
  const bridgeId = bridgeIdOverride ?? activeBridgeId;
  const fixtureGroups = useFixtureGroups(bridgeId);
  const targetOfLight = useMemo(() => targetsOfLights(roomZones), [roomZones]);
  // Grouped over every light so a search matching one head still shows its
  // whole fixture.
  const allFixtures = useMemo(
    () => groupFixtures(lights, { overrides: fixtureGroups }),
    [lights, fixtureGroups],
  );
  const lightFixtures = useMemo(() => {
    const shown = new Set(filteredLights.map((light) => light.id));
    return allFixtures.filter((fixture) =>
      fixture.lightIds.some((id) => shown.has(id)),
    );
  }, [filteredLights, allFixtures]);
  const [panel, setPanel] = useState<PanelTarget | null>(null);
  const roomKeyOfLight = (light: HueLight | undefined) =>
    rooms.find(
      (room) => light?.deviceId && room.deviceIds.includes(light.deviceId),
    )?.id ?? UNASSIGNED_KEY;
  const lightRoomGroups = useMemo(
    () =>
      groupByRoom(
        lightFixtures,
        (fixture) => fixture.lights[0]?.deviceId,
        rooms,
      ),
    [lightFixtures, rooms],
  );
  const lightsByRoom = useMemo(
    () =>
      new Map(
        groupByRoom(lights, (light) => light.deviceId, rooms).map((group) => [
          group.key,
          group.items,
        ]),
      ),
    [lights, rooms],
  );
  const [fixtureError, setFixtureError] = useState<string | null>(null);
  /** Stores a grouping change; returns the error to show, or null. */
  const applyFixtureGroups = (result: FixtureResult<FixtureGroup[]>) => {
    if (!result.ok) {
      setFixtureError(result.error);
      return result.error;
    }
    setFixtureError(null);
    if (bridgeId)
      useFixtureGroupsStore.getState().setGroups(bridgeId, result.value);
    return null;
  };
  /** Creates a fixture, or changes which lights `existing` holds. */
  const storeFixture = (name: string, lightIds: string[], existing?: string) =>
    applyFixtureGroups(
      saveFixture(
        fixtureGroups,
        lightIds,
        name,
        existing ?? `fixture-${crypto.randomUUID()}`,
      ),
    );

  const matchCount =
    filteredLights.length +
    deviceGroups.switches.length +
    deviceGroups.sensors.length +
    deviceGroups.other.length;
  const totalCount = useMemo(() => {
    const devices = summary?.devices ?? [];
    return (
      lights.length +
      devices.filter((device) => classifyDevice(device) !== "light").length
    );
  }, [lights.length, summary?.devices]);
  const kindCounts: Record<DeviceKindTab, number> = {
    lights: filteredLights.length,
    switches: deviceGroups.switches.length,
    sensors: deviceGroups.sensors.length,
    other: deviceGroups.other.length,
  };
  // A kind with nothing in it, even unfiltered, has no tab; Other is often
  // empty. The chosen kind falls back to the first one there is.
  const kindOptions = DEVICE_KIND_TABS.filter(
    (option) =>
      option.value === "lights" ||
      // Before the first load, switches and sensors keep their tabs so they
      // don't pop in late; only an empty Other stays hidden.
      (summary == null && option.value !== "other") ||
      (option.value === "switches"
        ? totalOfKind(summary, "switch")
        : option.value === "sensors"
          ? totalOfKind(summary, "sensor")
          : totalOfKind(summary, null)) > 0,
  ).map((option) => ({
    ...option,
    detail: String(kindCounts[option.value]),
  }));
  const activeKind = kindOptions.some((option) => option.value === kind)
    ? kind
    : "lights";
  const deviceKindDevices =
    activeKind === "switches"
      ? deviceGroups.switches
      : activeKind === "sensors"
        ? deviceGroups.sensors
        : deviceGroups.other;

  return (
    <div className="space-y-5">
      {/* Stays at the top while the list scrolls, so switching kinds or
          searching never needs a scroll back up. It sticks to the scroll
          area's very top edge, past its top padding, so nothing shows above
          it. The 2rem of card color above the tabs sits in the page header's
          bottom space at rest, and takes the scroll area's top fade once
          scrolled, so the fade never reaches the tabs. */}
      <div className="sticky top-[calc(-1*var(--settings-scroll-pad-top,0px))] z-10 -mt-8 flex flex-col gap-3 bg-card pt-8 pb-3">
        <SegmentedControl
          value={activeKind}
          onValueChange={setKind}
          ariaLabel="Kind of device"
          options={kindOptions}
          layoutId="devices-kind-pill"
        />
        <div className="flex items-center gap-3">
          <div className="relative min-w-0 flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={deviceQuery}
              onChange={(event) => setDeviceQuery(event.target.value)}
              placeholder="Search by name, product, or capability"
              aria-label="Search devices"
              className="pl-9 pr-9"
            />
            {deviceQuery && (
              <button
                type="button"
                onClick={() => setDeviceQuery("")}
                aria-label="Clear search"
                className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
              >
                <CircleX size={16} />
              </button>
            )}
          </div>
          <Select
            items={deviceStatusItems}
            value={deviceStatus}
            onValueChange={(value) =>
              setDeviceStatus(value as DeviceStatusFilter)
            }
          >
            <SelectTrigger size="sm" className="w-40 shrink-0 rounded-4xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(
                Object.entries(deviceStatusItems) as Array<
                  [DeviceStatusFilter, string]
                >
              ).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {(query || deviceStatus !== "all") && (
          <p className="flex items-center text-xs text-muted-foreground">
            Showing{" "}
            <span className="mx-1 font-medium text-foreground">
              {matchCount}
            </span>{" "}
            of {totalCount} devices
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-2 h-7 gap-1.5 px-2 text-xs"
              onClick={() => {
                setDeviceQuery("");
                setDeviceStatus("all");
              }}
            >
              <FilterX size={14} />
              Clear filters
            </Button>
          </p>
        )}
      </div>

      {activeKind === "lights" ? (
        filteredLights.length === 0 ? (
          <EmptyText>{emptyMessageFor("lights")}</EmptyText>
        ) : (
          <div className="grid gap-3">
            {fixtureError && (
              <p className="text-sm text-(--destructive-text)">
                {fixtureError}
              </p>
            )}
            <RoomGroupedList
              groups={lightRoomGroups}
              framed
              getKey={(fixture) => fixture.id}
              getCount={(fixture) => fixture.lights.length}
              headingAction={(group) => {
                // A light is in one fixture at most, so a room offers
                // Create fixture only while two of its lights are free.
                const free = freeLights(
                  lightsByRoom.get(group.key) ?? [],
                  fixtureGroups,
                );
                if (free.length < 2) return null;
                return (
                  <FixtureDialog
                    lights={free}
                    suggestedIds={suggestFixtureLights(free, targetOfLight)}
                    onSave={(name, lightIds) => storeFixture(name, lightIds)}
                  />
                );
              }}
            >
              {(fixture) => (
                <FixtureListItems fixture={fixture} onOpen={setPanel} />
              )}
            </RoomGroupedList>
          </div>
        )
      ) : (
        <DeviceKindList
          emptyText={emptyMessageFor(activeKind)}
          devices={deviceKindDevices}
          rooms={rooms}
          roomZones={roomZones}
          servicesByDevice={accessoryServicesByDevice}
          switchConfigsByDevice={switchConfigsByDevice}
          onDelete={onDelete}
          onSaveSwitchConfig={onSaveSwitchConfig}
          onRefresh={onRefresh}
        />
      )}
      <LightsPanel
        panel={panel}
        lights={lights}
        fixtures={allFixtures}
        roomZones={roomZones}
        roomLightsOf={(fixture) => [
          // Its own lights, then the free ones in its room; never another
          // fixture's.
          ...fixture.lights,
          ...freeLights(
            lightsByRoom.get(roomKeyOfLight(fixture.lights[0])) ?? [],
            fixtureGroups,
          ),
        ]}
        onOpen={setPanel}
        onEditFixture={(fixture, name, lightIds) =>
          storeFixture(name, lightIds, fixture.id)
        }
        onRenameFixture={(fixture, name) =>
          applyFixtureGroups(renameFixture(fixtureGroups, fixture.id, name))
        }
        onUngroupFixture={(fixture) => {
          applyFixtureGroups(ungroupFixture(fixtureGroups, fixture.id));
          setPanel(null);
        }}
        onDelete={onDelete}
        onRefresh={onRefresh}
      />
    </div>
  );

  function emptyMessageFor(tab: DeviceKindTab) {
    if (isLoadingSummary && tab !== "lights") return "Loading devices...";
    const noun = DEVICE_KIND_TABS.find(
      (option) => option.value === tab,
    )!.label.toLowerCase();
    return query || deviceStatus !== "all"
      ? `No ${noun} match your filters.`
      : `No ${noun} found.`;
  }
};

/**
 * Renders items grouped by room with a subheading per room. The subheadings are
 * suppressed when everything falls into a single "Unassigned" bucket (e.g. no
 * rooms configured), so the section reads as a plain list in that case.
 */
function RoomGroupedList<T>({
  groups,
  getKey,
  getCount = () => 1,
  headingAction,
  framed = false,
  children,
}: {
  groups: RoomGroup<T>[];
  /**
   * Each room as one block: its heading as the first row and its items as
   * rows below, so rooms read apart without cards inside cards.
   */
  framed?: boolean;
  getKey: (item: T) => string;
  /** How many devices an item stands for, for the room badge. */
  getCount?: (item: T) => number;
  /** A control at the end of a room's heading, such as Create fixture. */
  headingAction?: (group: RoomGroup<T>) => React.ReactNode;
  children: (item: T) => React.ReactNode;
}) {
  const showHeadings = groups.length > 1 || groups[0]?.key !== UNASSIGNED_KEY;
  return (
    <div className={framed ? "grid gap-3" : "grid gap-5"}>
      {groups.map((group) => (
        <div
          key={group.key}
          className={
            framed
              ? cn("overflow-hidden rounded-2xl", SETTINGS_EXPANDABLE_CARD)
              : "grid gap-2.5"
          }
        >
          {(showHeadings || headingAction) && (
            <div
              className={cn(
                "flex min-h-7 items-center gap-2",
                framed && "py-2.5 pr-3 pl-4",
              )}
            >
              {showHeadings && (
                <>
                  <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {group.title}
                  </h3>
                  <Badge variant="outline" className="tabular-nums">
                    {group.items.reduce((sum, item) => sum + getCount(item), 0)}
                  </Badge>
                </>
              )}
              <span className="ml-auto">{headingAction?.(group)}</span>
            </div>
          )}
          <div
            className={
              framed
                ? "divide-y divide-border/60 border-t border-border/60 first:border-t-0"
                : "grid gap-3"
            }
          >
            {group.items.map((item) => (
              <Fragment key={getKey(item)}>{children(item)}</Fragment>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * A list inside the side panel. Its rows open something, so it takes the same
 * surface as the fields below it.
 */
const PANEL_LIST_CLASS = cn(
  "divide-y divide-border/60 overflow-hidden rounded-2xl",
  CONTROL_SURFACE_CLASS,
);

/** What the side panel shows: a light, or a fixture and its lights. */
type PanelTarget =
  | { kind: "light"; id: string; fixtureId?: string }
  | { kind: "fixture"; id: string };

/** "Hue Centris spot" in the "Hue Centris" fixture reads as "Spot". */
const headKind = (light: HueLight, fixtureName: string) => {
  const product = light.productName?.trim();
  if (!product) return null;
  const rest = product.toLowerCase().startsWith(fixtureName.toLowerCase())
    ? product.slice(fixtureName.length).trim()
    : product;
  return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : product;
};

const lightMeta = (light: HueLight, fixture?: Fixture) =>
  [
    fixture ? headKind(light, fixture.name) : light.productName,
    light.reachable ? null : "Unreachable",
  ]
    .filter(Boolean)
    .join(" · ");

/** A line in the list that opens its details in the side panel. */
const ListRow = ({
  icon: Icon,
  title,
  meta,
  indent = false,
  inset = "section",
  trailing,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  meta: string;
  indent?: boolean;
  /** "section" lines up with a room block's heading; "panel" sits in a box. */
  inset?: "section" | "panel";
  /** Shown before the arrow, such as a battery gauge. */
  trailing?: React.ReactNode;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex w-full min-w-0 items-center gap-3 py-2.5 text-left text-foreground transition-colors outline-none hover:bg-foreground/6 focus-visible:bg-foreground/6",
      inset === "section" ? "pr-4" : "pr-3",
      indent
        ? inset === "section"
          ? "pl-11"
          : "pl-10"
        : inset === "section"
          ? "pl-4"
          : "pl-3",
    )}
  >
    <Icon
      className="size-4.5 shrink-0 text-muted-foreground"
      strokeWidth={2.25}
    />
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium">{title}</span>
      {meta && (
        <span className="block truncate text-xs text-muted-foreground">
          {meta}
        </span>
      )}
    </span>
    {trailing}
    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
  </button>
);

/**
 * A fixture in the Lights list: a single light is one line; a fixture is a
 * line of its own with its lights indented once beneath it.
 */
const FixtureListItems = ({
  fixture,
  onOpen,
}: {
  fixture: Fixture;
  onOpen: (target: PanelTarget) => void;
}) => {
  if (fixture.lights.length === 1) {
    const light = fixture.lights[0];
    return (
      <ListRow
        icon={getLightIcon(light.typeName)}
        title={light.name}
        meta={lightMeta(light)}
        onClick={() => onOpen({ kind: "light", id: light.id })}
      />
    );
  }
  return (
    <div className="divide-y divide-border/40">
      <ListRow
        icon={Layers}
        title={fixture.name}
        meta={fixtureMeta(fixture)}
        onClick={() => onOpen({ kind: "fixture", id: fixture.id })}
      />
      {fixture.lights.map((light) => (
        <ListRow
          key={light.id}
          icon={getLightIcon(light.typeName)}
          title={light.name}
          meta={lightMeta(light, fixture)}
          indent
          onClick={() =>
            onOpen({ kind: "light", id: light.id, fixtureId: fixture.id })
          }
        />
      ))}
    </div>
  );
};

const fixtureMeta = (fixture: Fixture) => {
  const unreachable = fixture.lights.filter((light) => !light.reachable).length;
  return [
    fixture.custom ? "Fixture" : "Multi-light device",
    `${fixture.lights.length} lights`,
    unreachable > 0 ? `${unreachable} unreachable` : null,
  ]
    .filter(Boolean)
    .join(" · ");
};

/**
 * The side panel for the Lights list, laid out like the light side pane: the
 * icon and name at the top, then the settings, the device facts, and removal
 * at the bottom, with Cancel and Save pinned below. A fixture shows its lights
 * and settings that apply to all of them.
 */
const LightsPanel = ({
  panel,
  lights,
  fixtures,
  roomZones,
  roomLightsOf,
  onOpen,
  onEditFixture,
  onRenameFixture,
  onUngroupFixture,
  onDelete,
  onRefresh,
}: {
  panel: PanelTarget | null;
  lights: HueLight[];
  fixtures: Fixture[];
  roomZones: HueRoomZone[];
  /** The lights an edited fixture may be made of: those in its room. */
  roomLightsOf: (fixture: Fixture) => HueLight[];
  onOpen: (target: PanelTarget | null) => void;
  onEditFixture: (
    fixture: Fixture,
    name: string,
    lightIds: string[],
  ) => string | null;
  onRenameFixture: (fixture: Fixture, name: string) => void;
  onUngroupFixture: (fixture: Fixture) => void;
  onDelete: DeleteResource;
  onRefresh: () => Promise<void>;
}) => {
  const light =
    panel?.kind === "light"
      ? lights.find((entry) => entry.id === panel.id)
      : undefined;
  const fixture = fixtures.find(
    (entry) =>
      entry.id === (panel?.kind === "fixture" ? panel.id : panel?.fixtureId),
  );
  const close = () => onOpen(null);

  // A light deleted from its panel, or a fixture ungrouped, closes it. Each
  // panel is keyed so its draft starts fresh for what it shows.
  const content = light ? (
    <LightDetailsPanel
      key={light.id}
      light={light}
      fixture={fixture}
      roomZones={roomZones}
      onClose={close}
      onBack={
        fixture ? () => onOpen({ kind: "fixture", id: fixture.id }) : undefined
      }
      onDelete={onDelete}
      onRefresh={onRefresh}
    />
  ) : panel?.kind === "fixture" && fixture ? (
    <FixtureDetailsPanel
      key={fixture.id}
      fixture={fixture}
      roomZones={roomZones}
      roomLights={roomLightsOf(fixture)}
      onClose={close}
      onOpenLight={(head) =>
        onOpen({ kind: "light", id: head.id, fixtureId: fixture.id })
      }
      onEditLights={(name, lightIds) => onEditFixture(fixture, name, lightIds)}
      onRename={(name) => onRenameFixture(fixture, name)}
      onUngroup={() => onUngroupFixture(fixture)}
      onRefresh={onRefresh}
    />
  ) : null;
  // One sheet stays mounted, so it slides in and out; while it slides away it
  // keeps showing what it last showed.
  const shown = useRef<React.ReactNode>(null);
  if (content) shown.current = content;
  return (
    <DetailsSheet open={content != null} onClose={close}>
      {content ?? shown.current}
    </DetailsSheet>
  );
};

/** Cancel and Save, pinned to the bottom of a panel. */
const SaveFooter = ({
  settings,
  onCancel,
}: {
  settings: LightSettings;
  onCancel: () => void;
}) => (
  <>
    <Button
      type="button"
      variant="outline"
      className="flex-1"
      disabled={settings.isSaving}
      onClick={onCancel}
    >
      {/* Says what it does: drops the edits, or with none, closes. */}
      {settings.dirty ? "Discard" : "Cancel"}
    </Button>
    <Button
      type="button"
      className="flex-1"
      disabled={!settings.dirty || settings.isSaving}
      onClick={() => void settings.save()}
    >
      {settings.isSaving && <Loader2 className="animate-spin" />}
      Save
    </Button>
  </>
);

const LightDetailsPanel = ({
  light,
  fixture,
  roomZones,
  onClose,
  onBack,
  onDelete,
  onRefresh,
}: {
  light: HueLight;
  /** The fixture it was opened from, if any. */
  fixture?: Fixture;
  roomZones: HueRoomZone[];
  onClose: () => void;
  onBack?: () => void;
  onDelete: DeleteResource;
  onRefresh: () => Promise<void>;
}) => {
  const settings = useLightSettings({
    lights: [light],
    roomZones,
    name: light.name,
    onRefresh,
  });
  const inGroup = fixture != null && fixture.lights.length > 1;

  return (
    <DetailsFrame
      onClose={onClose}
      eyebrow={lightMeta(light) || "Hue light"}
      title={light.name}
      removal={
        <RemoveResourceSection
          title={`Delete ${light.name}`}
          description="Removes it from your Hue Bridge."
          actionLabel="Delete"
          confirmTone="danger"
          confirmTitle={`Delete "${light.name}"?`}
          confirmBody="It is removed from your Hue Bridge, along with its rooms, zones and scenes. To use it again, you have to add it to the bridge again."
          disabled={settings.isSaving}
          onConfirm={() => onDelete("light", light.id)}
        />
      }
      back={
        fixture && onBack ? { label: fixture.name, onClick: onBack } : undefined
      }
      guard={settings}
      footer={
        <SaveFooter
          settings={settings}
          // Cancel drops the edits; with none, it closes like the side pane.
          onCancel={settings.dirty ? settings.discard : onClose}
        />
      }
    >
      <LightHero
        icon={settings.draft.icon}
        name={settings.draft.name}
        disabled={settings.isSaving}
        onIconChange={(icon) => settings.set({ icon })}
        onNameChange={(name) => settings.set({ name })}
      />
      {inGroup && (
        <p className="-mt-3 text-center text-xs text-muted-foreground">
          Part of {fixture.name}. Changes here are for this light only.
        </p>
      )}
      <LightSettingsFields
        settings={settings}
        lights={[light]}
        roomZones={roomZones}
        roomLockedReason={
          inGroup
            ? fixture.custom
              ? `Set from ${fixture.name}, so all of its lights stay in one room.`
              : `The room belongs to the whole device. Set it from ${fixture.name}.`
            : undefined
        }
      />
      {settings.error && (
        <p className="text-sm text-(--destructive-text)">{settings.error}</p>
      )}
      <DetailsSection title="Device details">
        <LightDeviceFields light={light} />
      </DetailsSection>
    </DetailsFrame>
  );
};

const FixtureDetailsPanel = ({
  fixture,
  roomZones,
  roomLights,
  onClose,
  onOpenLight,
  onEditLights,
  onRename,
  onUngroup,
  onRefresh,
}: {
  fixture: Fixture;
  roomZones: HueRoomZone[];
  /** The lights its lights may be chosen from: its own and its room's free ones. */
  roomLights: HueLight[];
  onClose: () => void;
  onOpenLight: (light: HueLight) => void;
  onEditLights: (name: string, lightIds: string[]) => string | null;
  onRename: (name: string) => void;
  onUngroup: () => void;
  onRefresh: () => Promise<void>;
}) => {
  const settings = useLightSettings({
    lights: fixture.lights,
    roomZones,
    name: fixture.name,
    // A fixture is Mote's, so only one the person made can be renamed.
    saveName: fixture.custom ? onRename : undefined,
    onRefresh,
  });
  const roomNameOf = (head: HueLight) =>
    roomZones.find(
      (space) =>
        space.resourceType === "room" &&
        head.deviceId != null &&
        space.deviceIds.includes(head.deviceId),
    )?.name ?? "No room";
  // A fixture hangs in one room; lights moved apart elsewhere say so.
  const apart = new Set(fixture.lights.map(roomNameOf)).size > 1;

  return (
    <DetailsFrame
      onClose={onClose}
      eyebrow={fixtureMeta(fixture)}
      title={fixture.name}
      guard={settings}
      removal={
        fixture.custom && (
          <RemoveResourceSection
            title="Ungroup fixture"
            description="Lists its lights separately again."
            actionLabel="Ungroup"
            confirmTitle={`Ungroup "${fixture.name}"?`}
            confirmBody="Its lights are listed and placed on the map separately again. Nothing changes on the bridge, and you can group them again at any time."
            disabled={settings.isSaving}
            onConfirm={async () => onUngroup()}
          />
        )
      }
      footer={
        <SaveFooter
          settings={settings}
          onCancel={settings.dirty ? settings.discard : onClose}
        />
      }
    >
      <LightHero
        icon={settings.draft.icon === MIXED ? "" : settings.draft.icon}
        fallbackIcon={Layers}
        name={settings.draft.name}
        disabled={settings.isSaving}
        onIconChange={(icon) => settings.set({ icon })}
        onNameChange={
          fixture.custom ? (name) => settings.set({ name }) : undefined
        }
      />
      <DetailsSection
        title="Lights"
        description={
          apart
            ? "Its lights are in different rooms. Choose one room below to bring them together."
            : undefined
        }
        action={
          fixture.custom && (
            <FixtureDialog
              fixture={fixture}
              lights={roomLights}
              onSave={onEditLights}
            />
          )
        }
      >
        <div className={PANEL_LIST_CLASS}>
          {fixture.lights.map((head) => (
            <ListRow
              key={head.id}
              icon={getLightIcon(head.typeName)}
              title={head.name}
              meta={[lightMeta(head, fixture), apart ? roomNameOf(head) : null]
                .filter(Boolean)
                .join(" · ")}
              inset="panel"
              onClick={() => onOpenLight(head)}
            />
          ))}
        </div>
      </DetailsSection>
      <DetailsSection
        title="Settings"
        description={`Applies to ${fixture.lights.length === 2 ? "both" : `all ${fixture.lights.length}`} lights, including the icon above.`}
      >
        <LightSettingsFields
          settings={settings}
          lights={fixture.lights}
          roomZones={roomZones}
        />
      </DetailsSection>
      {settings.error && (
        <p className="text-sm text-(--destructive-text)">{settings.error}</p>
      )}
    </DetailsFrame>
  );
};

/** Product facts about a light's device, for its panel. */
const LightDeviceFields = ({ light }: { light: HueLight }) => (
  <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
    <DeviceField label="Product" value={light.productName ?? light.typeName} />
    <DeviceField label="Model" value={light.modelId} />
    <DeviceField label="Firmware" value={light.swVersion} />
    <DeviceField label="Zigbee ID" value={light.uniqueId} mono />
  </dl>
);

/** One kind of device (switches, sensors, other) as rooms of rows. */
const DeviceKindList = ({
  emptyText,
  devices,
  rooms,
  roomZones,
  servicesByDevice,
  switchConfigsByDevice,
  onDelete,
  onSaveSwitchConfig,
  onRefresh,
}: {
  emptyText: string;
  devices: HueSettingsDevice[];
  rooms: HueRoomZone[];
  roomZones: HueRoomZone[];
  servicesByDevice: Map<string, HueAccessoryService[]>;
  switchConfigsByDevice: Map<string, HueSwitchInputConfiguration[]>;
  onDelete: DeleteResource;
  onSaveSwitchConfig: SaveSwitchConfig;
  onRefresh: () => Promise<void>;
}) => {
  const groups = groupByRoom(devices, (device) => device.id, rooms);
  const [openId, setOpenIdState] = useState<string | null>(
    devicesTabMemory.openId,
  );
  const setOpenId = (next: string | null) => {
    devicesTabMemory.openId = next;
    setOpenIdState(next);
  };
  const opened = devices.find((device) => device.id === openId);
  // Kept while the sheet slides away, so it doesn't empty as it closes.
  const lastOpened = useRef<HueSettingsDevice | undefined>(undefined);
  if (opened) lastOpened.current = opened;
  const shown = opened ?? lastOpened.current;

  // Called, not rendered as a component, so the panel keeps its draft
  // across re-renders.
  const renderPanel = (device: HueSettingsDevice) => {
    const eyebrow = [
      device.productName ?? friendlyDeviceType(device),
      device.reachable ? null : "Unreachable",
    ]
      .filter(Boolean)
      .join(" · ");
    const removal = !isBridgeDevice(device) && (
      <RemoveResourceSection
        title={`Delete ${device.name}`}
        description="Removes it from your Hue Bridge."
        actionLabel="Delete"
        confirmTone="danger"
        confirmTitle={`Delete "${device.name}"?`}
        confirmBody="It is removed from your Hue Bridge, along with anything it controls there. To use it again, you have to add it to the bridge again."
        onConfirm={() => onDelete("device", device.id)}
      />
    );
    const details = (
      <DeviceDetails
        device={device}
        services={servicesByDevice.get(device.id) ?? []}
        switchConfigs={switchConfigsByDevice.get(device.id) ?? []}
        onSaveSwitchConfig={onSaveSwitchConfig}
      />
    );
    const kind = classifyDevice(device);
    // Switches and sensors have settings of their own; anything else only
    // shows what it is.
    if (kind === "switch" || kind === "sensor")
      return (
        <DeviceSettingsPanel
          key={device.id}
          device={device}
          services={servicesByDevice.get(device.id) ?? []}
          roomZones={roomZones}
          icon={deviceIcon(device)}
          eyebrow={eyebrow}
          removal={removal}
          onClose={() => setOpenId(null)}
          onRefresh={onRefresh}
        >
          {details}
        </DeviceSettingsPanel>
      );
    return (
      <DetailsFrame
        onClose={() => setOpenId(null)}
        title={device.name}
        eyebrow={eyebrow}
        removal={removal}
      >
        <LightHero
          icon=""
          fallbackIcon={deviceIcon(device)}
          name={device.name}
        />
        {details}
      </DetailsFrame>
    );
  };
  return (
    <>
      {devices.length === 0 ? (
        <EmptyText>{emptyText}</EmptyText>
      ) : (
        <RoomGroupedList groups={groups} framed getKey={(device) => device.id}>
          {(device) => {
            const battery = servicesByDevice
              .get(device.id)
              ?.find((service) => service.resourceType === "device_power");
            return (
              <ListRow
                icon={deviceIcon(device)}
                title={device.name}
                meta={[
                  device.productName ?? friendlyDeviceType(device),
                  device.reachable ? null : "Unreachable",
                ]
                  .filter(Boolean)
                  .join(" · ")}
                trailing={battery && <SensorBatteryGauge service={battery} />}
                onClick={() => setOpenId(device.id)}
              />
            );
          }}
        </RoomGroupedList>
      )}
      <DetailsSheet open={Boolean(opened)} onClose={() => setOpenId(null)}>
        {shown && renderPanel(shown)}
      </DetailsSheet>
    </>
  );
};

const deviceIcon = (device: HueSettingsDevice) => {
  const kind = classifyDevice(device);
  if (kind === "switch") return ToggleRight;
  if (kind === "sensor") return Radar;
  return Cpu;
};

/** Friendlier names for what a device can do, for its details. */
const CAPABILITY_LABELS: Record<string, string> = {
  device_power: "Battery",
  device_software_update: "Software updates",
  zigbee_connectivity: "Zigbee",
  light_level: "Light level",
  relative_rotary: "Dial",
  camera_motion: "Motion",
};

/**
 * Everything about a switch, sensor or other device, for the side panel: what
 * it reports now, the facts about it, and, for switches, the bridge's raw
 * button setup. Sections are set apart by dividers; nothing is folded away.
 */
const DeviceDetails = ({
  device,
  services,
  switchConfigs,
  onSaveSwitchConfig,
}: {
  device: HueSettingsDevice;
  services: HueAccessoryService[];
  switchConfigs: HueSwitchInputConfiguration[];
  onSaveSwitchConfig: SaveSwitchConfig;
}) => {
  const capabilities = [
    ...new Set(
      device.serviceTypes.map(
        (type) => CAPABILITY_LABELS[type] ?? humanize(type),
      ),
    ),
  ];

  // Battery shows at the top of the panel, so the readings here leave it out.
  const readings = services.filter(
    (service) => service.resourceType !== "device_power",
  );

  return (
    <div className="grid gap-6">
      <ExpandableRowGroup>
        {readings.length > 0 && (
          <ExpandableRow
            title="Status"
            value={`${readings.length} ${readings.length === 1 ? "reading" : "readings"}`}
          >
            <DeviceStatusList services={readings} />
          </ExpandableRow>
        )}
        <ExpandableRow
          title="Device details"
          value={device.modelId ?? undefined}
        >
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
            <DeviceField label="Product" value={device.productName} />
            <DeviceField label="Model" value={device.modelId} />
            <DeviceField label="Firmware" value={device.swVersion} />
            <DeviceField label="Zigbee ID" value={device.uniqueId} mono />
            {capabilities.length > 0 && (
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">Capabilities</dt>
                <dd className="text-sm">{capabilities.join(", ")}</dd>
              </div>
            )}
          </dl>
        </ExpandableRow>
      </ExpandableRowGroup>

      {switchConfigs.length > 0 && (
        <DetailsSection
          title="Wired switch"
          description="The kind of wall switch wired to this module, so its presses are read the right way."
        >
          <div className="grid gap-5">
            {switchConfigs.map((config, index) => (
              <SwitchModeField
                key={config.id}
                label={
                  switchConfigs.length > 1
                    ? `Switch ${index + 1}`
                    : "Switch type"
                }
                config={config}
                onSave={onSaveSwitchConfig}
              />
            ))}
          </div>
        </DetailsSection>
      )}
    </div>
  );
};

const SWITCH_MODE_LABELS: Record<string, string> = {
  switch_single_rocker: "Single rocker",
  switch_single_pushbutton: "Single push button",
  switch_dual_rocker: "Dual rocker",
  switch_dual_pushbutton: "Dual push button",
};

/** The switch_mode a wall switch module reports: its mode and the choices. */
const switchModeOf = (raw: unknown) => {
  const mode = isRecord(raw) ? raw.switch_mode : null;
  if (!isRecord(mode)) return null;
  return {
    mode: typeof mode.mode === "string" ? mode.mode : null,
    values: Array.isArray(mode.mode_values)
      ? mode.mode_values.filter(
          (value): value is string => typeof value === "string",
        )
      : Object.keys(SWITCH_MODE_LABELS),
    changing: mode.status === "changing",
  };
};

/** Picks the wired switch type; a choice is written straight away. */
const SwitchModeField = ({
  label,
  config,
  onSave,
}: {
  label: string;
  config: HueSwitchInputConfiguration;
  onSave: SaveSwitchConfig;
}) => {
  const current = switchModeOf(config.raw);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!current) return null;

  const choose = async (mode: string | null) => {
    if (!mode || mode === current.mode) return;
    setIsSaving(true);
    setError(null);
    try {
      await onSave(config.id, { switch_mode: { mode } });
    } catch (saveError) {
      setError(String(saveError) || "Unable to change the switch type.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Select
        items={Object.fromEntries(
          current.values.map((value) => [
            value,
            SWITCH_MODE_LABELS[value] ?? humanize(value),
          ]),
        )}
        value={current.mode}
        onValueChange={(value) => void choose(value)}
        disabled={isSaving}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Choose switch type" />
        </SelectTrigger>
        <SelectContent>
          {current.values.map((value) => (
            <SelectItem key={value} value={value}>
              {SWITCH_MODE_LABELS[value] ?? humanize(value)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {(isSaving || current.changing) && (
        <p className="text-xs text-muted-foreground">
          The module applies this the next time it wakes, which can take a
          minute. Press the switch to wake it sooner.
        </p>
      )}
      {error && <p className="text-sm text-(--destructive-text)">{error}</p>}
    </div>
  );
};

/** A labelled value in the device detail grid; shows a dash when absent. */
const DeviceField = ({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) => (
  <div className="min-w-0">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd
      className={cn(
        "truncate text-sm font-medium",
        mono && "font-mono text-xs",
        !value && "text-muted-foreground",
      )}
    >
      {value || "—"}
    </dd>
  </div>
);

const isBridgeDevice = (device: HueSettingsDevice) =>
  device.serviceTypes.includes("bridge") ||
  [device.name, device.productName, device.productArchetype]
    .filter(Boolean)
    .some((value) => value?.toLowerCase().includes("bridge"));

const friendlyDeviceType = (device: HueSettingsDevice) => {
  const kind = classifyDevice(device);
  if (kind === "switch") return "Switch";
  if (kind === "sensor") return "Sensor";
  if (kind === "light") return "Light";
  return "Hue device";
};

/** True when every search token appears in at least one of the given fields. */
const matchesQuery = (
  query: string,
  fields: Array<string | null | undefined>,
) => {
  if (!query) return true;
  const haystack = fields.filter(Boolean).join(" ").toLowerCase();
  return query.split(/\s+/).every((token) => haystack.includes(token));
};

const matchesStatus = (reachable: boolean, filter: DeviceStatusFilter) =>
  filter === "all" || (filter === "reachable" ? reachable : !reachable);
