import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import type { HueLight, HueRoomZone, HueSettingsDevice } from "@/types/hue";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useRef, useState } from "react";

/** Matches `IDENTIFY_DURATION_MS` in `hue_client.rs`, the length the bridge is
 * asked to breathe for. */
export const BLINK_DURATION_MS = 1_500;

/**
 * Resolves the light ids behind any selectable resource so a picker can blink
 * what the user just chose: a light blinks itself, a device blinks the lights
 * it carries, and a room/zone blinks all of its member lights.
 */
export const blinkableLightIds = (
  option: HueLight | HueSettingsDevice | HueRoomZone,
  lights: HueLight[],
): string[] => {
  if ("lightIds" in option) return option.lightIds;
  if ("serviceTypes" in option) {
    return lights
      .filter((light) => light.deviceId === option.id)
      .map((light) => light.id);
  }
  return [option.id];
};

/**
 * Lights still breathing, shared by every picker. A room and a zone (or two
 * pickers) often hold the same lights, and an identify sent to a light that is
 * already identifying queues behind it on the bridge, which read as the blink
 * looping on and on.
 */
const blinkingLights = new Set<string>();

/**
 * Runs the Hue identification breathe on a set of lights. The bridge restores
 * each light automatically. Ids that aren't in the store are dropped (dev
 * placeholder rows), a key that is already mid-blink is ignored, and so is any
 * light already breathing, so rapid re-selection doesn't stack signals.
 */
export const useBlinkLights = () => {
  const [blinkingKeys, setBlinkingKeys] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const inFlight = useRef(new Set<string>());

  const blink = useCallback(async (key: string, lightIds: string[]) => {
    const knownIds = new Set(
      useHueResourcesStore.getState().lights.map((light) => light.id),
    );
    const ids = lightIds.filter(
      (id) => knownIds.has(id) && !blinkingLights.has(id),
    );
    if (ids.length === 0 || inFlight.current.has(key)) return;

    inFlight.current.add(key);
    setBlinkingKeys(new Set(inFlight.current));
    for (const id of ids) blinkingLights.add(id);

    try {
      await Promise.all(ids.map((id) => invoke("signal-light", { id })));
      await wait(BLINK_DURATION_MS);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Failed to blink Hue lights", error);
      }
    } finally {
      for (const id of ids) blinkingLights.delete(id);
      inFlight.current.delete(key);
      setBlinkingKeys(new Set(inFlight.current));
    }
  }, []);

  return { blinkingKeys, blink };
};

const wait = (durationMs: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, durationMs));
