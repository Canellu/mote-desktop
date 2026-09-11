import { invoke } from "@tauri-apps/api/core";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** Mirrors `EntitlementState` in src-tauri/src/services/entitlements.rs. */
export type EntitlementState = "active" | "inactive" | "unknown";

/** Mirrors `EntitlementSnapshot`. Provider-neutral by design: nothing here
 *  names the Microsoft Store, so swapping the commerce adapter is a Rust-side
 *  change only. */
export interface EntitlementSnapshot {
  pro: EntitlementState;
  household: EntitlementState;
}

const UNAVAILABLE: EntitlementSnapshot = {
  pro: "unknown",
  household: "unknown",
};

interface EntitlementContextValue {
  snapshot: EntitlementSnapshot;
  /**
   * Entitled only on an explicit `active`. `unknown` means the backend could
   * not answer, and an unanswered question is not a purchase — treating it as
   * one would hand out Pro whenever the commerce adapter had a bad day.
   */
  hasPro: boolean;
  /** Re-reads the cached snapshot. Cheap; does not talk to the Store. */
  refresh: () => Promise<void>;
  /**
   * Asks the commerce backend again and folds the answer in. This is also the
   * restore path: restoring on a new machine is this read, once the customer is
   * signed in to the account that owns the add-on.
   */
  syncFromStore: () => Promise<void>;
  /**
   * Opens Microsoft's purchase flow, then re-reads. Resolves true only when the
   * customer owns Pro afterwards — the dialog's word is not the entitlement.
   */
  purchasePro: () => Promise<boolean>;
  /**
   * Development override, or `null` in a release build. The Rust side compiles
   * the mutable provider out of release entirely, so this is not merely hidden.
   */
  setDebugPro: ((active: boolean) => Promise<void>) | null;
}

const EntitlementContext = createContext<EntitlementContextValue | null>(null);

/** Whether this bundle may offer the development entitlement override. */
const allowDebugOverride = import.meta.env.DEV;

export const EntitlementProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [snapshot, setSnapshot] = useState<EntitlementSnapshot>(UNAVAILABLE);

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await invoke<EntitlementSnapshot>("get-entitlements"));
    } catch {
      // A browser-only `bun dev` session has no Tauri IPC. Staying unavailable
      // shows the Free presentation, which is the safe side to fail towards.
      setSnapshot(UNAVAILABLE);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const syncFromStore = useCallback(async () => {
    try {
      setSnapshot(await invoke<EntitlementSnapshot>("refresh-entitlements"));
    } catch {
      // Leave the last known state alone. A failed check is not a downgrade,
      // and the Rust cache applies the same rule on its side.
    }
  }, []);

  const purchasePro = useCallback(async () => {
    try {
      await invoke("purchase-mote-pro");
    } catch {
      // A cancelled or failed dialog still falls through to the read below,
      // which is the only thing that decides what the customer owns.
    }

    try {
      const next = await invoke<EntitlementSnapshot>("refresh-entitlements");
      setSnapshot(next);
      return next.pro === "active";
    } catch {
      return false;
    }
  }, []);

  const setDebugPro = useCallback(
    async (active: boolean) => {
      try {
        setSnapshot(
          await invoke<EntitlementSnapshot>("set-debug-entitlements", {
            snapshot: {
              pro: active ? "active" : "inactive",
              household: "inactive",
            },
          }),
        );
      } catch {
        await refresh();
      }
    },
    [refresh],
  );

  const value = useMemo<EntitlementContextValue>(
    () => ({
      snapshot,
      hasPro: snapshot.pro === "active",
      refresh,
      syncFromStore,
      purchasePro,
      setDebugPro: allowDebugOverride ? setDebugPro : null,
    }),
    [snapshot, refresh, syncFromStore, purchasePro, setDebugPro],
  );

  return (
    <EntitlementContext.Provider value={value}>
      {children}
    </EntitlementContext.Provider>
  );
};

/**
 * Reads entitlement state. Usable outside the provider — widget windows mount
 * their own tree — where it reports the Free presentation rather than throwing.
 */
export const useEntitlements = (): EntitlementContextValue => {
  const context = useContext(EntitlementContext);

  return (
    context ?? {
      snapshot: UNAVAILABLE,
      hasPro: false,
      refresh: async () => {},
      syncFromStore: async () => {},
      purchasePro: async () => false,
      setDebugPro: null,
    }
  );
};
