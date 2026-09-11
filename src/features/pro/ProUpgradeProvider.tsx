import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEntitlements } from "@/context/EntitlementContext";
import { ProUpgradeContext, type ProFeature } from "@/features/pro/proUpgrade";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import heroImage from "@/assets/pro-hero.webp";
import {
  Check,
  Keyboard,
  LayoutGrid,
  Router,
  Sparkles,
  Tv,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

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
    detail: "Several controls in one, your theme and size.",
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

interface ProOffer {
  title: string | null;
  formattedPrice: string | null;
  owned: boolean;
}

type Phase = "offer" | "working" | "unavailable" | "done";

/**
 * The buy button, which is not a plain Button on purpose.
 *
 * It is the one control in the app asking for money, so it gets a warm gradient,
 * a sheen that sweeps across on hover, a lift, and a real press. The sheen is a
 * translated pseudo-element rather than an animated gradient because transform
 * is the only property here that the compositor can run without repainting the
 * button on every frame.
 */
const BuyButton: React.FC<{
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}> = ({ children, onClick, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "group relative isolate w-full overflow-hidden rounded-2xl px-6 py-3.5",
      "text-base font-semibold tracking-tight text-amber-950",
      "bg-[linear-gradient(110deg,oklch(0.88_0.15_86)_0%,oklch(0.82_0.19_58)_45%,oklch(0.75_0.20_28)_100%)]",
      "shadow-[0_10px_30px_-12px_oklch(0.72_0.19_50/0.9),inset_0_1px_0_oklch(1_0_0/0.45)]",
      "transition-[transform,box-shadow,filter] duration-200 ease-out",
      "hover:-translate-y-0.5 hover:brightness-[1.04]",
      "hover:shadow-[0_16px_38px_-12px_oklch(0.72_0.19_50/0.95),inset_0_1px_0_oklch(1_0_0/0.55)]",
      "active:translate-y-0 active:scale-[0.985] active:brightness-[0.98]",
      "outline-none focus-visible:ring-2 focus-visible:ring-white/70",
      "disabled:pointer-events-none disabled:opacity-60",
      // The sheen: parked off the left edge, swept across on hover.
      "before:pointer-events-none before:absolute before:inset-y-0 before:-left-full before:w-1/2 before:-skew-x-12",
      "before:bg-[linear-gradient(to_right,transparent,oklch(1_0_0/0.55),transparent)]",
      "before:transition-transform before:duration-700 before:ease-out",
      "group-hover:before:translate-x-[300%] hover:before:translate-x-[300%]",
      "motion-reduce:transition-none motion-reduce:before:hidden motion-reduce:hover:translate-y-0",
    )}
  >
    <span className="relative z-10">{children}</span>
  </button>
);

