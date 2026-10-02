import { SensorBatteryGauge } from "@/components/SensorReadingPill";
import {
  buttonEventLabel,
  buttonLabel,
  formatReadingTime,
  readingLabel,
  readingValue,
} from "@/components/sensor-readings";
import { cn } from "@/lib/utils";
import type { HueAccessoryService } from "@/types/hue";

/** Readings in the order a person looks for them; battery closes the list. */
const ORDER = [
  "motion",
  "camera_motion",
  "contact",
  "temperature",
  "light_level",
  "tamper",
  "button",
  "relative_rotary",
  "device_power",
];

/**
 * What a switch or sensor reports, one row per reading: its name and when it
 * last changed on the left, its value on the right. Zigbee connectivity is
 * left out; the panel's header already says when a device is unreachable.
 */
export const DeviceStatusList = ({
  services,
}: {
  services: HueAccessoryService[];
}) => {
  const rows = services
    .filter((service) => service.resourceType !== "zigbee_connectivity")
    .sort(
      (a, b) =>
        rank(a.resourceType) - rank(b.resourceType) ||
        (a.controlId ?? 0) - (b.controlId ?? 0),
    );
  if (rows.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        This device reports no readings.
      </p>
    );

  return (
    <dl className="divide-y divide-border/60">
      {rows.map((service) => (
        <StatusRow key={service.id} service={service} />
      ))}
    </dl>
  );
};

const rank = (resourceType: string) => {
  const index = ORDER.indexOf(resourceType);
  return index === -1 ? ORDER.length : index;
};

const StatusRow = ({ service }: { service: HueAccessoryService }) => {
  const { resourceType, value, updated, enabled } = service;
  const when = formatReadingTime(updated);
  const off = enabled === false;

  let label = readingLabel(resourceType);
  let shown: React.ReactNode = readingValue(service) ?? "—";
  let detail = when ? `Updated ${when}` : null;

  if (resourceType === "motion" || resourceType === "camera_motion") {
    const active = value?.toLowerCase().includes("detected") ?? false;
    label = "Motion";
    shown = active ? "Detected" : "None";
    detail = when ? `Last detected ${when}` : null;
  } else if (resourceType === "button") {
    label = buttonLabel(service);
    shown = value ? buttonEventLabel(value) : "Not pressed yet";
    detail = when;
  } else if (resourceType === "device_power") {
    shown = <SensorBatteryGauge service={service} />;
    detail = null;
  }

  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <dt className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {(detail || off) && (
          <span className="block truncate text-xs text-muted-foreground">
            {off ? "Turned off on the bridge" : detail}
          </span>
        )}
      </dt>
      <dd
        className={cn(
          "shrink-0 text-sm tabular-nums",
          off && "text-muted-foreground",
        )}
      >
        {shown}
      </dd>
    </div>
  );
};
