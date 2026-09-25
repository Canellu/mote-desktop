import {
  AppContentTransition,
  type AppViewKey,
} from "@/components/AppContentTransition";
import { BridgeStatus } from "@/components/BridgeStatus";
import { DevUrlBar } from "@/components/DevUrlBar";
import Logo from "@/components/Logo";
import { StatusScreen } from "@/components/StatusScreen";
import { Button } from "@/components/ui/button";
import { ErrorScreen } from "@/components/ErrorScreen";
import { ComponentGallery } from "@/features/dev-gallery/ComponentGallery";
import { DeviceGallery } from "@/features/dev-gallery/DeviceGallery";
import { FeedbackButton } from "@/features/feedback/FeedbackButton";
import { FocusStatusButton } from "@/features/focus/FocusStatusButton";
import { UpdateButton } from "@/features/updates/UpdateButton";
import {
  sampleSyncBoxSession,
  SYNC_BOX_CONNECTED_DEV_VIEW_ID,
  syncBoxDevNextSteps,
  syncBoxWizardDevStates,
} from "@/features/sync-box/constants";
import { SyncBoxOnboardingWizard } from "@/features/sync-box/SyncBoxOnboardingWizard";
import { SyncBoxConnectedView } from "@/features/sync-box/SyncBoxScreen";
import {
  COMPONENT_GALLERY_VIEW_ID,
  DEVICE_GALLERY_VIEW_ID,
  ERROR_BOUNDARY_VIEW_ID,
  widgetWizardStepForViewId,
} from "@/features/setup-wizard/hooks/useDevViews";
import { RouterProvider } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { TitleBar } from "./components/TitleBar";
import { useHue } from "./context/HueContext";
import { WizardDevToolbar } from "./features/setup-wizard/components/WizardDevToolbar";
import {
  devNextSteps,
  wizardDevStates,
} from "./features/setup-wizard/constants";
import { useDevViews } from "./features/setup-wizard/hooks/useDevViews";
import { bridgeKind } from "./features/setup-wizard/utils/bridge";
import { WizardContainer } from "./features/setup-wizard/WizardContainer";
import { router } from "./router";
import { useHueResourcesStore } from "./stores/HueResourcesStore";

interface RenderedAppContent {
  viewKey: AppViewKey;
  content: ReactNode;
}

// A representative error for the dev-only error boundary preview, with a fake
// component stack so the "Technical details" disclosure has realistic content.
const devSampleError = new Error(
  "Cannot read properties of undefined (reading 'lights')",
);

const devSampleComponentStack = [
  "",
  "    at SpaceScreen (src/features/space-screen/SpaceScreen.tsx:42:7)",
  "    at SpaceRoute (src/routes/SpaceRoute.tsx:18:5)",
  "    at RootLayout (src/routes/RootLayout.tsx:24:3)",
  "    at App (src/App.tsx:114:1)",
].join("\n");

const HomeApp = () => (
  <div className="h-full">
    <RouterProvider router={router} />
  </div>
);

const splashLockupVariants: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.7,
      ease: [0.16, 1, 0.3, 1],
      staggerChildren: 0.08,
    },
  },
};

const splashItemVariants: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.92 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] },
  },
};

const SplashView = () => {
  const reduceMotion = Boolean(useReducedMotion());

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-background px-6">
      <motion.div
        className="relative flex flex-col items-center gap-6"
        variants={splashLockupVariants}
        initial={reduceMotion ? false : "hidden"}
        animate="visible"
      >
        <motion.div variants={splashItemVariants}>
          <Logo className="size-28 rounded-3xl shadow-2xl shadow-foreground/10" />
        </motion.div>
        <motion.div
          className="font-heading text-4xl font-semibold tracking-tight"
          variants={splashItemVariants}
        >
          Mote Desktop
        </motion.div>
      </motion.div>
    </div>
  );
};

