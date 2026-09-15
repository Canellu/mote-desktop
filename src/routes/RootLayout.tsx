import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { useEntitlements } from "@/context/EntitlementContext";
import { useHue } from "@/context/HueContext";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getRoomZoneIcon } from "@/features/home-screen/components/room-zone-icons";
import { readStoredGroupingMode } from "@/features/home-screen/utils/homeLayout";
import {
  resolveHomeView,
  type HomeViewSearch,
} from "@/features/home-map/homeView";
import { GroupPane } from "@/features/space-screen/components/GroupPane";
import { LightPane } from "@/features/space-screen/components/LightPane";
import { ScenePane } from "@/features/space-screen/components/ScenePane";
import { useInspector } from "@/features/space-screen/hooks/useInspector";
import { cn } from "@/lib/utils";
import {
  HueResourcesStoreEffects,
  useHueResourcesStore,
} from "@/stores/HueResourcesStore";
import type { HueLight, HueRoomZone, HueScene } from "@/types/hue";
import {
  EntertainmentStoreEffects,
  useEntertainmentStore,
} from "@/stores/EntertainmentStore";
import { useSyncBoxStore } from "@/stores/SyncBoxStore";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SyncBoxSession } from "@/types/sync-box";
import { ChevronRight, Loader2, Plus, TriangleAlert, Tv } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

/** Whichever resource the inspector is currently showing. */
type InspectorContent =
  | { kind: "light"; id: string; light: HueLight }
  | { kind: "scene"; id: string; scene: HueScene }
  | { kind: "group"; id: string; roomZone: HueRoomZone; lights: HueLight[] };

const getInspectorPaneWidth = () => {
  const rootFontSize = Number.parseFloat(
    getComputedStyle(document.documentElement).fontSize,
  );
  return Math.min(
    28 * rootFontSize,
    Math.max(20 * rootFontSize, innerWidth * 0.4),
  );
};

/**
 * The inspector's real flex width animates so it continuously pushes the main
 * content aside. The full-width panel translates in from beyond the right edge
 * in sync, giving it the same movement as a sheet without using an overlay.
 */
