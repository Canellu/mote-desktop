import { useEntitlements } from "@/context/EntitlementContext";
import { DevPlanMenu } from "@/features/pro/DevPlanMenu";
import { useProUpgrade } from "@/features/pro/proUpgrade";
import {
  formatDaysLeft,
  TRIAL_REMINDER_DAYS,
  trialShareLeft,
} from "@/features/pro/trial";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

/**
 * Gold, lit from above: a diagonal gradient for the metal, an inset white ring
 * and a specular band across the top for the shine.
 *
 * The light stays inside the surface. An outer glow only muddied the edge
 * against the translucent title bar, reading as a grey plate behind it rather
 * than as light coming off it.
 */
const goldSurface = cn(
  "relative overflow-hidden text-amber-950",
  "bg-[linear-gradient(135deg,oklch(0.93_0.12_98)_0%,oklch(0.86_0.16_82)_42%,oklch(0.76_0.17_64)_100%)]",
  "ring-1 ring-white/45 ring-inset",
  "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-1/2",
  "before:bg-[linear-gradient(to_bottom,oklch(1_0_0/0.6),oklch(1_0_0/0))]",
);

/** The mark of a bought Pro: a plain pill, with no icon to compete with the name. */
const proMark = cn(
  goldSurface,
  "rounded-full px-2.5 py-px text-[0.8125rem] leading-5 font-semibold tracking-tight",
);

/**
 * The trial's countdown. Flat, a hairline border on a faint fill: it is status,
 * and Pro is already on, so there is nothing here to sell.
 */
const statusChip = cn(
  "flex h-6 items-center gap-1.5 rounded-full border pr-2.5 pl-1.5",
  "border-foreground/6 bg-foreground/5",
  "text-[0.8125rem] leading-none font-medium tracking-tight text-foreground/80",
);

/**
 * Free, said as the way out of it. The only thing in the chrome that asks for
 * money, so it is built like a button: the title bar's button height, an icon
 * and a raised gold surface. It replaced a "Free" chip that sat beside it and
 * opened a second dialog for the same purchase.
 */
const getProMark = cn(
  goldSurface,
  "flex h-7 items-center rounded-md px-2.5 text-xs font-semibold shadow-xs",
  // A hairline just outside the gold, darker on light chrome and lighter on
  // dark, so the button's edge holds against the title bar.
  "border border-amber-800/25 dark:border-amber-200/30",
);

/** The trial's final stretch starts where its reminders do. */
const TRIAL_ENDING_DAYS = Math.max(...TRIAL_REMINDER_DAYS);

/** What is left of the trial, as a ring that empties towards its last day. */
const TrialRing = ({ share, ending }: { share: number; ending: boolean }) => {
  const radius = 5;
  const circumference = 2 * Math.PI * radius;

  return (
    <svg viewBox="0 0 14 14" className="size-3.5 -rotate-90" aria-hidden>
      <circle
        cx="7"
        cy="7"
        r={radius}
        fill="none"
        strokeWidth="2"
        className="stroke-foreground/15"
      />
      <circle
        cx="7"
        cy="7"
        r={radius}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - share)}
        className={ending ? "stroke-orange-500" : "stroke-amber-400"}
      />
    </svg>
  );
};

/**
 * Says which tier the running app is in, beside the product name.
 *
 * On Free it is the way to Pro, on a trial the countdown, and on Pro the mark;
 * before the first bridge pairs, and with it the trial, it is not there at all.
 * It is one control whatever the tier: clicking it opens the plan beside what
 * each tier includes, with the purchase in it on Free and the trial, and the
 * plan grows out of it and returns to it. A development build adds a menu
 * beside it that puts the app in each of those states.
 */
export const ProBadge: React.FC<{ className?: string }> = ({ className }) => {
  const { snapshot, hasPro, onTrial, purchased, trialDaysLeft, setDebugTier } =
    useEntitlements();
  const { showPlan, planAnchorRef } = useProUpgrade();

  // The title bar starts a window drag from its own mousedown, so every control
  // here has to stop the press or clicking it throws the window across the
  // desktop instead of doing its job.
  const stopDrag = {
    onMouseDown: (event: React.MouseEvent) => event.stopPropagation(),
    onPointerDown: (event: React.PointerEvent) => event.stopPropagation(),
  };

  const trial = snapshot.trial;
  const ending = trialDaysLeft !== null && trialDaysLeft <= TRIAL_ENDING_DAYS;
  // Nothing to say until the first bridge pairs: the trial starts the moment
  // it does, so Get Pro during setup would read as Free, then a trial, then
  // Free again. Also covers the instant at launch before entitlements load.
  const beforeTrial = !purchased && trial === null;

  const mark =
    onTrial && trial && trialDaysLeft !== null ? (
      <span className={statusChip}>
        <TrialRing
          share={trialShareLeft(trialDaysLeft, trial.startedAt, trial.endsAt)}
          ending={ending}
        />
        Pro trial
        <span aria-hidden className="text-foreground/30">
          ·
        </span>
        <span
          className={cn(
            "tabular-nums",
            ending
              ? "text-orange-600 dark:text-orange-400"
              : "text-foreground/60",
          )}
        >
          {formatDaysLeft(trialDaysLeft)}
        </span>
      </span>
    ) : hasPro ? (
      <span className={proMark}>Pro</span>
    ) : (
      <span className={getProMark}>
        {/* Above the specular band, so the label stays crisp under the shine. */}
        <span className="relative flex items-center gap-1.5">
          <Sparkles size={14} strokeWidth={2.2} aria-hidden />
          Get Pro
        </span>
      </span>
    );

  return (
    <span className={cn("flex items-center gap-2", className)}>
      {!beforeTrial && (
        <button
          ref={(element) => {
            planAnchorRef.current = element;
          }}
          type="button"
          {...stopDrag}
          onClick={(event) => {
            event.stopPropagation();
            showPlan();
          }}
          title={hasPro ? "See your plan" : "See what Mote Pro adds"}
          className={cn(
            // A bare wrapper: no box of its own, so the status is the only thing
            // that paints. Anything else here shows up as a plate behind it.
            "inline-flex appearance-none border-0 bg-transparent p-0",
            // The focus ring follows the shape inside: a pill, or Get Pro's corners.
            hasPro ? "rounded-full" : "rounded-md",
            "outline-none transition-[filter,translate] duration-150",
            "focus-visible:ring-2 focus-visible:ring-ring/50",
            "hover:brightness-[1.06] active:translate-y-px",
          )}
        >
          {mark}
        </button>
      )}

      {setDebugTier && <DevPlanMenu setDebugTier={setDebugTier} />}
    </span>
  );
};
