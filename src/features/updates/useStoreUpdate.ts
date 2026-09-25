import { createContext, useContext } from "react";
import type { StoreUpdateStatus } from "./api";

export const NO_STORE_UPDATE: StoreUpdateStatus = {
  supported: false,
  available: false,
  mandatory: false,
};

/**
 * Where an update stands once the Store has offered one: downloading while Mote
 * stays open, downloaded and waiting for a restart, then restarting to install.
 */
export type StoreUpdatePhase = "idle" | "downloading" | "ready" | "restarting";

export interface StoreUpdateContextValue {
  status: StoreUpdateStatus;
  /** When the Store last answered, in epoch milliseconds. Null until it has. */
  checkedAt: number | null;
  phase: StoreUpdatePhase;
  /** Download percent. Null until the Store reports the download moving. */
  percent: number | null;
  /**
   * Installs the update, which closes Mote and reopens it. Downloads it first
   * when the automatic download could not run.
   */
  restart: () => Promise<void>;
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
    phase: "idle",
    percent: null,
    restart: async () => {},
    recheck: async () => {},
  };
