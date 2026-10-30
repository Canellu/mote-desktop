import celShaded from "@/assets/mascot/moth-cel-shaded.webp";
import celShadedSheet from "@/assets/mascot/moth-cel-shaded-sheet.webp";
import lowPoly from "@/assets/mascot/moth-low-poly.webp";
import lowPolySheet from "@/assets/mascot/moth-low-poly-sheet.webp";
import paperCutout from "@/assets/mascot/moth-paper-cutout.webp";
import paperCutoutSheet from "@/assets/mascot/moth-paper-cutout-sheet.webp";
import pixelArt from "@/assets/mascot/moth-pixel-art.webp";
import pixelArtSheet from "@/assets/mascot/moth-pixel-art-sheet.webp";
import watercolor from "@/assets/mascot/moth-watercolor.webp";
import watercolorSheet from "@/assets/mascot/moth-watercolor-sheet.webp";
import type { WidgetMascotStyle } from "./types";

/** The moth drawings a widget can collapse into, in the order Settings lists
 * them. `src` is the original drawing the Settings picker shows; `sheet`
 * holds every animation frame the widget plays. */
export const MASCOT_STYLES = [
  {
    value: "celShaded",
    label: "Cartoon",
    src: celShaded,
    sheet: celShadedSheet,
  },
  { value: "lowPoly", label: "Low poly", src: lowPoly, sheet: lowPolySheet },
  {
    value: "pixelArt",
    label: "Pixel art",
    src: pixelArt,
    sheet: pixelArtSheet,
  },
  {
    value: "paperCutout",
    label: "Paper",
    src: paperCutout,
    sheet: paperCutoutSheet,
  },
  {
    value: "watercolor",
    label: "Watercolor",
    src: watercolor,
    sheet: watercolorSheet,
  },
] satisfies Array<{
  value: WidgetMascotStyle;
  label: string;
  src: string;
  sheet: string;
}>;

const styleOf = (style: WidgetMascotStyle) =>
  MASCOT_STYLES.find((option) => option.value === style) ?? MASCOT_STYLES[0];

export const mascotSrc = (style: WidgetMascotStyle) => styleOf(style).src;
export const mascotSheet = (style: WidgetMascotStyle) => styleOf(style).sheet;

/** Every sheet is the same grid: six columns, the animations below in order,
 * twelve frames each. Cut by `output/moth-sheets-24-frame-2026-10-30/recut.py`
 * and packed by `output/moth-12-frame-2026-10-30/pack_mascot.py --sheets`,
 * whose rows are named idle, flutter, blink and glow; here they're named for
 * what the moth does with them. */
export const MASCOT_SHEET = { columns: 6, rows: 8 } as const;

/** `breathe` is the resting glow, `bob` a gentle rise, `flutter` the wing
 * fold under the pointer. */
export type MascotAnimation = "bob" | "flutter" | "blink" | "breathe";

/** Where each animation starts on the sheet and how long each frame shows.
 * Each is six poses played forward then back, so frames 5 and 6 are the
 * turn: eyes shut for `blink`, brightest for `breathe`. */
export const MASCOT_ANIMATIONS: Record<
  MascotAnimation,
  { start: number; durationsMs: readonly number[] }
> = {
  bob: { start: 0, durationsMs: Array(12).fill(110) },
  flutter: { start: 12, durationsMs: Array(12).fill(60) },
  // About a third of a second, like a person's: a quick shut, a beat
  // closed, a slightly slower open.
  blink: {
    start: 24,
    durationsMs: [30, 20, 20, 20, 20, 50, 50, 25, 25, 25, 25, 30],
  },
  // A slow breath, about three seconds, easing at either end.
  breathe: {
    start: 36,
    durationsMs: [350, 240, 220, 220, 240, 300, 300, 240, 220, 220, 240, 350],
  },
};
