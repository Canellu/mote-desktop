import { openProUpgrade } from "@/features/pro/proUpgrade";
import { isPurchaseRequired } from "@/lib/entitlement-errors";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import type {
  DiscoveredSyncBox,
  SyncBoxOnboardingState,
  SyncBoxSession,
} from "@/types/sync-box";

const DISCOVERY_MIN_MS = 1000;
const PAIRING_RETRY_MS = 1000;
const PAIRING_TIMEOUT_MS = 180_000;

const delay = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export const useSyncBoxOnboarding = () => {
  const [state, setState] = useState<SyncBoxOnboardingState>({
    type: "welcome",
  });
  const [isBusy, setIsBusy] = useState(false);
  const knownSyncBoxesRef = useRef<DiscoveredSyncBox[]>([]);
  const pairingActiveRef = useRef(false);
  const pairingDeadlineRef = useRef<number | null>(null);
  const pairingRetryRef = useRef<number | null>(null);

  const stopPairing = () => {
    pairingActiveRef.current = false;
    if (pairingDeadlineRef.current !== null) {
      window.clearTimeout(pairingDeadlineRef.current);
      pairingDeadlineRef.current = null;
    }
    if (pairingRetryRef.current !== null) {
      window.clearTimeout(pairingRetryRef.current);
      pairingRetryRef.current = null;
    }
  };

  const showSelection = (syncBoxes: DiscoveredSyncBox[]) => {
    const supported = syncBoxes.filter((syncBox) => syncBox.supported);
    setState({
      type: "select",
      syncBoxes,
      selectedUniqueId: supported.length === 1 ? supported[0].uniqueId : "",
    });
  };

  const startDiscovery = async () => {
    if (isBusy) return;
    stopPairing();
    setIsBusy(true);
    setState({ type: "discovering" });

    try {
      const [syncBoxes] = await Promise.all([
        invoke<DiscoveredSyncBox[]>("discover-sync-boxes"),
        delay(DISCOVERY_MIN_MS),
      ]);
      knownSyncBoxesRef.current = syncBoxes;

      if (syncBoxes.length === 0) {
        setState({
          type: "error",
          reason: "not-found",
          message: "No Hue Sync Boxes were found on this network.",
        });
      } else if (syncBoxes.every((syncBox) => !syncBox.supported)) {
        const apiLevels = syncBoxes
          .map((syncBox) => `${syncBox.name} (API ${syncBox.apiLevel})`)
          .join(", ");
        setState({
          type: "error",
          reason: "unsupported",
          message: `${apiLevels}. Update the Sync Box firmware in the official Hue Sync app before connecting.`,
        });
      } else {
        showSelection(syncBoxes);
      }
    } catch (error) {
      setState({
        type: "error",
        reason: "discovery",
        message: String(error) || "Failed to discover Hue Sync Boxes.",
      });
    } finally {
      setIsBusy(false);
    }
  };

  const selectSyncBox = (uniqueId: string) => {
    setState((current) =>
      current.type === "select"
        ? { ...current, selectedUniqueId: uniqueId }
        : current,
    );
  };

  const startPairing = (syncBox: DiscoveredSyncBox) => {
    stopPairing();
    pairingActiveRef.current = true;
    setState({ type: "pairing", syncBox });

    pairingDeadlineRef.current = window.setTimeout(() => {
      stopPairing();
      setState({
        type: "error",
        reason: "timeout",
        message: "Pairing timed out before the Sync Box button was authorized.",
        syncBox,
      });
    }, PAIRING_TIMEOUT_MS);

    const poll = async () => {
      try {
        const session = await invoke<SyncBoxSession>("pair-sync-box", {
          ipAddress: syncBox.ipAddress,
          port: syncBox.port,
        });
        if (!pairingActiveRef.current) return;
        stopPairing();
        setState({ type: "success", session });
      } catch (error) {
        if (!pairingActiveRef.current) return;
        // A second box is Mote Pro. The screens ask before pairing starts, so
        // this is the backstop for a plan that changed in between.
        if (isPurchaseRequired(error)) {
          stopPairing();
          openProUpgrade("multiple_sync_boxes");
          setState({
            type: "error",
            reason: "pairing",
            message: "A second Sync Box is part of Mote Pro.",
            syncBox,
          });
          return;
        }
        const message = String(error) || "Failed to pair the Sync Box.";
        if (message.toLowerCase().includes("button authorization")) {
          pairingRetryRef.current = window.setTimeout(
            () => void poll(),
            PAIRING_RETRY_MS,
          );
          return;
        }
        stopPairing();
        setState({
          type: "error",
          reason: "pairing",
          message,
          syncBox,
        });
      }
    };

    void poll();
  };

  const continueWithSelection = () => {
    if (state.type !== "select") return;
    const syncBox = state.syncBoxes.find(
      (candidate) =>
        candidate.uniqueId === state.selectedUniqueId && candidate.supported,
    );
    if (syncBox) startPairing(syncBox);
  };

  const cancelPairing = () => {
    stopPairing();
    showSelection(knownSyncBoxesRef.current);
  };

  const retry = () => {
    if (state.type !== "error") return;
    if (
      (state.reason === "pairing" || state.reason === "timeout") &&
      knownSyncBoxesRef.current.length > 0
    ) {
      showSelection(knownSyncBoxesRef.current);
      return;
    }
    void startDiscovery();
  };

  const reset = () => {
    stopPairing();
    knownSyncBoxesRef.current = [];
    setState({ type: "welcome" });
  };

  useEffect(() => stopPairing, []);

  return {
    state,
    isBusy,
    startDiscovery,
    selectSyncBox,
    continueWithSelection,
    cancelPairing,
    retry,
    reset,
  };
};
