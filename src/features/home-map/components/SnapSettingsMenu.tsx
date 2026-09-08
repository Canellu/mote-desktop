import { Magnet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { convertLength } from "../measurements";
import {
  ANGLE_SNAPS,
  incrementsFor,
  nearestIncrement,
  type AngleSnap,
  type SnapIncrement,
  type SnapSettings,
} from "../snapping";

function incrementLabel(
  increment: SnapIncrement,
  units: "metric" | "imperial",
) {
  if (units === "metric")
    return increment >= 1
      ? `${increment} m`
      : `${Math.round(increment * 100)} cm`;
  const inches = Math.round(convertLength(increment, "m", "in"));
  return inches >= 12 ? `${Math.round(inches / 12)} ft` : `${inches} in`;
}

export function SnapSettingsMenu({
  settings,
  units,
  onChange,
}: {
  settings: SnapSettings;
  units: "metric" | "imperial";
  onChange: (settings: SnapSettings) => void;
}) {
  // A metric increment has no round label on a foot map; show the nearest.
  const increment = nearestIncrement(settings.incrementMeters, units);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size="sm"
            variant={settings.enabled ? "secondary" : "ghost"}
            aria-label={`Snapping settings, currently ${
              settings.enabled
                ? `on at ${incrementLabel(increment, units)}`
                : "off"
            }`}
          />
        }
      >
        <Magnet />
        {settings.enabled
          ? incrementLabel(settings.incrementMeters, units)
          : "Snap off"}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Drawing aids</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuCheckboxItem
          checked={settings.enabled}
          onCheckedChange={(checked) =>
            onChange({ ...settings, enabled: checked })
          }
        >
          Snap while dragging
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={settings.snapToCorners}
          disabled={!settings.enabled}
          onCheckedChange={(checked) =>
            onChange({ ...settings, snapToCorners: checked })
          }
        >
          Align to existing corners
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={settings.showGrid}
          onCheckedChange={(checked) =>
            onChange({ ...settings, showGrid: checked })
          }
        >
          Show grid
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={String(settings.angleDegrees)}
          onValueChange={(value) =>
            onChange({
              ...settings,
              angleDegrees: Number(value) as AngleSnap,
            })
          }
        >
          <DropdownMenuLabel>Wall angles</DropdownMenuLabel>
          {ANGLE_SNAPS.map((angle) => (
            <DropdownMenuRadioItem
              key={angle}
              value={String(angle)}
              disabled={!settings.enabled}
            >
              {angle === 0 ? "Any angle" : `${angle}° steps`}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={String(increment)}
          onValueChange={(value) =>
            onChange({
              ...settings,
              incrementMeters: Number(value) as SnapIncrement,
            })
          }
        >
          <DropdownMenuLabel>Snap increment</DropdownMenuLabel>
          {incrementsFor(units).map((increment) => (
            <DropdownMenuRadioItem
              key={increment}
              value={String(increment)}
              disabled={!settings.enabled}
            >
              {incrementLabel(increment, units)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
