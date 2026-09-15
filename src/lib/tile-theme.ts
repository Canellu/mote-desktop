// Pins a tile to the light-theme palette (mirrors the `:root` tokens in App.css)
// so a *lit*, color-tinted card renders its child controls consistently
// regardless of the app's light/dark mode. Defining these custom properties on a
// card overrides the inherited `.dark` values for the whole subtree, including
// the Switch/Slider/Card child components. Only applied to active tiles (see
// `activeTileTheme`); inactive tiles intentionally inherit the app theme so they
// get a real light/dark variant.
export const LIGHT_THEME = {
  "--background": "oklch(0.99 0 0)",
  "--foreground": "oklch(0.145 0 0)",
  "--card": "oklch(1 0 0)",
  "--card-foreground": "oklch(0.145 0 0)",
  "--muted": "oklch(0.97 0 0)",
  "--muted-foreground": "oklch(0.556 0 0)",
  "--accent": "oklch(0.97 0 0)",
  "--accent-foreground": "oklch(0.205 0 0)",
  "--border": "oklch(0.922 0 0)",
  "--input": "oklch(0.922 0 0)",
  "--ring": "oklch(0.708 0 0)",
} as React.CSSProperties;

// Shared styling for a brightness slider sitting on a tinted tile (the Home
// room/zone tiles, the Lights cards, and the in-space Group controls). Keeps
// the thumb/track/fill identical across all three so they read as one control:
// a wide thumb, a translucent track that lets the card's color show through,
// and a white fill that fades from soft to bright across the filled portion.
export const TILE_BRIGHTNESS_SLIDER_CLASS =
  "tile-brightness-slider w-full [--paced-slider-thumb-size-override:var(--tile-slider-thumb-size,1.25rem)] [--paced-slider-track-size-override:var(--tile-slider-track-size,0.75rem)]";

// Tile switches keep a translucent track so the lit tile's color shows through,
// instead of the solid gray fill the base Switch uses on neutral surfaces.
export const TILE_POWER_SWITCH_CLASS =
  "data-checked:bg-foreground/35 data-unchecked:bg-foreground/10 dark:data-checked:bg-foreground/35 dark:data-unchecked:bg-foreground/10 dark:**:data-[slot=switch-thumb]:data-unchecked:bg-background";

export const SCENE_TILE_SURFACE_CLASS = "tile-surface-scene";

// Background + text color ease over the bridge fade (`--tile-ease`) so a lit
// tile re-tints in step with the bulb it mirrors.
export const TILE_INTERACTION_TRANSITION_CLASS =
  "ease-out [transition-property:background,color] [transition-duration:var(--tile-ease),var(--tile-ease)]";

// Hue's mobile cards are taller, so their bottom shade has more vertical room.
// Our wider desktop cards need brightness to darken faster and climb higher up
// the surface, otherwise a 1% card still reads almost full-bright.
const MIN_SHADE_ALPHA = 0.3;
const MAX_SHADE_ALPHA = 0.64;
const SHADE_CURVE_EXPONENT = 0.8;
const SHADE_MID_RATIO = 0.64;
const SHADE_MID_STOP_MIN = 38;
const SHADE_MID_STOP_MAX = 62;
const SHADE_CLEAR_STOP_MIN = 74;
const SHADE_CLEAR_STOP_MAX = 98;
const SHADE_STOP_CURVE_EXPONENT = 0.9;
const HIGHLIGHT_MIN_ALPHA = 0.005;
const HIGHLIGHT_MAX_ALPHA = 0.105;
const HIGHLIGHT_CURVE_EXPONENT = 1.15;
const HIGHLIGHT_PEAK_END = 16;
const HIGHLIGHT_FADE_END = 34;

/**
 * Layers a Hue-style lit-tile treatment over `background`: a top highlight plus
 * a brightness-driven dark gradient. The lower the brightness, the more the
 * dark layer climbs toward the top; even at 100% brightness the bottom still
 * stays slightly darker so the card never goes flat.
 */
