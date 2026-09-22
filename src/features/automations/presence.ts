import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { create } from "zustand";
import { describeCommandError } from "@/lib/entitlement-errors";
import type { AutomationScene, AutomationTarget } from "./model";

/** Mirrors `PresenceDevice` in src-tauri/src/services/automations/presence.rs. */
export interface PresenceDevice {
  id: string;
  name: string;
  ip: string;
  mac: string | null;
  enabled: boolean;
}

/** Mirrors `PresenceSettings`. */
export interface PresenceSettings {
  enabled: boolean;
  bridgeId: string | null;
  devices: PresenceDevice[];
  arrivalScene: AutomationScene | null;
  departureTargets: AutomationTarget[];
}

export function defaultPresenceSettings(): PresenceSettings {
  return {
    enabled: false,
    bridgeId: null,
    devices: [],
    arrivalScene: null,
    departureTargets: [],
  };
}

export type Occupancy = "unknown" | "home" | "away";

export interface PresenceDeviceStatus {
  id: string;
  seen: boolean;
  evidence: "neighbor" | "ping" | null;
  lastSeenAt: number | null;
  conflict: boolean;
}

/** Mirrors `PresenceStatus`. Times are wall-clock milliseconds. */
export interface PresenceStatus {
  running: boolean;
  occupancy: Occupancy;
  devices: PresenceDeviceStatus[];
  awayAt: number | null;
  network: boolean;
  lastAction: {
    kind: "arrival" | "departure";
    at: number;
    failed: number;
    error: string | null;
  } | null;
}

/** Mirrors `FoundDevice` in presence_scan.rs. */
export interface FoundDevice {
  ip: string;
  mac: string;
  name: string | null;
  /** A hardware address made up for this network, as phones use. */
  privateAddress: boolean;
  /** Certainly not a phone. */
  kind: "router" | "hue" | null;
}

/** Mirrors `ProbeResult` in commands/presence.rs. */
export interface ProbeResult {
  seen: boolean;
  evidence: "neighbor" | "ping" | null;
  mac: string | null;
  macMatches: boolean | null;
}

interface PresenceState {
  settings: PresenceSettings | null;
  status: PresenceStatus | null;
  loadError: string | null;
}

export const usePresenceStore = create<PresenceState>(() => ({
  settings: null,
  status: null,
  loadError: null,
}));

let loading: Promise<void> | undefined;

export function loadPresence(): Promise<void> {
  return (loading ??= (async () => {
    if (!isTauri()) {
      usePresenceStore.setState({
        loadError: "Open Mote Desktop to set up presence.",
      });
      return;
    }
    try {
      await listen<PresenceStatus>("presence-status", (event) => {
        usePresenceStore.setState({ status: event.payload });
      });
      // A phone followed to a new address on the network.
      await listen<PresenceSettings>("presence-settings", (event) => {
        usePresenceStore.setState({ settings: event.payload });
      });
      const [settings, status] = await Promise.all([
        invoke<PresenceSettings>("get-presence-settings"),
        invoke<PresenceStatus>("get-presence-status"),
      ]);
      usePresenceStore.setState({ settings, status, loadError: null });
    } catch (error) {
      usePresenceStore.setState({ loadError: describeCommandError(error) });
      loading = undefined;
    }
  })());
}

/**
 * Saves a change, showing it at once. A refused save puts the last confirmed
 * settings back and says why; returns whether it was kept.
 */
export async function savePresence(
  change: (current: PresenceSettings) => PresenceSettings,
): Promise<boolean> {
  const current = usePresenceStore.getState().settings;
  if (!current) return false;
  const next = change(current);
  usePresenceStore.setState({ settings: next });
  try {
    const saved = await invoke<PresenceSettings>("set-presence-settings", {
      settings: next,
    });
    usePresenceStore.setState({ settings: saved });
    return true;
  } catch (error) {
    usePresenceStore.setState({ settings: current });
    toast.error(describeCommandError(error));
    return false;
  }
}

/** Everything answering on the home network, likely phones first. */
export function scanPresenceDevices() {
  return invoke<FoundDevice[]>("scan-presence-devices");
}

const PHONE_NAME =
  /iphone|ipad|android|galaxy|pixel|oneplus|xiaomi|redmi|huawei|honor|oppo|vivo|motorola|moto|nokia|phone/i;

/** Whether a found device looks like a phone or tablet. */
export function looksLikePhone(device: FoundDevice): boolean {
  return (
    !device.kind &&
    (device.privateAddress || PHONE_NAME.test(device.name ?? ""))
  );
}

export function probePresenceDevice(ip: string, mac: string | null) {
  return invoke<ProbeResult>("probe-presence-device", { ip, mac });
}

export function testPresenceAction(
  kind: "arrival" | "departure",
  settings: PresenceSettings,
) {
  return invoke<number>("test-presence-action", { kind, settings });
}

/** The sentence a household state reads as. */
export function occupancyText(status: PresenceStatus | null): string {
  if (!status?.running) return "Not watching";
  if (!status.network) return "Waiting for the home network";
  switch (status.occupancy) {
    case "home":
      return "Someone is home";
    case "away":
      return "Nobody is home";
    default:
      return "Checking who is home";
  }
}
