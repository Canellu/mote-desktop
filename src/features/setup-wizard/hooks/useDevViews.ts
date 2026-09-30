import type { BridgeKind } from "@/types/setup-wizard";
import { useEffect, useRef, useState } from "react";
import {
  DEV_DEFAULT_BRIDGE_COUNT,
  DEV_DEFAULT_PAIRING_KIND,
  wizardDevStates,
} from "../constants";
import {
  SYNC_BOX_CONNECTED_DEV_VIEW_ID,
  syncBoxWizardDevStates,
} from "@/features/sync-box/constants";

type AppDevViewId =
  | "splash"
  | "disconnected"
  | "error-boundary"
  | "home-preview";

const appDevViewOptions: { id: AppDevViewId; label: string }[] = [
  { id: "splash", label: "Splash" },
  { id: "disconnected", label: "Disconnected" },
  { id: "error-boundary", label: "Error" },
  { id: "home-preview", label: "Ready app" },
];

/** Dev-only id for the component gallery / living style guide. */
export const COMPONENT_GALLERY_VIEW_ID = "component-gallery";

/** Dev-only id for the hardware-illustration showcase (bridges + sync box). */
export const DEVICE_GALLERY_VIEW_ID = "device-gallery";

/** Dev-only id for Settings > Devices filled with a made-up home. */
export const DEVICES_PREVIEW_VIEW_ID = "devices-preview";

/** Dev-only id for the app-level error boundary fallback preview. */
export const ERROR_BOUNDARY_VIEW_ID = "error-boundary";

/**
 * Dev-only previews of the create-widget wizard, one entry per screen. Each maps
 * to a step the `WidgetWizard` mounts on, so the toolbar can jump
 * straight to a single screen to work on it.
 */
export const widgetWizardDevViews = [
  { id: "widget-wizard-profile", label: "Profile", step: 0 },
  { id: "widget-wizard-targets", label: "Controls", step: 1 },
  { id: "widget-wizard-configure", label: "Configure", step: 2 },
] as const;

/** Maps a dev view id to the wizard step it previews, or null if unrelated. */
export const widgetWizardStepForViewId = (viewId: string): number | null =>
  widgetWizardDevViews.find((view) => view.id === viewId)?.step ?? null;

// Toolbar groups: the component gallery, the app-level preview states, the
// create-widget wizard screens, then every setup wizard dev state. The gallery
// sits in its own group above "App".
export const devViewGroups = [
  {
    label: "Design",
    options: [
      { id: COMPONENT_GALLERY_VIEW_ID, label: "Components" },
      { id: DEVICE_GALLERY_VIEW_ID, label: "Devices" },
      { id: DEVICES_PREVIEW_VIEW_ID, label: "Devices settings" },
    ],
  },
  { label: "App", options: appDevViewOptions },
  {
    label: "Widget Wizard",
    options: widgetWizardDevViews.map(({ id, label }) => ({ id, label })),
  },
  {
    label: "Pairing Wizard",
    options: wizardDevStates.map(({ id, label }) => ({ id, label })),
  },
  {
    label: "Sync Box Wizard",
    options: [
      ...syncBoxWizardDevStates.map(({ id, label }) => ({ id, label })),
      { id: SYNC_BOX_CONNECTED_DEV_VIEW_ID, label: "Connected" },
    ],
  },
];

const DEV_RETRY_MS = 2000;

const getDevViewsEnabled = () => {
  if (!import.meta.env.DEV) return false;

  const value = import.meta.env.VITE_DEV_VIEWS?.trim().toLowerCase();
  return value === "1" || value === "true";
};

/**
 * Dev-only state machine behind the wizard dev toolbar: which preview view is
 * showing, the simulated bridge count, and the faked "retry" spinner on the
 * disconnected preview. Inert (and renders nothing extra) unless VITE_DEV_VIEWS
 * is set in a DEV build.
 */
export const useDevViews = () => {
  const [enabled] = useState(getDevViewsEnabled);
  const [viewId, setViewId] = useState("welcome");
  const [bridgeCount, setBridgeCount] = useState(DEV_DEFAULT_BRIDGE_COUNT);
  const [pairingKind, setPairingKind] = useState<BridgeKind>(
    DEV_DEFAULT_PAIRING_KIND,
  );
  const [retryLoading, setRetryLoading] = useState(false);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, []);

  const selectView = (id: string) => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    setRetryLoading(false);
    setViewId(id);
  };

  // Fakes a connection retry on the disconnected preview: show the splash
  // briefly, then fall back to disconnected.
  const startRetryTransition = () => {
    if (viewId !== "disconnected") return;
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);

    setRetryLoading(true);
    retryTimeoutRef.current = setTimeout(() => {
      setRetryLoading(false);
      retryTimeoutRef.current = null;
    }, DEV_RETRY_MS);
  };

  return {
    enabled,
    viewId,
    setViewId,
    bridgeCount,
    setBridgeCount,
    pairingKind,
    setPairingKind,
    retryLoading,
    selectView,
    startRetryTransition,
    groups: devViewGroups,
  };
};
