import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useEntitlements } from "@/context/EntitlementContext";
import { ProUpgradeContext, type ProFeature } from "@/features/pro/proUpgrade";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
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

/**
 * What Pro includes, in the order somebody would care about it. An icon each,
 * because six lines of plain text is a list nobody finishes reading.
 */
const INCLUDED = [
  {
    icon: Tv,
    title: "PC Sync",
    detail: "Lights follow video, games, or whatever is playing on your PC.",
  },
  {
    icon: Keyboard,
    title: "Global shortcuts",
    detail: "One key combination changes a light from anywhere in Windows.",
  },
  {
    icon: Sparkles,
    title: "Richer widgets",
    detail:
      "Several controls in one widget, and pick its theme, size, and place.",
  },
  {
    icon: LayoutGrid,
    title: "Your own dashboard",
    detail: "Arrange the home screen the way your home is actually laid out.",
  },
  {
    icon: Router,
    title: "Every bridge",
    detail: "Save more than one Hue Bridge and switch between them.",
  },
];

interface ProOffer {
  title: string | null;
  formattedPrice: string | null;
  owned: boolean;
}

type Phase = "offer" | "working" | "unavailable" | "done";

/**
 * The hero. Coloured light on a dark ground — the product photographed as the
 * thing it does, built from gradients rather than a bitmap so it stays sharp on
 * any display, costs no bytes in the bundle, and never looks like a screenshot
 * of an older version of the app.
 */
const Hero: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="relative h-44 shrink-0 overflow-hidden bg-[oklch(0.16_0.02_280)]">
    <div
      aria-hidden
      className="absolute inset-0"
      style={{
        backgroundImage: [
          // Three lamps washing a wall, plus a cool spill from off-frame. The
          // centres sit just inside the bottom edge so the bloom is what shows,
          // not the circle: placed any lower and only a faint rim bleeds in.
          "radial-gradient(26rem 15rem at 14% 96%, oklch(0.70 0.26 14 / 0.95), transparent 66%)",
          "radial-gradient(24rem 14rem at 46% 104%, oklch(0.80 0.20 58 / 0.95), transparent 64%)",
          "radial-gradient(26rem 15rem at 84% 96%, oklch(0.66 0.24 294 / 0.95), transparent 66%)",
          "radial-gradient(20rem 12rem at 72% 2%, oklch(0.78 0.17 196 / 0.55), transparent 70%)",
        ].join(","),
      }}
    />
    {/* A soft ceiling glow, so the colour reads as light in a room rather than
      as four coloured circles. */}
    <div
      aria-hidden
      className="absolute inset-x-0 top-0 h-24 bg-[linear-gradient(to_bottom,oklch(1_0_0/0.10),transparent)]"
    />
    <div
      aria-hidden
      className="absolute inset-x-0 bottom-0 h-16 bg-[linear-gradient(to_top,var(--color-popover),transparent)]"
    />

    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className={cn(
        "absolute top-3 right-3 grid size-8 place-items-center rounded-full",
        "bg-black/35 text-white/90 backdrop-blur transition-colors hover:bg-black/55",
        "outline-none focus-visible:ring-2 focus-visible:ring-white/60",
      )}
    >
      <X size={16} />
    </button>
  </div>
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
        {/* Bounded and scrollable: the list is long enough that on a short
          window the hero was pushed off the top edge and the buy button off the
          bottom. The hero stays put and the body scrolls under it. */}
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[min(90vh,46rem)] flex-col overflow-hidden p-0 sm:max-w-[30rem]"
        >
          <Hero onClose={close} />

          <div className="grid gap-5 overflow-y-auto px-6 pt-1 pb-6">
            <div className="grid gap-1.5">
              <DialogTitle className="font-heading text-2xl font-semibold">
                {phase === "done"
                  ? "Mote Pro is yours"
                  : LEAD[feature ?? "general"]}
              </DialogTitle>

              <div className="flex items-baseline gap-2">
                {/* The price comes from the Store, in the customer's own
                  currency. Nothing is hard-coded: a base price in NOK is one of
                  240 conversions, so a number typed here would be wrong almost
                  everywhere. When the Store cannot answer, the value still
                  stands on its own. */}
                {offer?.formattedPrice ? (
                  <>
                    <span className="text-2xl font-semibold tracking-tight">
                      {offer.formattedPrice}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      once — not a subscription
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    A single purchase. Not a subscription.
                  </span>
                )}
              </div>
            </div>

            <ul className="grid gap-3.5">
              {INCLUDED.map(({ icon: Icon, title, detail }) => (
                <li key={title} className="flex gap-3">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
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

            {phase === "unavailable" && (
              <p className="rounded-lg bg-muted px-3 py-2 text-sm leading-6 text-muted-foreground">
                The purchase did not go through, so nothing was charged. If you
                already own Mote Pro, checking again will find it.
              </p>
            )}
          </div>

          {/* Outside the scroll area on purpose. The way to buy should not be
            something you have to scroll to find. */}
          <div className="grid shrink-0 gap-2 border-t border-border/60 px-6 pt-4 pb-5">
            {phase === "done" ? (
              <Button size="lg" onClick={close}>
                <Check size={18} />
                Done
              </Button>
            ) : phase === "unavailable" ? (
              <>
                <Button size="lg" onClick={() => void retry()}>
                  Check again
                </Button>
                <Button variant="ghost" onClick={close}>
                  Not now
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="lg"
                  onClick={() => void buy()}
                  disabled={phase === "working"}
                >
                  {phase === "working" ? "Opening the Store…" : "Get Mote Pro"}
                </Button>
                <Button variant="ghost" onClick={close}>
                  Not now
                </Button>
              </>
            )}

            <p className="text-center text-xs leading-5 text-muted-foreground">
              Bought and refunded through the Microsoft Store. Already paid on
              another PC? Sign in with the same account and it restores itself.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </ProUpgradeContext.Provider>
  );
};
