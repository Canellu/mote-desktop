import { PacedSlider } from "@/components/PacedSlider";
import { Switch } from "@/components/ui/switch";
import { getRoomZoneIcon } from "@/features/home-screen/components/room-zone-icons";
import { roomZoneTileColor } from "@/features/space-screen/utils/color-state";
import { activeTileTheme } from "@/lib/tile-theme";
import { cn } from "@/lib/utils";
import type { LightColorChange } from "@/stores/HueResourcesStore";
import type { HueLight, HueRoomZone } from "@/types/hue";
import { GroupLightWheels } from "./GroupLightWheels";
import { SidePane } from "./SidePane";

type ControlCommitPhase = "live" | "final";

interface GroupPaneProps {
  roomZone: HueRoomZone;
  /** The room/zone's member lights — one thumb per light on the wheels. */
  lights: HueLight[];
  hueEventRevision: number;
  onClose: () => void;
  onToggle: (roomZone: HueRoomZone, nextOn: boolean) => void;
  onBrightness: (
    roomZone: HueRoomZone,
    pct: number,
    phase: ControlCommitPhase,
  ) => void;
  onLightColor: (light: HueLight, change: LightColorChange) => void;
}

/**
 * Group inspector: the room/zone counterpart to {@link LightPane}. The power
 * switch and brightness slider drive the whole space at once, while the color
 * and white wheels carry one thumb per member light so each can be tuned
 * individually without leaving the group view.
 */
export const GroupPane: React.FC<GroupPaneProps> = ({
  roomZone,
  lights,
  hueEventRevision,
  onClose,
  onToggle,
  onBrightness,
  onLightColor,
}) => {
  const onLights = lights.filter((light) => light.isOn);
  const anyOn = onLights.length > 0;
  const brightnessPct =
    onLights.length > 0
      ? Math.round(
          onLights.reduce((sum, light) => sum + (light.brightness ?? 0), 0) /
            onLights.length,
        )
      : 0;
  const Icon = getRoomZoneIcon(roomZone.class);
  const tile = roomZoneTileColor(lights);
  const previewStyle =
    tile.active && tile.background
      ? activeTileTheme(
          tile.background,
          tile.glow ?? tile.background,
          brightnessPct,
        )
      : undefined;

  const view = (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 pt-1">
        <span
          className={cn(
            "flex size-16 items-center justify-center rounded-2xl text-foreground",
            tile.active ? "shadow-sm" : "bg-muted",
          )}
          style={previewStyle}
        >
          <Icon size={32} strokeWidth={2.25} />
        </span>
        <h2 className="max-w-full truncate text-center font-heading text-lg font-medium text-foreground">
          {roomZone.name}
        </h2>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {anyOn ? "On" : "Off"}
        </span>
        <Switch
          checked={anyOn}
          disabled={!roomZone.groupedLightId}
          aria-label={`Toggle ${roomZone.name}`}
          onCheckedChange={(checked) => onToggle(roomZone, checked)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">
            Brightness
          </p>
          <span className="text-xs text-muted-foreground tabular-nums">
            {brightnessPct}%
          </span>
        </div>
        <PacedSlider
          value={anyOn ? Math.max(1, brightnessPct) : 1}
          min={1}
          disabled={!roomZone.groupedLightId}
          ariaLabel={`${roomZone.name} brightness`}
          isGroup
          animateKey={hueEventRevision}
          onCommit={(value, phase) => onBrightness(roomZone, value, phase)}
        />
      </div>

      <GroupLightWheels
        lights={lights}
        onColorPickMany={(picks) =>
          picks.forEach(({ light, xy, vividHex }) =>
            onLightColor(light, { xy, vividHex }),
          )
        }
        onTemperaturePickMany={(picks) =>
          picks.forEach(({ light, value }) =>
            onLightColor(light, { ct: value }),
          )
        }
      />
    </div>
  );

  return (
    <SidePane
      eyebrow={roomZone.resourceType === "zone" ? "Zone" : "Room"}
      resetKey={roomZone.id}
      onClose={onClose}
      view={view}
    />
  );
};
