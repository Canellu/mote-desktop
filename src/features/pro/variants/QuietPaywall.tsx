import { DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FOOTNOTE,
  INCLUDED,
  LEAD,
  type PaywallProps,
} from "@/features/pro/proVariants";
import { cn } from "@/lib/utils";
import { Check, X } from "lucide-react";

/**
 * No photograph at all. The price is the picture.
 *
 * Worth having as a real option rather than a strawman: a paid utility that
 * asks plainly, in the app's own surface, reads as confident where an
 * advertisement reads as a pitch. It is also the only one of the four that
 * cannot age — nothing here is a photograph that will look dated, or a
 * screenshot of a version that has shipped since.
 */
export const QuietPaywall: React.FC<PaywallProps> = ({
  feature,
  purchase,
  onClose,
}) => {
  const { offer, phase, buy, retry } = purchase;

  return (
    <>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className={cn(
          "absolute top-4 right-4 z-20 grid size-8 place-items-center rounded-full",
          "text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        )}
      >
        <X size={16} />
      </button>

      <ScrollArea
        className="max-h-[min(92vh,44rem)]"
        viewportClassName="px-10 py-12 sm:px-14"
      >
        <div className="mx-auto grid max-w-md gap-8">
          <header className="grid justify-items-center gap-3 text-center">
            <DialogTitle className="font-heading text-[1.6rem] leading-tight font-semibold text-balance">
              {phase === "done" ? "Mote Pro is yours" : LEAD[feature]}
            </DialogTitle>

            {/* This design puts the price where another would put a picture, so
              with no price there is nothing to enlarge. Repeating the product
              name at 6xl under a heading that already names it reads as a
              mistake, so the slot simply goes away. */}
            {offer?.formattedPrice && (
              <p className="font-heading text-6xl font-semibold tracking-tight tabular-nums">
                {offer.formattedPrice}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Paid once. Not a subscription, and nothing renews.
            </p>
          </header>

          {/* A plain bordered list, closer to a receipt than to a feature grid. */}
          <ul className="divide-y rounded-xl border">
            {INCLUDED.map(({ icon: Icon, title, detail }) => (
              <li key={title} className="flex items-start gap-3 px-4 py-3.5">
                <Icon
                  size={16}
                  className="mt-1 shrink-0 text-muted-foreground"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="block text-sm leading-6 text-muted-foreground">
                    {detail}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          {phase === "unavailable" && (
            <p className="rounded-lg bg-muted px-3.5 py-2.5 text-center text-sm leading-6 text-muted-foreground">
              The purchase did not go through, so nothing was charged.
            </p>
          )}

          <div className="grid justify-items-center gap-3">
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
                "rounded-full bg-foreground px-10 py-3 text-sm font-semibold text-background",
                "transition-[transform,opacity] duration-150 hover:opacity-90 active:scale-[0.98]",
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
              className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
            >
              Not now
            </button>
          </div>

          <p className="text-center text-xs leading-5 text-muted-foreground">
            {FOOTNOTE}
          </p>
        </div>
      </ScrollArea>
    </>
  );
};
