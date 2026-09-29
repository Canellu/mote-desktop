import type {
  WizardContainerProps,
  WizardController,
} from "@/types/setup-wizard";
import { useWizardDevDriver } from "./hooks/useWizardDevDriver";
import { useWizardFlow } from "./hooks/useWizardFlow";
import { WizardStep } from "./steps/WizardStep";

// Re-keyed on each state so every screen change replays the entrance animation.
const WizardLayout = ({
  stateKey,
  children,
}: {
  stateKey: string;
  children: React.ReactNode;
}) => (
  <div className="relative flex h-full w-full -translate-y-10 flex-col items-center justify-center px-6 py-10">
    <div
      key={stateKey}
      className="flex w-full max-w-xl flex-col items-center gap-10 text-center animate-in fade-in"
      style={{
        animationDuration: "1000ms",
        animationTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {children}
    </div>
  </div>
);

// The single place a controller is mapped onto the view, so both drivers stay
// interchangeable behind the same WizardStep.
const WizardView = ({ controller }: { controller: WizardController }) => (
  <WizardLayout stateKey={controller.state.type}>
    <WizardStep
      state={controller.state}
      isBusy={controller.isBusy}
      selectedBridge={controller.selectedBridge}
      onStartDiscovery={controller.startDiscovery}
      onSelectBridge={controller.selectBridge}
      onContinueWithSelectedBridge={controller.continueWithSelectedBridge}
      onCancelPairing={controller.cancelPairing}
      onErrorRetry={controller.handleErrorRetry}
      onManualEntry={controller.openManualEntry}
      onConnectManualBridge={controller.connectManualBridge}
      onReset={controller.reset}
      onEnterHome={controller.enterHome}
    />
  </WizardLayout>
);

const WizardFlowContainer = ({
  autoStartDiscovery,
  onPairingComplete,
}: {
  autoStartDiscovery: boolean;
  onPairingComplete?: () => void | Promise<void>;
}) => {
  const controller = useWizardFlow({ autoStartDiscovery, onPairingComplete });
  return <WizardView controller={controller} />;
};

const WizardDevContainer = ({
  devStateId,
  onDevStateChange,
  onEnterHomePreview,
  devBridgeCount,
  devPairingKind,
  onDevPairingKindChange,
}: Omit<WizardContainerProps, "devMode" | "autoStartDiscovery">) => {
  const controller = useWizardDevDriver({
    devStateId,
    onDevStateChange,
    onEnterHomePreview,
    devBridgeCount,
    devPairingKind,
    onDevPairingKindChange,
  });
  return <WizardView controller={controller} />;
};

/**
 * Entry point for the setup wizard. Picks a driver up front — the real flow or
 * the dev harness — so neither path carries the other's code. This is the only
 * place the two are distinguished.
 */
export const WizardContainer = ({
  devMode = false,
  autoStartDiscovery = false,
  onPairingComplete,
  ...devProps
}: WizardContainerProps) => {
  if (devMode) return <WizardDevContainer {...devProps} />;
  return (
    <WizardFlowContainer
      autoStartDiscovery={autoStartDiscovery}
      onPairingComplete={onPairingComplete}
    />
  );
};
