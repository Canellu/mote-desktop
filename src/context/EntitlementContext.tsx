import { daysLeftUntil } from "@/features/pro/trial";
import { describeCommandError } from "@/lib/entitlement-errors";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

/** Mirrors `EntitlementState` in src-tauri/src/services/entitlements.rs. */
export type EntitlementState = "active" | "inactive" | "unknown";

/** Mirrors `TrialStatus` in src-tauri/src/services/trial.rs. Unix milliseconds. */
export interface TrialStatus {
  startedAt: number;
  endsAt: number;
  active: boolean;
}

/** Mirrors `EntitlementStatus`. Provider-neutral by design: nothing here
 *  names the Microsoft Store, so swapping the commerce adapter is a Rust-side
 *  change only. `pro` is the purchase alone; the trial is reported beside it. */
export interface EntitlementSnapshot {
  pro: EntitlementState;
  household: EntitlementState;
  /** This installation's Pro trial, or null until its first bridge is paired. */
  trial: TrialStatus | null;
}

/** The development override's stops, in the order the badge steps through. */
export type DebugTier =
  | "free"
  | "trial"
  | "trial_ending"
  | "trial_ended"
  | "pro";

const UNAVAILABLE: EntitlementSnapshot = {
  pro: "unknown",
  household: "unknown",
  trial: null,
};

/** Emitted by the backend whenever what this installation may do changes. */
const ENTITLEMENTS_CHANGED_EVENT = "entitlements-changed";

const HOUR_MS = 60 * 60 * 1000;

interface EntitlementContextValue {
  snapshot: EntitlementSnapshot;
  /**
   * Pro is usable: bought, or a trial is running. Only on an explicit answer —
   * `unknown` means the backend could not say, and an unanswered question is not
   * a purchase. Treating it as one would hand out Pro whenever the commerce
   * adapter had a bad day.
   */
  hasPro: boolean;
  /** Pro is coming from the trial rather than a purchase. */
  onTrial: boolean;
  /** Whole days left on a running trial, counted up; null when not on one. */
  trialDaysLeft: number | null;
  /** The trial is over and the Store says nothing was bought. */
  trialEnded: boolean;
  /**
   * Pro has gone for certain: not owned, and no trial running. An unknown answer
   * is not a lapse, so saved Pro setups are never hidden from somebody who paid
   * just because the Store could not be reached.
   */
  proLapsed: boolean;
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
  setDebugTier: ((tier: DebugTier) => Promise<void>) | null;
}

const EntitlementContext = createContext<EntitlementContextValue | null>(null);

/** Whether this bundle may offer the development entitlement override. */
const allowDebugOverride = import.meta.env.DEV;

const DEBUG_TRIAL: Record<DebugTier, "none" | "active" | "ending" | "ended"> = {
  free: "none",
  trial: "active",
  trial_ending: "ending",
  trial_ended: "ended",
  pro: "none",
};

export const EntitlementProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [snapshot, setSnapshot] = useState<EntitlementSnapshot>(UNAVAILABLE);
  // Days left are counted against this rather than read from the clock during
  // render. It moves on every read and once an hour, which is plenty for a
  // number that changes once a day.
  const [now, setNow] = useState(() => Date.now());

  const apply = useCallback((next: EntitlementSnapshot) => {
    setSnapshot(next);
    setNow(Date.now());
  }, []);

  const refresh = useCallback(async () => {
    try {
      apply(await invoke<EntitlementSnapshot>("get-entitlements"));
    } catch {
      // A browser-only `bun dev` session has no Tauri IPC. Staying unavailable
      // shows the Free presentation, which is the safe side to fail towards.
      apply(UNAVAILABLE);
    }
  }, [apply]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The backend says when a trial ends, a purchase lands, or a refund does, so
  // nothing here has to poll for it.
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    listen(ENTITLEMENTS_CHANGED_EVENT, () => void refresh())
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch(() => {
        // No Tauri IPC in a browser-only session.
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), HOUR_MS);
    return () => window.clearInterval(timer);
  }, []);

  const syncFromStore = useCallback(async () => {
    try {
      apply(await invoke<EntitlementSnapshot>("refresh-entitlements"));
    } catch {
      // Leave the last known state alone. A failed check is not a downgrade,
      // and the Rust cache applies the same rule on its side.
    }
  }, [apply]);

  const purchasePro = useCallback(async () => {
    let purchaseError: unknown;
    try {
      await invoke("purchase-mote-pro");
    } catch (error) {
      purchaseError = error;
    }

    // A failed dialog can still leave a completed purchase. Check ownership
    // before showing its error; only the licence can grant Pro.
    try {
      const next = await invoke<EntitlementSnapshot>("refresh-entitlements");
      apply(next);
      if (next.pro === "active") return true;
    } catch (error) {
      purchaseError ??= error;
    }

    if (purchaseError != null) {
      toast.error("The purchase could not be confirmed", {
        description: describeCommandError(purchaseError),
        duration: 12000,
      });
    }
    return false;
  }, [apply]);

  const setDebugTier = useCallback(
    async (tier: DebugTier) => {
      try {
        await invoke("set-debug-entitlements", {
          snapshot: {
            pro: tier === "pro" ? "active" : "inactive",
            household: "inactive",
          },
        });
        apply(
          await invoke<EntitlementSnapshot>("set-debug-trial", {
            state: DEBUG_TRIAL[tier],
          }),
        );
      } catch {
        await refresh();
      }
    },
    [apply, refresh],
  );

  const value = useMemo<EntitlementContextValue>(() => {
    const { pro, trial } = snapshot;
    const purchased = pro === "active";
    const onTrial = !purchased && trial?.active === true;

    return {
      snapshot,
      hasPro: purchased || onTrial,
      onTrial,
      trialDaysLeft:
        onTrial && trial ? Math.max(1, daysLeftUntil(trial.endsAt, now)) : null,
      trialEnded: pro === "inactive" && trial !== null && !trial.active,
      proLapsed: pro === "inactive" && trial?.active !== true,
      refresh,
      syncFromStore,
      purchasePro,
      setDebugTier: allowDebugOverride ? setDebugTier : null,
    };
  }, [snapshot, now, refresh, syncFromStore, purchasePro, setDebugTier]);

  return (
    <EntitlementContext.Provider value={value}>
      {children}
    </EntitlementContext.Provider>
  );
};

/**
 * Reads entitlement state. Usable outside the provider, where it reports the
 * Free presentation rather than throwing.
 */
export const useEntitlements = (): EntitlementContextValue => {
  const context = useContext(EntitlementContext);

  return (
    context ?? {
      snapshot: UNAVAILABLE,
      hasPro: false,
      onTrial: false,
      trialDaysLeft: null,
      trialEnded: false,
      proLapsed: false,
      refresh: async () => {},
      syncFromStore: async () => {},
      purchasePro: async () => false,
      setDebugTier: null,
    }
  );
};
