import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useHue } from "@/context/HueContext";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import { useEntertainmentStore } from "@/stores/EntertainmentStore";
import type { HueRoomZone } from "@/types/hue";
import type { HomeMapLighting } from "./lighting";

/** Bind map controls to the existing actions, including delayed slider commits. */
export function useMapLighting(bridgeId: string | null): HomeMapLighting {
  const session = useHue();
  const gate = useRef({
    bridgeId: session.bridgeId,
    loading: session.isLoading,
  });
  useLayoutEffect(() => {
    gate.current = { bridgeId: session.bridgeId, loading: session.isLoading };
  }, [session.bridgeId, session.isLoading]);
  const resources = useHueResourcesStore(
    useShallow((state) => ({
      lights: state.lights,
      scenes: state.scenes,
      bridgeConnected: state.bridgeConnected,
      isLoading: state.isLoading,
      hueEventRevision: state.hueEventRevision,
      error: state.error,
    })),
  );
  const syncedLightIds = useEntertainmentStore((state) => state.syncedLightIds);
  const [commandError, setCommandError] = useState<string | null>(null);
  useEffect(
    () =>
      useHueResourcesStore.subscribe((next, previous) => {
        // Existing actions reload on failure; retain the error while that read settles.
        if (next.error && next.error !== previous.error)
          setCommandError(next.error);
      }),
    [],
  );

  function currentTarget(requested: HueRoomZone): HueRoomZone | null {
    const state = useHueResourcesStore.getState();
    if (
      !bridgeId ||
      gate.current.bridgeId !== bridgeId ||
      gate.current.loading ||
      state.isLoading ||
      !state.bridgeConnected
    )
      return null;
    const target = state.roomZones.find(
      (entry) =>
        entry.id === requested.id &&
        entry.resourceType === requested.resourceType,
    );
    if (!target?.groupedLightId) return null;
    const synced = new Set(useEntertainmentStore.getState().syncedLightIds);
    return state.lights.some(
      (light) =>
        target.lightIds.includes(light.id) &&
        light.reachable &&
        !synced.has(light.id),
    )
      ? target
      : null;
  }

  return {
    lights: resources.lights,
    scenes: resources.scenes,
    syncedLightIds,
    bridgeConnected: resources.bridgeConnected,
    resourcesLoading:
      resources.isLoading || session.isLoading || session.bridgeId !== bridgeId,
    hueEventRevision: resources.hueEventRevision,
    error: commandError ?? resources.error,
    onToggle: (requested, on) => {
      const target = currentTarget(requested);
      if (target)
        useHueResourcesStore.getState().setRoomZoneState(target, on, null);
    },
    onBrightness: (requested, value, phase) => {
      const target = currentTarget(requested);
      if (target)
        useHueResourcesStore
          .getState()
          .setRoomZoneState(
            target,
            true,
            Math.max(1, Math.min(100, value)),
            phase,
          );
    },
    onScene: async (requested) => {
      const state = useHueResourcesStore.getState();
      const scene = state.scenes.find(
        (entry) =>
          entry.id === requested.id &&
          entry.resourceType === "scene" &&
          !entry.smart &&
          entry.group === requested.group,
      );
      const linked =
        scene && state.roomZones.find((entry) => entry.id === scene.group);
      const target = linked && currentTarget(linked);
      const synced = new Set(useEntertainmentStore.getState().syncedLightIds);
      if (
        !scene ||
        !target ||
        target.lightIds.some((id) => synced.has(id)) ||
        scene.actions.some(
          (action) => !target.lightIds.includes(action.targetId),
        )
      )
        return;
      setCommandError(null);
      await state.activateScene(scene, "apply");
    },
    onRefresh: () => {
      void useHueResourcesStore
        .getState()
        .loadAll()
        .then(() => {
          setCommandError(useHueResourcesStore.getState().error);
        });
    },
  };
}
