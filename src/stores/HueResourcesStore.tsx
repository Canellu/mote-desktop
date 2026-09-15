import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { create } from "zustand";
import {
  deriveGroupedLayout,
  newLayoutSectionId,
  readStoredGroupingMode,
  readStoredHomeLayout,
  reconcileLayout,
  writeStoredGroupingMode,
  writeStoredHomeLayout,
} from "@/features/home-screen/utils/homeLayout";
import type { HueGalleryScenePreset } from "@/features/space-screen/data/hueSceneGallery";
import { recordPickedColor } from "@/features/space-screen/utils/color-state";
import {
  hueDynamicSpeedStepToValue,
  hueDynamicSpeedValueToStep,
} from "@/lib/hue-speed";
import { TRANSITION_MS } from "@/lib/transitions";
import { useEntertainmentStore } from "@/stores/EntertainmentStore";
import type { HomeGroupingMode, HomeLayout } from "@/types/app-layout";
import type {
  HueAccessoryService,
  HueEventUpdate,
  HueLight,
  HueRoom,
  HueRoomZone,
  HueScene,
  HueZone,
} from "@/types/hue";

const activeSyncedLightIds = (): Set<string> =>
  new Set(useEntertainmentStore.getState().syncedLightIds);

const isSyncLocked = (lightIds: string[]): boolean => {
  const syncedIds = activeSyncedLightIds();
  return lightIds.some((id) => syncedIds.has(id));
};

/** Color attributes that can be pushed to an individual light. */
export interface LightColorChange {
  xy?: [number, number];
  ct?: number;
  effect?: string;
  /**
   * The vivid (pre-gamut-clamp) color the wheel's thumb showed for an `xy` pick,
   * recorded so cards/tiles/the side-pane icon render it instead of the duller
   * readback of the clamped `xy` the bridge stores. See `recordPickedColor`.
   */
  vividHex?: string;
}

type ControlCommitPhase = "live" | "final";

interface LayoutState {
  storedLayout: HomeLayout | null;
  layout: HomeLayout;
  displayLayout: HomeLayout;
  groupingMode: HomeGroupingMode;
}

export interface HueResourcesState extends LayoutState {
  roomZones: HueRoomZone[];
  lights: HueLight[];
  scenes: HueScene[];
  /**
   * Live sensor/switch readings (motion, temperature, light level, battery,
   * button events) keyed nowhere yet — the UI groups them by owning device.
   * Loaded once with the rest of the resources so a space opens with its
   * accessory tiles already sized (no async grow-in), and kept current by the
   * SSE stream in {@link HueResourcesState.applyHueEvents} so motion reflects
   * reality rather than a stale snapshot from page load.
   */
  accessoryServices: HueAccessoryService[];
  /**
   * The bridge's user-given name, shown as the home/house label in the Home
   * header. `null` until fetched (or when the bridge carries no name); the UI
   * decides the fallback in that case.
   */
  homeName: string | null;
  isLoading: boolean;
  hasLoaded: boolean;
  error: string | null;
  /**
   * Health of the bridge event stream, from the backend's `hue-connection`
   * events. False means the bridge is currently unreachable (the backend keeps
   * retrying and re-discovering on its own); flipping back to true triggers a
   * full reload so state that changed during the outage is picked up.
   */
  bridgeConnected: boolean;
  /**
   * Bumps on any change a slider/tile should *ease* across rather than snap to:
   * inbound bridge SSE updates, plus our own discrete optimistic writes (a power
   * toggle, a final brightness commit, a scene apply). Live drag frames
   * deliberately do NOT bump it, so a slider tracking another control's drag
   * snaps frame-to-frame instead of lagging behind an ease.
   */
  hueEventRevision: number;

  // The inspector pane's selection now lives in the URL (`?inspect=<kind>:<id>`
  // on the space route) so it participates in browser history — see
  // `useInspector`. Nothing about the pane is tracked in this store anymore.

  // Home layout editing. Layout sections are local app state, not Hue resources.
  draftLayout: HomeLayout;
  isEditLayoutMode: boolean;
  setDraftLayout: (next: HomeLayout) => void;
  setGroupingMode: (mode: HomeGroupingMode) => void;
  /**
   * Shows a grouping mode without saving it as the choice. Used when a custom
   * layout outlives Pro: Home shows standard grouping, and the saved choice
   * comes back with Pro.
   */
  showGroupingMode: (mode: HomeGroupingMode) => void;
  enterEditLayout: () => void;
  cancelEditLayout: () => void;
  saveEditLayout: () => void;

  // Layout section creation (dialog driven from the header while editing).
  isCreatingSection: boolean;
  openCreateSection: () => void;
  closeCreateSection: () => void;
  createLayoutSection: (name: string) => void;
  renameLayoutSection: (sectionId: string, name: string) => void;

  // Data lifecycle and optimistic control handlers.
  loadLights: () => Promise<void>;
  loadScenes: () => Promise<void>;
  loadHomeName: () => Promise<void>;
  loadAccessoryServices: () => Promise<void>;
  loadAll: () => Promise<void>;
  applyHueEvents: (updates: HueEventUpdate[]) => void;
  setAllLightsState: (nextOn: boolean) => void;
  setRoomZoneState: (
    roomZone: HueRoomZone,
    nextOn: boolean,
    brightnessPct: number | null,
    phase?: ControlCommitPhase,
  ) => void;
  setLightState: (
    light: HueLight,
    nextOn: boolean,
    brightnessPct: number | null,
    phase?: ControlCommitPhase,
  ) => void;
  setLightColor: (light: HueLight, change: LightColorChange) => void;
  createGalleryScene: (
    roomZone: HueRoomZone,
    preset: HueGalleryScenePreset,
  ) => Promise<void>;
  /**
   * Live-previews a gallery preset on the room's actual lights without saving a
   * scene. Snapshots the room's light state on the first preview so
   * {@link HueResourcesState.endGalleryPreview} can restore it if the gallery is
   * dismissed without adding.
   */
  previewGalleryScene: (
    roomZone: HueRoomZone,
    preset: HueGalleryScenePreset,
  ) => void;
  /** Restores the pre-preview light state, if a preview is still pending. */
  endGalleryPreview: () => void;
  /**
   * Applies a gallery preset to the room's lights and keeps it — like a preview
   * that's committed rather than reverted. Does not create a scene resource.
   */
  setGallerySceneOnce: (
    roomZone: HueRoomZone,
    preset: HueGalleryScenePreset,
  ) => void;
  activateScene: (scene: HueScene, intent?: SceneIntent) => Promise<void>;
  /**
   * Changes the cadence of a currently-playing dynamic scene by writing its
   * `speed` property and re-recalling the palette so the new speed takes effect
   * immediately. The bridge has no transient/live speed separate from the
   * scene's stored `speed`, so this also persists onto the scene.
   */
  setDynamicSpeedLive: (scene: HueScene, step: number) => void;
  renameScene: (scene: HueScene, name: string) => Promise<void>;
  setSceneBrightness: (
    scene: HueScene,
    pct: number,
    phase?: ControlCommitPhase,
  ) => void;
  setSceneSpeed: (scene: HueScene, speed: number) => Promise<void>;
  setSceneAutoplay: (scene: HueScene, autoDynamic: boolean) => Promise<void>;
  deleteScene: (scene: HueScene) => Promise<void>;
}

const buildLayoutState = (
  roomZones: HueRoomZone[],
  storedLayout: HomeLayout | null,
  groupingMode: HomeGroupingMode,
): LayoutState => {
  const liveSpaceIds = roomZones.map((roomZone) => roomZone.id);
  const layout = reconcileLayout(storedLayout, liveSpaceIds);
  return {
    storedLayout,
    layout,
    displayLayout:
      groupingMode === "custom"
        ? layout
        : deriveGroupedLayout(roomZones, groupingMode),
    groupingMode,
  };
};

