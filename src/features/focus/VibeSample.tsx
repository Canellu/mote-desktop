import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { Slider } from "@/components/ui/slider";
import { hueDisplayColorHex } from "@/features/space-screen/utils/color-state";
import { cn } from "@/lib/utils";
import type { FocusRitual, FocusVibe } from "./model";

const mix = (from: [number, number], to: [number, number], t: number) =>
  [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t] as [
    number,
    number,
  ];

/** A whole round replayed in sixteen seconds: the focus phase, then a break. */
const CYCLE_MS = 16_000;
const BREAK_FROM = 0.82;
const TICK_MS = 120;
const PREVIEW_TICK_MS = 60;
/** Where a still sample sits, when the system asks for less motion. */
const STILL_AT = 0.7;

/** The colours of a ritual, without the rest of it. */
type Palette = Pick<FocusRitual, "focusXy" | "warningXy" | "breakXy">;

/**
 * Where a vibe puts each of four lights at a point in a focus phase. Mirrors
 * `looks()` in src-tauri/src/services/automations/focus.rs, so what plays here
 * is what the real lights do — Calm holds then warms in quarter steps, Journey
 * slides a gradient a quarter at a time, Light Race fills the lights one by
 * one, and Minimal flips only in the last stretch.
 */
function phaseMix(vibe: FocusVibe, progress: number): number[] {
  switch (vibe) {
    case "calm": {
      const warm = Math.min(1, Math.max(0, (progress - 0.6) / 0.4));
      const step = Math.floor(warm * 4) / 4;
      return [step, step, step, step];
    }
    case "journey": {
      const quarter = Math.min(3, Math.floor(progress * 4));
      return [0, 1, 2, 3].map((index) => (quarter + index / 3) / 4);
    }
    case "race": {
      const done = Math.floor(progress * 20) / 20;
      return [0, 1, 2, 3].map((index) => ((index + 1) / 4 <= done ? 1 : 0));
    }
    default:
      return [0, 1, 2, 3].map(() => (progress > 0.9 ? 1 : 0));
  }
}

/** The loop every sample and preview runs on: focus, break, and round again. */
function useVibeCycle(resetKey?: unknown, tickMs = TICK_MS) {
  const reduceMotion = useReducedMotion();
  const started = useRef(Date.now());
  const [stillCycle, setStillCycle] = useState(STILL_AT);
  // Only to redraw; the position itself comes from the clock, so a throttled
  // timer makes the round coarser rather than slower.
  const [, redraw] = useState(0);
  useEffect(() => {
    if (reduceMotion) return;
    // A new choice plays from the top of the round rather than picking up
    // wherever the last one had got to.
    started.current = Date.now();
    redraw((count) => count + 1);
    const timer = setInterval(() => redraw((count) => count + 1), tickMs);
    return () => clearInterval(timer);
  }, [reduceMotion, resetKey, tickMs]);
  const cycle = reduceMotion
    ? stillCycle
    : ((Date.now() - started.current) % CYCLE_MS) / CYCLE_MS;
  const onBreak = cycle >= BREAK_FROM;
  const seek = useCallback(
    (nextCycle: number) => {
      const next = Math.min(0.999, Math.max(0, nextCycle));
      started.current = Date.now() - next * CYCLE_MS;
      if (reduceMotion) setStillCycle(next);
      redraw((count) => count + 1);
    },
    [reduceMotion],
  );
  return {
    cycle,
    onBreak,
    progress: onBreak ? 1 : cycle / BREAK_FROM,
    seek,
    still: !!reduceMotion,
  };
}

function lightColors(
  vibe: FocusVibe,
  palette: Palette,
  progress: number,
  onBreak: boolean,
): string[] {
  const breakHex = hueDisplayColorHex({ xy: palette.breakXy }) ?? "#999";
  if (onBreak) return [breakHex, breakHex, breakHex, breakHex];
  return phaseMix(vibe, progress).map(
    (t) =>
      hueDisplayColorHex({ xy: mix(palette.focusXy, palette.warningXy, t) }) ??
      "#999",
  );
}

/**
 * Four lights playing the vibe on a loop, in the ritual's own colors, small
 * enough to sit inside a row. Still when the system asks for less motion: it
 * then holds the moment the vibe is most itself.
 */
export function VibeSample({
  vibe,
  ritual,
  size = "sm",
}: {
  vibe: FocusVibe;
  ritual: Palette;
  /** "md" is for a card that shows one vibe on its own. */
  size?: "sm" | "md";
}) {
  const { onBreak, progress } = useVibeCycle();
  const colors = lightColors(vibe, ritual, progress, onBreak);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 grid-cols-2 rounded-lg bg-muted",
        size === "md" ? "gap-1.5 p-2" : "gap-1 p-1.5",
      )}
    >
      {colors.map((color, index) => (
        <span
          key={index}
          className={cn(
            "rounded-full transition-[background-color,box-shadow] duration-500 ease-out",
            size === "md" ? "size-5" : "size-3.5",
          )}
          style={{
            background: color,
            boxShadow: `0 0 6px ${color}99`,
            // The break settles on the lights in turn, as it really does.
            transitionDelay: onBreak ? `${index * 60}ms` : "0ms",
          }}
        />
      ))}
    </span>
  );
}

