import { ChevronsUpDown } from "lucide-react";
import { useEffect, useState } from "react";

import { PacedSlider } from "@/components/PacedSlider";
import { SyncIndicator } from "@/components/SyncIndicator";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { roomZoneTileColor } from "@/features/space-screen/utils/color-state";
import {
  HUE_DYNAMIC_SPEED_MAX_STEP,
  HUE_DYNAMIC_SPEED_MIN_STEP,
  hueDynamicSpeedValueToStep,
} from "@/lib/hue-speed";
import {
  activeTileTheme,
  LIT_TILE_FLAT_EDGE,
  TILE_BRIGHTNESS_SLIDER_CLASS,
  TILE_INTERACTION_TRANSITION_CLASS,
  TILE_POWER_SWITCH_CLASS,
} from "@/lib/tile-theme";
import { UI_EASE_MS } from "@/lib/transitions";
import { cn } from "@/lib/utils";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import type { HueLight, HueRoomZone, HueScene } from "@/types/hue";
import { SectionGrip } from "./SectionDragHandle";

type ControlCommitPhase = "live" | "final";

interface GroupControlsProps {
  roomZone: HueRoomZone;
  lights: HueLight[];
  syncedLightIds: string[];
  /** The dynamic scene currently animating in this space, if any. */
  playingScene: HueScene | null;
  hueEventRevision: number;
  /** In edit mode the controls are muted and tapping the tile does nothing. */
  editing?: boolean;
  onToggle: (roomZone: HueRoomZone, nextOn: boolean) => void;
  onBrightness: (
    roomZone: HueRoomZone,
    pct: number,
    phase: ControlCommitPhase,
  ) => void;
  /** Opens the multi-light group pane for adjusting every light at once. */
  onOpen: (roomZone: HueRoomZone) => void;
}

/**
 * The room/zone group controls tile: a brightness slider and power switch that
 * expand (shadcn collapsible) to reveal the live dynamic-speed control for the
 * scene playing in this space. The expanded area stays mounted regardless of
 * whether a scene is playing — when none is, the speed control is disabled
 * rather than removed, so toggling open never shifts the layout. Open state is
 * local and resets only when the component remounts (entering/leaving a space).
 */
