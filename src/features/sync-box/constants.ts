import type {
  DiscoveredSyncBox,
  SyncBoxOnboardingState,
  StoredSyncBoxInfo,
  SyncBoxSession,
} from "@/types/sync-box";
import type { WizardDevNextStep } from "@/types/setup-wizard";

export const SYNC_BOX_CONNECTED_DEV_VIEW_ID = "sync-box-connected";

export const sampleSyncBoxes: DiscoveredSyncBox[] = [
  {
    name: "Living room Sync Box",
    deviceType: "HSB1",
    uniqueId: "C42996000000",
    ipAddress: "192.168.1.52",
    port: 443,
    apiLevel: 10,
    firmwareVersion: "2.5.3",
    supported: true,
  },
  {
    name: "Media room Sync Box",
    deviceType: "HSB1",
    uniqueId: "D53807000001",
    ipAddress: "192.168.1.68",
    port: 443,
    apiLevel: 6,
    firmwareVersion: "1.6.2",
    supported: false,
  },
];

const sampleStoredSyncBox: StoredSyncBoxInfo = {
  name: sampleSyncBoxes[0].name,
  deviceType: sampleSyncBoxes[0].deviceType,
  uniqueId: sampleSyncBoxes[0].uniqueId,
  ipAddress: sampleSyncBoxes[0].ipAddress,
  port: sampleSyncBoxes[0].port,
  apiLevel: sampleSyncBoxes[0].apiLevel,
  firmwareVersion: sampleSyncBoxes[0].firmwareVersion,
  bridgeUniqueId: null,
};

export const sampleSyncBoxSession: SyncBoxSession = {
  configured: true,
  connected: true,
  syncBox: sampleStoredSyncBox,
  syncBoxes: [sampleStoredSyncBox],
  error: null,
};

export interface SyncBoxWizardDevState {
  id: string;
  label: string;
  state: SyncBoxOnboardingState;
}

export const syncBoxWizardDevStates: SyncBoxWizardDevState[] = [
  {
    id: "sync-box-welcome",
    label: "Welcome",
    state: { type: "welcome" },
  },
  {
    id: "sync-box-discovering",
    label: "Discovering",
    state: { type: "discovering" },
  },
  {
    id: "sync-box-found",
    label: "Sync Box found",
    state: {
      type: "select",
      syncBoxes: [sampleSyncBoxes[0]],
      selectedUniqueId: sampleSyncBoxes[0].uniqueId,
    },
  },
  {
    id: "sync-box-select",
    label: "Select Sync Box",
    state: {
      type: "select",
      syncBoxes: sampleSyncBoxes,
      selectedUniqueId: sampleSyncBoxes[0].uniqueId,
    },
  },
  {
    id: "sync-box-pairing",
    label: "Pairing",
    state: { type: "pairing", syncBox: sampleSyncBoxes[0] },
  },
  {
    id: "sync-box-success",
    label: "Success",
    state: { type: "success", session: sampleSyncBoxSession },
  },
  {
    id: "sync-box-error-not-found",
    label: "Error: not found",
    state: {
      type: "error",
      reason: "not-found",
      message: "No Hue Sync Boxes were found on this network.",
    },
  },
  {
    id: "sync-box-error-unsupported",
    label: "Error: firmware",
    state: {
      type: "error",
      reason: "unsupported",
      message:
        "Media room Sync Box uses API level 6. Update its firmware in the official Hue Sync app before connecting.",
      syncBox: sampleSyncBoxes[1],
    },
  },
  {
    id: "sync-box-error-discovery",
    label: "Error: discovery",
    state: {
      type: "error",
      reason: "discovery",
      message: "Something went wrong while searching for Sync Boxes.",
    },
  },
  {
    id: "sync-box-error-pairing",
    label: "Error: pairing",
    state: {
      type: "error",
      reason: "pairing",
      message: "The Sync Box rejected the registration request.",
      syncBox: sampleSyncBoxes[0],
    },
  },
  {
    id: "sync-box-error-timeout",
    label: "Error: timeout",
    state: {
      type: "error",
      reason: "timeout",
      message: "Pairing timed out before the Sync Box button was authorized.",
      syncBox: sampleSyncBoxes[0],
    },
  },
];

export const syncBoxDevNextSteps: Partial<
  Record<SyncBoxOnboardingState["type"], WizardDevNextStep[]>
> = {
  discovering: [
    { id: "sync-box-found", label: "One found" },
    { id: "sync-box-select", label: "Multiple found" },
    { id: "sync-box-error-not-found", label: "None found" },
    { id: "sync-box-error-unsupported", label: "Firmware unsupported" },
    { id: "sync-box-error-discovery", label: "Discovery failed" },
  ],
  pairing: [
    { id: "sync-box-success", label: "Success" },
    { id: "sync-box-error-timeout", label: "Timeout" },
    { id: "sync-box-error-pairing", label: "Pairing failed" },
  ],
  success: [{ id: SYNC_BOX_CONNECTED_DEV_VIEW_ID, label: "Connected view" }],
};
