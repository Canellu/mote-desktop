import { useEffect } from "react";
import { Pause, Timer } from "lucide-react";
import { router } from "@/router";
import { useCountdown } from "./hooks";
import { formatClock, isSessionActive, phaseName } from "./model";
import { loadFocus, useFocusStore } from "./store";

/**
 * A running focus session's clock in the title bar, on every screen, so it is
 * never more than a glance away. Opens the session.
 */
export function FocusStatusButton() {
  const status = useFocusStore((s) => s.status);
  useEffect(() => {
    void loadFocus();
  }, []);
  const remaining = useCountdown(status);
  if (!isSessionActive(status)) return null;
  const paused = status.lifecycle === "paused";
  const label = status.intermission
    ? `${status.nextPhase ? phaseName[status.nextPhase] : "Next"} next`
    : status.phase
      ? phaseName[status.phase]
      : "Focus";
  return (
    <button
      type="button"
      aria-label={`${label}, ${paused ? "paused" : `${formatClock(remaining)} left`}. Open focus session`}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        void router.navigate({ to: "/focus" });
      }}
      className="flex h-full items-center gap-1.5 px-3 text-xs font-medium text-foreground transition-colors hover:bg-foreground/5 dark:hover:bg-foreground/10"
    >
      {paused ? (
        <Pause size={14} strokeWidth={2.4} className="text-muted-foreground" />
      ) : (
        <span className="relative flex size-3.5 items-center justify-center">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/30 motion-reduce:hidden" />
          <Timer
            size={14}
            strokeWidth={2.4}
            className="relative text-primary"
          />
        </span>
      )}
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{formatClock(remaining)}</span>
    </button>
  );
}
