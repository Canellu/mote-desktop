import type { WizardStepProps } from "@/types/setup-wizard";
import { DiscoveringStep } from "./DiscoveringStep";
import { ErrorStep } from "./ErrorStep";
import { ManualEntryStep } from "./ManualEntryStep";
import { PairingStep } from "./PairingStep";
import { SelectBridgeStep } from "./SelectBridgeStep";
import { SuccessStep } from "./SuccessStep";
import { WelcomeStep } from "./WelcomeStep";

export const WizardStep = ({
  state,
  isBusy,
  selectedBridge,
  onStartDiscovery,
  onSelectBridge,
  onContinueWithSelectedBridge,
  onCancelPairing,
  onErrorRetry,
  onManualEntry,
  onConnectManualBridge,
  onReset,
  onEnterHome,
}: WizardStepProps) => {
  switch (state.type) {
    case "welcome":
      return (
        <WelcomeStep isBusy={isBusy} onStartDiscovery={onStartDiscovery} />
      );
    case "discovering":
      return <DiscoveringStep />;
    case "selectBridge":
      return (
        <SelectBridgeStep
          state={state}
          onSelectBridge={onSelectBridge}
          onContinue={onContinueWithSelectedBridge}
          onBack={onReset}
          onManualEntry={onManualEntry}
        />
      );
    case "pairing":
      return <PairingStep state={state} onCancel={onCancelPairing} />;
    case "manualEntry":
      return (
        <ManualEntryStep
          state={state}
          isBusy={isBusy}
          onConnect={onConnectManualBridge}
          onBack={onReset}
        />
      );
    case "success":
      return (
        <SuccessStep
          selectedBridge={selectedBridge}
          isBusy={isBusy}
          onEnterHome={onEnterHome}
        />
      );
    case "error":
      return (
        <ErrorStep
          state={state}
          selectedBridge={selectedBridge}
          onReset={onReset}
          onRetry={onErrorRetry}
          onManualEntry={onManualEntry}
        />
      );
  }
};
