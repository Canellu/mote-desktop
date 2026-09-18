import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { DeviceDiscoveryRoute } from "./routes/DeviceDiscoveryRoute";
import { EntertainmentAreaSyncRoute } from "./routes/EntertainmentAreaSyncRoute";
import { EntertainmentAreaWizardRoute } from "./routes/EntertainmentAreaWizardRoute";
import { EntertainmentPlacementRoute } from "./routes/EntertainmentPlacementRoute";
import { HomeRoute } from "./routes/HomeRoute";
import { validateHomeViewSearch } from "./features/home-map/homeView";
import { preloadAppSettings } from "./features/settings-screen/appSettingsCache";
import { RoomZoneWizardRoute } from "./routes/RoomZoneWizardRoute";
import { RootLayout } from "./routes/RootLayout";
import { SettingsRoute } from "./routes/SettingsRoute";
import { SpaceRoute } from "./routes/SpaceRoute";
import { SyncHubRoute } from "./routes/SyncHubRoute";
import { WidgetWizardRoute } from "./routes/WidgetWizardRoute";

// Hash history keeps routes reload-safe in the desktop webview while adding
// them to its native history, so mouse Back/Forward buttons work.
const rootRoute = createRootRoute({ component: RootLayout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomeRoute,
  validateSearch: validateHomeViewSearch,
});

const spaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/space/$spaceId",
  // The inspector selection lives in the URL so it's a real history entry:
  // mouse Back closes the pane instead of leaving the space. Shape is
  // "<kind>:<id>" where kind is light | scene | group (mutually exclusive).
  validateSearch: (search: Record<string, unknown>): { inspect?: string } =>
    typeof search.inspect === "string" &&
    /^(light|scene|group):.+/.test(search.inspect)
      ? { inspect: search.inspect }
      : {},
  component: SpaceRoute,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
    // The open automation lives in the URL so it's a real history entry: mouse
    // Back returns to the automation list instead of leaving Settings.
    ...(search.automation === "onAir" || search.automation === "away"
      ? { automation: search.automation as "onAir" | "away" }
      : {}),
    ...(typeof search.widgetId === "string"
      ? { widgetId: search.widgetId }
      : {}),
    ...(typeof search.widgetRequest === "number"
      ? { widgetRequest: search.widgetRequest }
      : {}),
  }),
  // Fetched before the screen renders (and on hover of the gear), so the window
  // preferences open on their saved values instead of defaults.
  loader: preloadAppSettings,
  component: SettingsRoute,
});

const deviceDiscoveryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings/device-discovery",
  component: DeviceDiscoveryRoute,
});

const widgetWizardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings/widget-wizard",
  validateSearch: (search: Record<string, unknown>) => {
    const rawStep = Number(search.step);
    const step =
      import.meta.env.DEV &&
      Number.isInteger(rawStep) &&
      rawStep >= 0 &&
      rawStep <= 2
        ? rawStep
        : undefined;
    return step === undefined ? {} : { step };
  },
  component: WidgetWizardRoute,
});

const roomZoneWizardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings/spaces-wizard",
  component: RoomZoneWizardRoute,
});

const entertainmentAreaWizardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings/entertainment-wizard",
  validateSearch: (search: Record<string, unknown>) => ({
    from: search.from === "sync" ? ("sync" as const) : undefined,
  }),
  component: EntertainmentAreaWizardRoute,
});

const entertainmentPlacementRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings/entertainment-placement/$areaId",
  validateSearch: (search: Record<string, unknown>) => ({
    // Where the editor was opened from, so Back can return there.
    from: search.from === "sync" ? ("sync" as const) : undefined,
  }),
  component: EntertainmentPlacementRoute,
});

const syncHubRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sync",
  validateSearch: (search: Record<string, unknown>) => ({
    source: search.source === "box" ? ("box" as const) : undefined,
  }),
  component: SyncHubRoute,
});

const entertainmentAreaSyncRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sync/$areaId",
  component: EntertainmentAreaSyncRoute,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  spaceRoute,
  settingsRoute,
  deviceDiscoveryRoute,
  widgetWizardRoute,
  roomZoneWizardRoute,
  entertainmentAreaWizardRoute,
  entertainmentPlacementRoute,
  syncHubRoute,
  entertainmentAreaSyncRoute,
]);

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  defaultPreload: "intent",
  defaultStaleTime: 5000,
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
