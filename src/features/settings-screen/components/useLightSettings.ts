import {
  roomForLight,
  sameIds,
  updateRoomPlacementForLights,
  updateZonesPlacementForLights,
  zonesForLight,
} from "@/features/light-settings/lightPlacement";
import {
  buildPowerOnBody,
  powerOnDraftFromLight,
  samePowerOnDraft,
} from "@/features/light-settings/powerOn";
import type { HueLight, HueRoomZone } from "@/types/hue";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

export const NO_ROOM = "__none__";
/** Stands for a value the lights being edited together disagree on. */
export const MIXED = "__mixed__";

export const FUNCTION_LABELS: Record<string, string> = {
  functional: "Task",
  decorative: "Decorative",
  mixed: "Mixed",
};

/** One value when every light agrees, otherwise MIXED. */
const shared = (values: string[]) =>
  values.every((value) => value === values[0]) ? (values[0] ?? "") : MIXED;

export interface LightSettingsDraft {
  name: string;
  icon: string;
  func: string;
  room: string;
  zoneIds: string[];
  powerOn: ReturnType<typeof powerOnDraftFromLight>;
}

/** The light whose power-on setting is shown: the first that has one. */
export const powerOnLight = (lights: HueLight[]) =>
  lights.find((light) => light.powerup != null) ?? lights[0];

const draftFrom = (
  lights: HueLight[],
  roomZones: HueRoomZone[],
  name: string,
): LightSettingsDraft => {
  const zoneSets = lights.map((light) => zonesForLight(light, roomZones));
  return {
    name,
    icon: shared(lights.map((light) => light.typeName ?? "")),
    func: shared(lights.map((light) => light.function ?? "")),
    room: shared(
      lights.map((light) => roomForLight(light, roomZones) ?? NO_ROOM),
    ),
    // The zones every light is in; saving sets them all to the choice.
    zoneIds: (zoneSets[0] ?? []).filter((id) =>
      zoneSets.every((set) => set.includes(id)),
    ),
    powerOn: powerOnDraftFromLight(powerOnLight(lights)),
  };
};

/**
 * The editable settings of one light, or of every light in a fixture at once:
 * its name, icon, function, room, zones and power-on. With several lights a
 * value they disagree on is MIXED, and only what the person changes is
 * written, to every light.
 */
export const useLightSettings = ({
  lights,
  roomZones,
  name,
  saveName,
  onRefresh,
}: {
  lights: HueLight[];
  roomZones: HueRoomZone[];
  /** What the panel is called: the light's name, or its fixture's. */
  name: string;
  /**
   * Stores a new name for something the bridge doesn't name, like a fixture.
   * Without it, one light's name is written to that light.
   */
  saveName?: (name: string) => Promise<void> | void;
  onRefresh: () => Promise<void>;
}) => {
  // Live updates replace the light objects every time a light dims or changes
  // color, so the form follows the bridge only through this signature, and
  // only while nothing is being edited. Changes are measured against `base`,
  // the values the edit started from, so a live update never makes a field
  // read as changed.
  const fresh = draftFrom(lights, roomZones, name);
  const freshKey = JSON.stringify(fresh);
  const [base, setBase] = useState(fresh);
  const [draft, setDraft] = useState(fresh);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changed = {
    name: draft.name.trim() !== base.name,
    icon: draft.icon !== base.icon,
    func: draft.func !== base.func,
    room: draft.room !== base.room,
    zones: !sameIds(draft.zoneIds, base.zoneIds),
    powerOn: !samePowerOnDraft(draft.powerOn, base.powerOn),
  };
  const dirty = Object.values(changed).some(Boolean);

  useEffect(() => {
    if (dirty || isSaving) return;
    const next = JSON.parse(freshKey) as LightSettingsDraft;
    setBase(next);
    setDraft(next);
  }, [freshKey, dirty, isSaving]);

  const set = (patch: Partial<LightSettingsDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const discard = () => {
    setDraft(base);
    setError(null);
  };

  /** Writes the changes; resolves whether they were saved. */
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
      // One light's own name travels with its metadata; a fixture's is Mote's.
      const lightName = changed.name && !saveName ? trimmedName : null;
      await Promise.all(
        lights.map((light) => {
          const metadata = changed.icon || changed.func || lightName != null;
          const powerOn = changed.powerOn && light.powerup != null;
          if (!metadata && !powerOn) return null;
          return invoke("update-hue-resource", {
            resourceType: "light",
            id: light.id,
            body: {
              ...(metadata
                ? {
                    metadata: {
                      name: lightName ?? light.name,
                      archetype: changed.icon
                        ? draft.icon
                        : (light.typeName ?? undefined),
                      function: changed.func
                        ? draft.func
                        : (light.function ?? undefined),
                    },
                  }
                : null),
              ...(powerOn ? buildPowerOnBody(draft.powerOn) : null),
            },
          });
        }),
      );
      if (changed.name && saveName) await saveName(trimmedName);
      if (changed.room)
        await updateRoomPlacementForLights(
          lights,
          roomZones,
          draft.room === NO_ROOM ? null : draft.room,
        );
      if (changed.zones)
        await updateZonesPlacementForLights(lights, roomZones, draft.zoneIds);
      await onRefresh();
      // What was saved is the new starting point; the bridge's own values
      // take over from the refresh.
      setBase({ ...draft, name: trimmedName });
      setDraft((current) => ({ ...current, name: trimmedName }));
      return true;
    } catch (saveError) {
      setError(String(saveError) || "Unable to save these settings.");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return { base, draft, set, dirty, isSaving, error, save, discard };
};

export type LightSettings = ReturnType<typeof useLightSettings>;
