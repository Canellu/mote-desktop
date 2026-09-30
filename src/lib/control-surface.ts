/**
 * The surface and border of a pressable control, matching the select and
 * input fields: white on the grey settings surfaces in light mode, and a step
 * darker than them in dark mode. Tiles and lists of rows that open or pick
 * something use it too, so everything interactive reads the same.
 */
export const CONTROL_SURFACE_CLASS =
  "border border-foreground/12 bg-popover dark:border-foreground/8 dark:bg-[oklch(0.25_0_0)]";
