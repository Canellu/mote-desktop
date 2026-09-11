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
  /** Re-reads the snapshot, e.g. after a purchase or restore completes. */
  refresh: () => Promise<void>;
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
      setDebugPro: allowDebugOverride ? setDebugPro : null,
    }),
    [snapshot, refresh, setDebugPro],
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
      setDebugPro: null,
    }
  );
};
