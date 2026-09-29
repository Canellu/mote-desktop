import type {
  BridgeKind,
  DiscoveredBridge,
  ErrorReason,
  SetupState,
  WizardDevNextStep,
  WizardDevState,
} from "@/types/setup-wizard";

// Silent backstop so the pairing poll loop can't run forever if the user walks
// away or closes the lid mid-pairing. There's no visible countdown; the Cancel
// button is the user-facing exit, and this eventually stops polling.
export const PAIRING_TIMEOUT_SECONDS = 180;

export const sampleBridges: DiscoveredBridge[] = [
  { bridgeId: "001788FFFE1A2B3C", bridgeIp: "192.168.1.42", modelId: "BSB002" },
  { bridgeId: "001788FFFE4D5E6F", bridgeIp: "192.168.1.77", modelId: "BSB003" },
];

// Dev-only: build N distinct sample bridges for previewing the select step with
// any number of discovered bridges. Model alternates so both illustrations show.
export const makeSampleBridges = (count: number): DiscoveredBridge[] =>
  Array.from({ length: Math.max(1, count) }, (_, index) => ({
    bridgeId: `001788FFFE${index.toString(16).toUpperCase().padStart(6, "0")}`,
    bridgeIp: `192.168.1.${42 + index}`,
    modelId: index % 2 === 0 ? "BSB002" : "BSB003",
  }));

// Default bridge count shown when first opening the Select bridge dev preview.
// The hook rebuilds this state from the dev toolbar's count, so it's just a seed.
export const DEV_DEFAULT_BRIDGE_COUNT = 1;

/** A sample bridge of the given kind, for the Pairing preview's Normal/Pro tabs. */
export const sampleBridgeForKind = (kind: BridgeKind): DiscoveredBridge =>
  kind === "pro" ? sampleBridges[1] : sampleBridges[0];

// Bridge variant the Pairing dev preview opens on.
export const DEV_DEFAULT_PAIRING_KIND: BridgeKind = "original";

const defaultDevBridges = makeSampleBridges(DEV_DEFAULT_BRIDGE_COUNT);

// Dev toolbar entries. Each has a unique id so multiple variants of the same
// state type can coexist and toggle.
export const wizardDevStates: WizardDevState[] = [
  { id: "welcome", label: "Welcome", state: { type: "welcome" } },
  { id: "discovering", label: "Discovering", state: { type: "discovering" } },
  {
    id: "selectBridge",
    label: "Select bridge",
    state: {
      type: "selectBridge",
      bridges: defaultDevBridges,
      selectedBridgeIp:
        defaultDevBridges.length === 1 ? defaultDevBridges[0].bridgeIp : "",
    },
  },
  {
    id: "pairing",
    label: "Pairing",
    // Variant (Normal/Pro) is chosen live via the toolbar's tabs in dev.
    state: { type: "pairing", bridge: sampleBridges[0] },
  },
  { id: "manualEntry", label: "Manual IP", state: { type: "manualEntry" } },
  {
    id: "manualEntry-error",
    label: "Manual IP: error",
    state: {
      type: "manualEntry",
      ip: "192.168.1.250",
      message:
        "No Hue Bridge answered at 192.168.1.250. Check the address and that the bridge is powered on.",
    },
  },
  { id: "success", label: "Success", state: { type: "success" } },
  {
    id: "error-no-bridges",
    label: "Error: no bridges",
    state: {
      type: "error",
      reason: "no-bridges",
      message: "No Hue Bridges found on your network.",
    },
  },
  {
    id: "error-timeout",
    label: "Error: timeout",
    state: {
      type: "error",
      reason: "timeout",
      message: "Pairing timed out before the bridge button was pressed.",
      bridge: sampleBridges[0],
    },
  },
  {
    id: "error-discovery",
    label: "Error: discovery",
    state: {
      type: "error",
      reason: "discovery",
      message:
        "No bridge answered on your network, and the Philips online lookup is busy right now.",
    },
  },
  {
    id: "error-pairing",
    label: "Error: pairing",
    state: {
      type: "error",
      reason: "pairing",
      message: "The bridge rejected the pairing request.",
      bridge: sampleBridges[0],
    },
  },
];

// Dev-only quick-jump shortcuts for natural next transitions from a state.
export const devNextSteps: Partial<
  Record<SetupState["type"], WizardDevNextStep[]>
> = {
  discovering: [
    { id: "selectBridge", label: "Bridge(s) found" },
    { id: "error-discovery", label: "Discovery failed" },
  ],
  pairing: [
    { id: "success", label: "Success" },
    { id: "error-timeout", label: "Timeout" },
    { id: "error-pairing", label: "Pairing failed" },
  ],
};

export const errorTitles: Record<ErrorReason, string> = {
  "no-bridges": "No bridges found",
  timeout: "Pairing timed out",
  discovery: "Discovery failed",
  pairing: "Pairing failed",
};

export const errorHelp: Record<ErrorReason, string> = {
  "no-bridges":
    "Make sure your computer and Hue Bridge are on the same Wi-Fi network, and that the bridge is connected to your router by Ethernet and powered on.",
  timeout:
    "The bridge wasn't authorized in time. Click “Try again” to give it another go.",
  discovery:
    "Check that your bridge is powered on and on the same network, and that Windows Firewall allows Mote Desktop. You can also enter the bridge's address.",
  pairing: "Try pairing again. If it keeps failing, restart your Hue Bridge.",
};