const refreshLayoutState = (
  roomZones: HueRoomZone[],
  storedLayout: HomeLayout | null,
  groupingMode: HomeGroupingMode,
): LayoutState => {
  const next = buildLayoutState(roomZones, storedLayout, groupingMode);
  if (roomZones.length > 0) writeStoredHomeLayout(next.layout);
  return next;
};

const initialGroupingMode = readStoredGroupingMode();
const initialStoredLayout = readStoredHomeLayout();

// Short transitions keep on/off and dimming feeling immediate. The bridge resets
// transitiontime to 400ms unless set every write, and longer fades emit a stream
// of intermediate state events that fight optimistic UI — see
// docs/HUE/watch-that-transition-time.md. These live in one shared module so the
// CSS easing of each surface matches the fade we actually send the bulb.
const GROUP_TOGGLE_TRANSITION_MS = TRANSITION_MS.groupToggle;
const LIGHT_TOGGLE_ON_TRANSITION_MS = TRANSITION_MS.lightToggleOn;
const LIGHT_TOGGLE_OFF_TRANSITION_MS = TRANSITION_MS.lightToggleOff;
const BRIGHTNESS_TRANSITION_MS = TRANSITION_MS.brightness;
const COLOR_TRANSITION_MS = TRANSITION_MS.color;
const SCENE_TRANSITION_MS = TRANSITION_MS.scene;
const LIVE_SLIDER_TRANSITION_MS = TRANSITION_MS.liveSlider;
// Group writes are broadcast commands, and Hue batches SSE containers roughly
// once per second. Keep plain group toggles stable through delayed aggregate
// echoes instead of releasing on the first matching event.
const GROUP_TOGGLE_SETTLE_MS = GROUP_TOGGLE_TRANSITION_MS + 4000;
const SCENE_SETTLE_MS = SCENE_TRANSITION_MS + 3000;
const SCENE_EVENT_REFRESH_DELAY_MS = 500;
let sceneEventRefreshTimer: ReturnType<typeof setTimeout> | null = null;

interface PendingLightColorWrite {
  id: string;
  xy: [number, number] | null;
  ct: number | null;
  effect: string | null;
  transitionMs: number;
  onSent: () => void;
  onError: (error: unknown) => void;
}

// Hue recommends roughly 100ms between individual light writes. Keep a single
// global lane so a multi-light drag cannot flood the bridge, and retain only
// the newest unsent color for each light so stale drag positions are discarded.
const LIGHT_COLOR_WRITE_GAP_MS = 100;
const LIGHT_COLOR_CONFIRM_TIMEOUT_MS = 10000;
const pendingLightColorWrites = new Map<string, PendingLightColorWrite>();
const lightColorWriteVersions = new Map<string, number>();
let drainingLightColorWrites = false;

const wait = (durationMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, durationMs));

const drainLightColorWrites = async (): Promise<void> => {
  if (drainingLightColorWrites) return;
  drainingLightColorWrites = true;

  while (pendingLightColorWrites.size > 0) {
    const next = pendingLightColorWrites.values().next().value;
    if (!next) break;
    pendingLightColorWrites.delete(next.id);
    const dispatchedAt = Date.now();

    try {
      await invoke("set-light-color", {
        id: next.id,
        xy: next.xy,
        ct: next.ct,
        effect: next.effect,
        transitionMs: next.transitionMs,
      });
      next.onSent();
    } catch (error) {
      next.onError(error);
    }

    const remainingGap = LIGHT_COLOR_WRITE_GAP_MS - (Date.now() - dispatchedAt);
    if (remainingGap > 0) await wait(remainingGap);
  }

  drainingLightColorWrites = false;
};

const enqueueLightColorWrite = (write: PendingLightColorWrite): void => {
  pendingLightColorWrites.set(write.id, write);
  void drainLightColorWrites();
};

const scheduleSceneEventRefresh = (loadScenes: () => Promise<void>): void => {
  if (sceneEventRefreshTimer != null) return;
  sceneEventRefreshTimer = setTimeout(() => {
    sceneEventRefreshTimer = null;
    void loadScenes();
  }, SCENE_EVENT_REFRESH_DELAY_MS);
};

// When a light/room is off the bridge often reports a non-useful dimming level.
// Switch-on writes restore the last real brightness, or this default when none
// is known, instead of echoing an off-state value back to the bridge.
const DEFAULT_RESTORE_BRIGHTNESS = 100;
const restoreBrightness = (last: number | null | undefined): number =>
  last != null && last > 0 ? last : DEFAULT_RESTORE_BRIGHTNESS;

/**
 * After we issue a write, the bridge emits a short flurry of events: ones queued
 * *before* it processed our write (carrying the old value) plus intermediate
 * frames mid-transition. Applying those blindly makes a freshly-toggled switch
 * flicker back off or a dimmed tile bounce. While a lock is live we keep our
 * optimistic value for any field an event contradicts, and drop the lock as soon
 * as an event confirms it (or it expires). Keyed by the resource id we control
 * (grouped_light id, or light id).
 */
interface OptimisticLock {
  on?: boolean;
  brightness?: number;
  colorMode?: "xy" | "ct";
  xy?: [number, number];
  mirek?: number;
  effect?: string;
  effectV2?: string;
  until: number;
  releaseOnConfirm?: boolean;
}
const OPTIMISTIC_LOCK_MS = 1500;
const optimisticLocks = new Map<string, OptimisticLock>();

/** A light's restorable state, captured so a live preview can be reverted. */
interface LightStateSnapshot {
  id: string;
  isOn: boolean;
  brightness: number | null;
  colorMode: string | null;
  xy: [number, number] | null;
  ct: number | null;
}

/** Restores a set of snapshotted lights to the state they held when captured. */
const restoreLightSnapshots = (
  snapshots: LightStateSnapshot[],
  lights: HueLight[],
  setLightColor: HueResourcesState["setLightColor"],
  setLightState: HueResourcesState["setLightState"],
): void => {
  for (const snap of snapshots) {
    const light = lights.find((candidate) => candidate.id === snap.id);
    if (!light) continue;
    if (snap.isOn) {
      // Restore color first (it also wakes the light), then power/brightness.
      if (snap.colorMode === "ct" && snap.ct != null) {
        setLightColor(light, { ct: snap.ct });
      } else if (snap.xy != null) {
        setLightColor(light, { xy: snap.xy });
      }
      setLightState(light, true, snap.brightness, "final");
    } else {
      setLightState(light, false, null, "final");
    }
  }
};

/**
 * The room's light state captured before a gallery live-preview began, so the
 * preview can be reverted if the gallery is closed without adding the scene.
 * Held outside the store (like the optimistic locks) since it's transient
 * scratch state, not something the UI subscribes to.
 */
interface GalleryPreviewSnapshot {
  roomZoneId: string;
  lights: LightStateSnapshot[];
}
let galleryPreviewSnapshot: GalleryPreviewSnapshot | null = null;

const lockResource = (
  id: string,
  patch: {
    on?: boolean;
    brightness?: number;
    colorMode?: "xy" | "ct";
    xy?: [number, number];
    mirek?: number;
    effect?: string;
    effectV2?: string;
  },
  options: { durationMs?: number; releaseOnConfirm?: boolean } = {},
): void => {
  optimisticLocks.set(id, {
    ...patch,
    until: Date.now() + (options.durationMs ?? OPTIMISTIC_LOCK_MS),
    releaseOnConfirm: options.releaseOnConfirm,
  });
};

const clearResourceLocks = (ids: Iterable<string | null | undefined>): void => {
  for (const id of ids) {
    if (id) optimisticLocks.delete(id);
  }
};

