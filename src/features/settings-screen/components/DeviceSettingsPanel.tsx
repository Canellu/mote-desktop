import { cn } from "@/lib/utils";
import { SensorBatteryGauge } from "@/components/SensorReadingPill";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { LightHero } from "@/features/light-settings/LightHero";
import { updateRoomPlacementForDevices } from "@/features/light-settings/lightPlacement";
import type { HueAccessoryService, HueRoomZone } from "@/types/hue";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { DeviceBehaviors } from "./DeviceBehaviors";
import { DetailsFrame } from "./DetailsSheet";
import { NO_ROOM } from "./useLightSettings";
import { isRecord } from "../utils/format";

/**
 * Services the bridge lets an app switch on and off (Hue API v2 `enabled`),
 * with what turning one off does. An off reading stops reporting, so anything
 * that relies on it stops reacting to it.
 */
const TOGGLES: Record<string, { label: string; description: string }> = {
  motion: {
    label: "Motion detection",
    description: "Off pauses the sensor: movement no longer turns lights on.",
  },
  camera_motion: {
    label: "Motion detection",
    description: "Off pauses the camera: movement no longer turns lights on.",
  },
  light_level: {
    label: "Daylight detection",
    description:
      "Measures how bright the room is, so motion can skip turning lights on in daylight. Off means it can't tell day from night.",
  },
  temperature: {
    label: "Temperature",
    description: "Reports the room's temperature. Off stops the readings.",
  },
  contact: {
    label: "Open and closed",
    description:
      "Reports when a door or window opens. Off means opening it no longer triggers anything.",
  },
};

/** Services with a writable `sensitivity.sensitivity`. */
const SENSITIVITY_TYPES = new Set(["motion", "camera_motion"]);

const SENSITIVITY_LABELS: Record<number, string[]> = {
  2: ["Low", "Medium", "High"],
  4: ["Low", "Medium", "High", "Very high", "Max"],
};

interface Sensitivity {
  value: number;
  max: number;
}

const sensitivityOf = (service: HueAccessoryService): Sensitivity | null => {
  if (!SENSITIVITY_TYPES.has(service.resourceType)) return null;
  const raw = isRecord(service.raw) ? service.raw.sensitivity : null;
  if (!isRecord(raw) || typeof raw.sensitivity !== "number") return null;
  const max = typeof raw.sensitivity_max === "number" ? raw.sensitivity_max : 4;
  return { value: raw.sensitivity, max };
};

/** The device a panel edits: a switch or sensor, from Settings or a room. */
export interface EditableDevice {
  id: string;
  name: string;
  productName: string | null;
  reachable: boolean;
}

interface DeviceDraft {
  name: string;
  room: string;
  /** Service id → enabled. */
  enabled: Record<string, boolean>;
  /** Service id → sensitivity level. */
  sensitivity: Record<string, number>;
}

const draftFrom = (
  device: EditableDevice,
  services: HueAccessoryService[],
  roomZones: HueRoomZone[],
): DeviceDraft => ({
  name: device.name,
  room:
    roomZones.find(
      (space) =>
        space.resourceType === "room" && space.deviceIds.includes(device.id),
    )?.id ?? NO_ROOM,
  enabled: Object.fromEntries(
    services
      .filter(
        (service) => service.resourceType in TOGGLES && service.enabled != null,
      )
      .map((service) => [service.id, service.enabled === true]),
  ),
  sensitivity: Object.fromEntries(
    services.flatMap((service) => {
      const level = sensitivityOf(service);
      return level ? [[service.id, level.value]] : [];
    }),
  ),
});

/**
 * A switch's or sensor's editable settings: its name, room, which of its
 * sensors are on, and motion sensitivity. Follows the bridge until edited,
 * like the light settings do.
 */
