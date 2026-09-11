export type HomeView = "dashboard" | "map";

/**
 * The map is still being built, so it does not ship: a release build resolves
 * Home to the dashboard, never offers the view switch, and drops the map's
 * navigation state from the URL. Development keeps the whole feature live.
 * Delete this gate — and the checks that read it — when the map ships.
 */
export const mapFeatureEnabled = import.meta.env.DEV;

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

/**
 * Bounds and narrows the map's navigation values. Kept separate from the route
 * validator because stored selections are read back through it too, and those
 * still need checking in a build that never routes to the map.
 */
function sanitizeHomeViewSearch(
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

export function validateHomeViewSearch(
  search: Record<string, unknown>,
  enabled: boolean = mapFeatureEnabled,
): HomeViewSearch {
  // Every field here is map navigation state, so a gated build accepts none of
  // it from the URL: a typed `?view=map` simply lands on the dashboard.
  //
  // `enabled` is a parameter rather than a direct read so both sides stay
  // testable. `import.meta.env.DEV` is undefined under `bun test`, so a gate
  // read inline here would make every test assert the shipped path and quietly
  // stop covering the other one.
  return enabled ? sanitizeHomeViewSearch(search) : {};
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
    const { floorId, areaId } = sanitizeHomeViewSearch(
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
  enabled: boolean = mapFeatureEnabled,
): HomeView {
  // The route and the header both ask here, so the gate answers once for both
  // and a "map" preference left behind by a development build stays inert.
  if (!enabled) return "dashboard";
  return (
    (homeSearchMatchesBridge(search, bridgeId) ? search.view : undefined) ??
    readHomeView(bridgeId)
  );
}
