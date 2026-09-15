import { useEntitlements, type DebugTier } from "@/context/EntitlementContext";
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

/** The mark of a bought Pro. A label, so a pill with no icon and no hover. */
const proMark = cn(
  goldSurface,
  "rounded-full px-2.5 py-px text-[0.8125rem] leading-5 font-semibold tracking-tight",
);

/**
 * Where the tier stands. Flat, a hairline border on a faint fill, so beside the
 * gold button it reads as status and never as a second thing to press.
 */
const statusChip = cn(
  "flex h-6 items-center gap-1.5 rounded-full border px-2.5",
  "border-foreground/6 bg-foreground/5",
  "text-[0.8125rem] leading-none font-medium tracking-tight text-foreground/80",
);

/**
 * The only control in the chrome that asks for money, so it is built like one:
 * the title bar's button height and corners, an icon, a raised gold surface, and
 * hover and press states. It used to be a bold text link, and the dark theme's
 * primary colour is near-white, so it read as one more label.
 */
const getProButton = cn(
  goldSurface,
  "flex h-7 items-center rounded-md px-2.5 text-xs font-semibold shadow-xs",
  // A hairline just outside the gold, darker on light chrome and lighter on
  // dark, so the button's edge holds against the title bar.
  "border border-amber-800/25 dark:border-amber-200/30",
  "outline-none transition-[filter,transform] duration-150",
  "hover:brightness-[1.06] active:translate-y-px active:brightness-95",
  "focus-visible:ring-2 focus-visible:ring-ring",
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

const DEBUG_TIER_LABEL: Record<DebugTier, string> = {
  free: "Free",
  trial: "a new trial",
  trial_ending: "a trial with 3 days left",
  trial_ended: "an ended trial",
  pro: "Pro",
};

/**
 * Says which tier the running app is in, beside the product name.
 *
 * On Free it also carries the upgrade path. On a trial it counts down and still
 * offers the purchase. On Pro it is just the mark. In a development build the
 * status itself steps through Free, the trial's stages, and Pro, so every state
 * can be seen without a Store purchase or a two-week wait.
 */
export const ProBadge: React.FC<{ className?: string }> = ({ className }) => {
  const { snapshot, hasPro, onTrial, trialDaysLeft, trialEnded, setDebugTier } =
    useEntitlements();
  const { requestPro } = useProUpgrade();

  // The title bar starts a window drag from its own mousedown, so every control
  // here has to stop the press or clicking it throws the window across the
  // desktop instead of doing its job.
  const stopDrag = {
    onMouseDown: (event: React.MouseEvent) => event.stopPropagation(),
    onPointerDown: (event: React.PointerEvent) => event.stopPropagation(),
  };

  const trial = snapshot.trial;
  const ending = trialDaysLeft !== null && trialDaysLeft <= TRIAL_ENDING_DAYS;

  const mark =
    onTrial && trial && trialDaysLeft !== null ? (
      <span className={cn(statusChip, "pl-1.5")}>
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
      <span className={cn(statusChip, "text-foreground/70")}>Free</span>
    );

  // Free → trial → trial ending → trial ended → Pro → Free.
  const nextDebugTier: DebugTier =
    hasPro && !onTrial
      ? "free"
      : !onTrial && !trialEnded
        ? "trial"
        : onTrial && (trialDaysLeft ?? 0) > 3
          ? "trial_ending"
          : onTrial
            ? "trial_ended"
            : "pro";

  return (
    <span className={cn("flex items-center gap-2", className)}>
      {setDebugTier ? (
        <button
          type="button"
          {...stopDrag}
          onClick={(event) => {
            event.stopPropagation();
            void setDebugTier(nextDebugTier);
          }}
          title={`Development build: click for ${DEBUG_TIER_LABEL[nextDebugTier]}.`}
          className={cn(
            // A bare wrapper: no box of its own, so the status is the only thing
            // that paints. Anything else here shows up as a plate behind it.
            "inline-flex appearance-none rounded-full border-0 bg-transparent p-0",
            "outline-none transition-[filter] duration-150",
            "focus-visible:ring-2 focus-visible:ring-ring/50",
            "hover:brightness-[1.06]",
          )}
        >
          {mark}
        </button>
      ) : (
        mark
      )}

      {(!hasPro || onTrial) && (
        <button
          type="button"
          {...stopDrag}
          onClick={(event) => {
            event.stopPropagation();
            requestPro("general");
          }}
          className={getProButton}
        >
          {/* Above the specular band, so the label stays crisp under the shine. */}
          <span className="relative flex items-center gap-1.5">
            <Sparkles size={14} strokeWidth={2.2} />
            Get Pro
          </span>
        </button>
      )}
    </span>
  );
};
