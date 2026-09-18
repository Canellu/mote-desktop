import { useEntitlements } from "@/context/EntitlementContext";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";

/** Mirrors `ProOffer` in src-tauri/src/commands/store_commerce.rs. */
export interface ProOffer {
  title: string | null;
  formattedPrice: string | null;
  owned: boolean;
}

export type ProPhase = "offer" | "working" | "unavailable" | "done";

export interface ProPurchase {
  /** The Store's own localised price, or null when it could not answer. */
  offer: ProOffer | null;
  phase: ProPhase;
  buy: () => void;
  retry: () => void;
}

/** The buy button's words for each step of a purchase. */
export function purchaseLabel(phase: ProPhase): string {
  return phase === "done"
    ? "Done"
    : phase === "unavailable"
      ? "Check again"
      : phase === "working"
        ? "Opening the Store…"
        : "Get Mote Pro";
}

/**
 * Everything a paywall does, with nothing about how it looks.
 *
 * The variants differ only in presentation, so the buying lives here once. A
 * bug fixed in one of them would otherwise have to be found again in the other
 * three.
 */
export function useProPurchase(open: boolean): ProPurchase {
  const { purchasePro, syncFromStore } = useEntitlements();
  const [phase, setPhase] = useState<ProPhase>("offer");
  const [offer, setOffer] = useState<ProOffer | null>(null);

  useEffect(() => {
    if (!open) return;
    setPhase("offer");

    // Ask the Store what this costs here, only once it is actually shown.
    let cancelled = false;
    void invoke<ProOffer>("get-pro-offer")
      .then((next) => !cancelled && setOffer(next))
      .catch(() => !cancelled && setOffer(null));
    return () => {
      cancelled = true;
    };
  }, [open]);

  const buy = useCallback(() => {
    setPhase("working");
    void purchasePro().then((owned) =>
      setPhase(owned ? "done" : "unavailable"),
    );
  }, [purchasePro]);

  const retry = useCallback(() => {
    setPhase("working");
    void syncFromStore().then(() => setPhase("offer"));
  }, [syncFromStore]);

  return { offer, phase, buy, retry };
}
