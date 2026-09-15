import { DiscoveryWifi } from "@/components/DiscoveryWifi";
import {
  HueSyncBoxIllustration,
  SyncBoxThumb,
} from "@/components/HueSyncBoxIllustration";
import { SyncBoxStatus } from "@/components/SyncBoxStatus";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { overlaySelectionClassName } from "@/lib/selection-styles";
import { cn } from "@/lib/utils";
import type { SyncBoxOnboardingState, SyncBoxSession } from "@/types/sync-box";
import { Loader2 } from "lucide-react";
import { useSyncBoxOnboarding } from "./hooks/useSyncBoxOnboarding";

export const SyncBoxOnboardingWizard = ({
  onComplete,
  devState,
  onDevStateChange,
}: {
  onComplete?: (session: SyncBoxSession) => void;
  devState?: SyncBoxOnboardingState;
  onDevStateChange?: (id: string) => void;
}) => {
  const controller = useSyncBoxOnboarding();
  const {
    state: liveState,
    isBusy,
    startDiscovery,
    selectSyncBox,
    continueWithSelection,
    cancelPairing,
    retry,
    reset,
  } = controller;
  const state = devState ?? liveState;
  const devMode = devState !== undefined;

  const start = () =>
    devMode
      ? onDevStateChange?.("sync-box-discovering")
      : void startDiscovery();
  const backFromSelection = () =>
    devMode ? onDevStateChange?.("sync-box-welcome") : reset();
  const continueFromSelection = () =>
    devMode ? onDevStateChange?.("sync-box-pairing") : continueWithSelection();
  const backFromPairing = () =>
    devMode ? onDevStateChange?.("sync-box-select") : cancelPairing();
  const startOver = () =>
    devMode ? onDevStateChange?.("sync-box-welcome") : reset();
  const retryAfterError = () => {
    if (!devMode) {
      retry();
      return;
    }
    onDevStateChange?.(
      state.type === "error" &&
        (state.reason === "pairing" || state.reason === "timeout")
        ? "sync-box-select"
        : "sync-box-discovering",
    );
  };
  const complete = (session: SyncBoxSession) => {
    if (devMode) {
      onDevStateChange?.("sync-box-connected");
      return;
    }
    onComplete?.(session);
  };

  return (
    <div className="flex min-h-[calc(100vh-12rem)] -translate-y-10 items-center justify-center px-6 py-10">
      <div className="flex w-full max-w-2xl flex-col items-center gap-10 text-center">
        {state.type === "welcome" && (
          <>
            <HueSyncBoxIllustration />
            <WizardCopy
              title="Connect your Hue Sync Box"
              description="First connect your Sync Box to Wi-Fi using the official Hue app. When the Sync Box LED is white or red, continue here."
            />
            <Button size="xl" onClick={start} disabled={isBusy}>
              My Sync Box is ready
            </Button>
          </>
        )}

        {state.type === "discovering" && (
          <>
            <DiscoveryWifi />
            <WizardCopy
              title="Looking for Sync Boxes…"
              description="Scanning this network for Philips Hue HDMI Sync Boxes."
              shimmer
            />
          </>
        )}

        {state.type === "select" && (
          <>
            <WizardCopy
              title={
                state.syncBoxes.length === 1
                  ? "Hue Sync Box found"
                  : "Choose your Hue Sync Box"
              }
              description="Select the Sync Box you want this app to control."
            />
            <div className="flex max-w-[88vw] flex-wrap justify-center gap-4">
              {state.syncBoxes.map((syncBox) => {
                const selected = state.selectedUniqueId === syncBox.uniqueId;
                return (
                  <Card
                    key={syncBox.uniqueId}
                    role="button"
                    tabIndex={syncBox.supported ? 0 : -1}
                    aria-disabled={!syncBox.supported}
                    aria-pressed={selected}
                    data-selected={selected ? "" : undefined}
                    className={cn(
                      "border border-foreground/10 transition-[box-shadow,background-color] [--card-spacing:--spacing(8)]",
                      "bg-[oklch(0.99_0_0)] dark:bg-[oklch(0.24_0_0)]",
                      syncBox.supported &&
                        "cursor-pointer hover:bg-[oklch(0.96_0_0)] dark:hover:bg-[oklch(0.25_0_0)]",
                      selected && overlaySelectionClassName,
                      !syncBox.supported && "opacity-55",
                    )}
                    onClick={() => {
                      if (syncBox.supported) {
                        selectSyncBox(syncBox.uniqueId);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (
                        syncBox.supported &&
                        (event.key === "Enter" || event.key === " ")
                      ) {
                        event.preventDefault();
                        selectSyncBox(syncBox.uniqueId);
                      }
                    }}
                  >
                    <CardContent className="flex flex-col items-center gap-3 text-center">
                      <SyncBoxThumb />
                      <div className="w-full min-w-0">
                        <p className="truncate font-medium">{syncBox.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {syncBox.ipAddress}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Firmware {syncBox.firmwareVersion} · API{" "}
                          {syncBox.apiLevel}
                        </p>
                        {!syncBox.supported && (
                          <p className="mt-2 text-xs font-medium text-(--destructive-text)">
                            Firmware update required
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            <div className="flex gap-3">
              <Button size="xl" variant="outline" onClick={backFromSelection}>
                Back
              </Button>
              <Button
                size="xl"
                disabled={!state.selectedUniqueId}
                onClick={continueFromSelection}
              >
                Continue
              </Button>
            </div>
          </>
        )}

        {state.type === "pairing" && (
          <>
            <HueSyncBoxIllustration pulse />
            <WizardCopy
              title={`Authorize ${state.syncBox.name}`}
              description="Hold the Sync Box button for about three seconds. Release it when the LED blinks green; this app will connect automatically."
            />
            <Button size="xl" variant="outline" onClick={backFromPairing}>
              Back
            </Button>
          </>
        )}

        {state.type === "success" && (
          <>
            <SyncBoxStatus status="success" />
            <WizardCopy
              title="Sync Box connected"
              description={`${state.session.syncBox?.name ?? "Your Hue Sync Box"} is ready to control from Mote Desktop.`}
            />
            <Button size="xl" onClick={() => complete(state.session)}>
              Done
            </Button>
          </>
        )}

        {state.type === "error" && (
          <>
            <SyncBoxStatus status="error" />
            <WizardCopy
              title={errorTitle(state.reason)}
              description={state.message}
            />
            <div className="flex gap-3">
              <Button size="xl" variant="outline" onClick={startOver}>
                Start over
              </Button>
              <Button size="xl" onClick={retryAfterError}>
                Try again
              </Button>
            </div>
          </>
        )}

        {isBusy && state.type !== "discovering" && (
          <Loader2 className="animate-spin text-muted-foreground" />
        )}
      </div>
    </div>
  );
};

const WizardCopy = ({
  title,
  description,
  shimmer,
}: {
  title: string;
  description: string;
  shimmer?: boolean;
}) => (
  <div className="flex max-w-xl flex-col gap-3">
    <h1
      className={cn(
        "font-heading text-4xl font-semibold",
        shimmer && "text-shimmer",
      )}
    >
      {title}
    </h1>
    <p className="text-lg text-muted-foreground">{description}</p>
  </div>
);

const errorTitle = (
  reason: "discovery" | "not-found" | "unsupported" | "pairing" | "timeout",
) =>
  ({
    discovery: "Discovery failed",
    "not-found": "No Sync Boxes found",
    unsupported: "Firmware update required",
    pairing: "Pairing failed",
    timeout: "Pairing timed out",
  })[reason];
