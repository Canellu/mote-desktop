import { PacedSlider } from "@/components/PacedSlider";
import { SyncIndicator } from "@/components/SyncIndicator";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { roomZoneTileColor } from "@/features/space-screen/utils/color-state";
import {
  activeTileTheme,
  LIT_TILE_FLAT_EDGE,
  TILE_BRIGHTNESS_SLIDER_CLASS,
  TILE_INTERACTION_TRANSITION_CLASS,
  TILE_POWER_SWITCH_CLASS,
} from "@/lib/tile-theme";
import { UI_EASE_MS } from "@/lib/transitions";
import { cn } from "@/lib/utils";
import type { HueLight, HueRoomZone } from "@/types/hue";
import { useEntertainmentStore } from "@/stores/EntertainmentStore";
import { getRoomZoneIcon } from "./room-zone-icons";

type ControlCommitPhase = "live" | "final";

interface SpaceTileProps {
  roomZone: HueRoomZone;
  members: HueLight[];
  /** When true the tile is a passive drag target: controls/nav are disabled. */
  editing?: boolean;
  hueEventRevision: number;
  onOpenSpace: (id: string) => void;
  onRoomZoneToggle: (roomZone: HueRoomZone, nextOn: boolean) => void;
  onRoomZoneBrightness: (
    roomZone: HueRoomZone,
    pct: number,
    phase: ControlCommitPhase,
  ) => void;
}

/**
 * Presentational room/zone tile. Used directly on the Home screen and
 * wrapped by `SortableSpaceTile` while the layout is being edited.
 */
export const SpaceTile: React.FC<SpaceTileProps> = ({
  roomZone,
  members,
  editing = false,
  hueEventRevision,
  onOpenSpace,
  onRoomZoneToggle,
  onRoomZoneBrightness,
}) => {
  const syncedLightIds = useEntertainmentStore((store) => store.syncedLightIds);
  const syncedIds = new Set(syncedLightIds);
  const syncedLightCount = members.filter((light) =>
    syncedIds.has(light.id),
  ).length;
  const fullSync = syncedLightCount > 0 && syncedLightCount === members.length;
  const controllableMembers = members.filter(
    (light) => !syncedIds.has(light.id),
  );
  const displayMembers = fullSync ? members : controllableMembers;
  const onMembers = controllableMembers.filter((light) => light.isOn);
  const anyOn = onMembers.length > 0;
  const pct =
    onMembers.length > 0
      ? onMembers.reduce((sum, light) => sum + (light.brightness ?? 0), 0) /
        onMembers.length
      : 0;
  const Icon = getRoomZoneIcon(roomZone.class);
  const tile = fullSync
    ? { active: false, background: null, glow: null }
    : roomZoneTileColor(displayMembers);
  const controlsDisabled = editing || fullSync;

  return (
    <Card
      size="sm"
      role={editing ? undefined : "button"}
      tabIndex={editing ? -1 : 0}
      aria-disabled={editing || undefined}
      onClick={editing ? undefined : () => onOpenSpace(roomZone.id)}
      onKeyDown={
        editing
          ? undefined
          : (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenSpace(roomZone.id);
              }
            }
      }
      className={cn(
        "justify-center border border-tile-border bg-tile-off rounded-(--tile-radius) [--card-spacing:var(--tile-spacing)]! gap-(--tile-inner-gap)",
        TILE_INTERACTION_TRANSITION_CLASS,
        !editing && "cursor-pointer",
        tile.active && "ring-transparent",
      )}
      style={
        {
          "--tile-ease": `${UI_EASE_MS.tileBackground}ms`,
          ...(tile.active && tile.background
            ? {
                ...activeTileTheme(
                  tile.background,
                  tile.glow ?? tile.background,
                  pct,
                ),
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
            tile.active ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <Icon size={26} strokeWidth={2.5} className="size-(--tile-icon)" />
          {syncedLightCount > 0 && (
            <SyncIndicator
              syncedCount={syncedLightCount}
              totalCount={members.length}
              className="absolute -top-1 -right-1"
            />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-medium">{roomZone.name}</p>
        </div>
        {fullSync ? (
          <span aria-hidden="true" />
        ) : (
          <div className="flex items-center">
            <div onClick={(e) => !editing && e.stopPropagation()}>
              <Switch
                size="xl"
                className={TILE_POWER_SWITCH_CLASS}
                checked={anyOn}
                disabled={controlsDisabled}
                aria-label={`Toggle ${roomZone.name}`}
                onCheckedChange={(checked) =>
                  onRoomZoneToggle(roomZone, checked)
                }
              />
            </div>
          </div>
        )}
      </div>

      {fullSync ? (
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
            value={anyOn ? Math.max(1, pct) : 1}
            min={1}
            disabled={controlsDisabled}
            ariaLabel={`${roomZone.name} brightness`}
            className={cn(
              TILE_BRIGHTNESS_SLIDER_CLASS,
              !anyOn && "tile-brightness-slider-off",
            )}
            size="default"
            isGroup
            animateKey={hueEventRevision}
            onCommit={(value, phase) =>
              onRoomZoneBrightness(roomZone, value, phase)
            }
          />
        </div>
      )}
    </Card>
  );
};
