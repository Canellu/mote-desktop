import { createContext, useContext } from "react";

/** The capabilities a customer can be asked to buy, in their own words. */
export type ProFeature =
  | "pc_sync"
  | "multiple_bridges"
  | "advanced_widgets"
  | "dashboard_custom_layout"
  | "global_shortcuts"
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
