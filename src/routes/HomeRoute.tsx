import { useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useHue } from "@/context/HueContext";
import { HomeMapView } from "@/features/home-map/HomeMapView";
import { HomeViewSwitch } from "@/features/home-map/components/HomeViewSwitch";
import {
  homeSearchMatchesBridge,
  mapFeatureEnabled,
  resolveHomeView,
  readMapSelection,
  writeHomeView,
  writeMapSelection,
  type HomeView,
  type HomeViewSearch,
} from "@/features/home-map/homeView";
import { HomeScreen } from "@/features/home-screen/HomeScreen";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";

export const HomeRoute: React.FC = () => {
  const {
    roomZones,
    lights,
    isLoading,
    error,
    displayLayout,
    draftLayout,
    isEditLayoutMode,
    hueEventRevision,
    setDraftLayout,
    setAllLightsState,
    setRoomZoneState,
    isCreatingSection,
    createLayoutSection,
    closeCreateSection,
    renameLayoutSection,
  } = useHueResourcesStore(
    useShallow((state) => ({
      roomZones: state.roomZones,
      lights: state.lights,
      isLoading: state.isLoading,
      error: state.error,
      displayLayout: state.displayLayout,
      draftLayout: state.draftLayout,
      isEditLayoutMode: state.isEditLayoutMode,
      hueEventRevision: state.hueEventRevision,
      setDraftLayout: state.setDraftLayout,
      setAllLightsState: state.setAllLightsState,
      setRoomZoneState: state.setRoomZoneState,
      isCreatingSection: state.isCreatingSection,
      createLayoutSection: state.createLayoutSection,
      closeCreateSection: state.closeCreateSection,
      renameLayoutSection: state.renameLayoutSection,
    })),
  );
  const navigate = useNavigate();
  // The map renders its own actions into the shared header row.
  const [mapActions, setMapActions] = useState<HTMLDivElement | null>(null);
  const { bridgeId } = useHue();
  const search = useSearch({ from: "/" });
  const scopedSearch = homeSearchMatchesBridge(search, bridgeId) ? search : {};
  // Only the map reads a selection, so a gated build skips the stored lookup
  // rather than touching preferences for a screen it will never show.
  const selection = !mapFeatureEnabled
    ? {}
    : scopedSearch.mapPreview || scopedSearch.floorId !== undefined
      ? scopedSearch
      : readMapSelection(bridgeId);
  const view = isEditLayoutMode
    ? "dashboard"
    : resolveHomeView(search, bridgeId);
  const openSpace = (id: string) =>
    void navigate({ to: "/space/$spaceId", params: { spaceId: id } });
  function navigateHome(next: HomeViewSearch) {
    void navigate({
      to: "/",
      search: { ...next, viewBridge: bridgeId ?? "preview" },
    });
  }
  function changeView(next: HomeView) {
    writeHomeView(bridgeId, next);
    navigateHome({ ...scopedSearch, view: next, mapPreview: undefined });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* One header row for both views, with the same padding and the same
        place in the layout, so the switch never moves as the view changes.
        With the map gated out there is nothing to switch between, so the row
        goes too rather than leaving an empty band above the dashboard. */}
      {mapFeatureEnabled && (
        <div
          className={`flex shrink-0 items-center gap-4 px-12 pt-6 ${
            view === "map" ? "pb-4" : "pb-6"
          }`}
        >
          <HomeViewSwitch
            value={view}
            onChange={changeView}
            disabled={isEditLayoutMode}
          />
          {view === "map" && (
            <div
              ref={setMapActions}
              role="toolbar"
              aria-label="Map actions"
              className="ml-auto flex min-w-0 items-center gap-2"
            />
          )}
        </div>
      )}
      {mapFeatureEnabled && view === "map" ? (
        <HomeMapView
          key={bridgeId ?? "no-bridge"}
          bridgeId={bridgeId}
          actionsSlot={mapActions}
          floorId={selection.floorId}
          areaId={selection.areaId}
          preview={scopedSearch.mapPreview === true}
          roomZones={roomZones}
          onSelect={(floorId, areaId) => {
            if (!scopedSearch.mapPreview)
              writeMapSelection(bridgeId, floorId, areaId);
            navigateHome({
              ...scopedSearch,
              view: "map",
              floorId,
              areaId: areaId ?? undefined,
            });
          }}
          onOpenSpace={(id) => {
            writeHomeView(bridgeId, "map");
            if (selection.floorId)
              writeMapSelection(
                bridgeId,
                selection.floorId,
                selection.areaId ?? null,
              );
            openSpace(id);
          }}
          onStartOver={() =>
            navigateHome({
              ...scopedSearch,
              view: "map",
              floorId: undefined,
              areaId: undefined,
              mapPreview: undefined,
              mapEdit: undefined,
              mapCreate: true,
            })
          }
          creating={scopedSearch.mapCreate === true}
          onCreatingChange={(next) =>
            navigateHome({
              ...scopedSearch,
              view: "map",
              mapCreate: next ? true : undefined,
            })
          }
          editing={view === "map" && scopedSearch.mapEdit === true}
          onEditingChange={(next) =>
            navigateHome({
              ...scopedSearch,
              view: "map",
              mapEdit: next ? true : undefined,
            })
          }
          onPreview={() => navigateHome({ view: "map", mapPreview: true })}
          onDashboard={() => changeView("dashboard")}
        />
      ) : (
        <ScrollArea
          fade
          hideScrollbar
          className="min-h-0 flex-1"
          // Without the header row above it the dashboard owns its own top
          // padding, so the content never sits flush against the title bar.
          viewportClassName={
            mapFeatureEnabled ? "px-12 pb-6" : "px-12 pt-6 pb-6"
          }
        >
          <HomeScreen
            roomZones={roomZones}
            lights={lights}
            isLoading={isLoading}
            error={error}
            layout={isEditLayoutMode ? draftLayout : displayLayout}
            editing={isEditLayoutMode}
            hueEventRevision={hueEventRevision}
            onLayoutChange={setDraftLayout}
            onOpenSpace={openSpace}
            onAllLightsToggle={setAllLightsState}
            onRoomZoneToggle={(roomZone, on) =>
              setRoomZoneState(roomZone, on, null)
            }
            onRoomZoneBrightness={(roomZone, pct, phase) =>
              setRoomZoneState(roomZone, pct > 0, pct, phase)
            }
            isCreatingSection={isCreatingSection}
            onCreateSection={createLayoutSection}
            onCloseCreateSection={closeCreateSection}
            onRenameSection={renameLayoutSection}
          />
        </ScrollArea>
      )}
    </div>
  );
};
