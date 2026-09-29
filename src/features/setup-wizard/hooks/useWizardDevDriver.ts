import { useEffect, useRef, useState } from "react";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import type {
  DiscoveredBridge,
  SetupState,
  WizardController,
  WizardDevDriverOptions,
  WizardDevState,
} from "@/types/setup-wizard";
import {
  DEV_DEFAULT_BRIDGE_COUNT,
  DEV_DEFAULT_PAIRING_KIND,
  makeSampleBridges,
  sampleBridgeForKind,
  wizardDevStates,
} from "../constants";
import {
  bridgeSelectionState,
  highlightedBridge,
  retriesToBridgeSelection,
  selectBridgeInState,
} from "../machine";
import { bridgeKind } from "../utils/bridge";

const welcomeDevState = wizardDevStates[0];

const findDevState = (idOrType?: string): WizardDevState | undefined =>
  idOrType
    ? wizardDevStates.find(
        (entry) => entry.id === idOrType || entry.state.type === idOrType,
      )
    : undefined;

/**
 * Resolves the dev state to open on mount: an explicit request, else a
 * `?wizardState=` deep link (handy for sharing a specific preview), else
 * Welcome.
 */
const getInitialDevState = (requestedDevStateId?: string): WizardDevState => {
  const requested = findDevState(requestedDevStateId);
  if (requested) return requested;

  const params = new URLSearchParams(window.location.search);
  const fromUrl =
    params.get("wizardState") ??
    params.get("wizard_state") ??
    params.get("wizard-step");

  return findDevState(fromUrl ?? undefined) ?? welcomeDevState;
};

/**
 * Drives the wizard for the dev toolbar: jump to any registered state, tweak
 * the previewed bridge count, and step through the flow to watch transitions —
 * all without touching the network. Mirrors the real flow's visual routing
 * (via the shared machine helpers) so previews behave like the real thing.
 * `enterHome` is the one real side effect: it loads live resources so the Home
 * preview shows actual lights.
 */
export const useWizardDevDriver = ({
  devStateId,
  onDevStateChange,
  onEnterHomePreview,
  devBridgeCount = DEV_DEFAULT_BRIDGE_COUNT,
  devPairingKind = DEV_DEFAULT_PAIRING_KIND,
  onDevPairingKindChange,
}: WizardDevDriverOptions): WizardController => {
  const initialRef = useRef(getInitialDevState(devStateId));
  const [state, setState] = useState<SetupState>(initialRef.current.state);
  const [currentId, setCurrentId] = useState(initialRef.current.id);
  const [isBusy, setIsBusy] = useState(false);
  const knownBridgesRef = useRef<DiscoveredBridge[]>([]);
  const selectedBridgeRef = useRef<DiscoveredBridge | null>(null);
  // Lets the pairing-kind effect read the current view without re-subscribing.
  const currentIdRef = useRef(currentId);
  currentIdRef.current = currentId;

  // Single funnel for state changes so the toolbar highlight always tracks
  // whatever the driver shows.
  const goTo = (id: string, next: SetupState) => {
    if (next.type === "selectBridge") knownBridgesRef.current = next.bridges;
    if (next.type === "pairing") selectedBridgeRef.current = next.bridge;
    setCurrentId(id);
    onDevStateChange?.(id);
    setState(next);
  };

  // Resolve a registered dev state, sizing the Select bridge preview by the
  // toolbar's current bridge count rather than its baked-in sample.
  const jumpToDevState = (id: string) => {
    const entry = findDevState(id);
    if (!entry) return;
    // Shape select/pairing previews from the live toolbar controls (count /
    // Normal-Pro) rather than the baked-in sample.
    let resolved = entry.state;
    if (entry.state.type === "selectBridge") {
      resolved = bridgeSelectionState(makeSampleBridges(devBridgeCount));
    } else if (entry.state.type === "pairing") {
      resolved = {
        type: "pairing",
        bridge: sampleBridgeForKind(devPairingKind),
      };
    }
    goTo(entry.id, resolved);
  };

  // Follow the toolbar's selection.
  useEffect(() => {
    if (devStateId && devStateId !== currentId) jumpToDevState(devStateId);
    // jumpToDevState reads only stable refs/setters; sync on the request alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devStateId, currentId]);

  // Re-render the Select bridge preview when the toolbar's count changes.
  useEffect(() => {
    if (currentId !== "selectBridge") return;
    const next = bridgeSelectionState(makeSampleBridges(devBridgeCount));
    knownBridgesRef.current = next.bridges;
    setState(next);
  }, [devBridgeCount, currentId]);

  // Swap the Pairing preview's bridge variant when the toolbar's tabs change.
  // Keyed on the kind alone (current view read via ref) so it never clobbers a
  // bridge carried in from the Select step's Continue.
  useEffect(() => {
    if (currentIdRef.current !== "pairing") return;
    const bridge = sampleBridgeForKind(devPairingKind);
    selectedBridgeRef.current = bridge;
    setState({ type: "pairing", bridge });
  }, [devPairingKind]);

  const startDiscovery = () => goTo("discovering", { type: "discovering" });

  const selectBridge = (bridgeIp: string) =>
    setState((current) => selectBridgeInState(current, bridgeIp));

  const continueWithSelectedBridge = () => {
    const bridge = highlightedBridge(state);
    if (!bridge) return;
    // Pairing is one toolbar entry now; the selected bridge's own model decides
    // whether PairingStep shows the Pro or Normal illustration. Keep the
    // toolbar's Normal/Pro tab in step with the bridge the user just picked.
    onDevPairingKindChange?.(bridgeKind(bridge.modelId));
    goTo("pairing", { type: "pairing", bridge });
  };

  const reset = () => {
    knownBridgesRef.current = [];
    selectedBridgeRef.current = null;
    goTo("welcome", { type: "welcome" });
  };

  const cancelPairing = () => {
    if (knownBridgesRef.current.length > 0) {
      goTo("selectBridge", bridgeSelectionState(knownBridgesRef.current));
    } else {
      reset();
    }
  };

  const handleErrorRetry = () => {
    if (state.type !== "error") return;
    if (retriesToBridgeSelection(state, knownBridgesRef.current.length > 0)) {
      goTo("selectBridge", bridgeSelectionState(knownBridgesRef.current));
      return;
    }
    startDiscovery();
  };

  const openManualEntry = () =>
    goTo("manualEntry", { type: "manualEntry" });

  // Simulated lookup: any address resolves to a sample bridge at that IP.
  const connectManualBridge = (ip: string) => {
    const bridge = { ...sampleBridgeForKind(devPairingKind), bridgeIp: ip };
    knownBridgesRef.current = [bridge];
    goTo("pairing", { type: "pairing", bridge });
  };

  const enterHome = async () => {
    // Load live resources so the Home preview renders the real setup.
    setIsBusy(true);
    await useHueResourcesStore.getState().loadAll();
    onEnterHomePreview?.();
  };

  return {
    state,
    isBusy,
    selectedBridge: selectedBridgeRef.current,
    startDiscovery,
    selectBridge,
    continueWithSelectedBridge,
    cancelPairing,
    handleErrorRetry,
    openManualEntry,
    connectManualBridge,
    reset,
    enterHome,
  };
};
