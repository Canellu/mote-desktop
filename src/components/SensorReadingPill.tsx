import { cn } from "@/lib/utils";
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

const buttonLabel = ({
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

const buttonEventLabel = (value: string | null): string => {
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

const chipClass = (reachable: boolean, extra?: string) =>
  cn(
    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs",
    reachable ? "bg-muted/60" : "bg-destructive/10 text-(--destructive-text)",
    extra,
  );

/** "Today, 22:15" / "Yesterday, 08:04" / "Mar 3, 14:20" — null when unknown. */
const formatReadingTime = (iso: string | null): string | null => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const now = new Date();
  const time = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
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

/** Phone-style battery: a bordered cell filled to `pct` with the number inside.
 * Fill runs green when fresh, amber as it drops, red when low. */
const BatteryGauge = ({ pct }: { pct: number }) => {
  const clamped = Math.max(0, Math.min(100, pct));
  const fillClass =
    clamped <= 20
      ? "bg-red-500"
      : clamped <= 50
        ? "bg-amber-500"
        : "bg-green-500";
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      <span className="relative flex h-4 w-8 items-center rounded-[3px] border border-muted-foreground/40 p-0.5">
        <span className="relative h-full w-full overflow-hidden rounded-[1px]">
          <span
            className={cn("absolute inset-y-0 left-0", fillClass)}
            style={{ width: `${clamped}%` }}
          />
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold tabular-nums text-foreground">
            {Math.round(clamped)}
          </span>
          <span
            className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-black tabular-nums"
            style={{
              clipPath: `inset(0 ${100 - clamped}% 0 0)`,
            }}
          >
            {Math.round(clamped)}
          </span>
        </span>
      </span>
      <span className="h-1.5 w-0.5 rounded-r-[1px] bg-muted-foreground/40" />
    </span>
  );
};

/** Bare battery gauge for a device_power service, for corner placement in a
 * card header (no chip background). Falls back to text for a non-numeric
 * battery_state ("Normal", "Critical"). */
export const SensorBatteryGauge = ({
  service,
}: {
  service: HueAccessoryService;
}) => {
  const pct = service.value ? Number.parseInt(service.value, 10) : Number.NaN;
  if (Number.isNaN(pct)) {
    return service.value ? (
      <span className="text-xs text-muted-foreground">{service.value}</span>
    ) : null;
  }
  return (
    <span
      title={
        service.reachable ? `Battery ${Math.round(pct)}%` : "Battery — offline"
      }
    >
      <BatteryGauge pct={pct} />
    </span>
  );
};

/** Compact chip for a single accessory/sensor reading. */
export const SensorReadingPill = ({
  service,
}: {
  service: HueAccessoryService;
}) => {
  const { resourceType, value, reachable, updated } = service;

  // Battery — a visual gauge instead of the word "Battery" twice over. Falls
  // back to text for a non-numeric battery_state ("Normal", "Critical").
  if (resourceType === "device_power") {
    const pct = value ? Number.parseInt(value, 10) : Number.NaN;
    if (!Number.isNaN(pct)) {
      return (
        <span
          className={chipClass(reachable)}
          title={
            reachable ? `Battery ${Math.round(pct)}%` : "Battery — offline"
          }
        >
          <BatteryGauge pct={pct} />
        </span>
      );
    }
  }

  // Motion — always show the timestamp; only the leading label changes with
  // state ("Motion detected" while active, "Last detected" once it clears).
  if (resourceType === "motion" || resourceType === "camera_motion") {
    const active = value?.toLowerCase().includes("detected") ?? false;
    const when = formatReadingTime(updated);
    const label = active ? "Motion detected" : when ? "Last detected" : "No motion";
    return (
      <span
        className={chipClass(reachable, active ? "bg-primary/10" : undefined)}
      >
        <span
          className={cn(
            "text-muted-foreground",
            active && "font-medium text-primary",
          )}
        >
          {label}
        </span>
        {when && (
          <span className="font-medium">
            <span className="font-normal text-muted-foreground">· </span>
            {when}
          </span>
        )}
      </span>
    );
  }

  if (resourceType === "button") {
    const when = formatReadingTime(updated);
    return (
      <span
        className={chipClass(
          reachable,
          "grid w-full grid-cols-[6.5rem_minmax(0,1fr)]",
        )}
        title={[
          `Last event: ${value ?? "None"}`,
          when ? `Reported ${when}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      >
        <span className="text-muted-foreground">{buttonLabel(service)}</span>
        <span className="font-medium">{buttonEventLabel(value)}</span>
      </span>
    );
  }

  const label = SENSOR_READING_LABELS[resourceType] ?? humanize(resourceType);

  // Everything else keeps the label + value form (not redundant for these).
  return (
    <span className={chipClass(reachable)}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </span>
  );
};
