import { useNavigate, useSearch } from "@tanstack/react-router";
import { useShallow } from "zustand/react/shallow";
import { useHue } from "@/context/HueContext";
import { HomeMapView } from "@/features/home-map/HomeMapView";
import { HomeViewSwitch } from "@/features/home-map/components/HomeViewSwitch";
import {
  homeSearchMatchesBridge,
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
  const { bridgeId } = useHue();
  const search = useSearch({ from: "/" });
  const scopedSearch = homeSearchMatchesBridge(search, bridgeId) ? search : {};
  const selection =
    scopedSearch.mapPreview || scopedSearch.floorId !== undefined
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
      viewTransition: false,
      search: { ...next, viewBridge: bridgeId ?? "preview" },
    });
  }
  function changeView(next: HomeView) {
    writeHomeView(bridgeId, next);
    navigateHome({ ...scopedSearch, view: next, mapPreview: undefined });
  }

  return (
    <div
      className={view === "map" ? "flex h-full min-h-0 flex-col" : "space-y-6"}
    >
      <div className={view === "map" ? "shrink-0 px-6 py-2" : undefined}>
        <HomeViewSwitch
          value={view}
          onChange={changeView}
          disabled={isEditLayoutMode}
        />
      </div>
      {view === "map" ? (
        <HomeMapView
          key={bridgeId ?? "no-bridge"}
          bridgeId={bridgeId}
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
      )}
    </div>
  );
};
