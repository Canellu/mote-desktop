import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import {
  MASCOT_ANIMATIONS,
  MASCOT_SHEET,
  mascotSheet,
  type MascotAnimation,
} from "./mascot";
import type { WidgetMascotStyle } from "./types";

/** What loops at rest: the moth glowing softly as it breathes. */
const REST: MascotAnimation = "breathe";
/** Seconds of breathing between blinks, checked as each breath ends. */
const BLINK_GAP = [2, 7] as const;
/** How often a pause ends in a bob instead of a blink. */
const BOB_CHANCE = 0.12;
/** How often a blink comes straight back as a second one. */
const DOUBLE_BLINK_CHANCE = 0.2;

const nextPause = () => {
  const [min, max] = BLINK_GAP;
  return Date.now() + (min + Math.random() * (max - min)) * 1000;
};

/**
 * The collapsed widget's moth, played from its sprite sheet. At rest it
 * breathes, blinking every few seconds and now and then bobbing; under the pointer it flutters;
 * pressed, it squishes. Still when `animated` is off or motion is reduced.
 */
export const MascotSprite = ({
  style,
  hovering,
  pressed,
  animated = true,
  className,
}: {
  style: WidgetMascotStyle;
  hovering: boolean;
  pressed: boolean;
  animated?: boolean;
  className?: string;
}) => {
  const reduceMotion = useReducedMotion();
  const live = animated && !reduceMotion;
  const [frame, setFrame] = useState(MASCOT_ANIMATIONS[REST].start);

  useEffect(() => {
    if (!live) return;
    let timer: number | undefined;
    let animation: MascotAnimation = hovering ? "flutter" : REST;
    let index = 0;
    let restUntil = nextPause();
    let doubled = false;
    const step = () => {
      const { start, durationsMs } = MASCOT_ANIMATIONS[animation];
      setFrame(start + index);
      timer = window.setTimeout(() => {
        index += 1;
        if (index < durationsMs.length) return step();
        // A loop ends: flutter keeps going under the pointer, breathing runs
        // until its pause is up, and a blink or bob hands back to breathing,
        // unless a blink comes again at once.
        index = 0;
        if (animation === REST) {
          if (Date.now() >= restUntil) {
            animation = Math.random() < BOB_CHANCE ? "bob" : "blink";
          }
        } else if (animation === "flutter") {
          // Keeps fluttering until the pointer leaves.
        } else if (
          animation === "blink" &&
          !doubled &&
          Math.random() < DOUBLE_BLINK_CHANCE
        ) {
          doubled = true;
        } else {
          animation = REST;
          doubled = false;
          restUntil = nextPause();
        }
        step();
      }, durationsMs[index]);
    };
    step();
    return () => window.clearTimeout(timer);
  }, [hovering, live]);

  const { columns, rows } = MASCOT_SHEET;
  // Held still, it shows the first rest frame: the same drawing it animates.
  const shown = live ? frame : MASCOT_ANIMATIONS[REST].start;
  const column = shown % columns;
  const row = Math.floor(shown / columns);
  const sprite = {
    backgroundImage: `url(${mascotSheet(style)})`,
    backgroundSize: `${columns * 100}% ${rows * 100}%`,
    backgroundPosition: `${(column / (columns - 1)) * 100}% ${(row / (rows - 1)) * 100}%`,
    imageRendering: style === "pixelArt" ? "pixelated" : undefined,
  } as const;

  if (!live) {
    return <div className={cn("size-full", className)} style={sprite} />;
  }

  return (
    <motion.div
      className={cn("size-full", className)}
      animate={{
        y: hovering ? -2 : 0,
        scale: pressed ? 0.9 : hovering ? 1.06 : 1,
      }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      style={sprite}
    />
  );
};
