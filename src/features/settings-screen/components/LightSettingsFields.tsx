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
  sameIds,
  zonesForLight,
} from "@/features/light-settings/lightPlacement";
import {
  powerOnDraftFromLight,
  samePowerOnDraft,
} from "@/features/light-settings/powerOn";
import type { HueLight, HueRoomZone } from "@/types/hue";
import {
  FUNCTION_LABELS,
  MIXED,
  NO_ROOM,
  powerOnLight,
  type LightSettings,
} from "./useLightSettings";

/**
 * The fields below a light's name and icon: function, room, zones and
 * power-on. With several lights, notes say where they disagree.
 */
export const LightSettingsFields = ({
  settings,
  lights,
  roomZones,
  roomLockedReason,
}: {
  settings: LightSettings;
  lights: HueLight[];
  roomZones: HueRoomZone[];
  /**
   * Why the room can't be changed here, such as the light being part of a
   * fixture whose lights move together. The room is editable without it.
   */
  roomLockedReason?: string;
}) => {
  const { base, draft, set, isSaving } = settings;
  const several = lights.length > 1;
  const rooms = roomZones.filter((space) => space.resourceType === "room");
  const zones = roomZones.filter((space) => space.resourceType === "zone");
  const zonesDiffer = lights.some(
    (light) => !sameIds(zonesForLight(light, roomZones), base.zoneIds),
  );
  const powerOnDiffers = lights.some(
    (light) =>
      light.powerup != null &&
      !samePowerOnDraft(powerOnDraftFromLight(light), base.powerOn),
  );
  const powerOnSupported = lights.some((light) => light.powerup != null);

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <Label>Function</Label>
        <Select
          items={{
            ...(draft.func === MIXED ? { [MIXED]: "Mixed" } : null),
            ...FUNCTION_LABELS,
          }}
          value={draft.func || null}
          onValueChange={(value) => set({ func: value ?? "" })}
          disabled={isSaving}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose function" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(FUNCTION_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Task lights are what you use to see; decorative lights set ambiance.
          Hue uses this to assign scene colors.
        </p>
      </div>

      <div className="grid gap-2">
        <Label>Room</Label>
        <Select
          items={{
            ...(draft.room === MIXED ? { [MIXED]: "Different rooms" } : null),
            [NO_ROOM]: "No room",
            ...Object.fromEntries(rooms.map((space) => [space.id, space.name])),
          }}
          value={draft.room}
          onValueChange={(value) => set({ room: value ?? NO_ROOM })}
          disabled={isSaving || Boolean(roomLockedReason)}
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
        {roomLockedReason ? (
          <p className="text-xs text-muted-foreground">{roomLockedReason}</p>
        ) : (
          several &&
          base.room === MIXED && (
            <p className="text-xs text-muted-foreground">
              These lights are in different rooms. Choose one to bring them
              together.
            </p>
          )
        )}
      </div>

      <div className="grid gap-2">
        <Label>Zones</Label>
        <Select
          multiple
          items={Object.fromEntries(
            zones.map((space) => [space.id, space.name]),
          )}
          value={draft.zoneIds}
          onValueChange={(value) => set({ zoneIds: value })}
          disabled={isSaving}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="No zones">
              {(value: string[]) =>
                value.length === 0
                  ? several && zonesDiffer
                    ? "Different zones"
                    : "No zones"
                  : value
                      .map(
                        (id) =>
                          zones.find((space) => space.id === id)?.name ?? id,
                      )
                      .join(", ")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {zones.map((space) => (
              <SelectItem key={space.id} value={space.id} indicator="checkbox">
                {space.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {several && zonesDiffer && (
          <p className="text-xs text-muted-foreground">
            These lights are in different zones. Changing this puts all of them
            in the zones you choose.
          </p>
        )}
      </div>

      {(!several || powerOnSupported) && (
        <div className="grid gap-2">
          <PowerOnFields
            light={powerOnLight(lights)}
            value={draft.powerOn}
            onChange={(powerOn) => set({ powerOn })}
            disabled={isSaving}
          />
          {several && powerOnDiffers && (
            <p className="text-xs text-muted-foreground">
              These lights power on differently. This shows one of them;
              changing it sets all of them.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