function brightnessShade(background: string, brightness: number): string {
  const clampedBrightness = Math.min(100, Math.max(0, brightness));
  const intensity = 1 - clampedBrightness / 100;
  const weightedIntensity = Math.pow(intensity, SHADE_CURVE_EXPONENT);
  const shadeReach = Math.pow(intensity, SHADE_STOP_CURVE_EXPONENT);
  const brightnessLift = Math.pow(
    clampedBrightness / 100,
    HIGHLIGHT_CURVE_EXPONENT,
  );
  const alpha = +(
    MIN_SHADE_ALPHA +
    (MAX_SHADE_ALPHA - MIN_SHADE_ALPHA) * weightedIntensity
  ).toFixed(3);
  const midAlpha = +(alpha * SHADE_MID_RATIO).toFixed(3);
  const midStop = +(
    SHADE_MID_STOP_MIN +
    (SHADE_MID_STOP_MAX - SHADE_MID_STOP_MIN) * shadeReach
  ).toFixed(1);
  const clearStop = +(
    SHADE_CLEAR_STOP_MIN +
    (SHADE_CLEAR_STOP_MAX - SHADE_CLEAR_STOP_MIN) * shadeReach
  ).toFixed(3);
  const highlightAlpha = +(
    HIGHLIGHT_MIN_ALPHA +
    (HIGHLIGHT_MAX_ALPHA - HIGHLIGHT_MIN_ALPHA) * brightnessLift
  ).toFixed(3);
  const highlightMidAlpha = +(highlightAlpha * 0.7).toFixed(3);
  return `linear-gradient(to bottom, rgb(255 255 255 / calc(${highlightAlpha} * var(--tile-highlight-strength))) 0%, rgb(255 255 255 / calc(${highlightMidAlpha} * var(--tile-highlight-strength))) ${HIGHLIGHT_PEAK_END}%, rgb(255 255 255 / 0) ${HIGHLIGHT_FADE_END}%), linear-gradient(to top, rgb(0 0 0 / calc(${alpha} * var(--tile-shade-strength))) 0%, rgb(0 0 0 / calc(${midAlpha} * var(--tile-shade-mid-strength))) ${midStop}%, rgb(0 0 0 / 0) ${clearStop}%, rgb(0 0 0 / 0) 100%), ${background}`;
}

const parseSolidColor = (
  color: string,
): { r: number; g: number; b: number } | null => {
  const value = color.trim();
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (hex) {
    const expanded =
      hex.length === 3
        ? hex
            .split("")
            .map((part) => part + part)
            .join("")
        : hex;
    const int = Number.parseInt(expanded, 16);
    return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
  }

  const rgb = value.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/i,
  );
  if (!rgb) return null;
  return {
    r: Math.min(255, Math.max(0, Number(rgb[1]))),
    g: Math.min(255, Math.max(0, Number(rgb[2]))),
    b: Math.min(255, Math.max(0, Number(rgb[3]))),
  };
};

const relativeLuminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

// --- Ink (text/icon) color for a lit tile -----------------------------------
// A lit tile renders text/icons in one of two app ink tokens. The CSS
// `contrast-color()` function can't choose between them correctly here: it only
// ever sees a single flat color, but our tiles paint a multi-color *gradient*
// that is then *darkened* by the brightness shade — so a seed taken from one
// full-brightness color drifts from what's actually behind the text (the
// "random" feeling). Instead we resolve the ink in JS from every palette color,
// after modeling the same darkening, and keep whichever ink has the better
// worst-case contrast across the whole surface.

// Soft near-black / near-white, matching the app's `--foreground` tokens (not
// pure #000/#fff). Their approximate sRGB luminances are precomputed so the ink
// choice never has to parse an oklch() string at runtime.
const INK_DARK = "oklch(0.145 0 0)";
const INK_LIGHT = "oklch(0.985 0 0)";
const INK_DARK_LUM = relativeLuminance({ r: 33, g: 33, b: 33 });
const INK_LIGHT_LUM = relativeLuminance({ r: 250, g: 250, b: 250 });

/** WCAG contrast ratio between two relative luminances (order-independent). */
const contrastRatio = (a: number, b: number): number =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/**
 * Relative luminances of every solid color (hex or `rgb()`) referenced by a
 * solid or `linear-gradient(...)` background. Non-color tokens in the gradient
 * (angles, percentage stops) are ignored. Falls back to `seed` when nothing
 * parses, so a single solid tint always yields one luminance.
 */
const paletteLuminances = (background: string, seed: string): number[] => {
  const tokens = background.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)/g) ?? [];
  const colors = tokens
    .map(parseSolidColor)
    .filter((c): c is { r: number; g: number; b: number } => c != null);
  if (colors.length === 0) {
    const fallback = parseSolidColor(seed);
    if (fallback) colors.push(fallback);
  }
  return colors.map(relativeLuminance);
};

/**
 * Approximate how much the brightness shade (see `brightnessShade`) darkens the
 * surface where text sits — a black overlay whose bottom alpha climbs as the
 * tile dims. Returns a representative darkening factor (0 = untouched) taken at
 * roughly mid-card, so it suits both top-aligned text (the widget header) and
 * bottom-aligned text (a tile name). A dimmer tile darkens more, so its ink
 * flips to light sooner — matching what the eye actually sees on the card.
 */
