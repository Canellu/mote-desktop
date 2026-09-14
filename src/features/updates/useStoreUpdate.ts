import { createContext, useContext } from "react";
import type { StoreUpdateProgress, StoreUpdateStatus } from "./api";

export const NO_STORE_UPDATE: StoreUpdateStatus = {
  supported: false,
  available: false,
  mandatory: false,
};

export interface StoreUpdateContextValue {
  status: StoreUpdateStatus;
  /** When the Store last answered, in epoch milliseconds. Null until it has. */
  checkedAt: number | null;
  installing: boolean;
  /** Null until the customer accepts Microsoft's dialog and the download starts. */
  progress: StoreUpdateProgress | null;
  install: () => Promise<void>;
  recheck: () => Promise<void>;
}

export const StoreUpdateContext = createContext<StoreUpdateContextValue | null>(
  null,
);

/** Outside the provider (a widget window) this reports nothing to install. */
export const useStoreUpdate = (): StoreUpdateContextValue =>
  useContext(StoreUpdateContext) ?? {
    status: NO_STORE_UPDATE,
    checkedAt: null,
    installing: false,
    progress: null,
    install: async () => {},
    recheck: async () => {},
  };
