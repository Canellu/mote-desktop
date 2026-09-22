import { useEffect } from "react";
import { useReducedMotion } from "motion/react";
import {
  Check,
  FastForward,
  Pause,
  Play,
  Plus,
  Square,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { hueDisplayColorHex } from "@/features/space-screen/utils/color-state";
import { describeCommandError } from "@/lib/entitlement-errors";
import { cn } from "@/lib/utils";
import { useCountdown } from "./hooks";
import {
  formatClock,
  phaseName,
  type FocusPhase,
  type FocusRitual,
  type FocusStatus,
} from "./model";
import {
  dismissFocus,
  extendFocusPhase,
  pauseFocus,
  resumeFocus,
  skipFocusPhase,
  startFocus,
  stopFocus,
} from "./store";

/** Drawing units; the ring itself is sized by `RING_SIZE`. */
const RING = 120;
const STROKE = 8;
const CIRCUMFERENCE = 2 * Math.PI * (RING - STROKE);
/**
 * The clock grows a little with the window, up to a comfortable size, and the
 * text inside it scales with it (`cqw`).
 */
const RING_SIZE = "size-[clamp(16rem,min(40vh,60vw),25rem)]";

const mix = (from: [number, number], to: [number, number], t: number) =>
  [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t] as [
    number,
    number,
  ];

/** The color the lights are heading for, for the ring and its glow. */
function phaseColor(
  ritual: FocusRitual | undefined,
  phase: FocusPhase | null,
  progress: number,
): string {
  if (!ritual) return "var(--primary)";
  const xy =
    phase === "focus"
      ? mix(
          ritual.focusXy,
          ritual.warningXy,
          Math.max(0, (progress - 0.6) / 0.4),
        )
      : ritual.breakXy;
  return hueDisplayColorHex({ xy }) ?? "var(--primary)";
}

/** A running, paused, or between-phases session: the clock and its controls. */
export function SessionView({
  status,
  ritual,
}: {
  status: FocusStatus;
  ritual: FocusRitual | undefined;
}) {
  const reduceMotion = useReducedMotion();
  const remaining = useCountdown(status);
  const paused = status.lifecycle === "paused";
  const between = status.intermission;
  const progress = status.stageMs
    ? Math.min(1, Math.max(0, 1 - remaining / status.stageMs))
    : 0;
  const shownPhase = between ? status.nextPhase : status.phase;
  const color = phaseColor(ritual, shownPhase, between ? 0 : progress);
  const extendLabel =
    status.phase === "focus" ? "Add 5 minutes" : "Add 2 minutes";

  // Space pauses and resumes, while nothing else has focus.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;
      if (document.activeElement && document.activeElement !== document.body)
        return;
      event.preventDefault();
      void (paused ? resumeFocus() : pauseFocus());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paused]);

  return (
    // Fills the height Focus is given, so the clock sits in the middle of it.
    <div className="mx-auto grid w-full max-w-xl flex-1 content-center justify-items-center gap-8 py-4">
      {status.error && (
        <div
          role="alert"
          className="flex w-full items-start gap-3 rounded-2xl bg-destructive/10 p-4 text-sm text-(--destructive-text)"
        >
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p>
            The timer is running, but the lights could not follow:{" "}
            {describeCommandError(status.error)}
          </p>
        </div>
      )}
      <div
        className={cn("@container relative grid place-items-center", RING_SIZE)}
      >
        {/* A soft bloom in the color the lights are showing. A mask rather
            than a blur, which clipped to a visible box at this size. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-[30%] rounded-full opacity-40 transition-colors duration-1000 [mask-image:radial-gradient(closest-side,black_15%,rgb(0_0_0/0.45)_50%,transparent)]"
          style={{ backgroundColor: color }}
        />
        <svg
          viewBox={`0 0 ${RING * 2} ${RING * 2}`}
          className="relative size-full -rotate-90"
          aria-hidden="true"
        >
          <circle
            cx={RING}
            cy={RING}
            r={RING - STROKE}
            fill="none"
            strokeWidth={STROKE}
            className="stroke-muted"
          />
          <circle
            cx={RING}
            cy={RING}
            r={RING - STROKE}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            stroke={color}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
            style={{
              transition: reduceMotion
                ? undefined
                : "stroke-dashoffset 250ms linear, stroke 1s ease",
            }}
          />
        </svg>
        <div
          role="timer"
          aria-live="off"
          className="absolute grid justify-items-center gap-[1.5cqw] text-center"
        >
          <span className="text-[clamp(0.875rem,5cqw,1.125rem)] font-medium text-muted-foreground">
            {between
              ? `${shownPhase ? phaseName[shownPhase] : "Next"} in`
              : paused
                ? "Paused"
                : status.phase
                  ? phaseName[status.phase]
                  : "Focus"}
          </span>
          <span
            className={cn(
              "font-heading text-[20cqw] leading-none font-semibold tabular-nums",
              paused && "text-muted-foreground",
            )}
          >
            {formatClock(remaining)}
          </span>
          <span className="text-[clamp(0.75rem,4cqw,0.9375rem)] text-muted-foreground">
            Round {status.round} of {status.rounds}
          </span>
        </div>
      </div>

      <RoundDots status={status} />

      {status.pausedBySleep && paused && (
        <p className="text-sm text-muted-foreground">
          Paused while this PC slept. Resume when you are ready.
        </p>
      )}

      {between ? (
        <div className="flex flex-wrap justify-center gap-3">
          <Button size="xl" onClick={() => void skipFocusPhase()}>
            <Play />
            Start now
          </Button>
          <Button
            size="xl"
            variant="outline"
            onClick={() => void extendFocusPhase()}
          >
            <Plus />
            {status.phase === "focus" ? "5 more minutes" : "2 more minutes"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            size="xl"
            className="min-w-36"
            onClick={() => void (paused ? resumeFocus() : pauseFocus())}
          >
            {paused ? <Play /> : <Pause />}
            {paused ? "Resume" : "Pause"}
          </Button>
          <Button
            size="icon-xl"
            variant="outline"
            aria-label={extendLabel}
            title={extendLabel}
            onClick={() => void extendFocusPhase()}
          >
            <Plus />
          </Button>
          <Button
            size="icon-xl"
            variant="outline"
            aria-label="Skip to the next phase"
            title="Skip to the next phase"
            onClick={() => void skipFocusPhase()}
          >
            <FastForward />
          </Button>
        </div>
      )}
      <Button
        variant="ghost"
        className="text-muted-foreground"
        onClick={() => void stopFocus()}
      >
        <Square />
        End session
      </Button>
    </div>
  );
}

function RoundDots({ status }: { status: FocusStatus }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Rounds">
      {Array.from({ length: status.rounds }, (_, index) => {
        const done = index < status.completedRounds;
        const current = !done && index === status.round - 1;
        return (
          <li
            key={index}
            aria-label={`Round ${index + 1}${done ? ", done" : current ? ", now" : ""}`}
            className={cn(
              "size-2.5 rounded-full transition-colors",
              done
                ? "bg-primary"
                : current
                  ? "bg-primary/40 ring-2 ring-primary/40"
                  : "bg-muted",
            )}
          />
        );
      })}
    </ol>
  );
}

/** The end of a session: what was done, and a way to go again. */
export function CompletionView({
  status,
  ritual,
}: {
  status: FocusStatus;
  ritual: FocusRitual | undefined;
}) {
  const minutes = Math.round(status.focusedMs / 60000);
  return (
    <div className="mx-auto grid w-full max-w-md flex-1 content-center justify-items-center gap-6 py-4 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-(--success-surface) text-(--success-text)">
        <Check size={30} />
      </span>
      <div className="grid gap-2">
        <h2 className="font-heading text-2xl font-semibold">
          Session complete
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {minutes} {minutes === 1 ? "minute" : "minutes"} of focus over{" "}
          {status.completedRounds}{" "}
          {status.completedRounds === 1 ? "round" : "rounds"}. Your lights are
          back to how they were.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {ritual && (
          <Button size="xl" onClick={() => void startFocus(ritual.id)}>
            <Play />
            Run again
          </Button>
        )}
        <Button size="xl" variant="outline" onClick={() => void dismissFocus()}>
          Done
        </Button>
      </div>
    </div>
  );
}