const shadeDarkening = (brightness: number | undefined): number => {
  if (brightness == null) return 0;
  const intensity = 1 - Math.min(100, Math.max(0, brightness)) / 100;
  const bottomAlpha =
    MIN_SHADE_ALPHA +
    (MAX_SHADE_ALPHA - MIN_SHADE_ALPHA) *
      Math.pow(intensity, SHADE_CURVE_EXPONENT);
  return bottomAlpha * 0.5;
};

/**
 * Picks the legible ink token for a lit tile. Resolves contrast against the
 * *whole* painted background — every palette color, dimmed by the brightness
 * shade — and returns whichever ink keeps the better worst-case contrast, so
 * text stays readable over both the brightest and the darkest part of a
 * gradient (and as the tile dims toward dark).
 */
const tileInk = (
  background: string,
  seed: string,
  brightness: number | undefined,
): string => {
  const keep = 1 - shadeDarkening(brightness);
  const lums = paletteLuminances(background, seed).map((l) => l * keep);
  if (lums.length === 0) return INK_DARK;
  const darkest = Math.min(...lums);
  const brightest = Math.max(...lums);
  // Dark ink is weakest over the darkest region; light ink over the brightest.
  // Whichever keeps the higher worst-case contrast wins the whole card.
  const darkWorst = contrastRatio(INK_DARK_LUM, darkest);
  const lightWorst = contrastRatio(INK_LIGHT_LUM, brightest);
  return darkWorst >= lightWorst ? INK_DARK : INK_LIGHT;
};

/** Pick readable foreground ink for an icon placed on a solid color. */
export const foregroundForBackground = (background: string): string =>
  tileInk(background, background, undefined);

/**
 * Inline style for an *active* (lit) tile. Paints the card with the light's live
 * color and derives a legible ink color from the actual painted surface (see
 * `tileInk`), so text and icons flip to light or dark based on the whole
 * gradient rather than a single seed color. `tint` is only a fallback seed for
 * the rare case the `background` string carries no parseable color.
 *
 * When `brightness` (0–100) is passed, a bottom-up dark gradient is layered over
 * the color so a dim tile looks dim — strongest at low brightness, easing to a
 * faint base shade (never fully gone) at 100%. The same brightness feeds the ink
 * choice, so a tile dimmed toward dark flips its text to light in step.
 *
 * Builds on `LIGHT_THEME` so the Switch/Slider keep their colored-card styling,
 * then overrides the foreground tokens. Every card surface that reads text color
 * from a token picks this up automatically: `text-foreground` and `text-card-
 * foreground` (the Card's default), plus their `/80` etc. opacity variants.
 */
export function activeTileTheme(
  background: string,
  tint: string,
  brightness?: number,
): React.CSSProperties {
  const foreground = tileInk(background, tint, brightness);
  return {
    ...LIGHT_THEME,
    background:
      brightness == null ? background : brightnessShade(background, brightness),
    // Gradients must cover the border positioning area and never repeat into
    // it. Otherwise a transparent border can paint the dark bottom stop along
    // the top edge and the bright top stop along the bottom edge.
    backgroundOrigin: "border-box",
    backgroundRepeat: "no-repeat",
    backgroundSize: "100% 100%",
    "--foreground": foreground,
    "--card-foreground": foreground,
    // Lit surfaces inherit their edge treatment from the component displaying
    // them. Large control tiles use LIT_TILE_FLAT_EDGE; small previews and chips
    // retain the normal theme border/shadow.
    "--tile-border": "var(--tile-border-lit)",
  } as React.CSSProperties;
}

/**
 * Spread onto large lit control tiles alongside `activeTileTheme`. Their
 * top-light → bottom-dark fill makes one neutral border look dark at the top
 * and light at the bottom. A transparent border still produces a wrapped edge
 * pixel on WebView-composited sortable cards, so remove the border entirely and
 * replace its vertical space with padding. Removing the elevation layer leaves
 * the surface flat while preserving Tailwind's separate focus/selection outline.
 * This stays component-specific because smaller previews and chips still benefit
 * from their normal edge and elevation.
 */
export const LIT_TILE_FLAT_EDGE = {
  borderWidth: 0,
  paddingBlock: "calc(var(--card-spacing) + 1px)",
  "--tw-shadow": "0 0 #0000",
} as React.CSSProperties;
