import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { SpaceScreen } from "@/features/space-screen/SpaceScreen";
import {
  useInspector,
  type InspectKind,
  type InspectSelection,
} from "@/features/space-screen/hooks/useInspector";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import type { HueAccessoryService } from "@/types/hue";

const isSceneStatusActive = (status: string | null | undefined): boolean =>
  status != null &&
  status.trim() !== "" &&
  status.trim().toLowerCase() !== "inactive";

export const SpaceRoute: React.FC = () => {
  const { spaceId } = useParams({ from: "/space/$spaceId" });
  const navigate = useNavigate();
  const {
    selection,
    isOpen: inspectorOpen,
    open: openInspector,
    toggle: toggleInspector,
    close: closeInspector,
  } = useInspector();
  const selectedLightId = selection?.kind === "light" ? selection.id : null;

  // Customize/Manage take the tiles over for reordering and multi-select, so the
  // inspector pane closes on entry and stays closed until the mode exits — the
  // space broadcasts its edit state through this window event.
  const [spaceEditActive, setSpaceEditActive] = useState(false);
  useEffect(() => {
    const onEditState = (event: Event) =>
      setSpaceEditActive(
        (event as CustomEvent<"customize" | "manage" | null>).detail != null,
      );
    window.addEventListener("hue-space-edit-state", onEditState);
    return () =>
      window.removeEventListener("hue-space-edit-state", onEditState);
  }, []);

  // Remember whatever the pane was showing when the mode opened, so leaving the
  // mode (save/cancel/done) restores it instead of leaving the pane closed.
  const restoreInspectRef = useRef<InspectSelection | null>(null);
  useEffect(() => {
    if (spaceEditActive) {
      if (inspectorOpen && selection) {
        restoreInspectRef.current = selection;
        closeInspector();
      }
    } else if (restoreInspectRef.current) {
      const restore = restoreInspectRef.current;
      restoreInspectRef.current = null;
      openInspector(restore.kind, restore.id);
    }
  }, [
    spaceEditActive,
    inspectorOpen,
    selection,
    closeInspector,
    openInspector,
  ]);

  const inspect = useCallback(
    (kind: InspectKind, id: string) => {
      if (spaceEditActive) return;
      toggleInspector(kind, id);
    },
    [spaceEditActive, toggleInspector],
  );
  const {
    roomZones,
    lights,
    scenes,
    accessoryServices,
    error,
    hueEventRevision,
    setRoomZoneState,
    setLightState,
    createGalleryScene,
    setGallerySceneOnce,
    previewGalleryScene,
    endGalleryPreview,
    activateScene,
    loadAll,
  } = useHueResourcesStore(
    useShallow((state) => ({
      roomZones: state.roomZones,
      lights: state.lights,
      scenes: state.scenes,
      accessoryServices: state.accessoryServices,
      error: state.error,
      hueEventRevision: state.hueEventRevision,
      setRoomZoneState: state.setRoomZoneState,
      setLightState: state.setLightState,
      createGalleryScene: state.createGalleryScene,
      setGallerySceneOnce: state.setGallerySceneOnce,
      previewGalleryScene: state.previewGalleryScene,
      endGalleryPreview: state.endGalleryPreview,
      activateScene: state.activateScene,
      loadAll: state.loadAll,
    })),
  );

  // Sensor/switch readings live in the store (loaded with the rest of the
  // resources and kept live by the SSE stream), so tiles open already sized and
  // motion/battery/button values stay current. Group them by owning device.
  const readingsByDevice = useMemo(() => {
    const map = new Map<string, HueAccessoryService[]>();
    for (const service of accessoryServices) {
      if (!service.deviceId || !service.value) continue;
      const current = map.get(service.deviceId) ?? [];
      current.push(service);
      map.set(service.deviceId, current);
    }
    return map;
  }, [accessoryServices]);

  const roomZone = useMemo(
    () => roomZones.find((g) => g.id === spaceId) ?? null,
    [roomZones, spaceId],
  );

  const spaceLights = useMemo(() => {
    if (!roomZone) return [];
    const ids = new Set(roomZone.lightIds);
    return lights
      .filter((light) => ids.has(light.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [lights, roomZone]);

  const spaceScenes = useMemo(() => {
    if (!roomZone) return [];
    return scenes
      .filter((scene) => scene.group === roomZone.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [scenes, roomZone]);

  const activeSceneId = useMemo(
    () =>
      spaceScenes.find((scene) => isSceneStatusActive(scene.status))?.id ??
      null,
    [spaceScenes],
  );

  // A missing room/zone (stale URL, or it vanished after a refresh) falls back
  // Home. Replace so a dead route can't be reached again with Forward.
  useEffect(() => {
    if (roomZones.length > 0 && !roomZone)
      void navigate({ to: "/", replace: true });
  }, [roomZones.length, roomZone, navigate]);

  // The inspector lives in the `?inspect` search param, which is scoped to this
  // route — leaving the space drops it, so the pane closes on its own.

  if (!roomZone) return null;

  return (
    <SpaceScreen
      roomZone={roomZone}
      roomZones={roomZones}
      allLights={lights}
      allScenes={scenes}
      lights={spaceLights}
      scenes={spaceScenes}
      readingsByDevice={readingsByDevice}
      activeSceneId={activeSceneId}
      selectedLightId={selectedLightId}
      error={error}
      hueEventRevision={hueEventRevision}
      onRoomZoneToggle={(g, on) => setRoomZoneState(g, on, null)}
      onRoomZoneBrightness={(g, pct, phase) =>
        setRoomZoneState(g, pct > 0, pct, phase)
      }
      onLightToggle={(light, on) => setLightState(light, on, null)}
      onLightBrightness={(light, pct, phase) =>
        setLightState(light, pct > 0, pct, phase)
      }
      onOpenGroup={(group) => inspect("group", group.id)}
      onSelectLight={(id) => inspect("light", id)}
      onSceneApply={(scene) => void activateScene(scene, "apply")}
      onSceneInspect={(scene) => inspect("scene", scene.id)}
      onSceneTogglePlay={(scene) => void activateScene(scene, "dynamic")}
      onGallerySceneCreate={(preset) => createGalleryScene(roomZone, preset)}
      onGallerySceneApplyOnce={(preset) =>
        setGallerySceneOnce(roomZone, preset)
      }
      onGalleryScenePreview={(preset) => previewGalleryScene(roomZone, preset)}
      onGalleryScenePreviewEnd={() => endGalleryPreview()}
      onRefresh={loadAll}
    />
  );
};
