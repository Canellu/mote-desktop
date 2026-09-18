import type { CSSProperties } from "react";
import type {
  WidgetCornerMode,
  WidgetSizeMode,
  WidgetThemeMode,
} from "./types";

/** Corner radius (px) of the widget window's glass shell. */
export const WIDGET_CORNER_RADIUS = 18;

/** Horizontal and bottom inset around the live widget control grid. */
export const WIDGET_SIDE_PADDING = 16;

/** The ideal width (px) of a control card — the basis each grid column grows
 * from. Cards lay out exactly like the main app's space grid (a uniform
 * `auto-fill` grid that wraps and stretches each row to one height), so a single
 * fixed width is all that's needed; the live widget's minimum window width is
 * derived from this so one card always fits. Tuned wide so a card comfortably
 * fits a full row of scene tiles. */
export const WIDGET_CARD_BASIS = 300;

/** The `grid-template-columns` value the widget (and its settings preview) use
 * for the control grid: uniform columns that wrap and never balloon a lone card,
 * mirroring the main app's room/zone grid. */
export const WIDGET_CARD_GRID_COLUMNS = `repeat(auto-fill, minmax(${WIDGET_CARD_BASIS}px, 1fr))`;

export const WIDGET_SIZE_METRICS: Record<
  WidgetSizeMode,
  {
    cardBasis: number;
    edgePadding: number;
    gridGap: number;
    fontSize: number;
    cornerRadius: number;
  }
> = {
  small: {
    cardBasis: 260,
    edgePadding: 30,
    gridGap: 10,
    fontSize: 14,
    cornerRadius: 16,
  },
  default: {
    cardBasis: WIDGET_CARD_BASIS,
    edgePadding: 36,
    gridGap: 12,
    fontSize: 16,
    cornerRadius: WIDGET_CORNER_RADIUS,
  },
  large: {
    cardBasis: 340,
    edgePadding: 42,
    gridGap: 14,
    fontSize: 18,
    cornerRadius: 20,
  },
};

/**
 * How far each corner style scales the standard rounding. The shell and the
 * cards inside it scale together, so their corners keep the same relationship
 * at every step. `rounded` is the widget as it has always looked.
 */
export const WIDGET_CORNER_SCALE: Record<WidgetCornerMode, number> = {
  square: 0,
  soft: 0.5,
  rounded: 1,
  round: 1.6,
};

/** The app's `--radius` in rem, mirrored from App.css. The cards' `rounded-*`
 * classes are calculated from it, so a widget scales them by redefining it. */
const APP_RADIUS_REM = 0.625;

export const widgetCardGridColumns = (sizeMode: WidgetSizeMode) =>
  `repeat(auto-fill, minmax(${WIDGET_SIZE_METRICS[sizeMode].cardBasis}px, 1fr))`;

export const resolveWidgetTheme = (
  themeMode: WidgetThemeMode,
  systemDark: boolean,
): "light" | "dark" => {
  if (themeMode === "system") return systemDark ? "dark" : "light";
  return themeMode;
};

// The surface tokens the widget's controls read, mirrored from App.css's `:root`
// and `.dark`. The widget paints these inline on its shell rather than leaning
// on the document's `.dark` class for two reasons: a widget owns its own
// light/dark appearance independent of the app theme, and the settings preview
// renders a widget shell *inside* the main app, where the document class
// reflects the app theme, not the previewed widget's. The live widget also
// toggles the `.dark` class on its own root (see `WidgetScreen`) so Tailwind's
// `dark:` variants resolve; these inline tokens override the class's values for
// the shell subtree, so the two always agree.
const WIDGET_LIGHT_TOKENS = {
  "--background": "oklch(0.96 0 0)",
  "--foreground": "oklch(0.145 0 0)",
  "--card": "oklch(0.99 0 0)",
  "--card-foreground": "oklch(0.145 0 0)",
  "--tile": "oklch(0.99 0 0)",
  "--tile-off": "oklch(0.925 0 0)",
  "--tile-border": "oklch(0.875 0 0 / 10%)",
  "--tile-border-lit": "oklch(0.875 0 0 / 10%)",
  "--tile-shade-strength": "0.92",
  "--tile-shade-mid-strength": "0.82",
  "--tile-highlight-strength": "0.9",
  "--popover": "oklch(1 0 0)",
  "--popover-foreground": "oklch(0.145 0 0)",
  "--primary": "oklch(0.205 0 0)",
  "--primary-foreground": "oklch(0.985 0 0)",
  "--secondary": "oklch(0.97 0 0)",
  "--secondary-foreground": "oklch(0.205 0 0)",
  "--muted": "oklch(0.97 0 0)",
  "--muted-foreground": "oklch(0.556 0 0)",
  "--accent": "oklch(0.97 0 0)",
  "--accent-foreground": "oklch(0.205 0 0)",
  "--border": "oklch(0.922 0 0)",
  "--input": "oklch(0.922 0 0)",
  "--ring": "oklch(0.708 0 0)",
} as CSSProperties;

const WIDGET_DARK_TOKENS = {
  "--background": "oklch(0.22 0 0)",
  "--foreground": "oklch(0.985 0 0)",
  "--card": "oklch(0.26 0 0)",
  "--card-foreground": "oklch(0.985 0 0)",
  "--tile": "oklch(0.26 0 0)",
  "--tile-off": "oklch(0.26 0 0)",
  "--tile-border": "oklch(1 0 0 / 5%)",
  "--tile-border-lit": "oklch(0.31 0 0)",
  "--tile-shade-strength": "1.08",
  "--tile-shade-mid-strength": "1",
  "--tile-highlight-strength": "0.48",
  "--popover": "oklch(0.275 0 0)",
  "--popover-foreground": "oklch(0.985 0 0)",
  "--primary": "oklch(0.922 0 0)",
  "--primary-foreground": "oklch(0.205 0 0)",
  "--secondary": "oklch(0.269 0 0)",
  "--secondary-foreground": "oklch(0.985 0 0)",
  "--muted": "oklch(0.269 0 0)",
  "--muted-foreground": "oklch(0.708 0 0)",
  "--accent": "oklch(0.269 0 0)",
  "--accent-foreground": "oklch(0.985 0 0)",
  "--border": "oklch(1 0 0 / 10%)",
  "--input": "oklch(1 0 0 / 15%)",
  "--ring": "oklch(0.556 0 0)",
} as CSSProperties;

/**
 * Inline styles for the widget shell: the full themed token set plus a soft
 * translucent tint (the visible blur is painted by the native compositor, so the
 * background stays mostly transparent). Self-contained so it renders identically
 * in the live widget window and in the settings preview.
 */
export const widgetShellStyle = (
  theme: "light" | "dark" = "dark",
  sizeMode: WidgetSizeMode = "default",
  cornerMode: WidgetCornerMode = "rounded",
): CSSProperties => {
  const dark = theme === "dark";
  const tint = dark ? "#1b1c20" : "#f6f7f2";
  const tintStrength = dark ? 55 : 70;
  const cornerScale = WIDGET_CORNER_SCALE[cornerMode];
  return {
    ...(dark ? WIDGET_DARK_TOKENS : WIDGET_LIGHT_TOKENS),
    "--radius": `${APP_RADIUS_REM * cornerScale}rem`,
    borderRadius: WIDGET_SIZE_METRICS[sizeMode].cornerRadius * cornerScale,
    fontSize: WIDGET_SIZE_METRICS[sizeMode].fontSize,
    backgroundColor: `color-mix(in srgb, ${tint} ${tintStrength}%, transparent)`,
    "--widget-tint": tint,
  } as CSSProperties;
};