const clearGroupLocksForLight = (
  lightId: string,
  roomZones: HueRoomZone[],
): void => {
  clearResourceLocks(
    roomZones
      .filter((roomZone) => roomZone.lightIds.includes(lightId))
      .map((roomZone) => roomZone.groupedLightId),
  );
};

const nextBrightness = (
  current: number | null,
  incoming: number | null | undefined,
  isOn: boolean,
): number | null => (isOn && incoming != null ? incoming : current);

const sameXy = (
  a: [number, number] | null | undefined,
  b: [number, number] | null | undefined,
): boolean =>
  a != null &&
  b != null &&
  Math.abs(a[0] - b[0]) < 0.0001 &&
  Math.abs(a[1] - b[1]) < 0.0001;

const normalizeSceneStatus = (status: string | null | undefined): string =>
  status?.trim().toLowerCase().replace(/_/g, " ") ?? "";

const isSceneActive = (scene: HueScene): boolean => {
  const status = normalizeSceneStatus(scene.status);
  return status !== "" && status !== "inactive";
};

const isSceneDynamicActive = (scene: HueScene): boolean =>
  normalizeSceneStatus(scene.status) === "dynamic palette";

// Two distinct intents now drive a regular scene:
//   "apply"   – recall the scene's stored colors statically (tapping the card).
//   "dynamic" – start/stop the dynamic palette animation (the card's play button).
// Smart scenes have no static/dynamic split, so they always toggle active.
type SceneIntent = "apply" | "dynamic";

const nextSceneStatus = (scene: HueScene, intent: SceneIntent): string =>
  scene.resourceType === "smart_scene"
    ? isSceneActive(scene)
      ? "Inactive"
      : "Active"
    : intent === "dynamic"
      ? isSceneDynamicActive(scene)
        ? "Static"
        : "Dynamic Palette"
      : "Static";

const sceneInvokeCommand = (scene: HueScene, intent: SceneIntent): string =>
  scene.resourceType === "smart_scene"
    ? isSceneActive(scene)
      ? "deactivate-smart-scene"
      : "activate-smart-scene"
    : intent === "dynamic"
      ? isSceneDynamicActive(scene)
        ? "stop-dynamic-scene"
        : "start-dynamic-scene"
      : "activate-scene";

const sceneActionHasColor = (action: HueScene["actions"][number]): boolean =>
  action.xy != null || action.mirek != null;

/** Optimistically patches a single scene's editable fields in the store. */
const patchSceneLocal = (
  set: (fn: (state: HueResourcesState) => Partial<HueResourcesState>) => void,
  scene: HueScene,
  patch: { name?: string; speed?: number; autoDynamic?: boolean },
): void => {
  set((state) => ({
    scenes: state.scenes.map((candidate) =>
      candidate.id === scene.id && candidate.resourceType === scene.resourceType
        ? {
            ...candidate,
            ...(patch.name != null ? { name: patch.name } : {}),
            ...(patch.speed != null ? { speed: patch.speed } : {}),
            ...(patch.autoDynamic != null
              ? { autoDynamic: patch.autoDynamic }
              : {}),
          }
        : candidate,
    ),
  }));
};

/**
 * Reconciles an inbound event's on/brightness against any pending optimistic
 * lock for `id`. Returns the values the store should display: our locked value
 * for fields the event still contradicts, the event's value otherwise.
 * Confirmed locks clear early unless they are intentionally held for the full
 * settle window.
 */
const reconcileLock = (
  id: string | null | undefined,
  incoming: {
    on?: boolean | null;
    brightness?: number | null;
    colorMode?: string | null;
    xy?: [number, number] | null;
    mirek?: number | null;
    effect?: string | null;
    effectV2?: string | null;
  },
): {
  on?: boolean | null;
  brightness?: number | null;
  colorMode?: string | null;
  xy?: [number, number] | null;
  mirek?: number | null;
  effect?: string | null;
  effectV2?: string | null;
} => {
  if (!id) return incoming;
  const lock = optimisticLocks.get(id);
  if (!lock) return incoming;
  if (Date.now() >= lock.until) {
    optimisticLocks.delete(id);
    return incoming;
  }

  const result = { ...incoming };
  let confirmed = true;
  if (lock.on !== undefined) {
    if (incoming.on == null) confirmed = false;
    else if (incoming.on !== lock.on) {
      result.on = lock.on;
      confirmed = false;
    }
  }
  if (lock.brightness !== undefined) {
    if (incoming.brightness == null) confirmed = false;
    else if (Math.round(incoming.brightness) !== Math.round(lock.brightness)) {
      result.brightness = lock.brightness;
      confirmed = false;
    }
  }
  if (lock.colorMode !== undefined) {
    if (incoming.colorMode == null) confirmed = false;
    else if (incoming.colorMode !== lock.colorMode) {
      result.colorMode = lock.colorMode;
      confirmed = false;
    }
  }
  if (lock.xy !== undefined) {
    if (incoming.xy == null) confirmed = false;
    else if (!sameXy(incoming.xy, lock.xy)) {
      result.xy = lock.xy;
      confirmed = false;
    }
  }
  if (lock.mirek !== undefined) {
    if (incoming.mirek == null) confirmed = false;
    else if (incoming.mirek !== lock.mirek) {
      result.mirek = lock.mirek;
      confirmed = false;
    }
  }
  if (lock.effect !== undefined) {
    if (incoming.effect == null) confirmed = false;
    else if (incoming.effect !== lock.effect) {
      result.effect = lock.effect;
      confirmed = false;
    }
  }
  if (lock.effectV2 !== undefined) {
    if (incoming.effectV2 == null) confirmed = false;
    else if (incoming.effectV2 !== lock.effectV2) {
      result.effectV2 = lock.effectV2;
      confirmed = false;
    }
  }
  if (confirmed && lock.releaseOnConfirm !== false) optimisticLocks.delete(id);
  return result;
};

const coalesceHueEvents = (updates: HueEventUpdate[]): HueEventUpdate[] => {
  const byResource = new Map<string, HueEventUpdate>();

  for (const update of updates) {
    const key = `${update.type}:${update.id ?? ""}`;
    const previous = byResource.get(key);
    if (!previous) {
      byResource.set(key, update);
      continue;
    }

    byResource.set(key, {
      eventType: update.eventType ?? previous.eventType,
      type: update.type,
      id: update.id,
      on: update.on ?? previous.on,
      brightness: update.brightness ?? previous.brightness,
      xy: update.xy ?? previous.xy,
      mirek: update.mirek ?? previous.mirek,
      colorMode: update.colorMode ?? previous.colorMode,
      effect: update.effect ?? previous.effect,
      effectV2: update.effectV2 ?? previous.effectV2,
      speed: update.speed ?? previous.speed,
      autoDynamic: update.autoDynamic ?? previous.autoDynamic,
      status: update.status ?? previous.status,
      activeStreamerId: update.activeStreamerId ?? previous.activeStreamerId,
      value: update.value ?? previous.value,
      updated: update.updated ?? previous.updated,
    });
  }

  return [...byResource.values()];
};

