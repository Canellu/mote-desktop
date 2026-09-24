import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import {
  isAutomationPage,
  type AutomationsSearch,
} from "./features/automations/model";
import { AutomationsRoute } from "./routes/AutomationsRoute";
import { DeviceDiscoveryRoute } from "./routes/DeviceDiscoveryRoute";
import { EntertainmentAreaSyncRoute } from "./routes/EntertainmentAreaSyncRoute";
import { EntertainmentAreaWizardRoute } from "./routes/EntertainmentAreaWizardRoute";
import { EntertainmentPlacementRoute } from "./routes/EntertainmentPlacementRoute";
import { FocusRoute } from "./routes/FocusRoute";
import { FocusWizardRoute } from "./routes/FocusWizardRoute";
import { HomeRoute } from "./routes/HomeRoute";
import { validateHomeViewSearch } from "./features/home-map/homeView";
import { preloadAppSettings } from "./features/settings-screen/appSettingsCache";
import { RoomZoneWizardRoute } from "./routes/RoomZoneWizardRoute";
import { RootLayout } from "./routes/RootLayout";
import { SettingsRoute } from "./routes/SettingsRoute";
import { CreateSceneRoute } from "./routes/CreateSceneRoute";
import { SpaceRoute } from "./routes/SpaceRoute";
import { SyncHubRoute } from "./routes/SyncHubRoute";
import { WidgetWizardRoute } from "./routes/WidgetWizardRoute";
import { AutomationWizardRoute } from "./routes/AutomationWizardRoute";

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
    ...(typeof search.widgetId === "string"
      ? { widgetId: search.widgetId }
      : {}),
    ...(typeof search.widgetRequest === "number"
      ? { widgetRequest: search.widgetRequest }
      : {}),
  }),
  // Automations used to be a Settings tab; a restored history entry still
  // lands on them.
  beforeLoad: ({ search }) => {
    if (search.tab === "automations")
      throw redirect({ to: "/automations", replace: true });
  },
  // Fetched before the screen renders (and on hover of the gear), so the window
  // preferences open on their saved values instead of defaults.
  loader: preloadAppSettings,
  component: SettingsRoute,
});

const automationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/automations",
  // The open automation lives in the URL so it's a real history entry: mouse
  // Back returns to the automation list instead of leaving the screen.
  validateSearch: (search: Record<string, unknown>): AutomationsSearch => ({
    ...(isAutomationPage(search.automation)
      ? { automation: search.automation }
      : {}),
    ...(typeof search.calendarRuleId === "string"
      ? { calendarRuleId: search.calendarRuleId }
      : {}),
  }),
  component: AutomationsRoute,
});

const automationWizardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/automations/new",
  component: AutomationWizardRoute,
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

const createSceneRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings/scenes/new",
  component: CreateSceneRoute,
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

const focusRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/focus",
  component: FocusRoute,
});

const focusWizardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/focus/new",
  component: FocusWizardRoute,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  spaceRoute,
  settingsRoute,
  automationsRoute,
  automationWizardRoute,
  deviceDiscoveryRoute,
  widgetWizardRoute,
  roomZoneWizardRoute,
  createSceneRoute,
  entertainmentAreaWizardRoute,
  entertainmentPlacementRoute,
  syncHubRoute,
  entertainmentAreaSyncRoute,
  focusRoute,
  focusWizardRoute,
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