const useDeviceSettings = ({
  device,
  services,
  roomZones,
  onRefresh,
}: {
  device: EditableDevice;
  services: HueAccessoryService[];
  roomZones: HueRoomZone[];
  onRefresh: () => Promise<void>;
}) => {
  const freshKey = JSON.stringify(draftFrom(device, services, roomZones));
  const [base, setBase] = useState<DeviceDraft>(() => JSON.parse(freshKey));
  const [draft, setDraft] = useState<DeviceDraft>(base);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changedServices = services.filter(
    (service) =>
      draft.enabled[service.id] !== base.enabled[service.id] ||
      draft.sensitivity[service.id] !== base.sensitivity[service.id],
  );
  const changed = {
    name: draft.name.trim() !== base.name,
    room: draft.room !== base.room,
    services: changedServices.length > 0,
  };
  const dirty = Object.values(changed).some(Boolean);

  useEffect(() => {
    if (dirty || isSaving) return;
    const next = JSON.parse(freshKey) as DeviceDraft;
    setBase(next);
    setDraft(next);
  }, [freshKey, dirty, isSaving]);

  const set = (patch: Partial<DeviceDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const discard = () => {
    setDraft(base);
    setError(null);
  };

  const save = async (): Promise<boolean> => {
    if (!dirty) return true;
    const trimmedName = draft.name.trim();
    if (changed.name && !trimmedName) {
      setError("Enter a name.");
      return false;
    }
    setIsSaving(true);
    setError(null);
    try {
      if (changed.name)
        await invoke("rename-hue-resource", {
          resourceType: "device",
          id: device.id,
          name: trimmedName,
        });
      await Promise.all(
        changedServices.map((service) => {
          const enabled = draft.enabled[service.id];
          const level = draft.sensitivity[service.id];
          return invoke("update-hue-resource", {
            resourceType: service.resourceType,
            id: service.id,
            body: {
              ...(enabled !== base.enabled[service.id] ? { enabled } : null),
              ...(level !== base.sensitivity[service.id]
                ? { sensitivity: { sensitivity: level } }
                : null),
            },
          });
        }),
      );
      if (changed.room)
        await updateRoomPlacementForDevices(
          [device.id],
          roomZones,
          draft.room === NO_ROOM ? null : draft.room,
        );
      await onRefresh();
      const saved = { ...draft, name: trimmedName };
      setBase(saved);
      setDraft(saved);
      return true;
    } catch (saveError) {
      setError(String(saveError) || "Unable to save these settings.");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return { draft, set, dirty, isSaving, error, save, discard };
};

/**
 * The side panel for a switch or sensor: its name and room, its sensors and
 * their sensitivity, with Cancel and Save. Settings
 * adds its status and device facts below as children.
 */
export const DeviceSettingsPanel = ({
  device,
  services,
  roomZones,
  icon,
  eyebrow,
  removal,
  onClose,
  onRefresh,
  children,
}: {
  device: EditableDevice;
  services: HueAccessoryService[];
  roomZones: HueRoomZone[];
  icon: LucideIcon;
  eyebrow: string;
  removal?: React.ReactNode;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  children?: React.ReactNode;
}) => {
  const settings = useDeviceSettings({
    device,
    services,
    roomZones,
    onRefresh,
  });
  const { draft, set, isSaving } = settings;
  const rooms = roomZones.filter((space) => space.resourceType === "room");
  const battery = services.find(
    (service) => service.resourceType === "device_power",
  );
  const toggles = services.filter((service) => service.id in draft.enabled);
  const sensitivities = services.flatMap((service) => {
    const level = sensitivityOf(service);
    return level ? [{ service, max: level.max }] : [];
  });
  return (
    <DetailsFrame
      onClose={onClose}
      eyebrow={eyebrow}
      title={device.name}
      removal={removal}
      guard={settings}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            disabled={isSaving}
            onClick={settings.dirty ? settings.discard : onClose}
          >
            {settings.dirty ? "Discard" : "Cancel"}
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={!settings.dirty || isSaving}
            onClick={() => void settings.save()}
          >
            {isSaving && <Loader2 className="animate-spin" />}
            Save
          </Button>
        </>
      }
    >
      <LightHero
        icon=""
        fallbackIcon={icon}
        name={draft.name}
        disabled={isSaving}
        onNameChange={(name) => set({ name })}
      />
      {battery && (
        <div className="-mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <SensorBatteryGauge service={battery} />
          Battery
        </div>
      )}

      <div className="grid gap-5">
        <div className="grid gap-2">
          <Label>Room</Label>
          <Select
            items={{
              [NO_ROOM]: "No room",
              ...Object.fromEntries(
                rooms.map((space) => [space.id, space.name]),
              ),
            }}
            value={draft.room}
            onValueChange={(value) => set({ room: value ?? NO_ROOM })}
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

        {toggles.map((service) => (
          <div
            key={service.id}
            className="flex items-center justify-between gap-3"
          >
            <div className="grid min-w-0 gap-0.5">
              <Label htmlFor={`enabled-${service.id}`}>
                {TOGGLES[service.resourceType].label}
              </Label>
              <p className="text-xs text-muted-foreground">
                {TOGGLES[service.resourceType].description}
              </p>
            </div>
            <Switch
              id={`enabled-${service.id}`}
              checked={draft.enabled[service.id]}
              disabled={isSaving}
              onCheckedChange={(checked) =>
                set({ enabled: { ...draft.enabled, [service.id]: checked } })
              }
            />
          </div>
        ))}

        {sensitivities.map(({ service, max }) => (
          <SensitivityField
            key={service.id}
            value={draft.sensitivity[service.id] ?? 0}
            max={max}
            disabled={isSaving || draft.enabled[service.id] === false}
            onChange={(level) =>
              set({
                sensitivity: { ...draft.sensitivity, [service.id]: level },
              })
            }
          />
        ))}

      </div>

      {settings.error && (
        <p className="text-sm text-(--destructive-text)">{settings.error}</p>
      )}
      <DeviceBehaviors
        deviceId={device.id}
        services={services}
        roomZones={roomZones}
      />
      {children}
    </DetailsFrame>
  );
};

const SensitivityField = ({
  value,
  max,
  disabled,
  onChange,
}: {
  value: number;
  max: number;
  disabled: boolean;
  onChange: (level: number) => void;
}) => (
  <div className="grid gap-2">
    <Label>Motion sensitivity</Label>
    <div className="flex items-start gap-3">
      <div className="grid min-w-0 flex-1 gap-1.5">
        <Slider
          aria-label="Motion sensitivity"
          min={0}
          max={max}
          step={1}
          value={[value]}
          disabled={disabled}
          onValueChange={(next) =>
            onChange(Array.isArray(next) ? next[0] : (next as number))
          }
        />
        {/* A tick under each level, so it reads as steps, not a fluid
            slider. The thumb's centre stops half a thumb in from each end. */}
        <div
          aria-hidden
          className={cn("relative h-1.5", disabled && "opacity-50")}
        >
          {Array.from({ length: max + 1 }, (_, level) => (
            <span
              key={level}
              className={cn(
                "absolute top-0 h-full w-px -translate-x-1/2 rounded-full",
                level === value ? "bg-foreground/60" : "bg-foreground/25",
              )}
              style={{
                left: `calc(0.5rem + (100% - 1rem) * ${level / max})`,
              }}
            />
          ))}
        </div>
      </div>
      <span className="w-18 shrink-0 text-right text-sm leading-3 text-muted-foreground">
        {SENSITIVITY_LABELS[max]?.[value] ?? `${value} of ${max}`}
      </span>
    </div>
    <p className="text-xs text-muted-foreground">
      Higher picks up smaller movements from further away.
    </p>
  </div>
);