/**
 * The chosen vibe played at a size worth watching: four lights, where the
 * round has got to, and what phase that is — a stand-in for the real lights
 * while the ritual is still being made.
 */
export function VibePreview({
  ritual,
  className,
}: {
  ritual: Pick<FocusRitual, "vibe" | "focusMinutes" | "breakMinutes"> & Palette;
  className?: string;
}) {
  const { cycle, onBreak, progress, seek, still } = useVibeCycle(
    ritual.vibe,
    PREVIEW_TICK_MS,
  );
  const colors = lightColors(ritual.vibe, ritual, progress, onBreak);
  const minute = Math.min(
    ritual.focusMinutes,
    Math.floor(progress * ritual.focusMinutes) + 1,
  );
  const breakProgress = Math.max(0, (cycle - BREAK_FROM) / (1 - BREAK_FROM));
  const breakMinute = Math.min(
    ritual.breakMinutes,
    Math.floor(breakProgress * ritual.breakMinutes) + 1,
  );
  const positionLabel = onBreak
    ? `Break, minute ${breakMinute} of ${ritual.breakMinutes}`
    : `Focus, minute ${minute} of ${ritual.focusMinutes}`;
  const wash = colors[0];
  return (
    <div
      className={cn(
        "grid min-w-0 content-between gap-4 overflow-hidden rounded-2xl border border-border/60 bg-(--settings-surface) p-4 transition-[background-image] duration-700 dark:bg-card",
        className,
      )}
      style={{
        backgroundImage: `radial-gradient(90% 90% at 50% 0%, ${wash}1f, transparent 70%)`,
      }}
    >
      <div
        aria-hidden="true"
        className="flex min-w-0 items-center justify-center gap-3 py-3"
      >
        {colors.map((color, index) => (
          <span
            key={index}
            className="size-9 rounded-full ring-1 ring-foreground/10 transition-[background-color,box-shadow] duration-500 ease-out"
            style={{
              background: color,
              boxShadow: `0 0 16px ${color}80`,
              transitionDelay: onBreak ? `${index * 70}ms` : "0ms",
            }}
          />
        ))}
      </div>
      <div className="grid min-w-0 gap-2">
        <Slider
          aria-label={`Preview position: ${positionLabel}`}
          className={cn(
            "h-4 cursor-grab [--paced-ease:80ms] active:cursor-grabbing active:[--paced-ease:0ms]",
            "[&_[data-slot=slider-track]]:!h-0.5 [&_[data-slot=slider-track]]:origin-center [&_[data-slot=slider-track]]:scale-y-100 [&_[data-slot=slider-track]]:transition-transform [&_[data-slot=slider-track]]:duration-150 hover:[&_[data-slot=slider-track]]:scale-y-[2] focus-within:[&_[data-slot=slider-track]]:scale-y-[2]",
            "[&_[data-slot=slider-range]]:ease-linear",
            "[&_[data-slot=slider-thumb]]:!size-2.5 [&_[data-slot=slider-thumb]]:border-primary [&_[data-slot=slider-thumb]]:bg-primary [&_[data-slot=slider-thumb]]:opacity-0 [&_[data-slot=slider-thumb]]:transition-[width,height,opacity,inset-inline-start,inset-inline-end,left,right,transform,translate] [&_[data-slot=slider-thumb]]:ease-linear hover:[&_[data-slot=slider-thumb]]:!size-3 hover:[&_[data-slot=slider-thumb]]:opacity-100 focus-within:[&_[data-slot=slider-thumb]]:!size-3 focus-within:[&_[data-slot=slider-thumb]]:opacity-100",
            onBreak
              ? "[--slider-range-background:color-mix(in_oklch,var(--foreground)_40%,transparent)]"
              : "[--slider-range-background:var(--primary)]",
            "[--slider-track-background:color-mix(in_oklch,var(--foreground)_10%,transparent)]",
          )}
          style={
            {
              "--slider-thumb-size": "0.625rem",
              "--paced-ease":
                cycle < (PREVIEW_TICK_MS * 2) / CYCLE_MS ? "0ms" : undefined,
            } as React.CSSProperties
          }
          min={0}
          max={10_000}
          step={1}
          value={[cycle * 10_000]}
          onValueChange={(value) =>
            seek((typeof value === "number" ? value : value[0]) / 10_000)
          }
        />
        <p role="status" className="text-xs leading-5 text-muted-foreground">
          {onBreak
            ? `Break · minute ${breakMinute} of ${ritual.breakMinutes}`
            : `Focus · minute ${minute} of ${ritual.focusMinutes}`}
          {still && " · held still for reduced motion"}
        </p>
      </div>
    </div>
  );
}
