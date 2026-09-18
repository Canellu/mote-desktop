import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  ProUpgradeContext,
  registerProUpgradeOpener,
  type PlanOptions,
  type ProFeature,
} from "@/features/pro/proUpgrade";
import { PlanOverview } from "@/features/pro/PlanOverview";
import { ProPaywall } from "@/features/pro/ProPaywall";
import { useProPurchase } from "@/features/pro/useProPurchase";
import { cn } from "@/lib/utils";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

/** What the dialog shows: the offer for a capability, or the current plan. */
type DialogView =
  | { kind: "offer"; feature: ProFeature }
  | { kind: "plan"; welcome: boolean };

/** Leaving the badge: quick off the mark, settling gently into place. */
const FLIGHT_OUT = { duration: "480ms", ease: "cubic-bezier(0.16, 1, 0.3, 1)" };
/** Returning to it: gathering speed, so it lands rather than drifts. */
const FLIGHT_HOME = {
  duration: "320ms",
  ease: "cubic-bezier(0.55, 0, 0.75, 0.25)",
};
/** The dialog's size at the badge, as a share of its own: about a badge wide. */
const FLIGHT_SCALE = 0.12;

/**
 * The dialog's enter and exit animations, pointed at the badge.
 *
 * The dialog is centred in the window, so the badge's offset from the window's
 * centre is exactly how far the dialog has to travel. tw-animate-css reads its
 * start and end from these properties and translates before it scales, so the
 * distance is not shrunk along with the dialog. Returns nothing when there is
 * no badge on screen or motion is reduced, which leaves the ordinary fade.
 */
function flightTo(
  anchor: HTMLElement | null,
  timing: typeof FLIGHT_OUT,
): CSSProperties | undefined {
  if (!anchor) return undefined;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return undefined;
  }

  const rect = anchor.getBoundingClientRect();
  if (rect.width === 0) return undefined;

  const x = `${rect.left + rect.width / 2 - window.innerWidth / 2}px`;
  const y = `${rect.top + rect.height / 2 - window.innerHeight / 2}px`;

  return {
    "--tw-enter-translate-x": x,
    "--tw-enter-translate-y": y,
    "--tw-enter-scale": FLIGHT_SCALE,
    "--tw-enter-opacity": 0,
    "--tw-exit-translate-x": x,
    "--tw-exit-translate-y": y,
    "--tw-exit-scale": FLIGHT_SCALE,
    "--tw-exit-opacity": 0,
    "--tw-animation-duration": timing.duration,
    "--tw-ease": timing.ease,
  } as CSSProperties;
}

/** The badge catching the plan as it lands. */
const LANDING: Keyframe[] = [
  { transform: "scale(1)" },
  { transform: "scale(1.14)", offset: 0.35 },
  { transform: "scale(1)" },
];

export const ProUpgradeProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  // Open is kept apart from the view so the view survives the close animation
  // instead of snapping to another one while it fades.
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<DialogView>({
    kind: "offer",
    feature: "general",
  });
  const [flight, setFlight] = useState<CSSProperties | undefined>();
  const purchase = useProPurchase(open);
  const planAnchorRef = useRef<HTMLElement>(null);
  const landingRef = useRef(false);
  // The plan opens on its main button. Left to the default, focus lands on the
  // first link in the scroll area, which scrolls the table past its header.
  const planActionRef = useRef<HTMLButtonElement>(null);

  const requestPro = useCallback((next: ProFeature = "general") => {
    setView({ kind: "offer", feature: next });
    setFlight(undefined);
    setOpen(true);
  }, []);

  const showPlan = useCallback((options?: PlanOptions) => {
    setView({ kind: "plan", welcome: options?.welcome ?? false });
    setFlight(flightTo(planAnchorRef.current, FLIGHT_OUT));
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    // Measured again rather than reused: the window may have been resized
    // while the plan was open, which moves the badge.
    const home =
      view.kind === "plan"
        ? flightTo(planAnchorRef.current, FLIGHT_HOME)
        : undefined;
    landingRef.current = home !== undefined;
    setFlight(home);
    setOpen(false);
  }, [view.kind]);

  const landed = useCallback((isOpen: boolean) => {
    if (isOpen || !landingRef.current) return;
    landingRef.current = false;
    planAnchorRef.current?.animate(LANDING, {
      duration: 380,
      easing: "ease-out",
    });
  }, []);

  // Lets code with no component around it — the global shortcut handler — open
  // this, which is exactly where a refusal happens.
  useEffect(() => registerProUpgradeOpener(requestPro), [requestPro]);

  const value = useMemo(
    () => ({ requestPro, showPlan, planAnchorRef }),
    [requestPro, showPlan],
  );

  return (
    <ProUpgradeContext.Provider value={value}>
      {children}

      <Dialog
        open={open}
        onOpenChange={(next) => !next && close()}
        onOpenChangeComplete={landed}
      >
        <DialogContent
          // The paywall draws its own, over the photograph.
          showCloseButton={view.kind === "plan"}
          initialFocus={view.kind === "plan" ? planActionRef : true}
          style={flight}
          className={cn(
            "overflow-hidden p-0 text-foreground",
            "border-black/10 dark:border-white/10",
            // The one row is what lets the dialog shrink to this cap, so its
            // footer stays inside the dialog instead of being clipped by it.
            // The cap leaves the title bar clear, which sits above dialogs.
            "max-h-[min(calc(100vh-6rem),44rem)] grid-rows-[minmax(0,1fr)]",
            view.kind === "plan" ? "sm:max-w-[38rem]" : "sm:max-w-[54rem]",
          )}
        >
          {view.kind === "plan" ? (
            <PlanOverview
              purchase={purchase}
              welcome={view.welcome}
              onClose={close}
              actionRef={planActionRef}
            />
          ) : (
            <ProPaywall
              feature={view.feature}
              purchase={purchase}
              onClose={close}
            />
          )}
        </DialogContent>
      </Dialog>
    </ProUpgradeContext.Provider>
  );
};
