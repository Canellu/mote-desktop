import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { UI_EASE_MS } from "@/lib/transitions";

interface PacedSliderProps {
  /** Committed value (0–100 unless min/max overridden). */
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  dimWhenDisabled?: boolean;
  ariaLabel: string;
  className?: string;
  /** Extra inline styles merged onto the slider root (e.g. a track gradient). */
  style?: React.CSSProperties;
  size?: "default" | "lg" | "xl";
  /**
   * How long (ms) the fill/thumb eases to a value that changed on its own (a
   * toggle ramp, a scene, an external change) — matched to the bridge fade so
   * the bar finishes alongside the bulb. Live drag frames never ease.
   */
  easeMs?: number;
  /**
   * Optional source marker for programmatic easing. When provided, the slider
   * only eases value changes that arrive in the same render as a new key.
   */
  animateKey?: number;
  /**
   * Whether this controls a grouped_light (room/zone). Selects the throttle
   * profile: the Hue Bridge caps group commands at ~1/s but allows ~10/s for a
   * single light (see docs/HUE/hue-system-performance.md).
   */
  isGroup: boolean;
  /** Overrides the hardware default throttle frame, in ms. */
  liveMs?: number;
  /**
   * Draw tick marks at each discrete snap point. Use for sliders that step
   * through a small set of values (e.g. the 1–12 dynamic-speed steps) so it
   * reads as discrete rather than continuous. Requires `step`.
   */
  showTicks?: boolean;
  /**
   * Print value labels beneath the tick marks. `"all"` labels every snap point;
   * `"ends"` labels just the min and max. Requires `showTicks` and `step`.
   */
  tickLabels?: "all" | "ends";
  /**
   * Expands the click-swallow area around the slider. The slider lives inside a
   * card whose own click opens a side pane; without this, a tap that lands in
   * the padding just above/below the track falls through to the card and opens
   * the pane by accident. The values are CSS lengths the hit area extends past
   * each edge — by default the full section below and half the gap above. They
   * are clamped by the card's `overflow-hidden`, so over-reaching is harmless.
   */
  hitInset?: { top?: string; bottom?: string; x?: string };
  /** Fires the paced value (leading, trailing, and on release). */
  onCommit: (value: number, phase: "live" | "final") => void;
  /** Per-frame callback for local visual feedback (fires every move). */
  onInput?: (value: number) => void;
}

const first = (v: number | readonly number[]): number =>
  Array.isArray(v) ? v[0] : (v as number);

/** Hue Bridge command budgets, in ms between writes (see perf doc). */
const GROUP_LIVE_MS = 1000;
const LIGHT_LIVE_MS = 200;
// Fill and track colors come from the base Slider so every slider outside the
// tiles looks the same; only the fill's gradient sizing is paced-specific.
const PACED_SLIDER_CLASS =
  "[--slider-range-background-size:var(--paced-slider-track-width,100%)_100%]";

/**
 * How long to keep trusting the value we just sent over inbound bridge echoes.
 * A write triggers a brief flurry of events — including ones the bridge emitted
 * *before* it processed our write (carrying the old value) and intermediate
 * frames mid-transition. Without this guard those echoes snap the thumb back to
 * where the drag started. Cleared early once an echo confirms what we sent.
 */
const SETTLE_MS = 1500;

/**
 * A shadcn Slider tuned for the Hue Bridge's command budget. The handle tracks
 * the pointer at 60fps locally (`onValueChange` → `setLocal`/`onInput`) while
 * writes to the bridge are paced with a hybrid throttle:
 *
 * - **Leading edge** — the first move of a throttle frame commits immediately.
 * - **Trailing catch-up** — if the finger stops but stays down, a deferred
 *   commit fires for the remainder of the current frame so the lights reach the
 *   cursor while held.
 * - **Instant release** — `onValueCommitted` bypasses all pacing and commits the
 *   final resting value, then resets the throttle clock so the next interaction
 *   starts instantly.
 * - **Settle protection** — after committing, the thumb holds the sent value
 *   until the authoritative value catches up, so a stale event can't snap it
 *   backward.
 * - **Click-to-position** — a press that never drags (a track click) keeps
 *   easing on, so the thumb glides from where it was to the pressed value over
 *   the bridge-fade window instead of snapping. Easing is dropped to 1:1 only
 *   once the pointer actually moves, marking the gesture a real drag.
 */
