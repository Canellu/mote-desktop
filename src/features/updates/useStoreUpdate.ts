import { createContext, useContext } from "react";
import type { StoreUpdateStatus } from "./api";

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
    install: async () => {},
    recheck: async () => {},
  };
