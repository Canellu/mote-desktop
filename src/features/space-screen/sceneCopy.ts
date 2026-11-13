import type { HueLight } from "@/types/hue";

import { mirekToXy } from "./utils/color";

type Raw = Record<string, unknown>;

/** What a light can accept in a scene action. */
export interface LightCapabilities {
  id: string;
  dimming: boolean;
  color: boolean;
  /** Supported mirek range, or null when the light has no color temperature. */
  ct: { min: number; max: number } | null;
  gradient: boolean;
  effects: string[];
  effectsV2: string[];
}

const isRecord = (value: unknown): value is Raw =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const record = (value: unknown): Raw | null => (isRecord(value) ? value : null);

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const DEFAULT_CT = { min: 153, max: 500 };

/** Capabilities read from a raw v2 `light` resource. */
export const capabilitiesFromResource = (light: Raw): LightCapabilities => {
  const ct = record(light.color_temperature);
  const schema = record(ct?.mirek_schema);
  const min = schema?.mirek_minimum;
  const max = schema?.mirek_maximum;
  return {
    id: String(light.id),
    dimming: isRecord(light.dimming),
    color: isRecord(light.color),
    ct: ct
      ? typeof min === "number" && typeof max === "number"
        ? { min, max }
        : DEFAULT_CT
      : null,
    gradient: isRecord(light.gradient),
    effects: strings(record(light.effects)?.effect_values),
    effectsV2: strings(record(record(light.effects_v2)?.action)?.effect_values),
  };
};

/** Fallback when the raw resource is unavailable; gradient is unknown there. */
export const capabilitiesFromLight = (light: HueLight): LightCapabilities => ({
  id: light.id,
  dimming: light.brightness != null,
  color: light.supportsColor,
  ct: light.supportsCt
    ? {
        min: light.ctMin ?? DEFAULT_CT.min,
        max: light.ctMax ?? DEFAULT_CT.max,
      }
    : null,
  gradient: false,
  effects: light.effects,
  effectsV2: light.effectsV2,
});

const xyOf = (value: unknown): { x: number; y: number } | null => {
  const xy = record(record(value)?.xy);
  return typeof xy?.x === "number" && typeof xy?.y === "number"
    ? { x: xy.x, y: xy.y }
    : null;
};

const brightnessOf = (value: unknown): number | null => {
  const brightness = record(value)?.brightness;
  return typeof brightness === "number" ? brightness : null;
};

const mirekOf = (value: unknown): number | null => {
  const mirek = record(value)?.mirek;
  return typeof mirek === "number" ? mirek : null;
};

/** Closest color temperature to an xy point (McCamy), in mireds. */
const xyToMirek = ({ x, y }: { x: number; y: number }): number => {
  const n = (x - 0.332) / (0.1858 - y);
  const kelvin = 449 * n ** 3 + 3525 * n ** 2 + 6823.3 * n + 5520.33;
  return Number.isFinite(kelvin) && kelvin > 0 ? 1_000_000 / kelvin : 366;
};

const clampMirek = (mirek: number, range: { min: number; max: number }) =>
  Math.round(Math.min(range.max, Math.max(range.min, mirek)));

const effectV2Post = (value: unknown, supported: string[]): Raw | null => {
  const action = record(record(value)?.action);
  const effect = action?.effect;
  if (typeof effect !== "string" || !supported.includes(effect)) return null;
  const source = record(action?.parameters);
  const parameters: Raw = {};
  const xy = xyOf(source?.color);
  if (xy) parameters.color = { xy };
  const mirek = mirekOf(source?.color_temperature);
  if (mirek != null)
    parameters.color_temperature = { mirek: Math.round(mirek) };
  if (typeof source?.speed === "number") parameters.speed = source.speed;
  return {
    action: {
      effect,
      ...(Object.keys(parameters).length > 0 ? { parameters } : null),
    },
  };
};

/**
 * Rebuild a scene action so it only carries what the target light accepts.
 * The bridge rejects the whole scene when one action sets a feature its light
 * lacks (color on a white bulb, a gradient on a single-color lamp).
 */
