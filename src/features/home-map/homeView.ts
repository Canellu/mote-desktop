export type HomeView = "dashboard" | "map";

export interface HomeViewSearch {
  view?: HomeView;
  viewBridge?: string;
  floorId?: string;
  areaId?: string;
  mapPreview?: boolean;
  /** The map editor takes over the window, so the layout reads this. */
  mapEdit?: boolean;
  /** Map creation takes over the window in the same way. */
  mapCreate?: boolean;
}

export function validateHomeViewSearch(
  search: Record<string, unknown>,
): HomeViewSearch {
  const text = (value: unknown) =>
    typeof value === "string" && value.length <= 128 ? value : undefined;
  return {
    view:
      search.view === "dashboard" || search.view === "map"
        ? search.view
        : undefined,
    viewBridge: text(search.viewBridge),
    floorId: text(search.floorId),
    areaId: text(search.areaId),
    mapPreview:
      import.meta.env.DEV && search.mapPreview === true ? true : undefined,
    mapEdit: search.mapEdit === true ? true : undefined,
    mapCreate: search.mapCreate === true ? true : undefined,
  };
}

export function readHomeView(bridgeId: string | null): HomeView {
  if (!bridgeId) return "dashboard";
  try {
    return localStorage.getItem(`mote-home-view:${bridgeId}`) === "map"
      ? "map"
      : "dashboard";
  } catch {
    return "dashboard";
  }
}

export function writeHomeView(bridgeId: string | null, view: HomeView): void {
  if (!bridgeId) return;
  try {
    localStorage.setItem(`mote-home-view:${bridgeId}`, view);
  } catch {
    // View selection still works through route state when storage is unavailable.
  }
}

export function readMapSelection(
  bridgeId: string | null,
): Pick<HomeViewSearch, "floorId" | "areaId"> {
  if (!bridgeId) return {};
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(`mote-map-selection:${bridgeId}`) ?? "null",
    );
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const { floorId, areaId } = validateHomeViewSearch(
      value as Record<string, unknown>,
    );
    return { floorId, areaId };
  } catch {
    return {};
  }
}

export function writeMapSelection(
  bridgeId: string | null,
  floorId: string,
  areaId: string | null,
): void {
  if (!bridgeId) return;
  try {
    localStorage.setItem(
      `mote-map-selection:${bridgeId}`,
      JSON.stringify({ floorId, areaId: areaId ?? undefined }),
    );
  } catch {
    // Back/Forward still restores selection through route state.
  }
}

export const homeSearchMatchesBridge = (
  search: HomeViewSearch,
  bridgeId: string | null,
): boolean =>
  search.viewBridge === undefined ||
  search.viewBridge === (bridgeId ?? "preview");

export function resolveHomeView(
  search: HomeViewSearch,
  bridgeId: string | null,
): HomeView {
  return (
    (homeSearchMatchesBridge(search, bridgeId) ? search.view : undefined) ??
    readHomeView(bridgeId)
  );
}