const LightInspector: React.FC = () => {
  const {
    lights,
    scenes,
    roomZones,
    hueEventRevision,
    setLightState,
    setLightColor,
    setRoomZoneState,
  } = useHueResourcesStore(
    useShallow((state) => ({
      lights: state.lights,
      scenes: state.scenes,
      roomZones: state.roomZones,
      hueEventRevision: state.hueEventRevision,
      setLightState: state.setLightState,
      setLightColor: state.setLightColor,
      setRoomZoneState: state.setRoomZoneState,
    })),
  );
  const syncedLightIds = useEntertainmentStore((state) => state.syncedLightIds);

  // The pane's open state and selection both live in the URL (see useInspector),
  // so mouse Back/Forward walk in and out of it like any other navigation.
  const { selection, isOpen, close } = useInspector();
  const selectedLightId = selection?.kind === "light" ? selection.id : null;
  const selectedGroupId = selection?.kind === "group" ? selection.id : null;
  const selectedSceneId = selection?.kind === "scene" ? selection.id : null;

  // The inspector only opens from inside a space, so resolve which room/zone is
  // on screen — the light pane removes a light from *this* space specifically.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeSpace = useMemo<HueRoomZone | null>(() => {
    if (!pathname.startsWith("/space/")) return null;
    const id = decodeURIComponent(pathname.slice("/space/".length));
    return roomZones.find((roomZone) => roomZone.id === id) ?? null;
  }, [pathname, roomZones]);

  // Light and scene selection are mutually exclusive; resolve whichever is set
  // to a single content descriptor the panel renders.
  const current = useMemo<InspectorContent | null>(() => {
    if (selectedLightId) {
      const light = lights.find((l) => l.id === selectedLightId);
      return light ? { kind: "light", id: light.id, light } : null;
    }
    if (selectedGroupId) {
      const roomZone = roomZones.find((r) => r.id === selectedGroupId);
      if (!roomZone) return null;
      const ids = new Set(roomZone.lightIds);
      const syncedIds = new Set(syncedLightIds);
      const members = lights
        .filter((light) => ids.has(light.id) && !syncedIds.has(light.id))
        .sort((a, b) => a.name.localeCompare(b.name));
      return { kind: "group", id: roomZone.id, roomZone, lights: members };
    }
    if (selectedSceneId) {
      const scene = scenes.find((s) => s.id === selectedSceneId);
      return scene ? { kind: "scene", id: scene.id, scene } : null;
    }
    return null;
  }, [
    selectedLightId,
    selectedGroupId,
    selectedSceneId,
    lights,
    scenes,
    roomZones,
    syncedLightIds,
  ]);

  const open = isOpen;
  const reduceMotion = useReducedMotion();
  const [paneWidth, setPaneWidth] = useState(getInspectorPaneWidth);
  const transition = {
    duration: reduceMotion ? 0 : 0.3,
    ease: [0.4, 0, 0.2, 1] as const,
  };

  useEffect(() => {
    const updatePaneWidth = () => setPaneWidth(getInspectorPaneWidth());
    window.addEventListener("resize", updatePaneWidth);
    return () => window.removeEventListener("resize", updatePaneWidth);
  }, []);

  // Keep showing the last content while the panel animates closed, so it
  // doesn't blank out before it is fully clipped.
  const [shown, setShown] = useState<InspectorContent | null>(null);
  useEffect(() => {
    if (current) setShown(current);
  }, [current]);

  const content = current ?? (open ? null : shown);
  const contentKey = content ? `${content.kind}:${content.id}` : "empty";

  return (
    <motion.aside
      initial={false}
      animate={{ width: open ? paneWidth : 0 }}
      transition={transition}
      className="relative shrink-0"
      inert={!open}
      onAnimationComplete={() => {
        if (!open) setShown(null);
      }}
    >
      <motion.div
        initial={false}
        animate={{
          x: open ? 0 : paneWidth,
          opacity: open ? 1 : 0,
        }}
        transition={transition}
        className="absolute inset-y-0 right-0 h-full shrink-0 p-6 pl-0"
        style={{ width: paneWidth }}
      >
        <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-card text-card-foreground">
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={contentKey}
              initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: reduceMotion ? 0 : 0.18,
                ease: "easeOut",
              }}
              className="h-full"
            >
              {content ? (
                content.kind === "light" ? (
                  <LightPane
                    light={content.light}
                    space={activeSpace}
                    hueEventRevision={hueEventRevision}
                    onClose={close}
                    onLightToggle={(l, on) => setLightState(l, on, null)}
                    onLightBrightness={(l, pct, phase) =>
                      setLightState(l, pct > 0, pct, phase)
                    }
                    onLightColor={(l, change) => setLightColor(l, change)}
                  />
                ) : content.kind === "group" ? (
                  <GroupPane
                    roomZone={content.roomZone}
                    lights={content.lights}
                    hueEventRevision={hueEventRevision}
                    onClose={close}
                    onToggle={(g, on) => setRoomZoneState(g, on, null)}
                    onBrightness={(g, pct, phase) =>
                      setRoomZoneState(g, pct > 0, pct, phase)
                    }
                    onLightColor={(l, change) => setLightColor(l, change)}
                  />
                ) : (
                  <ScenePane scene={content.scene} onClose={close} />
                )
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
                  <p className="font-heading text-lg font-medium text-foreground">
                    Nothing selected
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Click a light or scene tile to show it here.
                  </p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.aside>
  );
};

