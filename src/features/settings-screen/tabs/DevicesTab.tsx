import {
  SensorBatteryGauge,
  SensorReadingPill,
} from "@/components/SensorReadingPill";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PowerOnFields } from "@/features/light-settings/PowerOnFields";
import {
  roomForLight,
  sameIds,
  updateRoomPlacement,
  updateZonesPlacement,
  zonesForLight,
} from "@/features/light-settings/lightPlacement";
import {
  buildPowerOnBody,
  powerOnDraftFromLight,
  powerupSummary,
  samePowerOnDraft,
} from "@/features/light-settings/powerOn";
import {
  getLightIcon,
  LIGHT_ICON_OPTIONS,
} from "@/features/space-screen/utils/light-icons";
import { cn } from "@/lib/utils";
import type {
  HueAccessoryService,
  HueLight,
  HueRoomZone,
  HueSettingsDevice,
  HueSettingsSummary,
  HueSwitchInputConfiguration,
} from "@/types/hue";
import {
  CircleX,
  FilterX,
  Loader2,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { DeleteResourceButton } from "../components/DeleteResourceButton";
import { EditableResourceRow } from "../components/EditableResourceRow";
import { EmptyText } from "../components/EmptyText";
import { Panel } from "../components/Panel";
import { FLAT_CARD } from "../constants";
import type {
  DeleteResource,
  RenameResource,
  SaveSwitchConfig,
} from "../types";
import { classifyDevice } from "../utils/devices";
import { humanize, isRecord } from "../utils/format";

/** Reachability filter applied to the device list before grouping. */
type DeviceStatusFilter = "all" | "reachable" | "unreachable";

const deviceStatusItems: Record<DeviceStatusFilter, string> = {
  all: "All statuses",
  reachable: "Reachable",
  unreachable: "Unreachable",
};

/** Type-level sections, in display order. Also drives expand/collapse all. */
const SECTION_KEYS = ["Lights", "Switches", "Sensors", "Other Devices"];

/** Bucket key for devices/lights not placed in any room. */
const UNASSIGNED_KEY = "__unassigned";
const NO_ROOM = "__none__";

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
  summary,
  isLoadingSummary,
  lights,
  roomZones,
  onRename,
  onDelete,
  onSaveSwitchConfig,
  onRefresh,
}: {
  summary: HueSettingsSummary | null;
  isLoadingSummary: boolean;
  lights: HueLight[];
  roomZones: HueRoomZone[];
  onRename: RenameResource;
  onDelete: DeleteResource;
  onSaveSwitchConfig: SaveSwitchConfig;
  onRefresh: () => Promise<void>;
}) => {
  const [deviceQuery, setDeviceQuery] = useState("");
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatusFilter>("all");

  // Tracks which device sections the user has collapsed. Devices defaults to a
  // compact view, so known sections start collapsed.
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    () => new Set(["Lights", "Switches", "Sensors", "Other Devices"]),
  );

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
  const lightRoomGroups = useMemo(
    () => groupByRoom(filteredLights, (light) => light.deviceId, rooms),
    [filteredLights, rooms],
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
  const emptyDevicesMessage = isLoadingSummary
    ? "Loading devices..."
    : query || deviceStatus !== "all"
      ? "No devices match your filters."
      : "No devices found.";
  // An active search or status filter narrows the list to a handful of
  // matches, so force every rendered section open — otherwise the results
  // (and their controls, like delete) stay hidden behind a collapsed header.
  const isFiltering = query !== "" || deviceStatus !== "all";
  const isSectionOpen = (key: string) =>
    isFiltering || !collapsedSections.has(key);
  const toggleSection = (key: string) =>
    setCollapsedSections((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const expandAllSections = () => setCollapsedSections(new Set());
  const collapseAllSections = () => setCollapsedSections(new Set(SECTION_KEYS));

  return (
    <Panel title="Devices" contentClassName="min-h-[30vh]">
      <div className="space-y-5">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1">
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
              <SelectTrigger size="sm" className="w-40 rounded-4xl">
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

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Showing{" "}
              <span className="font-medium text-foreground">{matchCount}</span>{" "}
              of {totalCount} devices
              {(query || deviceStatus !== "all") && (
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
              )}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={expandAllSections}
              >
                Expand all
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={collapseAllSections}
              >
                Collapse all
              </Button>
            </div>
          </div>
        </div>

        {matchCount === 0 ? (
          <EmptyText>{emptyDevicesMessage}</EmptyText>
        ) : (
          <>
            {filteredLights.length > 0 && (
              <CollapsibleSection
                title="Lights"
                count={filteredLights.length}
                open={isSectionOpen("Lights")}
                onToggle={() => toggleSection("Lights")}
              >
                <RoomGroupedList groups={lightRoomGroups} getKey={(l) => l.id}>
                  {(light) => (
                    <EditableLightRow
                      light={light}
                      roomZones={roomZones}
                      onRename={onRename}
                      onDelete={onDelete}
                      onRefresh={onRefresh}
                    />
                  )}
                </RoomGroupedList>
              </CollapsibleSection>
            )}

            {deviceGroups.switches.length > 0 && (
              <DeviceGroupPanel
                title="Switches"
                devices={deviceGroups.switches}
                rooms={rooms}
                servicesByDevice={accessoryServicesByDevice}
                switchConfigsByDevice={switchConfigsByDevice}
                isLoading={isLoadingSummary}
                open={isSectionOpen("Switches")}
                onToggle={() => toggleSection("Switches")}
                onDelete={onDelete}
                onSaveSwitchConfig={onSaveSwitchConfig}
              />
            )}
            {deviceGroups.sensors.length > 0 && (
              <DeviceGroupPanel
                title="Sensors"
                devices={deviceGroups.sensors}
                rooms={rooms}
                servicesByDevice={accessoryServicesByDevice}
                switchConfigsByDevice={switchConfigsByDevice}
                isLoading={isLoadingSummary}
                open={isSectionOpen("Sensors")}
                onToggle={() => toggleSection("Sensors")}
                onDelete={onDelete}
                onSaveSwitchConfig={onSaveSwitchConfig}
              />
            )}
            {deviceGroups.other.length > 0 && (
              <DeviceGroupPanel
                title="Other Devices"
                devices={deviceGroups.other}
                rooms={rooms}
                servicesByDevice={accessoryServicesByDevice}
                switchConfigsByDevice={switchConfigsByDevice}
                isLoading={isLoadingSummary}
                open={isSectionOpen("Other Devices")}
                onToggle={() => toggleSection("Other Devices")}
                onDelete={onDelete}
                onSaveSwitchConfig={onSaveSwitchConfig}
              />
            )}
          </>
        )}
      </div>
    </Panel>
  );
};

/**
 * Renders items grouped by room with a subheading per room. The subheadings are
 * suppressed when everything falls into a single "Unassigned" bucket (e.g. no
 * rooms configured), so the section reads as a plain list in that case.
 */
function RoomGroupedList<T>({
  groups,
  getKey,
  children,
}: {
  groups: RoomGroup<T>[];
  getKey: (item: T) => string;
  children: (item: T) => React.ReactNode;
}) {
  const showHeadings = groups.length > 1 || groups[0]?.key !== UNASSIGNED_KEY;
  return (
    <div className="grid gap-5">
      {groups.map((group) => (
        <div key={group.key} className="grid gap-2.5">
          {showHeadings && (
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {group.title}
              </h3>
              <Badge variant="outline" className="tabular-nums">
                {group.items.length}
              </Badge>
            </div>
          )}
          <div className="grid gap-3">
            {group.items.map((item) => (
              <Fragment key={getKey(item)}>{children(item)}</Fragment>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const EditableLightRow = ({
  light,
  roomZones,
  onRename,
  onDelete,
  onRefresh,
}: {
  light: HueLight;
  roomZones: HueRoomZone[];
  onRename: RenameResource;
  onDelete: DeleteResource;
  onRefresh: () => Promise<void>;
}) => {
  const [icon, setIcon] = useState(light.typeName ?? "");
  const [func, setFunc] = useState(light.function ?? "");
  const [room, setRoom] = useState<string | null>(
    roomForLight(light, roomZones),
  );
  const [zoneIds, setZoneIds] = useState<string[]>(
    zonesForLight(light, roomZones),
  );
  const [powerOn, setPowerOn] = useState(() => powerOnDraftFromLight(light));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIcon(light.typeName ?? "");
    setFunc(light.function ?? "");
    setRoom(roomForLight(light, roomZones));
    setZoneIds(zonesForLight(light, roomZones));
    setPowerOn(powerOnDraftFromLight(light));
    setError(null);
  }, [light, roomZones]);

  const rooms = roomZones.filter((space) => space.resourceType === "room");
  const zones = roomZones.filter((space) => space.resourceType === "zone");
  const originalRoom = roomForLight(light, roomZones);
  const originalZones = zonesForLight(light, roomZones);
  const originalPowerOn = powerOnDraftFromLight(light);
  const metadataChanged =
    icon !== (light.typeName ?? "") || func !== (light.function ?? "");
  const powerOnChanged =
    light.powerup != null && !samePowerOnDraft(powerOn, originalPowerOn);
  const placementChanged =
    room !== originalRoom || !sameIds(zoneIds, originalZones);
  const dirty = metadataChanged || powerOnChanged || placementChanged;

  const save = async () => {
    if (!dirty) return;
    if (placementChanged && !light.deviceId) {
      setError("This light is missing its owning device id.");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      if (metadataChanged || powerOnChanged) {
        await invoke("update-hue-resource", {
          resourceType: "light",
          id: light.id,
          body: {
            ...(metadataChanged
              ? {
                  metadata: {
                    name: light.name,
                    ...(icon ? { archetype: icon } : null),
                    ...(func ? { function: func } : null),
                  },
                }
              : null),
            ...(powerOnChanged ? buildPowerOnBody(powerOn) : null),
          },
        });
      }
      if (room !== originalRoom) {
        await updateRoomPlacement(light, roomZones, room);
      }
      if (!sameIds(zoneIds, originalZones)) {
        await updateZonesPlacement(light, roomZones, zoneIds);
      }
      await onRefresh();
    } catch (saveError) {
      setError(String(saveError) || "Unable to save light settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const iconOptions =
    icon && !LIGHT_ICON_OPTIONS.some((option) => option.value === icon)
      ? [
          ...LIGHT_ICON_OPTIONS,
          { value: icon, label: humanize(icon), Icon: getLightIcon(icon) },
        ]
      : LIGHT_ICON_OPTIONS;
  const iconItems = Object.fromEntries(
    iconOptions.map((option) => [option.value, option.label]),
  );

  return (
    <EditableResourceRow
      id={light.id}
      resourceType="light"
      name={light.name}
      eyebrow={light.productName ?? light.typeName ?? "Hue light"}
      meta={[
        !light.reachable ? "Offline" : null,
        light.powerup ? `Power on: ${powerupSummary(light.powerup)}` : null,
      ]}
      onRename={onRename}
      onDelete={onDelete}
      deleteDescription={`Delete light "${light.name}" from the bridge.`}
    >
      <Accordion className="mt-3 rounded-xl border-border/60">
        <AccordionItem value="settings">
          <AccordionTrigger className="p-3">Light settings</AccordionTrigger>
          <AccordionContent className="px-3">
            <div className="grid gap-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Icon</Label>
                  <Select
                    items={iconItems}
                    value={icon || null}
                    onValueChange={(value) => setIcon(value ?? "")}
                    disabled={isSaving}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose icon">
                        {(value: string | null) => {
                          const option = iconOptions.find(
                            (item) => item.value === value,
                          );
                          if (!option) return "Choose icon";
                          const Icon = option.Icon;
                          return (
                            <>
                              <Icon
                                className="size-4.5 text-muted-foreground"
                                strokeWidth={2.25}
                              />
                              <span>{option.label}</span>
                            </>
                          );
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {iconOptions.map(({ value, label, Icon }) => (
                        <SelectItem key={value} value={value}>
                          <Icon
                            className="size-4.5 text-muted-foreground"
                            strokeWidth={2.25}
                          />
                          <span>{label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-1.5">
                  <Label>Function</Label>
                  <Select
                    items={{
                      functional: "Task",
                      decorative: "Decorative",
                      mixed: "Mixed",
                    }}
                    value={func || null}
                    onValueChange={(value) => setFunc(value ?? "")}
                    disabled={isSaving}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose function" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="functional">Task</SelectItem>
                      <SelectItem value="decorative">Decorative</SelectItem>
                      <SelectItem value="mixed">Mixed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Room</Label>
                  <Select
                    items={{
                      [NO_ROOM]: "No room",
                      ...Object.fromEntries(
                        rooms.map((space) => [space.id, space.name]),
                      ),
                    }}
                    value={room ?? NO_ROOM}
                    onValueChange={(value) =>
                      setRoom(value === NO_ROOM ? null : value)
                    }
                    disabled={isSaving}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_ROOM}>No room</SelectItem>
                      {rooms.map((space) => (
                        <SelectItem key={space.id} value={space.id}>
                          {space.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-1.5">
                  <Label>Zones</Label>
                  <Select
                    multiple
                    items={Object.fromEntries(
                      zones.map((space) => [space.id, space.name]),
                    )}
                    value={zoneIds}
                    onValueChange={setZoneIds}
                    disabled={isSaving}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="No zones">
                        {(value: string[]) =>
                          value.length === 0
                            ? "No zones"
                            : value
                                .map(
                                  (id) =>
                                    zones.find((space) => space.id === id)
                                      ?.name ?? id,
                                )
                                .join(", ")
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {zones.map((space) => (
                        <SelectItem
                          key={space.id}
                          value={space.id}
                          indicator="checkbox"
                        >
                          {space.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <PowerOnFields
                light={light}
                value={powerOn}
                onChange={setPowerOn}
                disabled={isSaving}
              />

              {error && (
                <p className="text-sm text-(--destructive-text)">{error}</p>
              )}
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  disabled={!dirty || isSaving}
                  onClick={() => void save()}
                >
                  {isSaving && <Loader2 className="animate-spin" />}
                  Save changes
                </Button>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="details">
          <AccordionTrigger className="p-3">Device details</AccordionTrigger>
          <AccordionContent className="px-3">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <DeviceField
                label="Product"
                value={light.productName ?? light.typeName}
              />
              <DeviceField label="Model" value={light.modelId} />
              <DeviceField label="Firmware" value={light.swVersion} />
              <DeviceField label="Zigbee ID" value={light.uniqueId} mono />
            </dl>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </EditableResourceRow>
  );
};

const DeviceGroupPanel = ({
  title,
  devices,
  rooms,
  servicesByDevice,
  switchConfigsByDevice,
  isLoading,
  open,
  onToggle,
  onDelete,
  onSaveSwitchConfig,
}: {
  title: string;
  devices: HueSettingsDevice[];
  rooms: HueRoomZone[];
  servicesByDevice: Map<string, HueAccessoryService[]>;
  switchConfigsByDevice: Map<string, HueSwitchInputConfiguration[]>;
  isLoading: boolean;
  open: boolean;
  onToggle: () => void;
  onDelete: DeleteResource;
  onSaveSwitchConfig: SaveSwitchConfig;
}) => {
  const groups = groupByRoom(devices, (device) => device.id, rooms);
  return (
    <CollapsibleSection
      title={title}
      count={devices.length}
      open={open}
      onToggle={onToggle}
    >
      {devices.length === 0 ? (
        <EmptyText>
          {isLoading
            ? "Loading devices..."
            : `No ${title.toLowerCase()} found.`}
        </EmptyText>
      ) : (
        <RoomGroupedList groups={groups} getKey={(device) => device.id}>
          {(device) => (
            <DeviceRow
              device={device}
              services={servicesByDevice.get(device.id) ?? []}
              switchConfigs={switchConfigsByDevice.get(device.id) ?? []}
              onDelete={onDelete}
              onSaveSwitchConfig={onSaveSwitchConfig}
            />
          )}
        </RoomGroupedList>
      )}
    </CollapsibleSection>
  );
};

const DeviceRow = ({
  device,
  services,
  switchConfigs,
  onDelete,
  onSaveSwitchConfig,
}: {
  device: HueSettingsDevice;
  services: HueAccessoryService[];
  switchConfigs: HueSwitchInputConfiguration[];
  onDelete: DeleteResource;
  onSaveSwitchConfig: SaveSwitchConfig;
}) => {
  const battery = services.find(
    (service) => service.resourceType === "device_power",
  );
  const primaryReadings = services.filter(
    (service) =>
      service.value &&
      service.resourceType !== "button" &&
      service.resourceType !== "relative_rotary" &&
      service.resourceType !== "device_power" &&
      service.resourceType !== "zigbee_connectivity" &&
      service.resourceType !== "light_level",
  );
  const serviceTypes = [...new Set(device.serviceTypes)];

  return (
    <Card size="sm" className={cn("bg-background/70", FLAT_CARD)}>
      <CardContent>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{device.name}</p>
            <p className="truncate text-sm text-muted-foreground">
              {device.productName ?? friendlyDeviceType(device)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!device.reachable && <Badge variant="destructive">Offline</Badge>}
            {battery && <SensorBatteryGauge service={battery} />}
          </div>
        </div>

        {primaryReadings.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {primaryReadings.map((service) => (
              <SensorReadingPill key={service.id} service={service} />
            ))}
          </div>
        )}

        <Accordion className="mt-3 rounded-xl border-border/60">
          <AccordionItem value="details">
            <AccordionTrigger className="p-3">Device details</AccordionTrigger>
            <AccordionContent className="px-3">
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <DeviceField label="Product" value={device.productName} />
                <DeviceField label="Model" value={device.modelId} />
                <DeviceField label="Firmware" value={device.swVersion} />
                <DeviceField label="Zigbee ID" value={device.uniqueId} mono />
              </dl>

              {serviceTypes.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Services
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {serviceTypes.map((serviceType) => (
                      <Badge key={serviceType} variant="outline">
                        {humanize(serviceType)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {(services.length > 0 || switchConfigs.length > 0) && (
                <Accordion className="mt-4 rounded-xl border-border/60">
                  {services.length > 0 && (
                    <AccordionItem value="services">
                      <AccordionTrigger className="p-3">
                        Service diagnostics
                      </AccordionTrigger>
                      <AccordionContent className="px-3">
                        <div className="grid gap-2">
                          {services.map((service) => (
                            <AccessoryServiceRow
                              key={service.id}
                              service={service}
                            />
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}
                  {switchConfigs.length > 0 && (
                    <AccordionItem value="switch-config">
                      <AccordionTrigger className="p-3">
                        Advanced switch configuration
                      </AccordionTrigger>
                      <AccordionContent className="px-3">
                        <p className="mb-3 text-xs text-muted-foreground">
                          Raw bridge configuration for troubleshooting and
                          custom switch behavior.
                        </p>
                        <div className="grid gap-2">
                          {switchConfigs.map((config) => (
                            <SwitchConfigEditor
                              key={config.id}
                              config={config}
                              onSave={onSaveSwitchConfig}
                            />
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}
                </Accordion>
              )}

              {!isBridgeDevice(device) && (
                <div className="mt-4 flex flex-col items-start gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">Remove device</p>
                    <p className="text-xs text-muted-foreground">
                      Disconnect this device from the Hue Bridge.
                    </p>
                  </div>
                  <DeleteResourceButton
                    label={device.name}
                    description={`Delete device "${device.name}" from the bridge.`}
                    triggerLabel="Remove device"
                    onDelete={() => onDelete("device", device.id)}
                  />
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
};

const AccessoryServiceRow = ({ service }: { service: HueAccessoryService }) => (
  <div className="rounded-lg bg-muted/45 px-3 py-2 text-sm">
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate font-medium">{humanize(service.resourceType)}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[service.value, service.updated].filter(Boolean).join(" · ") ||
            "No state reported"}
        </p>
      </div>
      <div className="flex shrink-0 gap-1">
        {service.enabled !== null && (
          <Badge variant={service.enabled ? "secondary" : "outline"}>
            {service.enabled ? "Enabled" : "Disabled"}
          </Badge>
        )}
        <Badge variant={service.reachable ? "secondary" : "destructive"}>
          {service.reachable ? "Reachable" : "Offline"}
        </Badge>
      </div>
    </div>
  </div>
);

const SwitchConfigEditor = ({
  config,
  onSave,
}: {
  config: HueSwitchInputConfiguration;
  onSave: SaveSwitchConfig;
}) => {
  const [draft, setDraft] = useState(() =>
    JSON.stringify(writableSwitchConfig(config.raw), null, 2),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(JSON.stringify(writableSwitchConfig(config.raw), null, 2));
  }, [config.raw]);

  const save = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const parsed = JSON.parse(draft) as unknown;
      if (!isRecord(parsed)) {
        throw new Error("Configuration body must be a JSON object.");
      }
      await onSave(config.id, parsed);
    } catch (saveError) {
      setError(String(saveError) || "Unable to save switch configuration.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-lg bg-muted/45 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {config.mode ?? "Switch input configuration"}
          </p>
          <p className="truncate text-xs text-muted-foreground">{config.id}</p>
        </div>
        <Button
          type="button"
          size="sm"
          className="gap-2"
          disabled={isSaving}
          onClick={() => void save()}
        >
          {isSaving ? (
            <Loader2 className="animate-spin" />
          ) : (
            <SlidersHorizontal />
          )}
          Save
        </Button>
      </div>
      <textarea
        className="min-h-28 w-full resize-y rounded-xl border border-border bg-background/80 px-3 py-2 font-mono text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        aria-label="Switch input configuration JSON"
        spellCheck={false}
      />
      {error && (
        <p className="mt-2 text-sm text-(--destructive-text)">{error}</p>
      )}
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

const writableSwitchConfig = (raw: unknown): Record<string, unknown> => {
  if (!isRecord(raw)) return {};
  const next = { ...raw };
  delete next.id;
  delete next.type;
  delete next.owner;
  delete next.metadata;
  return next;
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
