import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

export type TimeFormat = "24h" | "12h";
export type MeasurementSystem = "metric" | "imperial";
export type TemperatureUnit = "celsius" | "fahrenheit";

const KEYS = {
  timeFormat: "timeFormat",
  measurementSystem: "measurementSystem",
  temperatureUnit: "temperatureUnit",
} as const;

// Regions that measure in feet and inches day to day.
const IMPERIAL_REGIONS = new Set(["US", "LR", "MM"]);
// Regions that give the weather in Fahrenheit.
const FAHRENHEIT_REGIONS = new Set([
  "US",
  "BS",
  "BZ",
  "KY",
  "PW",
  "LR",
  "FM",
  "MH",
  "PR",
  "GU",
  "VI",
  "AS",
  "MP",
]);

/** What Windows says about the person's region and formats. */
interface RegionalDefaults {
  region: string | null;
  clock24: boolean | null;
  metric: boolean | null;
}

/** The person's own choice from Settings, or null when they have not made one. */
const stored = <T extends string>(key: string, allowed: readonly T[]) => {
  try {
    const value = localStorage.getItem(key);
    if (value && (allowed as readonly string[]).includes(value))
      return value as T;
  } catch {
    // Unreadable storage counts as no choice.
  }
  return null;
};

const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not persisting only costs the choice on next launch.
  }
};

interface FormatPreferencesState {
  timeFormat: TimeFormat;
  measurementSystem: MeasurementSystem;
  temperatureUnit: TemperatureUnit;
  setTimeFormat: (value: TimeFormat) => void;
  setMeasurementSystem: (value: MeasurementSystem) => void;
  setTemperatureUnit: (value: TemperatureUnit) => void;
}

/**
 * How the app writes times, lengths and temperatures: the person's choice in
 * Settings, else their Windows region (see initializeFormatPreferences), else
 * 24-hour, metric and Celsius.
 */
export const useFormatPreferences = create<FormatPreferencesState>((set) => ({
  timeFormat: stored(KEYS.timeFormat, ["24h", "12h"]) ?? "24h",
  measurementSystem:
    stored(KEYS.measurementSystem, ["metric", "imperial"]) ?? "metric",
  temperatureUnit:
    stored(KEYS.temperatureUnit, ["celsius", "fahrenheit"]) ?? "celsius",
  setTimeFormat: (timeFormat) => {
    write(KEYS.timeFormat, timeFormat);
    set({ timeFormat });
  },
  setMeasurementSystem: (measurementSystem) => {
    write(KEYS.measurementSystem, measurementSystem);
    set({ measurementSystem });
  },
  setTemperatureUnit: (temperatureUnit) => {
    write(KEYS.temperatureUnit, temperatureUnit);
    set({ temperatureUnit });
  },
}));

/** A clock time in the chosen format, e.g. "07:00" or "7:00 AM". */
export const formatClock = (
  hour: number,
  minute: number,
  format: TimeFormat = useFormatPreferences.getState().timeFormat,
) => {
  const mm = String(minute).padStart(2, "0");
  if (format === "24h") return `${String(hour).padStart(2, "0")}:${mm}`;
  const period = hour < 12 ? "AM" : "PM";
  return `${hour % 12 === 0 ? 12 : hour % 12}:${mm} ${period}`;
};

/** A date's time of day in the chosen format. */
export const formatTimeOfDay = (date: Date) =>
  formatClock(date.getHours(), date.getMinutes());

/** A temperature given in Celsius, in the chosen unit. */
export const formatTemperature = (
  celsius: number,
  unit: TemperatureUnit = useFormatPreferences.getState().temperatureUnit,
) =>
  unit === "fahrenheit"
    ? `${((celsius * 9) / 5 + 32).toFixed(1)} °F`
    : `${celsius.toFixed(1)} °C`;

/**
 * Fills in what the person hasn't chosen from their Windows region: the clock
 * and measurement system they set there, and Fahrenheit where it is used.
 * Nothing is saved, so a later change of region still applies.
 */
export const initializeFormatPreferences = async () => {
  let windows: RegionalDefaults;
  try {
    windows = await invoke<RegionalDefaults>("get-regional-defaults");
  } catch {
    return;
  }
  const region = windows.region ?? "";
  const patch: Partial<FormatPreferencesState> = {};
  if (!stored(KEYS.timeFormat, ["24h", "12h"]) && windows.clock24 != null)
    patch.timeFormat = windows.clock24 ? "24h" : "12h";
  if (!stored(KEYS.measurementSystem, ["metric", "imperial"])) {
    const metric =
      windows.metric ?? (region ? !IMPERIAL_REGIONS.has(region) : null);
    if (metric != null)
      patch.measurementSystem = metric ? "metric" : "imperial";
  }
  if (!stored(KEYS.temperatureUnit, ["celsius", "fahrenheit"]) && region)
    patch.temperatureUnit = FAHRENHEIT_REGIONS.has(region)
      ? "fahrenheit"
      : "celsius";
  useFormatPreferences.setState(patch);
};
