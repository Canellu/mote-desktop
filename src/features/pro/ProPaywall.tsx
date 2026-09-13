import { DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import heroDark from "@/assets/pro-hero-dark.webp";
import heroLight from "@/assets/pro-hero-light.webp";
import { BuyButton } from "@/features/pro/BuyButton";
import type { ProFeature } from "@/features/pro/proUpgrade";
import type { ProPurchase } from "@/features/pro/useProPurchase";
import { cn } from "@/lib/utils";
import { Check, Keyboard, LayoutGrid, Router, Sparkles, Tv, X } from "lucide-react";

/** What the dialog leads with, so it answers the thing the customer just tried. */
const LEAD: Record<ProFeature, string> = {
  pc_sync: "PC Sync is part of Mote Pro",
  multiple_bridges: "A second bridge is part of Mote Pro",
  advanced_widgets: "This widget needs Mote Pro",
  dashboard_custom_layout: "Your own layout is part of Mote Pro",
  global_shortcuts: "Shortcuts are part of Mote Pro",
  general: "Everything Mote can do",
};

/** What Pro includes, in the order somebody would care about it. */
const INCLUDED = [
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

const FOOTNOTE =
  "Bought and refunded through the Microsoft Store. Already paid on another PC? Sign in with the same account and it restores itself.";

interface ProPaywallProps {
  feature: ProFeature;
  purchase: ProPurchase;
  onClose: () => void;
}

/**
 * Offer on the left, photograph on the right.
 *
 * Nothing sits on top of the picture, so it is shown whole and the reading side
 * keeps the app's ordinary surface and contrast. The content comes first in the
 * markup, which is the order it should be read in, and `order` handles the
 * arrangement: picture on top when the window is narrow, to the right when it is
 * wide, where a side-by-side split would otherwise squeeze it into a strip
 * nobody can see.
 */
export const ProPaywall: React.FC<ProPaywallProps> = ({
  feature,
  purchase,
  onClose,
}) => {
  const { offer, phase, buy, retry } = purchase;

  const label =
    phase === "done"
      ? "Done"
      : phase === "unavailable"
        ? "Check again"
        : phase === "working"
          ? "Opening the Store…"
          : "Get Mote Pro";

  return (
    <div className="grid max-h-[min(92vh,44rem)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:grid-rows-1">
      <ScrollArea className="order-2 min-h-0 md:order-1" viewportClassName="p-9">
        <div className="grid gap-6">
          <header className="grid gap-2">
            <DialogTitle className="font-heading text-[1.75rem] leading-tight font-semibold text-balance">
              {phase === "done" ? "Mote Pro is yours" : LEAD[feature]}
            </DialogTitle>
            <p className="text-sm leading-6 text-muted-foreground">
              One purchase unlocks all of it, on every PC you sign in to.
            </p>
          </header>

          <ul className="grid gap-3.5">
            {INCLUDED.map(({ icon: Icon, title, detail }) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                  <Icon size={15} />
                </span>
                <span className="min-w-0">
                  <span className="text-sm font-semibold">{title} </span>
                  <span className="text-sm leading-6 text-muted-foreground">
                    {detail}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          {phase === "unavailable" && (
            <p className="rounded-lg bg-muted px-3.5 py-2.5 text-sm leading-6 text-muted-foreground">
              The purchase did not go through, so nothing was charged. Checking
              again will find Mote Pro if you already own it.
            </p>
          )}

          <div className="grid gap-4 border-t pt-5">
            {/* A price row with no price is worse than no price row: an empty
              slot next to "One-time purchase" reads as broken, or as free. When
              the Store cannot answer — it is unreachable, or this is a dev build
              with no Store at all — say plainly where the number comes from
              instead of drawing a placeholder. */}
            {offer?.formattedPrice ? (
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-muted-foreground">
                  One-time purchase
                </span>
                <span className="text-2xl font-semibold tracking-tight">
                  {offer.formattedPrice}
                </span>
              </div>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">
                A one-time purchase. The Microsoft Store shows the price for your
                region before you pay.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <BuyButton
                onClick={
                  phase === "done"
                    ? onClose
                    : phase === "unavailable"
                      ? retry
                      : buy
                }
                disabled={phase === "working"}
              >
                {phase === "done" ? (
                  <span className="inline-flex items-center gap-2">
                    <Check size={18} />
                    {label}
                  </span>
                ) : (
                  label
                )}
              </BuyButton>

              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
              >
                Not now
              </button>
            </div>

            <p className="text-xs leading-5 text-muted-foreground">{FOOTNOTE}</p>
          </div>
        </div>
      </ScrollArea>

      <div className="relative order-1 h-40 overflow-hidden md:order-2 md:h-auto">
        {/* Dawn for the light theme, the aurora for the dark one. Swapped in CSS
          rather than from a theme hook so it follows the `.dark` class with no
          flash on toggle. */}
        <img
          src={heroLight}
          alt=""
          aria-hidden
          className="absolute inset-0 size-full object-cover dark:hidden"
        />
        <img
          src={heroDark}
          alt=""
          aria-hidden
          className="absolute inset-0 hidden size-full object-cover dark:block"
        />
        {/* Only along the seam, so the two halves meet in a gradient rather than
          a hard edge. Bottom edge when stacked, inner edge when side by side. */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(to_top,var(--color-popover),transparent)] md:inset-y-0 md:right-auto md:left-0 md:h-auto md:w-24 md:bg-[linear-gradient(to_right,var(--color-popover),transparent)]"
        />
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className={cn(
          "absolute top-3 right-3 z-20 grid size-8 place-items-center rounded-full",
          "bg-black/25 text-white/85 backdrop-blur-md transition-colors hover:bg-black/40",
          "outline-none focus-visible:ring-2 focus-visible:ring-white/60",
        )}
      >
        <X size={16} />
      </button>
    </div>
  );
};