export const ProUpgradeProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { purchasePro, syncFromStore } = useEntitlements();
  const [feature, setFeature] = useState<ProFeature | null>(null);
  const [phase, setPhase] = useState<Phase>("offer");
  const [offer, setOffer] = useState<ProOffer | null>(null);

  const requestPro = useCallback((next: ProFeature = "general") => {
    setFeature(next);
    setPhase("offer");
  }, []);

  const close = useCallback(() => setFeature(null), []);

  // Ask the Store what this costs here, only once the dialog is actually opened.
  useEffect(() => {
    if (feature === null) return;
    let cancelled = false;
    void invoke<ProOffer>("get-pro-offer")
      .then((next) => !cancelled && setOffer(next))
      .catch(() => !cancelled && setOffer(null));
    return () => {
      cancelled = true;
    };
  }, [feature]);

  const buy = useCallback(async () => {
    setPhase("working");
    setPhase((await purchasePro()) ? "done" : "unavailable");
  }, [purchasePro]);

  const retry = useCallback(async () => {
    setPhase("working");
    await syncFromStore();
    setPhase("offer");
  }, [syncFromStore]);

  const value = useMemo(() => ({ requestPro }), [requestPro]);

  return (
    <ProUpgradeContext.Provider value={value}>
      {children}

      <Dialog open={feature !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent
          showCloseButton={false}
          className={cn(
            "overflow-hidden border-white/10 p-0 text-white",
            "max-h-[min(92vh,44rem)] sm:max-w-[46rem]",
          )}
        >
          {/* Light on water, behind everything. The panel below sits on it. */}
          <img
            src={heroImage}
            alt=""
            aria-hidden
            className="absolute inset-0 -z-20 size-full object-cover"
          />
          {/* Light enough to still see the water. The panel carries its own
            contrast, so the scrim only has to keep the heading and the footnote
            legible — an even 90% wash just threw the photograph away. */}
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-[linear-gradient(165deg,oklch(0.14_0.03_280/0.30)_0%,oklch(0.12_0.03_280/0.55)_45%,oklch(0.10_0.02_280/0.82)_100%)]"
          />
          {/* The title and price sit directly on the photograph rather than on
            the panel, and the brightest reflections run across exactly that
            band. This gives them ground without dimming the rest. */}
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 -z-10 h-40 bg-[linear-gradient(to_bottom,oklch(0.09_0.02_280/0.72),transparent)]"
          />

          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className={cn(
              "absolute top-4 right-4 z-20 grid size-9 place-items-center rounded-full",
              "bg-white/10 text-white/85 backdrop-blur-md transition-colors hover:bg-white/20",
              "outline-none focus-visible:ring-2 focus-visible:ring-white/70",
            )}
          >
            <X size={17} />
          </button>

          {/* ScrollArea, not overflow-auto: a native bar would be OS-styled and
            would reflow the panel the moment it appeared. With the two-column
            list this fits without scrolling on any ordinary window, so the bar
            is a fallback rather than the normal state. */}
          <ScrollArea
            className="max-h-[min(92vh,44rem)]"
            viewportClassName="p-8"
          >
            <div className="grid gap-6">
              <header className="grid gap-2 pr-12">
                <DialogTitle className="font-heading text-[2rem] leading-tight font-semibold text-balance">
                  {phase === "done"
                    ? "Mote Pro is yours"
                    : LEAD[feature ?? "general"]}
                </DialogTitle>

                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  {/* From the Store, in this customer's currency. A base price
                    in NOK is one of 240 conversions, so a number written here
                    would be wrong nearly everywhere. */}
                  {offer?.formattedPrice ? (
                    <>
                      <span className="text-3xl font-semibold tracking-tight">
                        {offer.formattedPrice}
                      </span>
                      <span className="text-sm text-white/70">
                        paid once, not a subscription
                      </span>
                    </>
                  ) : (
                    <span className="text-sm text-white/70">
                      A single purchase. Not a subscription.
                    </span>
                  )}
                </div>
              </header>

              {/* The frosted panel. */}
              <div
                className={cn(
                  "rounded-2xl border border-white/15 bg-white/[0.07] p-5",
                  "shadow-[inset_0_1px_0_oklch(1_0_0/0.18)] backdrop-blur-xl",
                )}
              >
                <ul className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  {INCLUDED.map(({ icon: Icon, title, detail }) => (
                    <li key={title} className="flex gap-3">
                      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-white/12 text-white">
                        <Icon size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">
                          {title}
                        </span>
                        <span className="block text-sm leading-6 text-white/70">
                          {detail}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {phase === "unavailable" && (
                <p className="rounded-xl border border-white/15 bg-white/[0.07] px-4 py-3 text-sm leading-6 text-white/80 backdrop-blur-xl">
                  The purchase did not go through, so nothing was charged. If
                  you already own Mote Pro, checking again will find it.
                </p>
              )}

              <div className="grid gap-3">
                {phase === "done" ? (
                  <BuyButton onClick={close}>
                    <span className="inline-flex items-center gap-2">
                      <Check size={18} />
                      Done
                    </span>
                  </BuyButton>
                ) : phase === "unavailable" ? (
                  <BuyButton onClick={() => void retry()}>
                    Check again
                  </BuyButton>
                ) : (
                  <BuyButton
                    onClick={() => void buy()}
                    disabled={phase === "working"}
                  >
                    {phase === "working"
                      ? "Opening the Store…"
                      : "Get Mote Pro"}
                  </BuyButton>
                )}

                <button
                  type="button"
                  onClick={close}
                  className={cn(
                    "mx-auto rounded-lg px-3 py-1.5 text-sm font-medium text-white/65",
                    "transition-colors hover:text-white",
                    "outline-none focus-visible:ring-2 focus-visible:ring-white/60",
                  )}
                >
                  Not now
                </button>

                <p className="text-center text-xs leading-5 text-white/50">
                  Bought and refunded through the Microsoft Store. Already paid
                  on another PC? Sign in with the same account and it restores
                  itself.
                </p>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </ProUpgradeContext.Provider>
  );
};
