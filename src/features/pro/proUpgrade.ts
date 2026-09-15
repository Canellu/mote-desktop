import { createContext, useContext } from "react";

/** The capabilities a customer can be asked to buy, in their own words. */
export type ProFeature =
  | "pc_sync"
  | "multiple_bridges"
  | "advanced_widgets"
  | "dashboard_custom_layout"
  | "global_shortcuts"
  | "local_automation"
  | "trial_ended"
  | "general";

export interface ProUpgradeContextValue {
  /** Opens the purchase dialog, leading with the capability that prompted it. */
  requestPro: (feature?: ProFeature) => void;
}

export const ProUpgradeContext = createContext<ProUpgradeContextValue | null>(
  null,
);

/**
 * Opens the purchase dialog from anywhere.
 *
 * Safe outside the provider — widget windows mount their own React tree — where
 * asking to buy simply does nothing rather than throwing.
 */
export const useProUpgrade = (): ProUpgradeContextValue =>
  useContext(ProUpgradeContext) ?? { requestPro: () => {} };

let opener: ((feature: ProFeature) => void) | null = null;

/** The provider claims this on mount so the escape hatch below has something to call. */
export function registerProUpgradeOpener(
  open: (feature: ProFeature) => void,
): () => void {
  opener = open;
  return () => {
    if (opener === open) opener = null;
  };
}

/**
 * Opens the purchase dialog from outside React.
 *
 * The global shortcut handler is a zustand store with no component around it,
 * and a refusal there is exactly the moment somebody should be offered the
 * purchase. Does nothing when no provider is mounted, which is the case in a
 * widget window.
 */
export function openProUpgrade(feature: ProFeature = "general"): void {
  opener?.(feature);
}
