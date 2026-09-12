import { DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import heroDark from "@/assets/pro-hero-dark.webp";
import heroLight from "@/assets/pro-hero-light.webp";
import { BuyButton } from "@/features/pro/BuyButton";
import {
  FOOTNOTE,
  INCLUDED,
  LEAD,
  type PaywallProps,
} from "@/features/pro/proVariants";
import { cn } from "@/lib/utils";
import { Check, X } from "lucide-react";

/** A photograph of natural light, with the offer on frosted glass over it. */
export const AuroraPaywall: React.FC<PaywallProps> = ({
  feature,
  purchase,
  onClose,
}) => {
  const { offer, phase, buy, retry } = purchase;

  return (
    <>
      {/* Dawn for the light theme, the aurora for the dark one. Swapped in CSS
        rather than from a theme hook so it follows the `.dark` class with no
        flash on toggle. */}
      <img
        src={heroLight}
        alt=""
        aria-hidden
        className="absolute inset-0 -z-20 size-full object-cover dark:hidden"
      />
      <img
        src={heroDark}
        alt=""
        aria-hidden
        className="absolute inset-0 -z-20 hidden size-full object-cover dark:block"
      />
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 -z-10",
          "bg-[linear-gradient(165deg,oklch(1_0_0/0.06)_0%,oklch(1_0_0/0.20)_50%,oklch(1_0_0/0.48)_100%)]",
          "dark:bg-[linear-gradient(165deg,oklch(0.14_0.03_280/0.18)_0%,oklch(0.12_0.03_280/0.46)_45%,oklch(0.10_0.02_280/0.80)_100%)]",
        )}
      />
      <div
        aria-hidden
        className={cn(
          "absolute inset-x-0 top-0 -z-10 h-40",
          "bg-[linear-gradient(to_bottom,oklch(1_0_0/0.45),transparent)]",
          "dark:bg-[linear-gradient(to_bottom,oklch(0.09_0.02_280/0.72),transparent)]",
        )}
      />

      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className={cn(
          "absolute top-4 right-4 z-20 grid size-9 place-items-center rounded-full",
          "bg-black/10 text-foreground/80 backdrop-blur-md transition-colors hover:bg-black/20",
          "dark:bg-white/10 dark:text-white/85 dark:hover:bg-white/20",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
        )}
      >
        <X size={17} />
      </button>

      <ScrollArea
        className="max-h-[min(92vh,48rem)]"
        viewportClassName="p-10 sm:p-12"
      >
        {/* The dialog is wide so the photograph has room; the reading column is
          not, because a 58rem line of body copy is unreadable. */}
        <div className="grid max-w-xl gap-7">
          <header className="grid gap-2 pr-12">
            <DialogTitle className="font-heading text-[2.25rem] leading-tight font-semibold text-balance">
              {phase === "done" ? "Mote Pro is yours" : LEAD[feature]}
            </DialogTitle>

            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              {offer?.formattedPrice ? (
                <>
                  <span className="text-3xl font-semibold tracking-tight">
                    {offer.formattedPrice}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    paid once, not a subscription
                  </span>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">
                  A single purchase. Not a subscription.
                </span>
              )}
            </div>
          </header>

          <div
            className={cn(
              "rounded-2xl border p-5 backdrop-blur-xl",
              "border-white/60 bg-white/45 shadow-[inset_0_1px_0_oklch(1_0_0/0.7)]",
              "dark:border-white/15 dark:bg-white/[0.07] dark:shadow-[inset_0_1px_0_oklch(1_0_0/0.18)]",
            )}
          >
            <ul className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {INCLUDED.map(({ icon: Icon, title, detail }) => (
                <li key={title} className="flex gap-3">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-foreground/10 text-foreground dark:bg-white/12 dark:text-white">
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{title}</span>
                    <span className="block text-sm leading-6 text-muted-foreground">
                      {detail}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {phase === "unavailable" && (
            <p className="rounded-xl border border-white/60 bg-white/45 px-4 py-3 text-sm leading-6 text-foreground/85 backdrop-blur-xl dark:border-white/15 dark:bg-white/[0.07] dark:text-white/80">
              The purchase did not go through, so nothing was charged. If you
              already own Mote Pro, checking again will find it.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {phase === "done" ? (
              <BuyButton onClick={onClose}>
                <span className="inline-flex items-center gap-2">
                  <Check size={18} />
                  Done
                </span>
              </BuyButton>
            ) : phase === "unavailable" ? (
              <BuyButton onClick={retry}>Check again</BuyButton>
            ) : (
              <BuyButton onClick={buy} disabled={phase === "working"}>
                {phase === "working" ? "Opening the Store…" : "Get Mote Pro"}
              </BuyButton>
            )}

            <button
              type="button"
              onClick={onClose}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground",
                "transition-colors hover:text-foreground",
                "outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              )}
            >
              Not now
            </button>
          </div>

          <p className="text-xs leading-5 text-muted-foreground">{FOOTNOTE}</p>
        </div>
      </ScrollArea>
    </>
  );
};
