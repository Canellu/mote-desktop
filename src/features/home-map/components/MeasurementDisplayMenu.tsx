import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  CornerAngleDisplay,
  MeasurementDisplaySettings,
  WallLengthDisplay,
} from "../measurementDisplay";

export function MeasurementDisplayMenu({
  settings,
  onChange,
  showLights = true,
  onShowLightsChange,
}: {
  settings: MeasurementDisplaySettings;
  showLights?: boolean;
  onShowLightsChange?: (show: boolean) => void;
  onChange: (settings: MeasurementDisplaySettings) => void;
}) {
  const active =
    settings.wallLengths === "all" || settings.cornerAngles !== "off";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size="icon-sm"
            variant={active ? "secondary" : "ghost"}
            aria-label="Map preferences"
            title="Map preferences"
          />
        }
      >
        <Settings />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {onShowLightsChange && (
          <>
            <DropdownMenuCheckboxItem
              checked={showLights}
              onCheckedChange={onShowLightsChange}
            >
              Show fixtures
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Wall lengths</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={settings.wallLengths}
            onValueChange={(value) =>
              onChange({
                ...settings,
                wallLengths: value as WallLengthDisplay,
              })
            }
          >
            <DropdownMenuRadioItem value="off">Hidden</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="selected">
              Selected wall only
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="all">All walls</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Corner angles</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={settings.cornerAngles}
            onValueChange={(value) =>
              onChange({
                ...settings,
                cornerAngles: value as CornerAngleDisplay,
              })
            }
          >
            <DropdownMenuRadioItem value="off">Hidden</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="inner">
              Inner angles
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="outer">
              Outer angles
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="both">
              Inner and outer
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <p className="px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          Hold Alt to temporarily show every length and angle.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
