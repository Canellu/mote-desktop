import { DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import heroDark from "@/assets/pro-hero-dark.webp";
import heroLight from "@/assets/pro-hero-light.webp";
import {
  FOOTNOTE,
  INCLUDED,
  LEAD,
  type PaywallProps,
} from "@/features/pro/proVariants";
import { cn } from "@/lib/utils";
import { Check, X } from "lucide-react";

/**
 * Picture on one side, offer on the other.
 *
 * The opposite trade to Aurora: nothing sits on top of the photograph, so it is
 * shown whole and the reading side keeps the app's ordinary surface and
 * contrast. On a narrow window the image becomes a band above the content
 * rather than being squeezed into a strip nobody can see.
 */
export const SplitPaywall: React.FC<PaywallProps> = ({
  feature,
  purchase,
  onClose,
}) => {
  const { offer, phase, buy, retry } = purchase;

  return (
    <div className="grid max-h-[min(92vh,44rem)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] md:grid-rows-1">
      <div className="relative h-40 overflow-hidden md:h-auto">
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
        {/* Only where the two halves meet, so the seam is a gradient rather
          than a hard edge against the panel. */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(to_top,var(--color-popover),transparent)] md:inset-y-0 md:right-0 md:left-auto md:h-auto md:w-24 md:bg-[linear-gradient(to_left,var(--color-popover),transparent)]"
        />
      </div>

      <ScrollArea className="min-h-0" viewportClassName="p-9">
        <div className="grid gap-6">
          <header className="grid gap-2 pr-10">
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

          <div className="grid gap-3 border-t pt-5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-muted-foreground">
                One-time purchase
              </span>
              <span className="text-2xl font-semibold tracking-tight">
                {offer?.formattedPrice ?? "—"}
              </span>
            </div>

            <button
              type="button"
              onClick={
                phase === "done"
                  ? onClose
                  : phase === "unavailable"
                    ? retry
                    : buy
              }
              disabled={phase === "working"}
              className={cn(
                "w-full rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground",
                "transition-[transform,filter] duration-150 hover:brightness-110 active:scale-[0.99]",
                "outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                "disabled:pointer-events-none disabled:opacity-60",
              )}
            >
              {phase === "done" ? (
                <span className="inline-flex items-center gap-2">
                  <Check size={16} />
                  Done
                </span>
              ) : phase === "unavailable" ? (
                "Check again"
              ) : phase === "working" ? (
                "Opening the Store…"
              ) : (
                "Get Mote Pro"
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
            >
              Not now
            </button>

            <p className="text-xs leading-5 text-muted-foreground">
              {FOOTNOTE}
            </p>
          </div>
        </div>
      </ScrollArea>

      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className={cn(
          "absolute top-3 right-3 z-20 grid size-8 place-items-center rounded-full",
          "bg-foreground/5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        )}
      >
        <X size={16} />
      </button>
    </div>
  );
};