export const fitActionToLight = (
  source: Raw,
  light: LightCapabilities,
): Raw => {
  const action: Raw = {};
  const on = record(source.on)?.on;
  action.on = { on: typeof on === "boolean" ? on : true };

  const brightness = brightnessOf(source.dimming);
  if (brightness != null && light.dimming) action.dimming = { brightness };

  const gradient = record(source.gradient);
  const points = (Array.isArray(gradient?.points) ? gradient.points : [])
    .map((point) => xyOf(record(point)?.color))
    .filter((xy) => xy !== null);
  if (light.gradient && points.length >= 2) {
    action.gradient = {
      points: points.slice(0, 5).map((xy) => ({ color: { xy } })),
      ...(typeof gradient?.mode === "string" ? { mode: gradient.mode } : null),
    };
  }

  // A gradient-only action still has a color to hand a plain color light.
  const xy =
    xyOf(source.color) ?? (action.gradient ? null : (points[0] ?? null));
  const mirek = mirekOf(source.color_temperature);
  if (xy && light.color) {
    action.color = { xy };
  } else if (mirek != null && light.ct) {
    action.color_temperature = { mirek: clampMirek(mirek, light.ct) };
  } else if (xy && light.ct) {
    action.color_temperature = { mirek: clampMirek(xyToMirek(xy), light.ct) };
  } else if (mirek != null && light.color) {
    const [x, y] = mirekToXy(mirek);
    action.color = { xy: { x, y } };
  }

  const effect = record(source.effects)?.effect;
  if (typeof effect === "string" && light.effects.includes(effect))
    action.effects = { effect };
  const effectV2 = effectV2Post(source.effects_v2, light.effectsV2);
  if (effectV2) action.effects_v2 = effectV2;

  const duration = record(source.dynamics)?.duration;
  if (typeof duration === "number")
    action.dynamics = { duration: Math.round(duration) };

  return action;
};

/** 3 gradient, 2 color, 1 white ambiance, 0 dimmable or on/off. */
const actionTier = (action: Raw): number =>
  isRecord(action.gradient)
    ? 3
    : isRecord(action.color)
      ? 2
      : isRecord(action.color_temperature)
        ? 1
        : 0;

const lightTier = (light: LightCapabilities): number =>
  light.gradient ? 3 : light.color ? 2 : light.ct ? 1 : 0;

/**
 * Hand each target light a source action, preferring one written for the same
 * kind of light and rotating through those so the scene's colors spread out.
 */
export const buildCopiedActions = (
  sourceActions: Raw[],
  targets: LightCapabilities[],
): Raw[] => {
  const settings = sourceActions
    .map((item) => record(item.action))
    .filter((action) => action !== null);
  if (settings.length === 0) return [];
  const used = new Map<number, number>();
  return targets.map((light) => {
    const tier = lightTier(light);
    // Nearest tier at or below the light's, else the nearest above.
    const tiers = [...new Set(settings.map(actionTier))].sort(
      (a, b) =>
        Number(a > tier) - Number(b > tier) ||
        Math.abs(a - tier) - Math.abs(b - tier),
    );
    const pool = settings.filter((action) => actionTier(action) === tiers[0]);
    const turn = used.get(tiers[0]) ?? 0;
    used.set(tiers[0], turn + 1);
    return {
      target: { rid: light.id, rtype: "light" },
      action: fitActionToLight(pool[turn % pool.length], light),
    };
  });
};

/** The palette fields a scene POST accepts, or null when there are none. */
export const creatablePalette = (value: unknown): Raw | null => {
  const palette = record(value);
  if (!palette) return null;
  const list = (field: string) =>
    Array.isArray(palette[field]) ? (palette[field] as unknown[]) : [];

  const color = list("color").flatMap((entry) => {
    const xy = xyOf(record(entry)?.color);
    const brightness = brightnessOf(record(entry)?.dimming);
    return xy && brightness != null
      ? [{ color: { xy }, dimming: { brightness } }]
      : [];
  });
  const dimming = list("dimming").flatMap((entry) => {
    const brightness = brightnessOf(entry);
    return brightness != null ? [{ brightness }] : [];
  });
  const colorTemperature = list("color_temperature").flatMap((entry) => {
    const mirek = mirekOf(record(entry)?.color_temperature);
    const brightness = brightnessOf(record(entry)?.dimming);
    return mirek != null && brightness != null
      ? [
          {
            color_temperature: { mirek: Math.round(mirek) },
            dimming: { brightness },
          },
        ]
      : [];
  });
  const effectsV2 = list("effects_v2").flatMap((entry) => {
    const effect = record(record(entry)?.action)?.effect;
    const post =
      typeof effect === "string" ? effectV2Post(entry, [effect]) : null;
    return post ? [post] : [];
  });

  if (color.length + dimming.length + colorTemperature.length === 0)
    return null;
  return {
    color: color.slice(0, 9),
    dimming: dimming.slice(0, 1),
    color_temperature: colorTemperature.slice(0, 1),
    ...(effectsV2.length > 0 ? { effects_v2: effectsV2.slice(0, 3) } : null),
  };
};
