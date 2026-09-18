import { DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import heroDark from "@/assets/pro-hero-dark.webp";
import heroLight from "@/assets/pro-hero-light.webp";
import { BuyButton } from "@/features/pro/BuyButton";
import type { ProFeature } from "@/features/pro/proUpgrade";
import { purchaseLabel, type ProPurchase } from "@/features/pro/useProPurchase";
import { cn } from "@/lib/utils";
import {
  Check,
  Keyboard,
  LayoutGrid,
  Radio,
  Router,
  Sparkles,
  Tv,
  X,
} from "lucide-react";

/** What the dialog leads with, so it answers the thing the customer just tried. */
const LEAD: Record<ProFeature, string> = {
  pc_sync: "PC Sync is part of Mote Pro",
  multiple_bridges: "A second bridge is part of Mote Pro",
  advanced_widgets: "This widget needs Mote Pro",
  dashboard_custom_layout: "Your own layout is part of Mote Pro",
  global_shortcuts: "Shortcuts are part of Mote Pro",
  local_automation: "Automations are part of Mote Pro",
  trial_ended: "Your Pro trial has ended",
  general: "Everything Mote can do",
};

/** The line under the lead. Only an ended trial has something else to say. */
const SUBTITLE: Partial<Record<ProFeature, string>> = {
  trial_ended:
    "Everything you set up is saved. One purchase switches it back on, on every PC you sign in to.",
};

/** What Pro includes, in the order somebody would care about it. */
const INCLUDED = [
  {
    icon: Radio,
    title: "Automations",
    detail: "Lights react to your calls and to locking your PC.",
  },
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
 * Offer on the left, photograph on the right, split exactly down the middle.
 *
 * The halves meet at a hairline rather than a gradient, so the picture is shown
 * whole and the reading side keeps the app's ordinary surface and contrast. When
 * the window is too narrow for two columns the picture moves on top and meets
 * the content at the same kind of line. The content comes first in the markup,
 * which is the order it should be read in, and `order` handles the arrangement.
 *
 * Everything to read scrolls; the buttons do not. They sit in their own footer
 * under the scroll area, so Get Mote Pro stays on screen however far the offer
 * is scrolled.
 */
export const ProPaywall: React.FC<ProPaywallProps> = ({
  feature,
  purchase,
  onClose,
}) => {
  const { offer, phase, buy, retry } = purchase;

  const label = purchaseLabel(phase);

  return (
    <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden md:grid-cols-2 md:grid-rows-1">
      <div className="order-2 flex min-h-0 flex-col md:order-1">
        {/* The fade only appears on an edge with more to scroll toward, so it
          marks hidden content without dimming an offer that fits. */}
        <ScrollArea
          fade
          className="min-h-0 flex-1 overflow-hidden"
          viewportClassName="p-9"
        >
          <div className="grid gap-6">
            <header className="grid gap-2">
              <DialogTitle className="font-heading text-[1.75rem] leading-tight font-semibold text-balance">
                {phase === "done" ? "Mote Pro is yours" : LEAD[feature]}
              </DialogTitle>
              <p className="text-sm leading-6 text-muted-foreground">
                {SUBTITLE[feature] ??
                  "One purchase unlocks all of it, on every PC you sign in to."}
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
                The purchase did not go through, so nothing was charged.
                Checking again will find Mote Pro if you already own it.
              </p>
            )}

            <div className="grid gap-4">
              {/* A price row with no price is worse than no price row: an empty
                slot next to "One-time purchase" reads as broken, or as free.
                When the Store cannot answer — it is unreachable, or this is a
                dev build with no Store at all — say plainly where the number
                comes from instead of drawing a placeholder. */}
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
                  A one-time purchase. The Microsoft Store shows the price for
                  your region before you pay.
                </p>
              )}

              <p className="text-xs leading-5 text-muted-foreground">
                {FOOTNOTE}
              </p>
            </div>
          </div>
        </ScrollArea>

        <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t px-9 py-5">
          <BuyButton
            onClick={
              phase === "done" ? onClose : phase === "unavailable" ? retry : buy
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
        </footer>
      </div>

      <div className="relative order-1 h-40 overflow-hidden border-b md:order-2 md:h-auto md:border-b-0 md:border-l">
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
