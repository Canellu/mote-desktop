import { Card } from "@/components/ui/card";
import { SyncIndicator } from "@/components/SyncIndicator";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { PacedSlider } from "@/components/PacedSlider";
import {
  activeTileTheme,
  LIT_TILE_FLAT_EDGE,
  TILE_BRIGHTNESS_SLIDER_CLASS,
  TILE_INTERACTION_TRANSITION_CLASS,
  TILE_POWER_SWITCH_CLASS,
} from "@/lib/tile-theme";
import { overlaySelectionClassName } from "@/lib/selection-styles";
import { UI_EASE_MS } from "@/lib/transitions";
import { lightColorHex } from "@/features/space-screen/utils/color-state";
import { getLightIcon } from "@/features/space-screen/utils/light-icons";
import type { HueLight } from "@/types/hue";
import { useEntertainmentStore } from "@/stores/EntertainmentStore";

type ControlCommitPhase = "live" | "final";

interface LightCardProps {
  light: HueLight;
  selected: boolean;
  hueEventRevision: number;
  /** In edit mode the live controls are muted so the card reads as reorderable. */
  editing?: boolean;
  onSelect: (id: string) => void;
  onToggle: (light: HueLight, nextOn: boolean) => void;
  onBrightness: (
    light: HueLight,
    pct: number,
    phase: ControlCommitPhase,
  ) => void;
}

export const LightCard: React.FC<LightCardProps> = ({
  light,
  selected,
  hueEventRevision,
  editing = false,
  onSelect,
  onToggle,
  onBrightness,
}) => {
  const syncLocked = useEntertainmentStore((store) =>
    store.syncedLightIds.includes(light.id),
  );
  const pct = Math.round(light.brightness ?? 0);
  // When the light is on, tint the whole card with its live color (mirrors the
  // Home room/zone tiles); off or color-less lights stay on the muted surface.
  const color = light.isOn && !syncLocked ? lightColorHex(light) : null;
  const active = color != null;
  const unreachable = !light.reachable;
  const DeviceIcon = getLightIcon(light.typeName);

  return (
    <Card
      data-edit-id={light.id}
      size="sm"
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={() => onSelect(light.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(light.id);
        }
      }}
      className={cn(
        "cursor-pointer justify-center border border-tile-border bg-tile-off outline-none rounded-(--tile-radius) [--card-spacing:var(--tile-spacing)]! gap-(--tile-inner-gap) focus-visible:ring-2 focus-visible:ring-ring",
        TILE_INTERACTION_TRANSITION_CLASS,
        active && "ring-transparent",
        selected && overlaySelectionClassName,
        unreachable && "opacity-50",
      )}
      style={
        {
          "--tile-ease": `${UI_EASE_MS.tileBackground}ms`,
          // A single light is always one solid color, so it doubles as the
          // contrast seed. The lit card also dims with the bulb's brightness.
          ...(active && color
            ? {
                ...activeTileTheme(color, color, pct),
                ...LIT_TILE_FLAT_EDGE,
              }
            : null),
        } as React.CSSProperties
      }
    >
      <div className="flex items-center gap-4 px-(--card-spacing)">
        <span
          className={cn(
            "relative flex size-(--tile-icon-box) shrink-0 items-center justify-center",
            active ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <DeviceIcon
            size={26}
            strokeWidth={2.5}
            className="size-(--tile-icon)"
          />
          {syncLocked && (
            <SyncIndicator
              syncedCount={1}
              totalCount={1}
              className="absolute -top-1 -right-1"
            />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-medium" title={light.name}>
            {light.name}
          </p>
        </div>
        {syncLocked ? (
          <span aria-hidden="true" />
        ) : (
          <div onClick={(e) => !editing && e.stopPropagation()}>
            <Switch
              size="xl"
              className={TILE_POWER_SWITCH_CLASS}
              checked={light.isOn}
              disabled={unreachable || editing}
              aria-label={`Toggle ${light.name}`}
              onCheckedChange={(checked) => onToggle(light, checked)}
            />
          </div>
        )}
      </div>

      {syncLocked ? (
        <div className="px-(--card-spacing)">
          <div className="flex h-4 items-center gap-2" aria-hidden="true">
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-primary/15">
              <span className="block h-full w-full animate-pulse bg-primary/40" />
            </span>
          </div>
        </div>
      ) : (
        <div
          className="px-(--card-spacing)"
          onClick={(e) => !editing && e.stopPropagation()}
        >
          <PacedSlider
            value={light.isOn ? Math.max(1, pct) : 1}
            min={1}
            disabled={unreachable || editing}
            ariaLabel={`${light.name} brightness`}
            className={cn(
              TILE_BRIGHTNESS_SLIDER_CLASS,
              !light.isOn && "tile-brightness-slider-off",
            )}
            size="default"
            isGroup={false}
            animateKey={hueEventRevision}
            onCommit={(value, phase) => onBrightness(light, value, phase)}
          />
        </div>
      )}
    </Card>
  );
};