export const useHueResourcesStore = create<HueResourcesState>((set, get) => ({
  roomZones: [],
  lights: [],
  scenes: [],
  accessoryServices: [],
  homeName: null,
  isLoading: true,
  hasLoaded: false,
  error: null,
  bridgeConnected: true,
  hueEventRevision: 0,
  ...buildLayoutState([], initialStoredLayout, initialGroupingMode),
  draftLayout: [],
  isEditLayoutMode: false,
  isCreatingSection: false,
  setDraftLayout: (next) => set({ draftLayout: next }),

  setGroupingMode: (mode) => {
    writeStoredGroupingMode(mode);
    set((state) => ({
      ...refreshLayoutState(state.roomZones, state.storedLayout, mode),
      ...(mode !== "custom"
        ? {
            isEditLayoutMode: false,
            draftLayout: [],
            isCreatingSection: false,
          }
        : null),
    }));
  },

  showGroupingMode: (mode) => {
    set((state) => ({
      ...buildLayoutState(state.roomZones, state.storedLayout, mode),
      ...(mode !== "custom"
        ? {
            isEditLayoutMode: false,
            draftLayout: [],
            isCreatingSection: false,
          }
        : null),
    }));
  },

  enterEditLayout: () => {
    const state = get();
    if (state.groupingMode !== "custom") writeStoredGroupingMode("custom");
    set({
      ...refreshLayoutState(state.roomZones, state.storedLayout, "custom"),
      draftLayout: state.layout.map((section) => ({
        ...section,
        spaceIds: [...section.spaceIds],
      })),
      isEditLayoutMode: true,
    });
  },

  cancelEditLayout: () => set({ isEditLayoutMode: false, draftLayout: [] }),

  saveEditLayout: () => {
    const state = get();
    const draftLayout = state.draftLayout;
    writeStoredHomeLayout(draftLayout);
    set({
      ...refreshLayoutState(state.roomZones, draftLayout, state.groupingMode),
      isEditLayoutMode: false,
      draftLayout: [],
    });
  },

  openCreateSection: () => set({ isCreatingSection: true }),
  closeCreateSection: () => set({ isCreatingSection: false }),

  createLayoutSection: (name) =>
    set((state) => ({
      draftLayout: [
        ...state.draftLayout,
        { id: newLayoutSectionId(), name, spaceIds: [] },
      ],
      isCreatingSection: false,
    })),

  renameLayoutSection: (sectionId, name) =>
    set((state) => ({
      draftLayout: state.draftLayout.map((section) =>
        section.id === sectionId ? { ...section, name } : section,
      ),
    })),

  loadLights: async () => {
    const result = await invoke<HueLight[]>("get-hue-lights");
    set({ lights: result });
  },

  loadScenes: async () => {
    try {
      const result = await invoke<HueScene[]>("get-hue-scenes");
      set({ scenes: result });
    } catch (error) {
      set({ error: String(error) || "Failed to load scenes." });
    }
  },

  // Live sensor/switch readings, fetched alongside the rest of the resources so
  // accessory tiles render at their final size from the first paint. Best
  // effort: a failure leaves the last-known readings in place (or none) and the
  // SSE stream still updates whatever is present.
  loadAccessoryServices: async () => {
    try {
      const result = await invoke<HueAccessoryService[]>(
        "get-hue-accessory-services",
      );
      set({ accessoryServices: result });
    } catch {
      // Non-fatal — accessory readings just won't refresh until the next load.
    }
  },

  // The home/house name shown in the Home header. Best effort: a failure (or a
  // bridge with no name) leaves it null, and the header falls back accordingly.
  loadHomeName: async () => {
    try {
      const result = await invoke<string | null>("get-hue-home-name");
      set({ homeName: result });
    } catch {
      // Non-fatal — the rest of Home loads regardless of the name.
    }
  },

  loadAll: async () => {
    set({ isLoading: true, error: null });
    try {
      // Each resource degrades independently: a failure in any one (zones,
      // scenes, rooms, lights) leaves the others usable rather than blanking
      // the whole Home. Rooms failing surfaces a banner but Home still renders.
      const [rooms, zones, sceneResult] = await Promise.all([
        invoke<HueRoom[]>("get-hue-rooms").catch((roomsError) => {
          set({
            error: String(roomsError) || "Failed to load your Hue setup.",
          });
          return [] as HueRoom[];
        }),
        invoke<HueZone[]>("get-hue-zones").catch(() => [] as HueZone[]),
        invoke<HueScene[]>("get-hue-scenes").catch(() => [] as HueScene[]),
        get().loadLights(),
        get().loadHomeName(),
        get().loadAccessoryServices(),
      ]);
      const roomZones = [...rooms, ...zones].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      set((state) => ({
        roomZones,
        scenes: sceneResult,
        ...refreshLayoutState(
          roomZones,
          state.storedLayout,
          state.groupingMode,
        ),
      }));
    } catch (loadError) {
      // Reached only if loadLights rejects (it has no per-call fallback).
      set({ error: String(loadError) || "Failed to load your Hue setup." });
    } finally {
      set({ isLoading: false, hasLoaded: true });
    }
  },

  applyHueEvents: (updates) => {
    const changes = coalesceHueEvents(updates);
    const sceneChanges = changes.filter(
      (change) =>
        (change.type === "scene" || change.type === "smart_scene") &&
        change.id != null,
    );
    const knownSceneKeys = new Set(
      get().scenes.map((scene) => `${scene.resourceType}:${scene.id}`),
    );
    const shouldRefreshScenes =
      sceneChanges.length > 0 &&
      sceneChanges.some((change) => {
        const known = knownSceneKeys.has(`${change.type}:${change.id ?? ""}`);
        return (
          change.eventType === "update" ||
          change.eventType === "add" ||
          change.eventType === "delete" ||
          !known ||
          change.value == null
        );
      });

    set((state) => {
      const lights = state.lights.map((light) => {
        const change = changes.find(
          (u) => u.type === "light" && u.id === light.id,
        );
        if (!change) return light;
        const { on, brightness, colorMode, xy, mirek, effect, effectV2 } =
          reconcileLock(light.id, {
            on: change.on,
            brightness: change.brightness,
            colorMode: change.colorMode,
            xy: change.xy,
            mirek: change.mirek,
            effect: change.effect,
            effectV2: change.effectV2,
          });
        const nextIsOn = on ?? light.isOn;
        return {
          ...light,
          isOn: nextIsOn,
          brightness: nextBrightness(light.brightness, brightness, nextIsOn),
          xy: xy ?? light.xy,
          ct: mirek ?? light.ct,
          effect: effectV2 ?? effect ?? light.effect,
          effectV2: effectV2 ?? light.effectV2,
          colorMode: colorMode ?? light.colorMode,
        };
      });

      // The bridge sends a grouped_light event for room/zone-level changes, but
      // an external single-light change may only emit `light` events. Fall back
      // to deriving the tile's aggregate from its members so it still tracks.
      const lightById = new Map(lights.map((light) => [light.id, light]));
      const roomZones = state.roomZones.map((roomZone) => {
        const change = changes.find(
          (u) => u.type === "grouped_light" && u.id === roomZone.groupedLightId,
        );
        if (change) {
          const { on, brightness } = reconcileLock(roomZone.groupedLightId, {
            on: change.on,
            brightness: change.brightness,
          });
          const nextAnyOn = on ?? roomZone.anyOn;
          return {
            ...roomZone,
            anyOn: nextAnyOn,
            allOn: nextAnyOn ? roomZone.allOn : false,
            brightness: nextBrightness(
              roomZone.brightness,
              brightness,
              nextAnyOn,
            ),
          };
        }

        // No authoritative grouped event: derive from members, but never while
        // an optimistic command for this group is still settling.
        const lock = roomZone.groupedLightId
          ? optimisticLocks.get(roomZone.groupedLightId)
          : undefined;
        if (lock && Date.now() < lock.until) return roomZone;
        const memberChanged = roomZone.lightIds.some((id) =>
          changes.some((u) => u.type === "light" && u.id === id),
        );
        if (!memberChanged) return roomZone;
        const members = roomZone.lightIds
          .map((id) => lightById.get(id))
          .filter((light): light is HueLight => light !== undefined);
        // Members not yet in state: leave the tile as-is rather than guess it off.
        if (members.length === 0) return roomZone;
        const onMembers = members.filter((light) => light.isOn);
        return {
          ...roomZone,
          anyOn: onMembers.length > 0,
          allOn: members.length > 0 && onMembers.length === members.length,
          brightness: onMembers.length
            ? onMembers.reduce(
                (sum, light) => sum + (light.brightness ?? 0),
                0,
              ) / onMembers.length
            : roomZone.brightness,
        };
      });

      const liveDynamicSpeedByGroupId = new Map<string, number>();
      for (const roomZone of state.roomZones) {
        const groupedChange = changes.find(
          (u) =>
            u.type === "grouped_light" &&
            u.id === roomZone.groupedLightId &&
            u.speed != null,
        );
        if (groupedChange?.speed != null) {
          liveDynamicSpeedByGroupId.set(roomZone.id, groupedChange.speed);
          continue;
        }

        const memberChange = changes.find(
          (u) =>
            u.type === "light" &&
            u.speed != null &&
            roomZone.lightIds.includes(u.id ?? ""),
        );
        if (memberChange?.speed != null) {
          liveDynamicSpeedByGroupId.set(roomZone.id, memberChange.speed);
        }
      }

      const scenes =
        sceneChanges.length === 0 && liveDynamicSpeedByGroupId.size === 0
          ? state.scenes
          : state.scenes.map((scene) => {
              const change = sceneChanges.find(
                (candidate) =>
                  candidate.id === scene.id &&
                  candidate.type === scene.resourceType,
              );
              const liveDynamicSpeed =
                scene.group != null && isSceneDynamicActive(scene)
                  ? liveDynamicSpeedByGroupId.get(scene.group)
                  : undefined;
              if (!change && liveDynamicSpeed == null) return scene;
              return {
                ...scene,
                ...(change?.value ? { status: change.value } : {}),
                ...(change?.speed != null ? { speed: change.speed } : {}),
                ...(liveDynamicSpeed != null
                  ? { speed: liveDynamicSpeed }
                  : {}),
                ...(change?.autoDynamic != null
                  ? { autoDynamic: change.autoDynamic }
                  : {}),
              };
            });

      // Accessory readings (motion, temperature, light level, battery, button
      // events) carry a pre-formatted `value` on their SSE events. Patch only
      // when a value actually changed so light/scene traffic doesn't churn the
      // array identity and re-render every sensor tile.
      let accessoryChanged = false;
      const accessoryServices = state.accessoryServices.map((service) => {
        const change = changes.find(
          (u) =>
            u.id === service.id &&
            u.type === service.resourceType &&
            u.value != null,
        );
        if (!change || change.value === service.value) return service;
        accessoryChanged = true;
        return {
          ...service,
          value: change.value,
          updated: change.updated ?? service.updated,
        };
      });

      return {
        lights,
        roomZones,
        scenes,
        ...(accessoryChanged ? { accessoryServices } : {}),
        hueEventRevision: state.hueEventRevision + 1,
      };
    });

    if (shouldRefreshScenes) {
      scheduleSceneEventRefresh(() => get().loadScenes());
    }
  },

  setAllLightsState: (nextOn) => {
    const state = get();
    const lightIds = state.lights.map((light) => light.id);
    if (lightIds.length === 0 || isSyncLocked(lightIds)) return;

    const lockOptions = {
      durationMs: GROUP_TOGGLE_SETTLE_MS,
      releaseOnConfirm: false,
    };
    for (const id of lightIds) {
      lockResource(id, { on: nextOn }, lockOptions);
    }
    for (const roomZone of state.roomZones) {
      if (roomZone.groupedLightId) {
        lockResource(roomZone.groupedLightId, { on: nextOn }, lockOptions);
      }
    }

    set((current) => {
      const lights = current.lights.map((light) => ({
        ...light,
        isOn: nextOn,
      }));
      const lightById = new Map(lights.map((light) => [light.id, light]));
      const roomZones = current.roomZones.map((roomZone) => {
        const members = roomZone.lightIds
          .map((id) => lightById.get(id))
          .filter((light): light is HueLight => light != null);
        return {
          ...roomZone,
          anyOn: nextOn && members.length > 0,
          allOn: nextOn && members.length > 0,
        };
      });
      return {
        lights,
        roomZones,
        hueEventRevision: current.hueEventRevision + 1,
      };
    });

    void invoke("set-all-lights-state", {
      on: nextOn,
      transitionMs: GROUP_TOGGLE_TRANSITION_MS,
    }).catch((error) => {
      clearResourceLocks([
        ...lightIds,
        ...state.roomZones.map((roomZone) => roomZone.groupedLightId),
      ]);
      set({ error: String(error) || "Unable to update all lights." });
      void get().loadAll();
    });
  },

  setRoomZoneState: (roomZone, nextOn, brightnessPct, phase = "final") => {
    const syncedIds = activeSyncedLightIds();
    const memberIds = new Set(
      roomZone.lightIds.filter((id) => !syncedIds.has(id)),
    );
    if (memberIds.size === 0) return;
    const hasSyncedMembers = memberIds.size < roomZone.lightIds.length;
    const useGroupedLight =
      !hasSyncedMembers && roomZone.groupedLightId != null;
    const controllableMembers = get().lights.filter((light) =>
      memberIds.has(light.id),
    );
    const onControllableMembers = controllableMembers.filter(
      (light) => light.isOn,
    );
    const controllableAnyOn = onControllableMembers.length > 0;
    const controllableBrightness =
      onControllableMembers.length > 0
        ? onControllableMembers.reduce(
            (sum, light) => sum + (light.brightness ?? 0),
            0,
          ) / onControllableMembers.length
        : null;
    const isToggle = brightnessPct === null;
    // Turning on sends a concrete brightness as well as `on`; some grouped
    // light states accept `on: true` but do not physically wake the members
    // until dimming is written. Turning off still sends only `on: false`.
    const sendBrightness = nextOn
      ? brightnessPct === null
        ? restoreBrightness(controllableBrightness)
        : Math.max(1, brightnessPct)
      : null;
    const transitionMs =
      phase === "live"
        ? LIVE_SLIDER_TRANSITION_MS
        : isToggle
          ? GROUP_TOGGLE_TRANSITION_MS
          : BRIGHTNESS_TRANSITION_MS;
    // Only send `on` when it's actually changing: a brightness drag on an
    // already-on group should carry dimming alone (fewer ZigBee messages, and
    // it won't re-trigger an on-transition mid-drag).
    const sendOn = !isToggle && controllableAnyOn === nextOn ? null : nextOn;

    // Optimistic brightness shown right away: on/drag uses the value we send;
    // off leaves the last useful level in place for the next restore.
    const groupToggleLock = isToggle
      ? {
          durationMs: GROUP_TOGGLE_SETTLE_MS,
          releaseOnConfirm: false,
        }
      : undefined;

    // Guard the optimistic state from the echo flurry our own write triggers.
    // Switch-on carries brightness intentionally; switch-off only locks power.
    if (useGroupedLight) {
      lockResource(
        roomZone.groupedLightId!,
        {
          on: nextOn,
          ...(sendBrightness !== null ? { brightness: sendBrightness } : {}),
        },
        groupToggleLock,
      );
    }
    for (const memberId of memberIds) {
      lockResource(
        memberId,
        {
          on: nextOn,
          ...(sendBrightness !== null ? { brightness: sendBrightness } : {}),
        },
        groupToggleLock,
      );
    }

    set((state) => {
      const lights = state.lights.map((light) =>
        memberIds.has(light.id)
          ? {
              ...light,
              isOn: nextOn,
              brightness:
                sendBrightness ??
                (nextOn ? restoreBrightness(light.brightness) : null) ??
                light.brightness,
            }
          : light,
      );
      const lightById = new Map(lights.map((light) => [light.id, light]));
      const roomZones = state.roomZones.map((candidate) => {
        if (candidate.id !== roomZone.id) return candidate;
        const members = candidate.lightIds
          .map((id) => lightById.get(id))
          .filter((light): light is HueLight => light != null);
        const onMembers = members.filter((light) => light.isOn);
        return {
          ...candidate,
          anyOn: onMembers.length > 0,
          allOn: members.length > 0 && onMembers.length === members.length,
          brightness:
            onMembers.length > 0
              ? onMembers.reduce(
                  (sum, light) => sum + (light.brightness ?? 0),
                  0,
                ) / onMembers.length
              : candidate.brightness,
        };
      });
      return {
        roomZones,
        lights,
        hueEventRevision:
          phase === "live"
            ? state.hueEventRevision
            : state.hueEventRevision + 1,
      };
    });

    // A mixed space requires one request per controllable light. Keep live
    // dragging optimistic and send only the released value to avoid flooding
    // the bridge with N writes per slider frame.
    if (!useGroupedLight && phase === "live") return;

    const write = useGroupedLight
      ? invoke("set-grouped-light-state", {
          id: roomZone.groupedLightId,
          on: sendOn,
          brightness: sendBrightness,
          transitionMs,
        })
      : Promise.all(
          [...memberIds].map((id) =>
            invoke("set-light-state", {
              id,
              on: sendOn,
              brightness: sendBrightness,
              transitionMs,
            }),
          ),
        );

    void write.catch((e) => {
      clearResourceLocks([
        ...(useGroupedLight ? [roomZone.groupedLightId] : []),
        ...memberIds,
      ]);
      set({ error: String(e) || "Unable to update room or zone." });
      void get().loadAll();
    });
  },

  setLightState: (light, nextOn, brightnessPct, phase = "final") => {
    if (isSyncLocked([light.id])) return;
    const isToggle = brightnessPct === null;
    // Turning on sends brightness too. That makes switch-on behave like the
    // slider path, which reliably wakes lights even after a grouped off command.
    // Turning off still sends only `on: false`.
    const sendBrightness = nextOn
      ? brightnessPct === null
        ? restoreBrightness(light.brightness)
        : Math.max(1, brightnessPct)
      : null;
    const transitionMs =
      phase === "live"
        ? LIVE_SLIDER_TRANSITION_MS
        : isToggle
          ? nextOn
            ? LIGHT_TOGGLE_ON_TRANSITION_MS
            : LIGHT_TOGGLE_OFF_TRANSITION_MS
          : BRIGHTNESS_TRANSITION_MS;
    // Omit `on` for a brightness drag on an already-on light (see grouped case).
    const sendOn = !isToggle && light.isOn === nextOn ? null : nextOn;
    // A direct light command supersedes any still-settling room/zone optimistic
    // command that contains this light.
    clearGroupLocksForLight(light.id, get().roomZones);

    // Show immediately: on/drag uses the value we send; off leaves the last
    // useful level in place for the next restore.
    const optimisticBri = sendBrightness;
    lockResource(light.id, {
      on: nextOn,
      ...(sendBrightness !== null ? { brightness: sendBrightness } : {}),
    });
    set((state) => ({
      lights: state.lights.map((l) =>
        l.id === light.id
          ? { ...l, isOn: nextOn, brightness: optimisticBri ?? l.brightness }
          : l,
      ),
      // Glide the slider across a toggle or a released drag; live frames snap.
      hueEventRevision:
        phase === "live" ? state.hueEventRevision : state.hueEventRevision + 1,
    }));

    void invoke("set-light-state", {
      id: light.id,
      on: sendOn,
      brightness: sendBrightness,
      transitionMs,
    }).catch((e) => {
      clearResourceLocks([light.id]);
      set({ error: String(e) || "Unable to update light." });
      void get().loadLights();
    });
  },

  setLightColor: (light, change) => {
    if (isSyncLocked([light.id])) return;
    // Remember the wheel's vivid pre-clamp color so cards/tiles/the side-pane
    // icon show what the thumb showed rather than the duller clamped readback.
    if (change.xy && change.vividHex) {
      recordPickedColor(light.id, change.xy, change.vividHex);
    }
    // Setting a color also turns the light on; lock so an in-flight off-echo
    // can't immediately flip it back.
    lockResource(
      light.id,
      {
        on: true,
        ...(change.xy ? { colorMode: "xy" as const, xy: change.xy } : {}),
        ...(change.ct ? { colorMode: "ct" as const, mirek: change.ct } : {}),
        ...(change.effect
          ? { effect: change.effect, effectV2: change.effect }
          : {}),
      },
      {
        durationMs: LIGHT_COLOR_CONFIRM_TIMEOUT_MS,
        releaseOnConfirm: false,
      },
    );
    clearGroupLocksForLight(light.id, get().roomZones);
    set((state) => ({
      lights: state.lights.map((l) =>
        l.id === light.id
          ? {
              ...l,
              isOn: true,
              xy: change.xy ?? l.xy,
              ct: change.ct ?? l.ct,
              effect: change.effect ?? l.effect,
              effectV2: change.effect ?? l.effectV2,
              colorMode: change.xy ? "xy" : change.ct ? "ct" : l.colorMode,
            }
          : l,
      ),
    }));

    const writeVersion = (lightColorWriteVersions.get(light.id) ?? 0) + 1;
    lightColorWriteVersions.set(light.id, writeVersion);
    enqueueLightColorWrite({
      id: light.id,
      xy: change.xy ?? null,
      ct: change.ct ?? null,
      effect: change.effect ?? null,
      transitionMs: COLOR_TRANSITION_MS,
      onSent: () => {
        if (lightColorWriteVersions.get(light.id) !== writeVersion) return;
        // Every older write for this light has now been accepted before this
        // one. Stale SSE frames remain blocked until the bridge reports this
        // exact final value; only that confirmation may release the lock.
        lockResource(
          light.id,
          {
            on: true,
            ...(change.xy ? { colorMode: "xy" as const, xy: change.xy } : {}),
            ...(change.ct
              ? { colorMode: "ct" as const, mirek: change.ct }
              : {}),
            ...(change.effect
              ? { effect: change.effect, effectV2: change.effect }
              : {}),
          },
          {
            durationMs: LIGHT_COLOR_CONFIRM_TIMEOUT_MS,
            releaseOnConfirm: true,
          },
        );
        lightColorWriteVersions.delete(light.id);
      },
      onError: (error) => {
        if (lightColorWriteVersions.get(light.id) !== writeVersion) return;
        lightColorWriteVersions.delete(light.id);
        clearResourceLocks([light.id]);
        set({ error: String(error) || "Unable to update color." });
        void get().loadLights();
      },
    });
  },

  createGalleryScene: async (roomZone, preset) => {
    try {
      const scene = await invoke<HueScene>("create-hue-gallery-scene", {
        name: preset.name,
        groupId: roomZone.id,
        groupType: roomZone.resourceType,
        brightness: preset.brightness,
        colors: preset.colors.map(({ xy, mirek }) => ({ xy, mirek })),
        speed: preset.dynamic ? preset.speed : null,
      });

      set((state) => ({
        scenes: [
          ...state.scenes.filter(
            (candidate) =>
              candidate.id !== scene.id ||
              candidate.resourceType !== scene.resourceType,
          ),
          scene,
        ],
        error: null,
      }));

      // The scene now owns these colors, so keep the live preview rather than
      // reverting it: drop the restore snapshot before the gallery closes.
      galleryPreviewSnapshot = null;
      await get().activateScene(scene);
      await get().loadScenes();
    } catch (e) {
      const message = String(e) || "Unable to add gallery scene.";
      set({ error: message });
      throw e;
    }
  },

  previewGalleryScene: (roomZone, preset) => {
    const { lights, setLightColor, setRoomZoneState } = get();
    const members = roomZone.lightIds
      .map((id) => lights.find((light) => light.id === id))
      .filter((light): light is HueLight => light != null);
    if (members.length === 0) return;

    // Snapshot once per room. Re-previewing another preset overwrites the lights
    // but keeps the original snapshot so a later dismiss still restores cleanly.
    if (galleryPreviewSnapshot?.roomZoneId !== roomZone.id) {
      galleryPreviewSnapshot = {
        roomZoneId: roomZone.id,
        lights: members.map((light) => ({
          id: light.id,
          isOn: light.isOn,
          brightness: light.brightness,
          colorMode: light.colorMode,
          xy: light.xy,
          ct: light.ct,
        })),
      };
    }

    // Apply the group's brightness first, then the per-light colors — the color
    // writes lock last so the brightness write can't clobber their optimistic
    // color state. Colors mirror the bridge's gallery distribution
    // (colors[index % len]) so the preview matches the scene "Add" would create.
    const colors = preset.colors;
    const brightness = Math.min(100, Math.max(1, preset.brightness));
    setRoomZoneState(roomZone, true, brightness, "final");
    members.forEach((light, index) => {
      const color = colors[index % colors.length];
      if (color.mirek != null) setLightColor(light, { ct: color.mirek });
      else if (color.xy != null) setLightColor(light, { xy: color.xy });
    });
  },

  endGalleryPreview: () => {
    const snapshot = galleryPreviewSnapshot;
    if (!snapshot) return;
    galleryPreviewSnapshot = null;

    const { lights, setLightColor, setLightState } = get();
    restoreLightSnapshots(
      snapshot.lights,
      lights,
      setLightColor,
      setLightState,
    );
  },

  setGallerySceneOnce: (roomZone, preset) => {
    // Apply the preset to the real lights, then drop the restore snapshot so the
    // state sticks instead of reverting when the gallery is dismissed.
    get().previewGalleryScene(roomZone, preset);
    galleryPreviewSnapshot = null;
  },

  activateScene: async (scene, intent = "apply") => {
    const allActionsByLightId = new Map(
      scene.actions.map((action) => [action.targetId, action]),
    );
    const syncedIds = activeSyncedLightIds();
    const fallbackTargetIds =
      scene.group != null
        ? (get().roomZones.find((roomZone) => roomZone.id === scene.group)
            ?.lightIds ?? [])
        : [];
    const allTargetIds =
      allActionsByLightId.size > 0
        ? [...allActionsByLightId.keys()]
        : fallbackTargetIds;
    const syncedTargetCount = allTargetIds.filter((id) =>
      syncedIds.has(id),
    ).length;
    const partialSync =
      syncedTargetCount > 0 && syncedTargetCount < allTargetIds.length;
    if (
      (allTargetIds.length > 0 && syncedTargetCount === allTargetIds.length) ||
      (partialSync && (intent === "dynamic" || scene.smart))
    ) {
      return;
    }
    const actionByLightId = new Map(
      [...allActionsByLightId].filter(([id]) => !syncedIds.has(id)),
    );
    const targetIds = [...actionByLightId.keys()];
    const lockOptions = {
      durationMs: SCENE_SETTLE_MS,
      releaseOnConfirm: false,
    };

    for (const [lightId, action] of actionByLightId) {
      clearGroupLocksForLight(lightId, get().roomZones);
      const impliesOn =
        action.brightness != null ||
        sceneActionHasColor(action) ||
        action.effect != null ||
        action.effectV2 != null;
      lockResource(
        lightId,
        {
          ...(action.on != null || impliesOn ? { on: action.on ?? true } : {}),
          ...(action.brightness != null
            ? { brightness: action.brightness }
            : {}),
          ...(action.xy ? { colorMode: "xy" as const, xy: action.xy } : {}),
          ...(action.mirek != null
            ? { colorMode: "ct" as const, mirek: action.mirek }
            : {}),
          ...(action.effect ? { effect: action.effect } : {}),
          ...(action.effectV2 ? { effectV2: action.effectV2 } : {}),
        },
        lockOptions,
      );
    }

    set((state) => {
      const lights = state.lights.map((light) => {
        const action = actionByLightId.get(light.id);
        if (!action) return light;
        const impliesOn =
          action.brightness != null ||
          sceneActionHasColor(action) ||
          action.effect != null ||
          action.effectV2 != null;
        const nextIsOn = action.on ?? (impliesOn ? true : light.isOn);

        return {
          ...light,
          isOn: nextIsOn,
          brightness: nextBrightness(
            light.brightness,
            action.brightness,
            nextIsOn,
          ),
          xy: action.xy ?? light.xy,
          ct: action.mirek ?? light.ct,
          effect: action.effectV2 ?? action.effect ?? light.effect,
          effectV2: action.effectV2 ?? light.effectV2,
          colorMode: action.xy ? "xy" : action.mirek ? "ct" : light.colorMode,
        };
      });

      const lightById = new Map(lights.map((light) => [light.id, light]));
      const roomZones = state.roomZones.map((roomZone) => {
        const affected =
          scene.group != null
            ? roomZone.id === scene.group
            : roomZone.lightIds.some((id) => actionByLightId.has(id));
        if (!affected) return roomZone;

        const members = roomZone.lightIds
          .map((id) => lightById.get(id))
          .filter((light): light is HueLight => light !== undefined);
        if (members.length === 0) return roomZone;
        const onMembers = members.filter((light) => light.isOn);
        return {
          ...roomZone,
          anyOn: onMembers.length > 0,
          allOn: onMembers.length === members.length,
          brightness: onMembers.length
            ? onMembers.reduce(
                (sum, light) => sum + (light.brightness ?? 0),
                0,
              ) / onMembers.length
            : roomZone.brightness,
        };
      });

      const scenes = state.scenes.map((candidate) =>
        candidate.group === scene.group
          ? {
              ...candidate,
              status:
                candidate.id === scene.id
                  ? nextSceneStatus(candidate, intent)
                  : "Inactive",
            }
          : candidate,
      );

      // A scene apply is a discrete jump in brightness/color the sliders and
      // tiles should ease into, matching the scene's fade.
      return {
        error: null,
        lights,
        roomZones,
        scenes,
        hueEventRevision: state.hueEventRevision + 1,
      };
    });

    const groupedLightIds =
      partialSync || targetIds.length === 0
        ? []
        : get()
            .roomZones.filter((roomZone) =>
              scene.group != null
                ? roomZone.id === scene.group
                : roomZone.lightIds.some((id) => actionByLightId.has(id)),
            )
            .map((roomZone) => roomZone.groupedLightId)
            .filter((id): id is string => id != null);

    for (const roomZone of get().roomZones) {
      if (
        !roomZone.groupedLightId ||
        !groupedLightIds.includes(roomZone.groupedLightId)
      ) {
        continue;
      }
      lockResource(
        roomZone.groupedLightId,
        {
          on: roomZone.anyOn,
          ...(roomZone.brightness != null
            ? { brightness: roomZone.brightness }
            : {}),
        },
        lockOptions,
      );
    }

    try {
      if (partialSync) {
        await Promise.all(
          [...actionByLightId].map(async ([id, action]) => {
            const impliesOn =
              action.brightness != null ||
              sceneActionHasColor(action) ||
              action.effect != null ||
              action.effectV2 != null;
            if (
              action.xy != null ||
              action.mirek != null ||
              action.effect != null ||
              action.effectV2 != null
            ) {
              await invoke("set-light-color", {
                id,
                xy: action.xy,
                ct: action.mirek,
                effect: action.effectV2 ?? action.effect,
                transitionMs: SCENE_TRANSITION_MS,
              });
            }
            if (action.on != null || impliesOn) {
              await invoke("set-light-state", {
                id,
                on: action.on ?? true,
                brightness: action.brightness,
                transitionMs: SCENE_TRANSITION_MS,
              });
            }
          }),
        );
      } else {
        const command = sceneInvokeCommand(scene, intent);
        await invoke(
          command,
          command === "deactivate-smart-scene"
            ? { sceneId: scene.id }
            : { sceneId: scene.id, transitionMs: SCENE_TRANSITION_MS },
        );
      }
    } catch (e) {
      clearResourceLocks([...targetIds, ...groupedLightIds]);
      set({ error: String(e) || "Unable to activate scene." });
      void get().loadAll();
    }
  },

  setDynamicSpeedLive: (scene, step) => {
    const roomZone =
      scene.group != null
        ? get().roomZones.find((candidate) => candidate.id === scene.group)
        : undefined;
    const targetIds =
      roomZone?.lightIds ?? scene.actions.map((action) => action.targetId);
    if (isSyncLocked(targetIds)) return;
    const speed = hueDynamicSpeedStepToValue(step);
    const brightness =
      roomZone?.anyOn === true && roomZone.brightness != null
        ? Math.max(1, Math.round(roomZone.brightness))
        : null;
    patchSceneLocal(set, scene, { speed });
    void (async () => {
      try {
        await invoke("update-hue-resource", {
          resourceType: scene.resourceType,
          id: scene.id,
          body: { speed },
        });
        // Updating `speed` only re-paces the palette once the scene is recalled
        // again; carry the live group brightness so recall does not restore the
        // scene's saved dimming level.
        await invoke("start-dynamic-scene", {
          sceneId: scene.id,
          brightness,
        });
      } catch (e) {
        set({ error: String(e) || "Unable to change dynamic speed." });
      }
    })();
  },

  renameScene: async (scene, name) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === scene.name) return;
    patchSceneLocal(set, scene, { name: trimmed });
    try {
      await invoke("update-hue-resource", {
        resourceType: scene.resourceType,
        id: scene.id,
        body: { metadata: { name: trimmed } },
      });
    } catch (e) {
      set({ error: String(e) || "Unable to rename scene." });
      void get().loadScenes();
    }
  },

  setSceneBrightness: (scene, pct, phase = "final") => {
    if (phase !== "final") return;
    invoke("set-scene-brightness", {
      sceneId: scene.id,
      brightness: Math.max(1, Math.round(pct)),
    }).catch((e) => {
      set({ error: String(e) || "Unable to set scene brightness." });
    });
  },

  setSceneSpeed: async (scene, speed) => {
    const stepped = hueDynamicSpeedStepToValue(
      hueDynamicSpeedValueToStep(speed),
    );
    patchSceneLocal(set, scene, { speed: stepped });
    try {
      await invoke("update-hue-resource", {
        resourceType: scene.resourceType,
        id: scene.id,
        body: { speed: stepped },
      });
    } catch (e) {
      set({ error: String(e) || "Unable to set scene speed." });
      void get().loadScenes();
      throw e;
    }
  },

  setSceneAutoplay: async (scene, autoDynamic) => {
    patchSceneLocal(set, scene, { autoDynamic });
    try {
      await invoke("update-hue-resource", {
        resourceType: scene.resourceType,
        id: scene.id,
        body: { auto_dynamic: autoDynamic },
      });
    } catch (e) {
      set({ error: String(e) || "Unable to update autoplay." });
      void get().loadScenes();
      throw e;
    }
  },

  deleteScene: async (scene) => {
    set((state) => ({
      scenes: state.scenes.filter(
        (candidate) =>
          candidate.id !== scene.id ||
          candidate.resourceType !== scene.resourceType,
      ),
      error: null,
    }));
    try {
      await invoke("delete-hue-resource", {
        resourceType: scene.resourceType,
        id: scene.id,
      });
    } catch (e) {
      set({ error: String(e) || "Unable to delete scene." });
      void get().loadScenes();
    }
  },
}));