/** Header wired to the Hue resources store; split out so it can read the data layer. */
const ShellHeader: React.FC = () => {
  const [spaceEditMode, setSpaceEditMode] = useState<
    "customize" | "manage" | null
  >(null);
  const {
    roomZones,
    homeName,
    isEditLayoutMode,
    groupingMode,
    setGroupingMode,
    enterEditLayout,
    cancelEditLayout,
    saveEditLayout,
    openCreateSection,
  } = useHueResourcesStore(
    useShallow((state) => ({
      roomZones: state.roomZones,
      homeName: state.homeName,
      isEditLayoutMode: state.isEditLayoutMode,
      groupingMode: state.groupingMode,
      setGroupingMode: state.setGroupingMode,
      enterEditLayout: state.enterEditLayout,
      cancelEditLayout: state.cancelEditLayout,
      saveEditLayout: state.saveEditLayout,
      openCreateSection: state.openCreateSection,
    })),
  );
  const { bridgeId, bridges, switchBridge, beginAddBridge } = useHue();
  const { proLapsed } = useEntitlements();

  // A custom layout outlives Pro: it stays saved, and Home shows the standard
  // grouping until Pro is back. An unknown answer is not a lapse, so this never
  // hides the layout of somebody who paid while the Store is unreachable.
  useEffect(() => {
    if (readStoredGroupingMode() !== "custom") return;
    const { showGroupingMode } = useHueResourcesStore.getState();
    if (proLapsed && groupingMode === "custom") showGroupingMode("rooms-first");
    else if (!proLapsed && groupingMode !== "custom")
      showGroupingMode("custom");
  }, [proLapsed, groupingMode]);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const homeSearch = useRouterState({
    select: (s) => s.location.search as HomeViewSearch,
  });
  const homeView = resolveHomeView(homeSearch, bridgeId);

  useEffect(() => {
    const update = (event: Event) =>
      setSpaceEditMode(
        (event as CustomEvent<"customize" | "manage" | null>).detail,
      );
    window.addEventListener("hue-space-edit-state", update);
    return () => window.removeEventListener("hue-space-edit-state", update);
  }, []);

  useEffect(() => {
    setSpaceEditMode(null);
  }, [pathname]);

  // Layout editing and Settings are Home-only; Space/Settings use Back instead.
  const onHome = pathname === "/";
  const activeSpaceId = pathname.startsWith("/space/")
    ? decodeURIComponent(pathname.slice("/space/".length))
    : null;
  const activeSpace = activeSpaceId
    ? roomZones.find((roomZone) => roomZone.id === activeSpaceId)
    : null;
  const ActiveSpaceIcon = activeSpace
    ? getRoomZoneIcon(activeSpace.class)
    : null;
  const onDeviceDiscovery = pathname === "/settings/device-discovery";
  const onWidgetWizard = pathname === "/settings/widget-wizard";
  const onSpacesWizard = pathname === "/settings/spaces-wizard";
  const onEntertainmentWizard = pathname === "/settings/entertainment-wizard";
  const entertainmentWizardFrom = useRouterState({
    select: (s) => (s.location.search as { from?: string }).from,
  });
  const onSync = pathname === "/sync";
  const entertainmentAreas = useEntertainmentStore((state) => state.areas);
  const placementAreaId = pathname.startsWith(
    "/settings/entertainment-placement/",
  )
    ? decodeURIComponent(
        pathname.slice("/settings/entertainment-placement/".length),
      )
    : null;
  const placementFrom = useRouterState({
    select: (s) => (s.location.search as { from?: string }).from,
  });
  const placementArea = placementAreaId
    ? entertainmentAreas.find((area) => area.id === placementAreaId)
    : null;
  const activeSyncAreaId = pathname.startsWith("/sync/")
    ? decodeURIComponent(pathname.slice("/sync/".length))
    : null;
  const activeSyncArea = activeSyncAreaId
    ? entertainmentAreas.find((area) => area.id === activeSyncAreaId)
    : null;
  const title = onDeviceDiscovery
    ? "Add devices"
    : onWidgetWizard
      ? "Create widget"
      : onSpacesWizard
        ? "Create room or zone"
        : onEntertainmentWizard
          ? "Create entertainment area"
          : placementAreaId
            ? "Light placement"
            : activeSyncArea
              ? activeSyncArea.name
              : onSync
                ? "Sync"
                : pathname === "/settings"
                  ? "Settings"
                  : activeSpace?.name;
  const description = onDeviceDiscovery
    ? "Discover and place Hue devices"
    : onWidgetWizard
      ? "Build a pinned desktop widget"
      : onSpacesWizard
        ? "Group your devices and lights"
        : onEntertainmentWizard
          ? "Choose compatible lights and place them"
          : placementAreaId
            ? (placementArea?.name ?? "Place your lights around the room")
            : activeSyncArea
              ? "Choose what drives this entertainment area"
              : onSync
                ? "Light sync from this PC or the HDMI Sync Box"
                : pathname === "/settings"
                  ? "Bridge & app preferences"
                  : undefined;
  return (
    <AppHeader
      onBack={
        onHome
          ? undefined
          : () =>
              void (onDeviceDiscovery
                ? navigate({ to: "/settings", search: { tab: "devices" } })
                : placementAreaId
                  ? navigate(
                      placementFrom === "sync"
                        ? {
                            to: "/sync/$areaId",
                            params: { areaId: placementAreaId },
                          }
                        : {
                            to: "/settings",
                            search: { tab: "entertainment" },
                          },
                    )
                  : activeSyncArea
                    ? navigate({ to: "/sync", search: { source: undefined } })
                    : onWidgetWizard
                      ? navigate({ to: "/settings", search: { tab: "widget" } })
                      : onSpacesWizard
                        ? navigate({
                            to: "/settings",
                            search: { tab: "spaces" },
                          })
                        : onEntertainmentWizard
                          ? navigate(
                              entertainmentWizardFrom === "sync"
                                ? {
                                    to: "/sync",
                                    search: { source: undefined },
                                  }
                                : {
                                    to: "/settings",
                                    search: { tab: "entertainment" },
                                  },
                            )
                          : navigate({ to: "/" }))
      }
      title={title}
      description={description}
      headerAction={
        onSync ? (
          <Button
            size="xl"
            onClick={() =>
              void navigate({
                to: "/settings/entertainment-wizard",
                search: { from: "sync" },
              })
            }
          >
            <Plus size={20} />
            Add entertainment areas
          </Button>
        ) : undefined
      }
      titleIcon={
        ActiveSpaceIcon ? (
          <ActiveSpaceIcon size={24} strokeWidth={2.25} />
        ) : undefined
      }
      onTitleRename={(name) =>
        window.dispatchEvent(
          new CustomEvent("hue-space-rename", { detail: name }),
        )
      }
      onTitleIconClick={() =>
        window.dispatchEvent(new CustomEvent("hue-space-edit-icon"))
      }
      titleActionLabel={
        activeSpace
          ? `Edit ${activeSpace.resourceType === "room" ? "room" : "zone"}`
          : undefined
      }
      onTitleAction={() =>
        window.dispatchEvent(new CustomEvent("hue-space-edit-request"))
      }
      onTitleManage={() =>
        window.dispatchEvent(new CustomEvent("hue-space-manage-request"))
      }
      titleEditing={activeSpace != null && spaceEditMode === "customize"}
      titleManaging={activeSpace != null && spaceEditMode === "manage"}
      onCancelTitleEdit={() =>
        window.dispatchEvent(new CustomEvent("hue-space-edit-cancel"))
      }
      onSaveTitleEdit={() =>
        window.dispatchEvent(new CustomEvent("hue-space-edit-save"))
      }
      homeName={homeName}
      bridges={bridges}
      onSwitchBridge={(bridgeId) => void switchBridge(bridgeId)}
      onAddBridge={beginAddBridge}
      showSettings={onHome}
      onOpenSettings={() =>
        void navigate({ to: "/settings", search: { tab: undefined } })
      }
      showSync={onHome}
      onOpenSync={() =>
        void navigate({ to: "/sync", search: { source: undefined } })
      }
      showEditLayout={onHome && (isEditLayoutMode || homeView === "dashboard")}
      groupingMode={groupingMode}
      onGroupingModeChange={setGroupingMode}
      isEditLayoutMode={isEditLayoutMode}
      onEditLayout={enterEditLayout}
      onCancelEditLayout={cancelEditLayout}
      onSaveEditLayout={saveEditLayout}
      onCreateSection={openCreateSection}
    />
  );
};

