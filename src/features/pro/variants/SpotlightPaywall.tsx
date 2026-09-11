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
 * Always dark, lit from above, with the price pinned to the bottom.
 *
 * The one variant that ignores the theme on purpose, the way a cinema stays
 * dark whatever time it is outside. The light is drawn rather than photographed,
 * so it costs nothing and cannot date; the price sits in a bar that never
 * scrolls away, which is the pattern every subscription app has converged on
 * because it answers "what does it cost" without making anyone hunt.
 */
export const SpotlightPaywall: React.FC<PaywallProps> = ({
  feature,
  purchase,
  onClose,
}) => {
  const { offer, phase, buy, retry } = purchase;

  return (
    <div className="flex max-h-[min(92vh,46rem)] flex-col bg-[oklch(0.16_0.02_280)] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72"
        style={{
          backgroundImage: [
            "radial-gradient(30rem 16rem at 22% -4%, oklch(0.72 0.24 14 / 0.55), transparent 70%)",
            "radial-gradient(28rem 15rem at 54% -8%, oklch(0.78 0.20 58 / 0.5), transparent 68%)",
            "radial-gradient(30rem 16rem at 84% -4%, oklch(0.66 0.24 294 / 0.55), transparent 70%)",
          ].join(","),
        }}
      />

      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className={cn(
          "absolute top-4 right-4 z-20 grid size-8 place-items-center rounded-full",
          "bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white",
          "outline-none focus-visible:ring-2 focus-visible:ring-white/60",
        )}
      >
        <X size={16} />
      </button>

      <ScrollArea
        className="min-h-0 flex-1"
        viewportClassName="px-10 pt-12 pb-6"
      >
        <div className="grid max-w-lg gap-7">
          <header className="grid gap-2.5 pr-10">
            <span className="text-xs font-semibold tracking-[0.14em] text-white/55 uppercase">
              Mote Pro
            </span>
            <DialogTitle className="font-heading text-[2rem] leading-tight font-semibold text-balance text-white">
              {phase === "done" ? "Mote Pro is yours" : LEAD[feature]}
            </DialogTitle>
          </header>

          <ul className="grid gap-px overflow-hidden rounded-xl bg-white/10">
            {INCLUDED.map(({ icon: Icon, title, detail }) => (
              <li
                key={title}
                className="flex items-start gap-3.5 bg-[oklch(0.18_0.02_280)] px-4 py-3.5"
              >
                <Icon size={17} className="mt-0.5 shrink-0 text-white/70" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="block text-sm leading-6 text-white/60">
                    {detail}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          {phase === "unavailable" && (
            <p className="rounded-lg bg-white/10 px-3.5 py-2.5 text-sm leading-6 text-white/75">
              The purchase did not go through, so nothing was charged. Checking
              again will find Mote Pro if you already own it.
            </p>
          )}

          <p className="text-xs leading-5 text-white/45">{FOOTNOTE}</p>
        </div>
      </ScrollArea>

      {/* Never scrolls away. */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-t border-white/10 bg-[oklch(0.13_0.02_280)] px-10 py-5">
        <div className="grid">
          <span className="text-xl font-semibold tracking-tight">
            {offer?.formattedPrice ?? "One purchase"}
          </span>
          <span className="text-xs text-white/55">
            Paid once — nothing renews
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={
              phase === "done" ? onClose : phase === "unavailable" ? retry : buy
            }
            disabled={phase === "working"}
            className={cn(
              "rounded-xl bg-white px-6 py-2.5 text-sm font-semibold text-neutral-950",
              "shadow-[0_0_28px_-6px_oklch(1_0_0/0.45)]",
              "transition-[transform,box-shadow] duration-150",
              "hover:shadow-[0_0_36px_-4px_oklch(1_0_0/0.6)] active:scale-[0.98]",
              "outline-none focus-visible:ring-2 focus-visible:ring-white/70",
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
        </div>
      </div>
    </div>
  );
};
