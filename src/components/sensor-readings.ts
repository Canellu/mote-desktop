import {
  formatTemperature,
  formatTimeOfDay,
} from "@/stores/FormatPreferencesStore";
import type { HueAccessoryService } from "@/types/hue";

/** Friendlier labels for the v2 service resource types shown on sensor pills. */
const SENSOR_READING_LABELS: Record<string, string> = {
  temperature: "Temperature",
  light_level: "Light level",
  contact: "Contact",
  tamper: "Tamper",
  button: "Button",
  relative_rotary: "Dial",
  zigbee_connectivity: "Zigbee",
};

const humanize = (value: string) =>
  value
    .split("_")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");

export const buttonLabel = ({
  controlId,
  productName,
}: HueAccessoryService): string => {
  if (controlId === null) return "Button";

  if (productName?.toLowerCase().includes("dimmer switch")) {
    const dimmerLabels: Record<number, string> = {
      1: "Top button",
      2: "Brighten button",
      3: "Dim button",
      4: "Bottom button",
    };
    return dimmerLabels[controlId] ?? `Button ${controlId}`;
  }

  return `Button ${controlId}`;
};

export const buttonEventLabel = (value: string | null): string => {
  switch (value?.toLowerCase().replace(/_/g, " ")) {
    case "initial press":
      return "Pressed";
    case "repeat":
      return "Holding";
    case "short release":
      return "Tapped";
    case "long release":
      return "Hold released";
    case "double short release":
      return "Double-tapped";
    case "long press":
      return "Long-pressed";
    default:
      return value ?? "No event";
  }
};

/**
 * A reading's value as shown: temperatures in the chosen unit (the bridge
 * reports Celsius), everything else as reported.
 */
export const readingValue = ({
  resourceType,
  value,
}: Pick<HueAccessoryService, "resourceType" | "value">): string | null => {
  if (resourceType !== "temperature" || value == null) return value;
  const celsius = Number.parseFloat(value);
  return Number.isNaN(celsius) ? value : formatTemperature(celsius);
};

/** "Today, 22:15" / "Yesterday, 08:04" / "Mar 3, 14:20" — null when unknown. */
export const formatReadingTime = (iso: string | null): string | null => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const now = new Date();
  const time = formatTimeOfDay(date);
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Yesterday, ${time}`;
  return `${date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  })}, ${time}`;
};

/** The friendly name of a reading, such as "Light level" for light_level. */
export const readingLabel = (resourceType: string): string =>
  resourceType === "device_power"
    ? "Battery"
    : (SENSOR_READING_LABELS[resourceType] ?? humanize(resourceType));
