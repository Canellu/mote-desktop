import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEntitlements } from "@/context/EntitlementContext";
import {
  ProUpgradeContext,
  registerProUpgradeOpener,
  type ProFeature,
} from "@/features/pro/proUpgrade";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import heroDark from "@/assets/pro-hero-dark.webp";
import heroLight from "@/assets/pro-hero-light.webp";
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
      "group relative isolate overflow-hidden rounded-2xl px-8 py-3.5",
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

  // Lets code with no component around it — the global shortcut handler — open
  // this, which is exactly where a refusal happens.
  useEffect(() => registerProUpgradeOpener(requestPro), [requestPro]);

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
            "overflow-hidden p-0 text-foreground",
            "border-black/10 dark:border-white/10",
            // Bigger, so the photograph is something you see rather than
            // something behind a panel that covers it.
            "max-h-[min(92vh,48rem)] sm:max-w-[58rem]",
          )}
        >
          {/* Natural light behind everything: dawn for the light theme, the
            aurora for the dark one. Swapped in CSS rather than from a theme
            hook so it follows the `.dark` class instantly, with no flash on
            toggle. */}
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
          {/* Light enough to still see the water. The panel carries its own
            contrast, so the scrim only has to keep the heading and the footnote
            legible — an even 90% wash just threw the photograph away. */}
          <div
            aria-hidden
            className={cn(
              "absolute inset-0 -z-10",
              "bg-[linear-gradient(165deg,oklch(1_0_0/0.18)_0%,oklch(1_0_0/0.42)_45%,oklch(1_0_0/0.80)_100%)]",
              "dark:bg-[linear-gradient(165deg,oklch(0.14_0.03_280/0.18)_0%,oklch(0.12_0.03_280/0.46)_45%,oklch(0.10_0.02_280/0.80)_100%)]",
            )}
          />
          {/* The title and price sit directly on the photograph rather than on
            the panel, and the brightest reflections run across exactly that
            band. This gives them ground without dimming the rest. */}
          <div
            aria-hidden
            className={cn(
              "absolute inset-x-0 top-0 -z-10 h-40",
              "bg-[linear-gradient(to_bottom,oklch(1_0_0/0.62),transparent)]",
              "dark:bg-[linear-gradient(to_bottom,oklch(0.09_0.02_280/0.72),transparent)]",
            )}
          />

          <button
            type="button"
            onClick={close}
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

          {/* ScrollArea, not overflow-auto: a native bar would be OS-styled and
            would reflow the panel the moment it appeared. With the two-column
            list this fits without scrolling on any ordinary window, so the bar
            is a fallback rather than the normal state. */}
          <ScrollArea
            className="max-h-[min(92vh,48rem)]"
            viewportClassName="p-10 sm:p-12"
          >
            {/* The dialog is wide so the photograph has room; the reading
              column is not, because a 58rem line of body copy is unreadable and
              a 58rem button looks like a banner. */}
            <div className="grid max-w-xl gap-7">
              <header className="grid gap-2 pr-12">
                <DialogTitle className="font-heading text-[2.25rem] leading-tight font-semibold text-balance">
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

              {/* The frosted panel. */}
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
                        <span className="block text-sm font-semibold">
                          {title}
                        </span>
                        <span className="block text-sm leading-6 text-muted-foreground">
                          {detail}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {phase === "unavailable" && (
                <p className="rounded-xl border px-4 py-3 text-sm leading-6 backdrop-blur-xl border-white/60 bg-white/45 text-foreground/85 dark:border-white/15 dark:bg-white/[0.07] dark:text-white/80">
                  The purchase did not go through, so nothing was charged. If
                  you already own Mote Pro, checking again will find it.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3">
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
                    "rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground",
                    "transition-colors hover:text-foreground",
                    "outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                  )}
                >
                  Not now
                </button>
              </div>

              <div>
                <p className="text-xs leading-5 text-muted-foreground">
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
