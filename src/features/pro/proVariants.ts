import { Keyboard, LayoutGrid, Router, Sparkles, Tv } from "lucide-react";
import { create } from "zustand";
import type { ProFeature } from "@/features/pro/proUpgrade";

/** Which paywall design is being shown. */
export type PaywallVariant = "aurora" | "split" | "quiet" | "spotlight";

export const PAYWALL_VARIANTS: { id: PaywallVariant; label: string }[] = [
  { id: "aurora", label: "Aurora" },
  { id: "split", label: "Split" },
  { id: "quiet", label: "Quiet" },
  { id: "spotlight", label: "Spotlight" },
];

const STORAGE_KEY = "mote-paywall-variant";

const readStored = (): PaywallVariant => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (PAYWALL_VARIANTS.some((v) => v.id === raw))
      return raw as PaywallVariant;
  } catch {
    // Storage can be unavailable; the default is fine.
  }
  return "aurora";
};

interface VariantState {
  variant: PaywallVariant;
  setVariant: (next: PaywallVariant) => void;
}

/**
 * Which design is on screen, remembered between launches.
 *
 * This exists to compare the four side by side while the design is being
 * chosen. The switcher that drives it is development-only: a customer has no
 * reason to pick a paywall, and shipping the choice would mean shipping four
 * designs to maintain forever. When one wins, delete the others and this file.
 */
export const usePaywallVariant = create<VariantState>((set) => ({
  variant: readStored(),
  setVariant: (next) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not persisting is survivable.
    }
    set({ variant: next });
  },
}));

/** What the dialog leads with, so it answers the thing the customer just tried. */
export const LEAD: Record<ProFeature, string> = {
  pc_sync: "PC Sync is part of Mote Pro",
  multiple_bridges: "A second bridge is part of Mote Pro",
  advanced_widgets: "This widget needs Mote Pro",
  dashboard_custom_layout: "Your own layout is part of Mote Pro",
  global_shortcuts: "Shortcuts are part of Mote Pro",
  general: "Everything Mote can do",
};

/** What Pro includes, in the order somebody would care about it. */
export const INCLUDED = [
  {
    icon: Tv,
    title: "PC Sync",
    detail: "Lights follow video, games, or whatever is playing.",
  },
  {
    icon: Keyboard,
    title: "Global shortcuts",
    detail: "Change a light from anywhere in Windows.",
  },
  {
    icon: Sparkles,
    title: "Richer widgets",
    detail: "More than one control, and set its size and place.",
  },
  {
    icon: LayoutGrid,
    title: "Your own dashboard",
    detail: "Arrange home the way your home really is.",
  },
  {
    icon: Router,
    title: "Every bridge",
    detail: "Save more than one, switch whenever.",
  },
];

/** The one line of small print every variant carries. */
export const FOOTNOTE =
  "Bought and refunded through the Microsoft Store. Already paid on another PC? Sign in with the same account and it restores itself.";

/** Everything a variant needs. They differ in presentation and nothing else. */
export interface PaywallProps {
  feature: ProFeature;
  purchase: import("@/features/pro/useProPurchase").ProPurchase;
  onClose: () => void;
}
