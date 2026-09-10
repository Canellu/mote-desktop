import type { MapPoint } from "./types";

export type WallLengthDisplay = "off" | "selected" | "all";
export type CornerAngleDisplay = "off" | "inner" | "outer" | "both";

export interface MeasurementDisplaySettings {
  wallLengths: WallLengthDisplay;
  cornerAngles: CornerAngleDisplay;
}

export const DEFAULT_MEASUREMENT_DISPLAY: MeasurementDisplaySettings = {
  wallLengths: "selected",
  cornerAngles: "off",
};

export function getCornerAngles(
  previous: MapPoint,
  corner: MapPoint,
  next: MapPoint,
  winding: number,
): { inner: number; outer: number } | null {
  const first = { x: previous.x - corner.x, y: previous.y - corner.y };
  const second = { x: next.x - corner.x, y: next.y - corner.y };
  const firstLength = Math.hypot(first.x, first.y);
  const secondLength = Math.hypot(second.x, second.y);
  if (firstLength <= 0 || secondLength <= 0) return null;
  const cosine = Math.max(
    -1,
    Math.min(
      1,
      (first.x * second.x + first.y * second.y) / (firstLength * secondLength),
    ),
  );
  const smaller = (Math.acos(cosine) * 180) / Math.PI;
  const cross = first.x * second.y - first.y * second.x;
  const inner = cross * winding > 0 ? 360 - smaller : smaller;
  return { inner, outer: 360 - inner };
}

const storageKey = "mote-map-measurement-display";

export function parseMeasurementDisplay(
  value: unknown,
): MeasurementDisplaySettings {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { ...DEFAULT_MEASUREMENT_DISPLAY };
  const record = value as Record<string, unknown>;
  return {
    wallLengths:
      record.wallLengths === "all"
        ? "all"
        : record.wallLengths === "off"
          ? "off"
          : "selected",
    cornerAngles:
      record.cornerAngles === "inner" ||
      record.cornerAngles === "outer" ||
      record.cornerAngles === "both"
        ? record.cornerAngles
        : "off",
  };
}

export function readMeasurementDisplay(): MeasurementDisplaySettings {
  try {
    return parseMeasurementDisplay(
      JSON.parse(localStorage.getItem(storageKey) ?? "null"),
    );
  } catch {
    return { ...DEFAULT_MEASUREMENT_DISPLAY };
  }
}

export function writeMeasurementDisplay(
  settings: MeasurementDisplaySettings,
): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(settings));
  } catch {
    // The current editor session still keeps the preference in React state.
  }
}