/**
 * Router root layout: hosts the shared data layer and the global header, and
 * renders the active route (Home / Space / Settings) into the content area.
 */
export const RootLayout: React.FC = () => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Home pins its own view-switch header and scrolls the content under it, so
  // it owns both the scroll and the padding for either view.
  const routeOwnsScroll =
    pathname === "/settings" ||
    pathname === "/" ||
    (pathname.startsWith("/settings/") &&
      (pathname.endsWith("-wizard") ||
        pathname.startsWith("/settings/entertainment-placement/")));
  // The placement editor and Home draw to the viewport edge, so the shared
  // padding would frame them in.
  const routeIsFullBleed =
    pathname.startsWith("/settings/entertainment-placement/") ||
    pathname === "/";
  const navigate = useNavigate();
  const inspectorPaneOpen = useRouterState({
    select: (state) =>
      (state.location.search as { inspect?: string }).inspect != null,
  });
  const roomZones = useHueResourcesStore((state) => state.roomZones);
  const bridgeConnected = useHueResourcesStore(
    (state) => state.bridgeConnected,
  );
  const { refreshSession, isLoading: sessionLoading } = useHue();
  const syncState = useSyncBoxStore((state) => state.state);
  const activeSyncedLightIds = useEntertainmentStore(
    (state) => state.syncedLightIds,
  );
  const syncUpdating = useSyncBoxStore((state) => state.isUpdating);
  const refreshSync = useSyncBoxStore((state) => state.refresh);
  const loadAreaLights = useSyncBoxStore((state) => state.loadAreaLights);
  const updateSync = useSyncBoxStore((state) => state.updateExecution);
  const entertainmentAreas = useEntertainmentStore((state) => state.areas);
  const pcSyncStatus = useEntertainmentStore((state) => state.pcStatus);
  const [pcStopping, setPcStopping] = useState(false);
  // The entertainment area with an active stream and who owns it: this PC's
  // engine, the Sync Box, or another application — the bridge only ever runs
  // one stream at a time.
  const activeSync = (() => {
    const area = entertainmentAreas.find(
      (candidate) => candidate.status === "active",
    );
    if (!area) return null;
    const ownedByPc =
      pcSyncStatus.areaId === area.id &&
      (pcSyncStatus.state === "running" || pcSyncStatus.state === "starting");
    const boxGroup = syncState
      ? Object.entries(syncState.hue.groups).find(
          ([id, group]) =>
            syncState.execution.syncActive &&
            syncState.execution.hueTarget === id &&
            group.name.trim().toLocaleLowerCase() ===
              area.name.trim().toLocaleLowerCase(),
        )
      : undefined;
    // The bridge reports the external owner's name through the box's group
    // list when a box is paired; otherwise the app id is all we have.
    const externalOwner = syncState
      ? Object.values(syncState.hue.groups).find((group) => group.active)?.owner
      : undefined;
    return {
      area,
      owner: ownedByPc
        ? ("pc" as const)
        : boxGroup
          ? ("box" as const)
          : ("other" as const),
      ownerLabel: ownedByPc
        ? "this PC"
        : boxGroup
          ? "the Sync Box"
          : (externalOwner ?? "another app"),
    };
  })();
  const activeSpace = pathname.startsWith("/space/")
    ? roomZones.find(
        (roomZone) =>
          roomZone.id === decodeURIComponent(pathname.slice("/space/".length)),
      )
    : null;
  const activeSpaceSyncedLightCount = activeSpace
    ? activeSpace.lightIds.filter((id) => activeSyncedLightIds.includes(id))
        .length
    : 0;
  const showSyncBanner = pathname === "/" || activeSpaceSyncedLightCount > 0;
  const openSyncControls = () => {
    if (!activeSync) return;
    void navigate({
      to: "/sync/$areaId",
      params: { areaId: activeSync.area.id },
    });
  };

  useEffect(() => {
    let interval: number | undefined;
    void invoke<SyncBoxSession>("get-sync-box-session").then((session) => {
      if (!session.configured) return;
      void refreshSync().then(loadAreaLights);
      interval = window.setInterval(() => void refreshSync(), 1500);
    });
    return () => {
      if (interval) window.clearInterval(interval);
    };
  }, [loadAreaLights, refreshSync]);

  // The viewport is a single persistent element across route changes, so its
  // scroll offset would otherwise carry over to the next page. Reset to the top
  // whenever the route changes.
  useEffect(() => {
    viewportRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  useEffect(() => {
    const unlisten = listen<{ widgetId: string }>(
      "open-widget-settings",
      (event) => {
        void navigate({
          to: "/settings",
          search: {
            tab: "widget",
            widgetId: event.payload.widgetId,
            widgetRequest: Date.now(),
          },
        });
      },
    );
    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, [navigate]);

  // Double-clicking a widget control card jumps here: open the targeted
  // room/zone's Space screen. We land on the space itself (no inspector pane) —
  // the same view you'd get tapping the space on Home. The backend only ever
  // sends room/zone kinds, so `inspect` stays clear.
  useEffect(() => {
    const unlisten = listen<{ kind: string; id: string }>(
      "open-widget-target",
      (event) => {
        void navigate({
          to: "/space/$spaceId",
          params: { spaceId: event.payload.id },
          search: {},
        });
      },
    );
    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, [navigate]);

  return (
    <>
      <HueResourcesStoreEffects />
      <EntertainmentStoreEffects />
      <div className="flex h-full flex-col">
        <ShellHeader />
        {!bridgeConnected && (
          <div className="mx-12 mb-2 flex items-center gap-4 rounded-2xl border border-destructive/25 bg-destructive/10 px-5 py-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-destructive/15 text-(--destructive-text)">
              <TriangleAlert size={21} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">Hue Bridge unreachable</p>
              <p className="truncate text-sm text-muted-foreground">
                Trying to reconnect automatically. Check that the bridge is
                powered and on your network.
              </p>
            </div>
            <Button
              variant="outline"
              disabled={sessionLoading}
              onClick={() => void refreshSession()}
            >
              {sessionLoading && <Loader2 className="animate-spin" />}
              Reconnect
            </Button>
          </div>
        )}
        {showSyncBanner && activeSync && (
          <div
            role="button"
            tabIndex={0}
            aria-label={`Open sync controls for ${activeSync.area.name}`}
            onClick={openSyncControls}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openSyncControls();
              }
            }}
            className="mx-12 mb-2 flex cursor-pointer items-center gap-4 rounded-2xl border border-primary/25 bg-primary/10 px-5 py-3 outline-none transition-colors hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Tv size={21} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">Light sync is active</p>
              <p className="truncate text-sm text-muted-foreground">
                {(() => {
                  const subject =
                    activeSpace && activeSpaceSyncedLightCount > 0
                      ? `${activeSpaceSyncedLightCount} ${activeSpaceSyncedLightCount === 1 ? "light" : "lights"} in ${activeSpace.name} ${activeSpaceSyncedLightCount === 1 ? "is" : "are"}`
                      : `${activeSync.area.name} is`;
                  return activeSync.owner === "other"
                    ? `${subject} syncing with ${activeSync.ownerLabel}.`
                    : `${subject} controlled by ${activeSync.ownerLabel}. Stop sync to control those lights normally.`;
                })()}
              </p>
            </div>
            {activeSync.owner === "pc" ? (
              <Button
                variant="outline"
                disabled={pcStopping}
                onClick={(event) => {
                  event.stopPropagation();
                  setPcStopping(true);
                  void invoke("stop-host-sync")
                    .catch(() => undefined)
                    .finally(() => setPcStopping(false));
                }}
              >
                {pcStopping && <Loader2 className="animate-spin" />}
                Stop sync
              </Button>
            ) : activeSync.owner === "box" ? (
              <Button
                variant="outline"
                disabled={syncUpdating}
                onClick={(event) => {
                  event.stopPropagation();
                  void updateSync({ syncActive: false });
                }}
              >
                {syncUpdating && <Loader2 className="animate-spin" />}
                Stop sync
              </Button>
            ) : (
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
            )}
          </div>
        )}
        <div className="flex min-h-0 flex-1">
          <ScrollArea
            fade
            hideScrollbar
            viewportRef={viewportRef}
            viewportProps={
              routeOwnsScroll ? { style: { overflowY: "hidden" } } : undefined
            }
            className="min-h-0 min-w-0 flex-1"
            viewportClassName={cn(
              !routeIsFullBleed && [
                "py-6 pl-12",
                inspectorPaneOpen ? "pr-2" : "pr-12",
              ],
            )}
            contentClassName={cn(
              "min-w-0!",
              routeOwnsScroll ? "h-full" : "min-h-full",
            )}
          >
            <Outlet />
          </ScrollArea>
          <LightInspector />
        </div>
      </div>
    </>
  );
};