export const GroupControls: React.FC<GroupControlsProps> = ({
  roomZone,
  lights,
  syncedLightIds,
  playingScene,
  hueEventRevision,
  editing = false,
  onToggle,
  onBrightness,
  onOpen,
}) => {
  const setDynamicSpeedLive = useHueResourcesStore(
    (state) => state.setDynamicSpeedLive,
  );
  const [open, setOpen] = useState(false);
  const syncedIds = new Set(syncedLightIds);
  const syncedLightCount = lights.filter((light) =>
    syncedIds.has(light.id),
  ).length;
  const fullSync = syncedLightCount > 0 && syncedLightCount === lights.length;
  const partialSync = syncedLightCount > 0 && !fullSync;
  const controllableLights = lights.filter((light) => !syncedIds.has(light.id));
  const onControllableLights = controllableLights.filter((light) => light.isOn);
  const anyOn = onControllableLights.length > 0;
  const brightnessPct =
    onControllableLights.length > 0
      ? onControllableLights.reduce(
          (sum, light) => sum + (light.brightness ?? 0),
          0,
        ) / onControllableLights.length
      : 0;
  const tile = fullSync
    ? { active: false, background: null, glow: null }
    : roomZoneTileColor(controllableLights);
  const controlsDisabled = editing || fullSync;

  return (
    <Collapsible open={open && !editing} onOpenChange={setOpen}>
      <div className="flex flex-col gap-(--section-header-gap)">
        <div className="flex items-center justify-between">
          <div className="flex h-7 items-center">
            <SectionGrip />
            <p className="text-sm font-medium text-muted-foreground">
              Group controls
            </p>
          </div>
          {!editing && (
            <CollapsibleTrigger
              aria-label={open ? "Hide scene speed" : "Show scene speed"}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <ChevronsUpDown size={16} />
            </CollapsibleTrigger>
          )}
        </div>
        <Card
          // gap-0: the always-visible block (below) owns its own gap so the
          // collapsible panel sits flush and isn't a gap-spaced sibling — a
          // sibling gap is static layout that snaps when the panel hides.
          role="button"
          tabIndex={controlsDisabled ? -1 : 0}
          aria-label={`Adjust ${roomZone.name} lights`}
          aria-disabled={fullSync || undefined}
          onClick={() => {
            if (!controlsDisabled) onOpen(roomZone);
          }}
          onKeyDown={(e) => {
            if (controlsDisabled) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpen(roomZone);
            }
          }}
          className={cn(
            "gap-0 border border-tile-border bg-tile-off outline-none focus-visible:ring-2 focus-visible:ring-ring",
            TILE_INTERACTION_TRANSITION_CLASS,
            tile.active && "ring-transparent",
            controlsDisabled ? "cursor-default" : "cursor-pointer",
          )}
          style={
            {
              "--tile-ease": `${UI_EASE_MS.tileBackground}ms`,
              ...(tile.active && tile.background
                ? {
                    ...activeTileTheme(
                      tile.background,
                      tile.glow ?? tile.background,
                      brightnessPct,
                    ),
                    ...LIT_TILE_FLAT_EDGE,
                  }
                : null),
            } as React.CSSProperties
          }
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4 px-6">
              <span
                className={cn(
                  "text-sm font-medium",
                  tile.active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                Brightness
              </span>
              <div className="flex items-center gap-3">
                {syncedLightCount > 0 && (
                  <SyncIndicator
                    syncedCount={syncedLightCount}
                    totalCount={lights.length}
                    showCount={partialSync}
                  />
                )}
                {!fullSync && (
                  <div onClick={(e) => !editing && e.stopPropagation()}>
                    <Switch
                      size="xl"
                      className={TILE_POWER_SWITCH_CLASS}
                      checked={anyOn}
                      disabled={controlsDisabled}
                      aria-label={`Toggle ${roomZone.name}`}
                      onCheckedChange={(checked) => onToggle(roomZone, checked)}
                    />
                  </div>
                )}
              </div>
            </div>
            <div
              className="px-6"
              onClick={(e) => !editing && e.stopPropagation()}
            >
              {fullSync ? (
                <span className="block h-1 overflow-hidden rounded-full bg-primary/15">
                  <span className="block h-full w-full animate-pulse bg-primary/40" />
                </span>
              ) : (
                <PacedSlider
                  value={anyOn ? Math.max(1, brightnessPct) : 1}
                  min={1}
                  disabled={controlsDisabled}
                  ariaLabel={`${roomZone.name} brightness`}
                  className={cn(
                    TILE_BRIGHTNESS_SLIDER_CLASS,
                    !anyOn && "tile-brightness-slider-off",
                  )}
                  isGroup
                  animateKey={hueEventRevision}
                  onCommit={(pct, phase) => onBrightness(roomZone, pct, phase)}
                />
              )}
            </div>
          </div>
          {/*
            The panel owns all its spacing internally via `pt-6` (see
            DynamicSpeedControl), which animates as part of the height. There is
            no sibling gap/margin around it, so the whole card grows and shrinks
            as one continuous height animation with nothing to snap at the ends.
          */}
          <CollapsibleContent onClick={(e) => e.stopPropagation()}>
            <DynamicSpeedControl
              scene={playingScene}
              active={tile.active}
              syncLocked={syncedLightCount > 0}
              onSpeedLive={setDynamicSpeedLive}
            />
          </CollapsibleContent>
        </Card>
      </div>
    </Collapsible>
  );
};

/**
 * Live speed control for the dynamic scene currently playing in this space.
 * Seeded from the scene's saved speed; changes re-pace the running playback and
 * are written back to the scene (the bridge has no speed separate from `speed`).
 * When no scene is playing the control is disabled (not removed) so opening the
 * group controls never shifts the layout; it keeps showing the last value.
 */
const DynamicSpeedControl: React.FC<{
  scene: HueScene | null;
  active: boolean;
  syncLocked: boolean;
  onSpeedLive: (scene: HueScene, step: number) => void;
}> = ({ scene, active, syncLocked, onSpeedLive }) => {
  const disabled = scene == null || syncLocked;
  const [step, setStep] = useState(() =>
    hueDynamicSpeedValueToStep(scene?.speed),
  );

  useEffect(() => {
    if (scene) setStep(hueDynamicSpeedValueToStep(scene.speed));
  }, [scene, scene?.id, scene?.speed]);

  return (
    <div
      className={cn("flex flex-col gap-2 px-6 pt-6", disabled && "opacity-50")}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "text-sm font-medium",
            active ? "text-foreground" : "text-muted-foreground",
          )}
        >
          Scene speed
        </span>
        <span
          className={cn(
            "text-xs tabular-nums",
            active ? "text-foreground/80" : "text-muted-foreground",
          )}
        >
          {step}
        </span>
      </div>
      <PacedSlider
        value={step}
        min={HUE_DYNAMIC_SPEED_MIN_STEP}
        max={HUE_DYNAMIC_SPEED_MAX_STEP}
        step={1}
        showTicks
        tickLabels="ends"
        disabled={disabled}
        ariaLabel={`${scene?.name ?? "Scene"} live scene speed`}
        className={cn(
          TILE_BRIGHTNESS_SLIDER_CLASS,
          !active && "tile-brightness-slider-off",
        )}
        isGroup
        onInput={(value) => setStep(Math.round(value))}
        onCommit={(value) => {
          const next = Math.round(value);
          setStep(next);
          if (scene) onSpeedLive(scene, next);
        }}
      />
    </div>
  );
};
