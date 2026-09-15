import { PacedSlider } from "@/components/PacedSlider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  samePowerOnDraft,
} from "@/features/light-settings/powerOn";
import { lightColorHex } from "@/features/space-screen/utils/color-state";
import {
  getLightIcon,
  LIGHT_ICON_OPTIONS,
} from "@/features/space-screen/utils/light-icons";
import { selectableVariants } from "@/lib/selection-styles";
import { activeTileTheme } from "@/lib/tile-theme";
import { cn } from "@/lib/utils";
import {
  type LightColorChange,
  useHueResourcesStore,
} from "@/stores/HueResourcesStore";
import { useEntertainmentStore } from "@/stores/EntertainmentStore";
import type { HueLight, HueRoomZone } from "@/types/hue";
import { useNavigate } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { Lightbulb, Loader2, Pencil, Radio, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ColorWheel } from "./ColorWheel";
import { RemoveResourceSection } from "./RemoveResourceSection";
import { SidePane } from "./SidePane";
import { TemperatureWheel } from "./TemperatureWheel";

type ControlCommitPhase = "live" | "final";

type Tab = "color" | "kelvin" | "effects";

// The Hue bridge rejects resource names longer than 32 characters.
const MAX_NAME_LENGTH = 32;

interface LightPaneProps {
  light: HueLight;
  /** The room/zone currently on screen — the space a "remove" takes it out of. */
  space: HueRoomZone | null;
  hueEventRevision: number;
  onClose: () => void;
  onLightToggle: (light: HueLight, nextOn: boolean) => void;
  onLightBrightness: (
    light: HueLight,
    pct: number,
    phase: ControlCommitPhase,
  ) => void;
  onLightColor: (light: HueLight, change: LightColorChange) => void;
}

// Friendly labels for the v2 effect identifiers a fixture may report.
const EFFECT_LABELS: Record<string, string> = {
  no_effect: "None",
  candle: "Candle",
  fire: "Fireplace",
  sparkle: "Sparkle",
  prism: "Prism",
  glisten: "Glisten",
  opal: "Opal",
  underwater: "Underwater",
  cosmos: "Cosmos",
  sunbeam: "Sunbeam",
  enchant: "Enchant",
};

const TAB_LABELS: Record<Tab, string> = {
  color: "Color",
  kelvin: "White",
  effects: "Effects",
};

// What the light is used for. Hue uses this when assigning scene colors:
// task ("functional") lights get usable whites, decorative lights get ambiance.
const FUNCTION_OPTIONS = [
  { value: "functional", label: "Task" },
  { value: "decorative", label: "Decorative" },
  { value: "mixed", label: "Mixed" },
];