/**
 * Lifecycle effects for the Hue resources store. Mounted once inside the
 * router root so the data layer persists across Home -> Space -> Settings
 * navigation without using a React context provider.
 */
export const HueResourcesStoreEffects: React.FC = () => {
  useEffect(() => {
    let refresh: ReturnType<typeof setTimeout> | undefined;
    const unlisten = listen<
      { id: string; on: boolean; brightness: number | null }[]
    >("shortcut-state-changed", ({ payload }) => {
      clearTimeout(refresh);
      const store = useHueResourcesStore.getState();
      const ids = new Set(payload.map((light) => light.id));
      clearResourceLocks([
        ...ids,
        ...store.roomZones
          .filter((group) => group.lightIds.some((id) => ids.has(id)))
          .map((group) => group.groupedLightId),
      ]);
      store.applyHueEvents(
        payload.map(
          (light) =>
            ({
              type: "light",
              id: light.id,
              on: light.on,
              brightness: light.brightness,
            }) as HueEventUpdate,
        ),
      );
      // Share completed shortcut state across windows while bridge echoes settle.
      const options = { durationMs: 2000, releaseOnConfirm: false };
      for (const light of payload) {
        lockResource(
          light.id,
          {
            on: light.on,
            ...(light.brightness != null
              ? { brightness: light.brightness }
              : {}),
          },
          options,
        );
      }
      for (const group of useHueResourcesStore.getState().roomZones) {
        if (group.groupedLightId && group.lightIds.some((id) => ids.has(id))) {
          lockResource(
            group.groupedLightId,
            {
              on: group.anyOn,
              ...(group.brightness != null
                ? { brightness: group.brightness }
                : {}),
            },
            options,
          );
        }
      }
      refresh = setTimeout(
        () => {
          void useHueResourcesStore.getState().loadAll();
        },
        payload.length ? 2100 : 0,
      );
    });
    return () => {
      clearTimeout(refresh);
      void unlisten.then((dispose) => dispose());
    };
  }, []);

  useEffect(() => {
    // The setup wizard prefetches resources before entering Home so the reveal
    // lands on a ready screen; skip the duplicate load when that already ran.
    if (!useHueResourcesStore.getState().hasLoaded) {
      void useHueResourcesStore.getState().loadAll();
    }
  }, []);

  useEffect(() => {
    void invoke("start-hue-events").catch(() => {
      // Non-fatal: controls still work, they just won't passively update.
    });

    let refresh: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    let refreshing = false;
    let refreshPending = false;
    const refreshResources = async () => {
      if (disposed || refreshing) return;
      refreshing = true;
      try {
        // Keep a second refresh when an edit arrives during an in-flight read.
        while (refreshPending && !disposed) {
          refreshPending = false;
          await useHueResourcesStore.getState().loadAll();
        }
      } finally {
        refreshing = false;
      }
    };
    const unlisten = listen<HueEventUpdate[]>("hue-event", (event) => {
      useHueResourcesStore.getState().applyHueEvents(event.payload);
      if (event.payload.some((update) => update.resourcesChanged)) {
        refreshPending = true;
        clearTimeout(refresh);
        refresh = setTimeout(() => void refreshResources(), 150);
      }
    });

    return () => {
      disposed = true;
      clearTimeout(refresh);
      void unlisten.then((dispose) => dispose());
    };
  }, []);

  useEffect(() => {
    const unlisten = listen<{ connected: boolean }>(
      "hue-connection",
      (event) => {
        const wasConnected = useHueResourcesStore.getState().bridgeConnected;
        if (event.payload.connected === wasConnected) return;
        useHueResourcesStore.setState({
          bridgeConnected: event.payload.connected,
        });
        // Back online after an outage: reload everything, since any changes
        // made while unreachable (or from other apps) were missed.
        if (event.payload.connected) {
          void useHueResourcesStore.getState().loadAll();
        }
      },
    );

    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, []);

  return null;
};
