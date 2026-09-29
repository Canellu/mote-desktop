import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { type HueSession, useHue } from "@/context/HueContext";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import type {
  DiscoveredBridge,
  SetupState,
  WizardController,
  WizardFlowOptions,
} from "@/types/setup-wizard";
import {
  bridgeIdIsPaired,
  bridgeSelectionState,
  highlightedBridge,
  retriesToBridgeSelection,
  selectBridgeInState,
} from "../machine";
import { usePairingPoll } from "./usePairingPoll";

const DISCOVERY_MIN_MS = 1000;
const ENTER_HOME_MIN_BUSY_MS = 1500;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The real setup flow: network discovery, the link-button pairing handshake,
 * and the warm-and-reveal into Home. Knows nothing about dev previews — see
 * useWizardDevDriver for that. Both satisfy the same WizardController contract.
 */
export const useWizardFlow = ({
  autoStartDiscovery = false,
  onPairingComplete,
}: WizardFlowOptions): WizardController => {
  const { applySession, bridges: pairedBridges } = useHue();
  const [state, setState] = useState<SetupState>({ type: "welcome" });
  const [isBusy, setIsBusy] = useState(false);
  // Ids of bridges already paired on this device, kept fresh so re-showing the
  // bridge list (after a cancel/retry) always reflects the current pairings.
  const pairedIdsRef = useRef<string[]>([]);
  pairedIdsRef.current = pairedBridges.map((bridge) =>
    bridge.bridgeId.toUpperCase(),
  );
  const knownBridgesRef = useRef<DiscoveredBridge[]>([]);
  const selectedBridgeRef = useRef<DiscoveredBridge | null>(null);
  const pendingSessionRef = useRef<HueSession | null>(null);
  const warmupPromiseRef = useRef<Promise<void> | null>(null);

  const pairing = usePairingPoll({
    onSuccess: (session) => {
      pendingSessionRef.current = session;
      // Warm Home resources immediately so they're ready by the time the user
      // presses "Let's Go". enterHome awaits this in-flight load.
      warmupPromiseRef.current = useHueResourcesStore.getState().loadAll();
      setState({ type: "success" });
    },
    onError: (message, bridge) =>
      setState({ type: "error", reason: "pairing", message, bridge }),
    onTimeout: (bridge) =>
      setState({
        type: "error",
        reason: "timeout",
        message: "Pairing timed out before the bridge button was pressed.",
        bridge,
      }),
  });

  const showBridgeSelection = (bridges: DiscoveredBridge[]) => {
    knownBridgesRef.current = bridges;
    setState(bridgeSelectionState(bridges, pairedIdsRef.current));
  };

  const startDiscovery = async () => {
    if (isBusy) return;

    setIsBusy(true);
    setState({ type: "discovering" });

    try {
      // Floor the spinner at DISCOVERY_MIN_MS so a near-instant result still
      // reads as "searched" rather than flickering past.
      const [bridges] = await Promise.all([
        invoke<DiscoveredBridge[]>("discover-bridges"),
        new Promise((resolve) => setTimeout(resolve, DISCOVERY_MIN_MS)),
      ]);
      if (bridges.length > 0) {
        showBridgeSelection(bridges);
      } else {
        setState({
          type: "error",
          reason: "no-bridges",
          message: "No Hue Bridges found on your network.",
        });
      }
    } catch (error) {
      setState({
        type: "error",
        reason: "discovery",
        message: String(error) || "Failed to discover bridges.",
      });
    } finally {
      setIsBusy(false);
    }
  };

  const startPairing = (bridge: DiscoveredBridge) => {
    selectedBridgeRef.current = bridge;
    setState({ type: "pairing", bridge });
    pairing.start(bridge);
  };

  const openManualEntry = () => {
    pairing.stop();
    setState({ type: "manualEntry" });
  };

  const connectManualBridge = async (ip: string) => {
    if (isBusy) return;

    setIsBusy(true);
    // Drop the previous attempt's error while this one is in flight.
    setState({ type: "manualEntry", ip });
    try {
      const bridge = await invoke<DiscoveredBridge>("lookup-bridge", { ip });
      if (bridgeIdIsPaired(bridge.bridgeId, pairedIdsRef.current)) {
        setState({
          type: "manualEntry",
          ip,
          message: "This bridge is already added on this device.",
        });
        return;
      }
      // Remember it so Cancel or a pairing retry returns to this bridge
      // instead of starting over.
      knownBridgesRef.current = [bridge];
      startPairing(bridge);
    } catch (error) {
      setState({
        type: "manualEntry",
        ip,
        message: String(error) || "Couldn't reach a bridge at that address.",
      });
    } finally {
      setIsBusy(false);
    }
  };

  const selectBridge = (bridgeIp: string) =>
    setState((current) => selectBridgeInState(current, bridgeIp));

  const continueWithSelectedBridge = () => {
    const bridge = highlightedBridge(state);
    if (bridge) startPairing(bridge);
  };

  const reset = () => {
    pairing.stop();
    knownBridgesRef.current = [];
    selectedBridgeRef.current = null;
    pendingSessionRef.current = null;
    warmupPromiseRef.current = null;
    setState({ type: "welcome" });
  };

  const cancelPairing = () => {
    pairing.stop();
    if (knownBridgesRef.current.length > 0) {
      showBridgeSelection(knownBridgesRef.current);
    } else {
      reset();
    }
  };

  const handleErrorRetry = () => {
    if (state.type !== "error") return;

    pairing.stop();
    if (retriesToBridgeSelection(state, knownBridgesRef.current.length > 0)) {
      showBridgeSelection(knownBridgesRef.current);
      return;
    }

    void startDiscovery();
  };

  const enterHome = async () => {
    const session = pendingSessionRef.current;
    if (!session) return;

    // Gate the crossfade on data readiness. Resources were warmed when pairing
    // succeeded; await that in-flight load so we only switch views once Home is
    // fully ready — never a half-loaded screen. loadAll handles its own errors
    // and never rejects, so Home still opens (with its own error state) if the
    // fetch failed.
    setIsBusy(true);
    await Promise.all([
      warmupPromiseRef.current ?? useHueResourcesStore.getState().loadAll(),
      delay(ENTER_HOME_MIN_BUSY_MS),
    ]);

    pendingSessionRef.current = null;
    await onPairingComplete?.();
    applySession(session);
  };

  useEffect(() => {
    if (autoStartDiscovery) void startDiscovery();
    // Run once on mount: re-pairing enters the wizard straight at discovery.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