export const PacedSlider: React.FC<PacedSliderProps> = ({
  value,
  min = 0,
  max = 100,
  step,
  disabled,
  dimWhenDisabled,
  ariaLabel,
  className = "w-full",
  style,
  size = "default",
  isGroup,
  liveMs,
  showTicks = false,
  tickLabels,
  easeMs = UI_EASE_MS.sliderFill,
  animateKey,
  hitInset,
  onCommit,
  onInput,
}) => {
  const activeLiveMs = liveMs ?? (isGroup ? GROUP_LIVE_MS : LIGHT_LIVE_MS);

  const [local, setLocal] = useState(value);
  // Drives whether the fill/thumb eases: off only once a gesture is confirmed a
  // real drag (so the thumb tracks 1:1), on otherwise — including a not-yet-moved
  // press, so a track click glides to the pressed value.
  const [interacting, setInteracting] = useState(false);
  const [externalEasing, setExternalEasing] = useState(false);
  // The first paint must land the thumb at its value with no transition — when
  // the slider mounts inside a panel that's opening, an enabled ease would make
  // the thumb visibly travel from the track start to the current value. Easing
  // is switched on only after that initial paint.
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => setHasMounted(true), []);
  // Measured control width, used by the fixed full-track fill gradient and by
  // ticks to place marks on the same edge-adjusted scale Base UI uses.
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const measure = () => {
      const track = el.querySelector<HTMLElement>('[data-slot="slider-track"]');
      setTrackWidth(track?.clientWidth ?? el.clientWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    const track = el.querySelector<HTMLElement>('[data-slot="slider-track"]');
    if (track) observer.observe(track);
    return () => observer.disconnect();
  }, []);
  // Timestamp (ms) of the last bridge write; 0 means "frame is open, commit now".
  const lastCommitAt = useRef(0);
  // Latest dragged value, read by the trailing timer.
  const latest = useRef(value);
  const trailingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInteracting = useRef(false);
  const previousValue = useRef(value);
  const previousAnimateKey = useRef(animateKey);
  // Per-gesture click/drag discrimination: the value of the gesture's first
  // frame, and whether a later frame moved away from it (→ a real drag, not a
  // click). Null between gestures.
  const gestureAnchor = useRef<number | null>(null);
  const gestureDragged = useRef(false);
  // The value we last sent and are waiting to see reflected back. While set, we
  // ignore inbound `value` changes that don't match it (stale/echoed state).
  const pending = useRef<number | null>(null);

  // Re-sync to the authoritative value, but never while dragging and never back
  // past a value we've committed but not yet seen confirmed.
  useEffect(() => {
    if (isInteracting.current) return;
    if (pending.current !== null) {
      if (Math.round(value) === Math.round(pending.current)) {
        pending.current = null;
        if (settleTimer.current) clearTimeout(settleTimer.current);
      }
      return;
    }
    const valueChanged = Math.round(value) !== Math.round(previousValue.current);
    const keyChanged = animateKey !== previousAnimateKey.current;
    setExternalEasing(
      valueChanged && (animateKey === undefined ? hasMounted : keyChanged),
    );
    previousValue.current = value;
    previousAnimateKey.current = animateKey;
    setLocal(value);
  }, [animateKey, hasMounted, value]);

  useEffect(
    () => () => {
      if (trailingTimer.current) clearTimeout(trailingTimer.current);
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );

  // Remember the value we sent so inbound echoes can be reconciled against it,
  // and arm a fallback so a confirmation that never arrives (e.g. a failed
  // write) eventually releases the thumb back to bridge state.
  const armSettle = (next: number) => {
    pending.current = next;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      pending.current = null;
    }, SETTLE_MS);
  };

  const flush = (next: number) => {
    lastCommitAt.current = Date.now();
    onCommit(next, "live");
    armSettle(next);
  };

  const schedule = (next: number) => {
    isInteracting.current = true;
    if (gestureAnchor.current === null) {
      // First frame of a press. Assume a click until proven a drag: keep easing
      // on (interacting stays false) and arm the glide, so a track click slides
      // to the pressed value instead of snapping.
      gestureAnchor.current = next;
      gestureDragged.current = false;
      setInteracting(false);
      setExternalEasing(true);
    } else if (!gestureDragged.current && next !== gestureAnchor.current) {
      // The pointer moved off the press point → a real drag. Drop to 1:1.
      gestureDragged.current = true;
      setInteracting(true);
      setExternalEasing(false);
    }
    latest.current = next;
    setLocal(next);
    onInput?.(next);

    const elapsed = Date.now() - lastCommitAt.current;
    if (elapsed >= activeLiveMs) {
      // Leading edge: a fresh frame, commit straight away.
      if (trailingTimer.current) {
        clearTimeout(trailingTimer.current);
        trailingTimer.current = null;
      }
      flush(next);
    } else {
      // Mid-frame: (re)arm a trailing commit for the remaining time so a paused
      // finger still catches the lights up to where the cursor came to rest.
      if (trailingTimer.current) clearTimeout(trailingTimer.current);
      trailingTimer.current = setTimeout(() => {
        trailingTimer.current = null;
        flush(latest.current);
      }, activeLiveMs - elapsed);
    }
  };

  const commitNow = (next: number) => {
    if (trailingTimer.current) {
      clearTimeout(trailingTimer.current);
      trailingTimer.current = null;
    }
    const wasClick = !gestureDragged.current;
    gestureAnchor.current = null;
    gestureDragged.current = false;
    isInteracting.current = false;
    setInteracting(false);
    // A click glides to its final value; a drag already tracked the pointer 1:1,
    // so it settles in place with no extra ease.
    setExternalEasing(wasClick);
    latest.current = next;
    setLocal(next);
    onCommit(next, "final");
    armSettle(next);
    // Start the next interaction on a fresh frame so it commits instantly.
    lastCommitAt.current = 0;
  };

  // The fill (slider-range) and thumb share one transition, declared once and
  // identically on both elements in slider.tsx. The only thing that varies is
  // its duration, carried by the --paced-ease custom property on the root below.
  // While the finger is down (a confirmed drag) or before the first paint, the
  // duration is zeroed so position changes are instant and the thumb tracks the
  // pointer 1:1; otherwise both ease over the same window (matched to the bridge
  // fade) so a programmatic change — a toggle ramp, a scene, an external SSE
  // update — glides the thumb and fill together. Because the transition-property
  // and timing are always present and identical on both, the thumb can never
  // snap ahead of the fill: sync reduces to a single shared duration.
  const eased = hasMounted && externalEasing && !interacting;
  const paceMs = eased ? easeMs : 0;
  const fillRatio =
    max === min ? 0 : Math.min(1, Math.max(0, (local - min) / (max - min)));

  const sliderStyle = {
    ...style,
    "--paced-ease": `${paceMs}ms`,
    "--slider-thumb-size":
      "var(--paced-slider-thumb-size-override,var(--paced-slider-thumb-size,1rem))",
    "--slider-track-size":
      "var(--paced-slider-track-size-override,var(--paced-slider-track-size,0.75rem))",
    "--paced-slider-track-width":
      trackWidth > 0 ? `${trackWidth}px` : undefined,
  } as React.CSSProperties;

  const slider = (
    <Slider
      value={[local]}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      dimWhenDisabled={dimWhenDisabled}
      aria-label={ariaLabel}
      className={cn(PACED_SLIDER_CLASS, showTicks ? "w-full" : className)}
      size={size}
      style={sliderStyle}
      onValueChange={(v) => schedule(first(v))}
      onValueCommitted={(v) => commitNow(first(v))}
    />
  );

  // A transparent layer behind the slider that extends the click-swallow zone
  // into the surrounding card padding. It sits below the slider (earlier in DOM)
  // so the track/thumb still take every pointer event over their own box; it
  // only catches taps in the dead space around them and stops them bubbling to
  // the card. Stopping propagation on the wrapper covers direct slider taps too.
  const hitOverlay = (
    <span
      aria-hidden
      className="pointer-events-auto absolute"
      style={{
        top: `calc(-1 * ${hitInset?.top ?? "0.75rem"})`,
        bottom: `calc(-1 * ${hitInset?.bottom ?? "1.5rem"})`,
        left: `calc(-1 * ${hitInset?.x ?? "1.5rem"})`,
        right: `calc(-1 * ${hitInset?.x ?? "1.5rem"})`,
      }}
    />
  );
  const swallow = (e: React.MouseEvent) => e.stopPropagation();

  // The track has discrete snap points: draw a subtle line at each. Lines past
  // the thumb (unfilled track) and lines under the fill get different colors so
  // they stay legible against either background.
  if (showTicks && step) {
    const count = Math.round((max - min) / step) + 1;
    if (count > 1 && count <= 64) {
      const fill = fillRatio;
      // Base UI positions the thumb on an edge-adjusted scale: its centre travels
      // (trackWidth − thumbWidth), inset by half a thumb width at each end so the
      // thumb never overhangs the track. A linear value%→position mapping drifts
      // away from the thumb near the ends. Map each tick through the same affine
      // transform so the lines stay pinned under the thumb. thumbRatio is 0 until
      // the track is measured, leaving the marks linear for the first paint.
      const thumbPx = size === "xl" ? 24 : size === "lg" ? 20 : 16;
      const thumbRatio = trackWidth > 0 ? thumbPx / trackWidth : 0;
      const posFor = (f: number) =>
        (0.5 * thumbRatio + (1 - thumbRatio) * f) * 100;
      // Match the track height per size so each line spans the track exactly.
      const tickHeight =
        size === "xl" ? "h-5" : size === "lg" ? "h-4" : "h-3";
      // Keep edge ticks/labels inside the track instead of poking past it.
      const offsetFor = (i: number) =>
        i === 0 ? "0" : i === count - 1 ? "-100%" : "-50%";
      const labelIndices = tickLabels
        ? tickLabels === "all"
          ? Array.from({ length: count }, (_, i) => i)
          : [0, count - 1]
        : [];
      return (
        <div className={cn("flex flex-col", className)} onClick={swallow}>
          <div ref={wrapperRef} className="relative w-full">
            {hitOverlay}
            {slider}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center"
            >
              {Array.from({ length: count }, (_, i) => {
                // Skip the end ticks — they'd just trace the track's own edges.
                if (i === 0 || i === count - 1) return null;
                const f = i / (count - 1);
                const filled = f <= fill + 1e-6;
                return (
                  <span
                    key={i}
                    className={cn(
                      "absolute w-0.5 rounded-full",
                      tickHeight,
                      filled
                        ? "bg-background/40 dark:bg-background/50"
                        : "bg-foreground/20 dark:bg-foreground/25",
                    )}
                    style={{
                      left: `${posFor(f)}%`,
                      transform: `translateX(${offsetFor(i)})`,
                    }}
                  />
                );
              })}
            </div>
          </div>
          {labelIndices.length > 0 && (
            <div
              aria-hidden
              className="relative mt-1.5 h-3 text-[10px] leading-none tabular-nums text-muted-foreground"
            >
              {labelIndices.map((i) => (
                <span
                  key={i}
                  className="absolute"
                  style={{
                    left: `${posFor(i / (count - 1))}%`,
                    transform: `translateX(${offsetFor(i)})`,
                  }}
                >
                  {min + i * step}
                </span>
              ))}
            </div>
          )}
        </div>
      );
    }
  }

  return (
    <div
      ref={wrapperRef}
      className={cn("relative w-full", !showTicks && className)}
      onClick={swallow}
    >
      {hitOverlay}
      {slider}
    </div>
  );
};
