export type DiscoveredBridge = {
  bridgeId: string;
  bridgeIp: string;
  modelId?: string | null;
  /** Found only by the cloud lookup, so mDNS replies may be blocked. */
  viaCloud?: boolean;
};

export type BridgeKind = "original" | "pro";

export type ErrorReason = "no-bridges" | "timeout" | "discovery" | "pairing";

export type SetupState =
  | { type: "welcome" }
  | { type: "discovering" }
  | {
      type: "selectBridge";
      bridges: DiscoveredBridge[];
      selectedBridgeIp: string;
      /**
       * Uppercased ids of bridges already paired on this device. Discovery still
       * reports them, but they're shown as "already added" and can't be
       * selected — so adding a second bridge can't re-pair an existing one.
       */
      alreadyPairedIds?: string[];
    }
  | { type: "pairing"; bridge: DiscoveredBridge }
  /** Typing the bridge's IP when discovery can't find it. */
  | { type: "manualEntry"; ip?: string; message?: string }
  | { type: "success" }
  | {
      type: "error";
      reason: ErrorReason;
      message: string;
      bridge?: DiscoveredBridge;
    };

export interface WizardContainerProps {
  devMode?: boolean;
  devStateId?: string;
  onDevStateChange?: (id: string) => void;
  onEnterHomePreview?: () => void;
  /** Skip the welcome step and begin discovery on mount (e.g. re-pairing). */
  autoStartDiscovery?: boolean;
  /** Dev-only: number of bridges to show in the Select bridge preview. */
  devBridgeCount?: number;
  /** Dev-only: bridge variant shown in the Pairing preview. */
  devPairingKind?: BridgeKind;
  /** Dev-only: sync the toolbar's bridge variant when the driver advances. */
  onDevPairingKindChange?: (kind: BridgeKind) => void;
  /** Real flow: pair this saved bridge again, straight at the button step. */
  repairBridge?: DiscoveredBridge;
  /** Real flow: runs before the connected app is revealed. */
  onPairingComplete?: () => void | Promise<void>;
}

/**
 * The interface a wizard driver exposes to the view. Both the real flow
 * (`useWizardFlow`) and the dev harness (`useWizardDevDriver`) satisfy this, so
 * the same `WizardStep` renders either without knowing which is behind it.
 */
export interface WizardController {
  state: SetupState;
  isBusy: boolean;
  selectedBridge: DiscoveredBridge | null;
  startDiscovery: () => void;
  selectBridge: (bridgeIp: string) => void;
  continueWithSelectedBridge: () => void;
  cancelPairing: () => void;
  handleErrorRetry: () => void;
  openManualEntry: () => void;
  connectManualBridge: (ip: string) => void;
  reset: () => void;
  enterHome: () => void;
}

export interface WizardFlowOptions {
  /** Skip the welcome step and begin discovery on mount (e.g. re-pairing). */
  autoStartDiscovery?: boolean;
  /** Pair this saved bridge again (its key was revoked), skipping discovery. */
  repairBridge?: DiscoveredBridge;
  /** Runs before applying the paired session and revealing the connected app. */
  onPairingComplete?: () => void | Promise<void>;
}

export interface WizardDevDriverOptions {
  /** Registered dev-state id the toolbar wants shown. */
  devStateId?: string;
  /** Notifies the toolbar when the driver advances to a new state. */
  onDevStateChange?: (id: string) => void;
  /** Invoked from the simulated Success step to reveal the Home preview. */
  onEnterHomePreview?: () => void;
  /** Number of bridges to show in the Select bridge preview. */
  devBridgeCount?: number;
  /** Bridge variant shown in the Pairing preview. */
  devPairingKind?: BridgeKind;
  /** Sync the toolbar's bridge variant when the driver advances (e.g. Continue). */
  onDevPairingKindChange?: (kind: BridgeKind) => void;
}

export interface WizardDevState {
  id: string;
  label: string;
  state: SetupState;
}

export interface WizardDevNextStep {
  id: string;
  label: string;
}

export interface DevViewOption {
  id: string;
  label: string;
}

export interface DevViewGroup {
  label: string;
  options: DevViewOption[];
}

export type SelectBridgeState = Extract<SetupState, { type: "selectBridge" }>;
export type PairingState = Extract<SetupState, { type: "pairing" }>;
export type ErrorState = Extract<SetupState, { type: "error" }>;
export type ManualEntryState = Extract<SetupState, { type: "manualEntry" }>;

export interface WelcomeStepProps {
  isBusy: boolean;
  onStartDiscovery: () => void | Promise<void>;
}

export interface SelectBridgeStepProps {
  state: SelectBridgeState;
  onSelectBridge: (bridgeIp: string) => void;
  onContinue: () => void;
  onBack: () => void;
  onManualEntry: () => void;
}

export interface PairingStepProps {
  state: PairingState;
  onCancel: () => void;
}

export interface SuccessStepProps {
  selectedBridge: DiscoveredBridge | null;
  isBusy: boolean;
  onEnterHome: () => void;
}

export interface ErrorStepProps {
  state: ErrorState;
  selectedBridge: DiscoveredBridge | null;
  onReset: () => void;
  onRetry: () => void;
  onManualEntry: () => void;
}

export interface ManualEntryStepProps {
  state: ManualEntryState;
  isBusy: boolean;
  onConnect: (ip: string) => void;
  onBack: () => void;
}

export interface WizardStepProps {
  state: SetupState;
  isBusy: boolean;
  selectedBridge: DiscoveredBridge | null;
  onStartDiscovery: () => void | Promise<void>;
  onSelectBridge: (bridgeIp: string) => void;
  onContinueWithSelectedBridge: () => void;
  onCancelPairing: () => void;
  onErrorRetry: () => void;
  onManualEntry: () => void;
  onConnectManualBridge: (ip: string) => void;
  onReset: () => void;
  onEnterHome: () => void;
}

export interface WizardDevToolbarProps {
  value: string;
  groups: DevViewGroup[];
  nextSteps?: WizardDevNextStep[];
  onSelectState: (id: string) => void;
  /** When set, shows a stepper to adjust the previewed discovered-bridge count. */
  bridgeCount?: number;
  onBridgeCountChange?: (count: number) => void;
  /** When set, shows Normal/Pro tabs on the Pairing preview. */
  pairingKind?: BridgeKind;
  onPairingKindChange?: (kind: BridgeKind) => void;
}