const DisconnectedBridgeView = ({
  error,
  onRetry,
  onPairNewBridge,
}: {
  error: string | null;
  onRetry: () => void;
  onPairNewBridge: () => void;
}) => (
  <StatusScreen
    visual={<BridgeStatus kind={bridgeKind()} status="error" />}
    title="Bridge unavailable"
    description={error ?? "The saved bridge could not be reached."}
    actions={
      <div className="flex gap-3">
        <Button size="xl" variant="outline" onClick={onPairNewBridge}>
          Pair a new bridge
        </Button>
        <Button size="xl" onClick={onRetry}>
          Retry connection
        </Button>
      </div>
    }
  />
);

function App() {
  const {
    configured,
    connected,
    error,
    isLoading,
    refreshSession,
    resetSession,
    isAddingBridge,
    cancelAddBridge,
  } = useHue();
  const dev = useDevViews();
  const [pairNewBridge, setPairNewBridge] = useState(false);
  const initialResourcesLoadStartedRef = useRef(false);
  const resourcesHasLoaded = useHueResourcesStore((state) => state.hasLoaded);
  const loadHueResources = useHueResourcesStore((state) => state.loadAll);
  const widgetWizardDevStep = widgetWizardStepForViewId(dev.viewId);

  useEffect(() => {
    if (dev.enabled || !configured || !connected || resourcesHasLoaded) return;
    if (initialResourcesLoadStartedRef.current) return;

    initialResourcesLoadStartedRef.current = true;
    void loadHueResources();
  }, [
    connected,
    configured,
    dev.enabled,
    loadHueResources,
    resourcesHasLoaded,
  ]);

  useEffect(() => {
    if (!configured || !connected) {
      initialResourcesLoadStartedRef.current = false;
    }
  }, [configured, connected]);

  useEffect(() => {
    if (!dev.enabled || widgetWizardDevStep === null) return;

    void router.navigate({
      to: "/settings/widget-wizard",
      search: { step: widgetWizardDevStep },
      replace: true,
    });
  }, [dev.enabled, widgetWizardDevStep]);

  // Dev preview path: the wizard dev toolbar drives which mock view shows.
  const renderDevContent = (): RenderedAppContent => {
    if (dev.viewId === COMPONENT_GALLERY_VIEW_ID) {
      return { viewKey: "component-gallery", content: <ComponentGallery /> };
    }

    if (dev.viewId === DEVICE_GALLERY_VIEW_ID) {
      return { viewKey: "device-gallery", content: <DeviceGallery /> };
    }

    if (dev.viewId === ERROR_BOUNDARY_VIEW_ID) {
      return {
        viewKey: "error-boundary",
        content: (
          <ErrorScreen
            error={devSampleError}
            componentStack={devSampleComponentStack}
            onReset={() => dev.selectView("home-preview")}
          />
        ),
      };
    }

    if (dev.viewId === "home-preview") {
      return { viewKey: "home-preview", content: <HomeApp /> };
    }

    const syncBoxWizardState = syncBoxWizardDevStates.find(
      (entry) => entry.id === dev.viewId,
    );
    if (syncBoxWizardState) {
      return {
        viewKey: "wizard-dev",
        content: (
          <SyncBoxOnboardingWizard
            devState={syncBoxWizardState.state}
            onDevStateChange={dev.selectView}
          />
        ),
      };
    }

    if (dev.viewId === SYNC_BOX_CONNECTED_DEV_VIEW_ID) {
      return {
        viewKey: "home-preview",
        content: (
          <SyncBoxConnectedView
            session={sampleSyncBoxSession}
            onPair={() => dev.selectView("sync-box-welcome")}
          />
        ),
      };
    }

    if (widgetWizardDevStep !== null) {
      return {
        // Render the real routed shell so dev previews inherit the same header,
        // viewport padding, scroll ownership, and footer constraints as the app.
        viewKey: "home-preview",
        content: <HomeApp />,
      };
    }

    if (dev.viewId === "splash" || dev.retryLoading) {
      return { viewKey: "loading", content: <SplashView /> };
    }

    if (dev.viewId === "disconnected") {
      return {
        viewKey: "disconnected",
        content: (
          <DisconnectedBridgeView
            error={null}
            onRetry={dev.startRetryTransition}
            onPairNewBridge={() => dev.selectView("discovering")}
          />
        ),
      };
    }

    return {
      viewKey: "wizard-dev",
      content: (
        <WizardContainer
          devMode
          devStateId={dev.viewId}
          onDevStateChange={dev.setViewId}
          onEnterHomePreview={() => dev.selectView("home-preview")}
          devBridgeCount={dev.bridgeCount}
          devPairingKind={dev.pairingKind}
          onDevPairingKindChange={dev.setPairingKind}
        />
      ),
    };
  };

  // Real path: the Hue session decides loading / home / disconnected / wizard.
  const renderSessionContent = (): RenderedAppContent => {
    if (isLoading) {
      return { viewKey: "loading", content: <SplashView /> };
    }

    // Adding a bridge reuses the full wizard as an overlay over the current
    // session, so pairing a second bridge never tears down the first. A Cancel
    // control backs out to Home (the active bridge is untouched until pairing
    // succeeds, at which point the new bridge becomes active).
    if (isAddingBridge) {
      return {
        viewKey: "wizard",
        content: (
          <div className="relative h-full">
            <WizardContainer
              autoStartDiscovery
              onPairingComplete={async () => {
                // The new bridge is now active; stop the previous bridge's
                // stream so Home restreams the new one when it remounts.
                await invoke("stop-hue-events").catch(() => {});
                cancelAddBridge();
                await router.navigate({ to: "/", replace: true });
              }}
            />
            <Button
              variant="ghost"
              size="xl"
              className="absolute right-6 top-4 z-10"
              onClick={cancelAddBridge}
            >
              Cancel
            </Button>
          </div>
        ),
      };
    }

    if (configured && connected) {
      if (!resourcesHasLoaded) {
        return { viewKey: "loading", content: <SplashView /> };
      }

      return { viewKey: "home", content: <HomeApp /> };
    }

    if (configured) {
      return {
        viewKey: "disconnected",
        content: (
          <DisconnectedBridgeView
            error={error}
            onRetry={() => void refreshSession()}
            onPairNewBridge={() => {
              setPairNewBridge(true);
              void resetSession();
            }}
          />
        ),
      };
    }

    return {
      viewKey: "wizard",
      content: (
        <WizardContainer
          autoStartDiscovery={pairNewBridge}
          onPairingComplete={async () => {
            await router.navigate({ to: "/", replace: true });
            setPairNewBridge(false);
          }}
        />
      ),
    };
  };

  const rendered = dev.enabled ? renderDevContent() : renderSessionContent();

  const selectedWizardDevState = wizardDevStates.find(
    (devState) => devState.id === dev.viewId,
  );
  const currentDevNextSteps = selectedWizardDevState
    ? devNextSteps[selectedWizardDevState.state.type]
    : syncBoxDevNextSteps[
        syncBoxWizardDevStates.find((entry) => entry.id === dev.viewId)?.state
          .type ?? "welcome"
      ];

  return (
    <main className="h-screen overflow-hidden bg-background pt-10 text-foreground">
      <TitleBar
        onDevBack={
          dev.enabled && dev.viewId === "home-preview"
            ? () => dev.selectView("success")
            : undefined
        }
        actions={
          <>
            <FocusStatusButton />
            <UpdateButton />
            <FeedbackButton />
          </>
        }
      />
      {dev.enabled && (
        <WizardDevToolbar
          value={dev.viewId}
          groups={dev.groups}
          nextSteps={currentDevNextSteps}
          onSelectState={dev.selectView}
          bridgeCount={dev.bridgeCount}
          onBridgeCountChange={dev.setBridgeCount}
          pairingKind={dev.pairingKind}
          onPairingKindChange={dev.setPairingKind}
        />
      )}
      <AppContentTransition viewKey={rendered.viewKey}>
        {rendered.content}
      </AppContentTransition>
      <DevUrlBar />
    </main>
  );
}

export default App;