const effectLabel = (id: string): string =>
  EFFECT_LABELS[id] ??
  id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const LightPane: React.FC<LightPaneProps> = ({
  light,
  space,
  hueEventRevision,
  onClose,
  onLightToggle,
  onLightBrightness,
  onLightColor,
}) => {
  const syncLocked = useEntertainmentStore((store) =>
    store.syncedLightIds.includes(light.id),
  );
  const hasEffects = useMemo(
    () =>
      [...(light.effectsV2 ?? []), ...(light.effects ?? [])].some(
        (e) => e !== "no_effect",
      ),
    [light.effects, light.effectsV2],
  );
  const effectOptions = useMemo(
    () =>
      Array.from(
        new Set([...(light.effectsV2 ?? []), ...(light.effects ?? [])]),
      ),
    [light.effects, light.effectsV2],
  );

  const availableTabs = useMemo<Tab[]>(() => {
    const tabs: Tab[] = [];
    if (light.supportsColor) tabs.push("color");
    if (light.supportsCt) tabs.push("kelvin");
    if (hasEffects) tabs.push("effects");
    return tabs;
  }, [light.supportsColor, light.supportsCt, hasEffects]);

  const [tab, setTab] = useState<Tab>("color");

  // Keep the active tab valid as the selected light changes.
  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.includes(tab)) {
      setTab(availableTabs[0]);
    }
  }, [availableTabs, tab]);

  const brightnessPct = Math.round(light.brightness ?? 0);
  const ctMin = light.ctMin ?? 153;
  const ctMax = light.ctMax ?? 500;
  const ct = light.ct ?? Math.round((ctMin + ctMax) / 2);
  const DeviceIcon = getLightIcon(light.typeName);
  const color = light.isOn && !syncLocked ? lightColorHex(light) : null;
  const previewStyle =
    color != null ? activeTileTheme(color, color, brightnessPct) : undefined;

  const view = (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 pt-1">
        <span
          className={cn(
            "flex size-16 items-center justify-center rounded-2xl text-foreground",
            color != null ? "shadow-sm" : "bg-muted",
          )}
          style={previewStyle}
        >
          <DeviceIcon size={32} strokeWidth={2.25} />
        </span>
        <h2 className="max-w-full truncate text-center font-heading text-lg font-medium text-foreground">
          {light.name}
        </h2>
      </div>

      {syncLocked && (
        <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/8 px-4 py-3">
          <Radio className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              Controlled by Sync Box
            </p>
            <p className="text-xs text-muted-foreground">
              Live controls are available again when sync stops.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {syncLocked ? "Syncing" : light.isOn ? "On" : "Off"}
        </span>
        <Switch
          checked={light.isOn}
          disabled={!light.reachable || syncLocked}
          aria-label={`Toggle ${light.name}`}
          onCheckedChange={(checked) => onLightToggle(light, checked)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">
            Brightness
          </p>
          <span className="text-xs text-muted-foreground tabular-nums">
            {syncLocked ? "—" : `${brightnessPct}%`}
          </span>
        </div>
        <PacedSlider
          value={Math.max(1, brightnessPct)}
          min={1}
          disabled={!light.reachable || syncLocked}
          ariaLabel={`${light.name} brightness`}
          isGroup={false}
          animateKey={hueEventRevision}
          onCommit={(value, phase) => onLightBrightness(light, value, phase)}
        />
      </div>

      {availableTabs.length > 0 && (
        <div
          inert={syncLocked}
          aria-disabled={syncLocked || undefined}
          className={cn(syncLocked && "opacity-45")}
        >
          <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
            {availableTabs.length > 1 && (
              <TabsList className="w-full">
                {availableTabs.map((id) => (
                  <TabsTrigger key={id} value={id}>
                    {TAB_LABELS[id]}
                  </TabsTrigger>
                ))}
              </TabsList>
            )}

            {light.supportsColor && (
              <TabsContent value="color" className="flex w-full p-8">
                <ColorWheel
                  xy={light.xy}
                  gamut={light.gamut}
                  onPick={(xy, vividHex) =>
                    onLightColor(light, { xy, vividHex })
                  }
                />
              </TabsContent>
            )}

            {light.supportsCt && (
              <TabsContent value="kelvin" className="flex w-full p-8">
                <TemperatureWheel
                  value={ct}
                  min={ctMin}
                  max={ctMax}
                  onPick={(value) => onLightColor(light, { ct: value })}
                />
              </TabsContent>
            )}

            {hasEffects && (
              <TabsContent value="effects" className="py-4">
                <div className="grid grid-cols-2 gap-2">
                  {effectOptions.map((effect) => (
                    <Button
                      key={effect}
                      disabled={syncLocked}
                      variant={
                        light.effect === effect || light.effectV2 === effect
                          ? "default"
                          : "outline"
                      }
                      className="justify-start gap-2"
                      onClick={() => onLightColor(light, { effect })}
                    >
                      <Sparkles size={16} />
                      {effectLabel(effect)}
                    </Button>
                  ))}
                </div>
              </TabsContent>
            )}
          </Tabs>
        </div>
      )}
    </div>
  );

  return (
    <SidePane
      eyebrow={light.productName ?? light.typeName ?? "Hue light"}
      editLabel={`Edit ${light.name}`}
      resetKey={light.id}
      onClose={onClose}
      view={view}
      renderEdit={({ active, exitEdit, guardRef }) => (
        <EditPane
          light={light}
          space={space}
          active={active}
          onClosePane={onClose}
          onExitEdit={exitEdit}
          guardRef={guardRef}
        />
      )}
    />
  );
};

/**
 * Editing pane shown inside the side pane (slid in from the right when the
 * pencil is tapped). Mirrors the read-only view's icon → name layout, but the
 * icon is a button that opens a picker modal and the name is click-to-edit.
 * `active` flips true when the pane scrolls into view, which (re)seeds the form
 * from the current light.
 */
const EditPane: React.FC<{
  light: HueLight;
  space: HueRoomZone | null;
  active: boolean;
  onClosePane: () => void;
  onExitEdit: () => void;
  guardRef: React.MutableRefObject<
    import("./SidePane").SidePaneEditGuard | null
  >;
}> = ({ light, space, active, onClosePane, onExitEdit, guardRef }) => {
  const navigate = useNavigate();
  const roomZones = useHueResourcesStore((state) => state.roomZones);
  const loadAll = useHueResourcesStore((state) => state.loadAll);
  const [name, setName] = useState(light.name);
  const [icon, setIcon] = useState(light.typeName ?? "");
  const [func, setFunc] = useState(light.function ?? "");
  const [powerOn, setPowerOn] = useState(() => powerOnDraftFromLight(light));
  const [room, setRoom] = useState<string | null>(
    roomForLight(light, roomZones),
  );
  const [zoneIds, setZoneIds] = useState<string[]>(
    zonesForLight(light, roomZones),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!active) return;
    setName(light.name);
    setIcon(light.typeName ?? "");
    setFunc(light.function ?? "");
    setPowerOn(powerOnDraftFromLight(light));
    setRoom(roomForLight(light, roomZones));
    setZoneIds(zonesForLight(light, roomZones));
    setError(null);
    setRenaming(false);
  }, [light, active, roomZones]);

  // Drop the light from the space currently on screen only. Rooms own devices,
  // so we update the room's device list; zones reference lights directly. The
  // device stays paired — a full delete lives in Settings → Devices.
  const removeFromSpace = async () => {
    if (!space) return;
    if (space.resourceType === "room") {
      if (!light.deviceId) {
        throw new Error("This light is missing its owning device id.");
      }
      await invoke("update-room-members", {
        roomId: space.id,
        deviceIds: space.deviceIds.filter((id) => id !== light.deviceId),
      });
    } else {
      await invoke("update-zone-members", {
        zoneId: space.id,
        lightIds: space.lightIds.filter((id) => id !== light.id),
      });
    }
    onClosePane();
    await loadAll();
  };

  const iconOptions = useMemo(() => {
    if (!icon || LIGHT_ICON_OPTIONS.some((option) => option.value === icon)) {
      return LIGHT_ICON_OPTIONS;
    }
    return [
      { value: icon, label: labelFromHueId(icon), Icon: Lightbulb },
      ...LIGHT_ICON_OPTIONS,
    ];
  }, [icon]);

  const rooms = useMemo(
    () => roomZones.filter((space) => space.resourceType === "room"),
    [roomZones],
  );
  const zones = useMemo(
    () => roomZones.filter((space) => space.resourceType === "zone"),
    [roomZones],
  );

  const roomItems = useMemo(
    () => ({
      [NONE]: "No room",
      ...Object.fromEntries(rooms.map((space) => [space.id, space.name])),
    }),
    [rooms],
  );
  const zoneItems = useMemo(
    () => Object.fromEntries(zones.map((space) => [space.id, space.name])),
    [zones],
  );

  const save = async (): Promise<boolean> => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name cannot be empty.");
      return false;
    }
    if (trimmed.length > MAX_NAME_LENGTH) {
      setError(`Name cannot exceed ${MAX_NAME_LENGTH} characters.`);
      return false;
    }
    if (!light.deviceId) {
      setError("This light is missing its owning device id.");
      return false;
    }

    setIsSaving(true);
    setError(null);
    try {
      const metadataChanged =
        trimmed !== light.name ||
        icon !== (light.typeName ?? "") ||
        func !== (light.function ?? "");
      const originalPowerOn = powerOnDraftFromLight(light);
      const powerOnChanged =
        light.powerup != null && !samePowerOnDraft(powerOn, originalPowerOn);

      if (metadataChanged || powerOnChanged) {
        await invoke("update-hue-resource", {
          resourceType: "light",
          id: light.id,
          body: {
            ...(metadataChanged
              ? {
                  metadata: {
                    name: trimmed,
                    ...(icon ? { archetype: icon } : null),
                    ...(func ? { function: func } : null),
                  },
                }
              : null),
            ...(powerOnChanged ? buildPowerOnBody(powerOn) : null),
          },
        });
      }

      if (room !== roomForLight(light, roomZones)) {
        await updateRoomPlacement(light, roomZones, room);
      }
      await updateZonesPlacement(light, roomZones, zoneIds);

      await loadAll();
      onExitEdit();
      return true;
    } catch (saveError) {
      setError(String(saveError) || "Unable to save device changes.");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const EditIcon = getLightIcon(icon || null);
  const color = light.isOn ? lightColorHex(light) : null;
  const previewStyle =
    color != null
      ? activeTileTheme(color, color, Math.round(light.brightness ?? 0))
      : undefined;

  const originalRoom = roomForLight(light, roomZones);
  const originalZones = zonesForLight(light, roomZones);
  const originalPowerOn = powerOnDraftFromLight(light);
  guardRef.current = {
    dirty:
      name !== light.name ||
      icon !== (light.typeName ?? "") ||
      func !== (light.function ?? "") ||
      !samePowerOnDraft(powerOn, originalPowerOn) ||
      room !== originalRoom ||
      !sameIds(zoneIds, originalZones),
    discard: () => {
      setName(light.name);
      setIcon(light.typeName ?? "");
      setFunc(light.function ?? "");
      setPowerOn(originalPowerOn);
      setRoom(originalRoom);
      setZoneIds(originalZones);
    },
    save,
  };

  return (
    <div className="flex h-full flex-col">
      <ScrollArea
        fade
        hideScrollbar
        className="min-h-0 flex-1"
        viewportClassName="px-6 pb-6"
        contentClassName="flex min-h-full flex-col"
      >
        <div className="flex flex-1 flex-col justify-between gap-5">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col items-center gap-3 pt-1">
              <button
                type="button"
                disabled={isSaving}
                onClick={() => setPickerOpen(true)}
                aria-label="Choose icon"
                className={cn(
                  "flex size-16 items-center justify-center rounded-2xl text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50",
                  color != null
                    ? "shadow-sm hover:opacity-90"
                    : "bg-muted hover:bg-accent",
                )}
                style={previewStyle}
              >
                <EditIcon size={32} strokeWidth={2.25} />
              </button>
              {renaming ? (
                <div className="flex w-full flex-col items-center gap-1">
                  <Input
                    autoFocus
                    size="lg"
                    value={name}
                    maxLength={MAX_NAME_LENGTH}
                    disabled={isSaving}
                    aria-label={`Rename ${light.name}`}
                    className="max-w-full text-center font-heading text-lg font-medium"
                    onChange={(event) => setName(event.target.value)}
                    onFocus={(event) => event.target.select()}
                    onBlur={() => setRenaming(false)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === "Escape") {
                        setRenaming(false);
                      }
                    }}
                  />
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {name.length}/{MAX_NAME_LENGTH}
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setRenaming(true)}
                  title="Rename"
                  className="flex max-w-full items-center gap-1.5 rounded-md px-2 py-0.5 text-center font-heading text-lg font-medium text-foreground hover:bg-muted disabled:opacity-50"
                >
                  <span className="truncate">{name || "Unnamed light"}</span>
                  <Pencil className="size-4 shrink-0 text-muted-foreground" />
                </button>
              )}
            </div>

            <div className="grid gap-2">
              <Label>Function</Label>
              <Select
                items={Object.fromEntries(
                  FUNCTION_OPTIONS.map((option) => [
                    option.value,
                    option.label,
                  ]),
                )}
                value={func || null}
                onValueChange={(value) =>
                  setFunc((value as string | null) ?? "")
                }
                disabled={isSaving}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose function" />
                </SelectTrigger>
                <SelectContent>
                  {FUNCTION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Task lights are what you use to see; decorative lights set
                ambiance. Hue uses this to assign scene colors.
              </p>
            </div>

            <div className="grid gap-2">
              <Label>Room</Label>
              <Select
                items={roomItems}
                value={room ?? NONE}
                onValueChange={(value) =>
                  setRoom(value === NONE ? null : (value as string))
                }
                disabled={isSaving}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="No room" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No room</SelectItem>
                  {rooms.map((space) => (
                    <SelectItem key={space.id} value={space.id}>
                      {space.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Zones</Label>
              <Select
                multiple
                items={zoneItems}
                value={zoneIds}
                onValueChange={(value) => setZoneIds(value)}
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
                                zones.find((space) => space.id === id)?.name ??
                                id,
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

            <PowerOnFields
              light={light}
              value={powerOn}
              onChange={setPowerOn}
              disabled={isSaving}
            />

            {error && (
              <p className="text-sm text-(--destructive-text)">{error}</p>
            )}
          </div>

          {space && (
            <RemoveResourceSection
              title={`Remove ${light.name}`}
              description={`Removes ${light.name} from ${space.name}`}
              actionLabel="Remove"
              confirmTitle={`Remove "${light.name}" from ${space.name}?`}
              confirmBody={
                <div className="flex flex-col gap-2">
                  <span>
                    This takes "{light.name}" out of {space.name}. The device
                    stays paired to your bridge and keeps working in any other
                    room or zone.
                  </span>
                  <span>
                    To delete the device completely from the system, go to
                    Settings {"->"} Devices.
                  </span>
                </div>
              }
              navLink={{
                label: "Settings",
                onNavigate: () =>
                  void navigate({
                    to: "/settings",
                    search: { tab: "devices" },
                  }),
              }}
              disabled={isSaving}
              onConfirm={removeFromSpace}
            />
          )}
        </div>
      </ScrollArea>

      <div className="flex gap-2 border-t border-border p-6 pt-4">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={isSaving}
          onClick={onExitEdit}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={isSaving}
          onClick={() => void save()}
        >
          {isSaving ? <Loader2 className="animate-spin" /> : null}
          Save
        </Button>
      </div>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Choose icon</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {iconOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setIcon(option.value);
                  setPickerOpen(false);
                }}
                data-selected={option.value === icon ? "" : undefined}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-2xl p-3 text-center text-xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  selectableVariants(),
                  option.value === icon && "text-foreground",
                )}
              >
                <option.Icon size={26} className="text-foreground" />
                {option.label}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Sentinel for the "no room"/"no zone" option, since base-ui selects can't hold
// a null value alongside string ids.
const NONE = "__none__";

const labelFromHueId = (id: string): string =>
  id.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
