import { PacedSlider } from "@/components/PacedSlider";
import { SyncIndicator } from "@/components/SyncIndicator";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getRoomZoneIcon } from "@/features/home-screen/components/room-zone-icons";
import {
  lightColorHex,
  roomZoneTileColor,
  sceneBubbleCss,
} from "@/features/space-screen/utils/color-state";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import { useEntertainmentStore } from "@/stores/EntertainmentStore";
import {
  activeTileTheme,
  TILE_BRIGHTNESS_SLIDER_CLASS,
  TILE_INTERACTION_TRANSITION_CLASS,
  TILE_POWER_SWITCH_CLASS,
} from "@/lib/tile-theme";
import { UI_EASE_MS } from "@/lib/transitions";
import { isSceneActive } from "@/features/space-screen/utils/scene-status";
import { SceneTile } from "@/features/space-screen/components/SceneTile";
import { cn } from "@/lib/utils";
import type { HueLight, HueRoomZone, HueScene } from "@/types/hue";
import { invoke } from "@tauri-apps/api/core";
import { Lightbulb } from "lucide-react";
import type { CSSProperties } from "react";
import { SceneCardRail, SceneRailItem, WidgetSceneCard } from "./SceneCardRail";
import {
  toggleAction,
  type SingleWidgetControl,
  type ToggleTarget,
  type TogglesWidgetControl,
  type WidgetControl,
  type WidgetSizeMode,
} from "../types";

/** Hover dwell (ms) before the "double-click to open" hint appears — long
 * enough that it never flashes while the pointer is just passing over a tile. */
const OPEN_HINT_DELAY_MS = 700;

/** A compact, pill-shaped scene button used in the rail when the control is compact. */
const SceneButton = ({
  scene,
  disabled = false,
  onActivate,
}: {
  scene: HueScene;
  disabled?: boolean;
  onActivate: () => void;
}) => {
  const bubble = sceneBubbleCss(scene);
  const active = isSceneActive(scene);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onActivate}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-foreground/40 bg-foreground/15"
          : "border-tile-border bg-tile hover:bg-foreground/10",
        disabled && "opacity-40",
      )}
    >
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-full ring-1 ring-foreground/20"
        style={{ background: bubble ?? "var(--muted-foreground)" }}
      />
      <span className="whitespace-nowrap">{scene.name}</span>
    </button>
  );
};

/**
 * Renders the resolved control once a room/zone or light target is found. The
 * card mirrors the real Home/Space tile: a control header that tints with the
 * light's live color (and dims with its brightness) when on, sitting on the
 * neutral card surface. A control's chosen scenes appear below the header in a
 * horizontal, drag-scrollable rail — as miniature scene cards (full) or pill
 * buttons (compact) — on that neutral surface so they stay legible against any
 * header tint.
 */
export const ControlView = ({
  name,
  icon,
  isOn,
  brightness,
  tileBackground,
  tileTint,
  dimmable,
  showBrightness,
  scenes,
  compact,
  hueEventRevision,
  sizeMode = "default",
  syncedCount = 0,
  totalCount = 0,
  onOpen,
  onToggle,
  onBrightness,
  onActivateScene,
  onToggleScenePlay,
}: {
  name: string;
  icon: React.ReactNode;
  isOn: boolean;
  brightness: number | null;
  tileBackground: string | null;
  tileTint: string | null;
  dimmable: boolean;
  showBrightness: boolean;
  scenes: HueScene[];
  /**
   * The control's compact (slider-hidden) mode. Compact controls render scenes
   * as pill buttons in the rail; full controls render them as scene cards.
   */
  compact: boolean;
  hueEventRevision: number;
  sizeMode?: WidgetSizeMode;
  /** How many of the target's lights are locked by an active light sync. */
  syncedCount?: number;
  totalCount?: number;
  /**
   * Opens the target's Space screen in the main app. Wired for room/zone
   * targets only (a light has no Space), and invoked on a double-click of the
   * header surface — clicks on the toggle/slider are left to those controls.
   */
  onOpen?: () => void;
  onToggle: (next: boolean) => void;
  onBrightness: (pct: number, phase: "live" | "final") => void;
  onActivateScene: (scene: HueScene) => void;
  onToggleScenePlay: (scene: HueScene) => void;
}) => {
  const pct = brightness ?? 0;
  // The header reads as "lit" only when the control is on *and* has a color to
  // paint with; otherwise it stays on the card's neutral surface.
  const lit = isOn && tileBackground != null;
  const fullSync = totalCount > 0 && syncedCount >= totalCount;
  const partialSync = syncedCount > 0 && !fullSync;
  // Any active sync makes scene changes pointless — the stream owns the colors.
  const scenesLocked = syncedCount > 0;

  const rowGapClass =
    sizeMode === "small" ? "gap-2" : sizeMode === "large" ? "gap-3" : "gap-2.5";
  // The icon + name form the "open the space" affordance: the header's double-
  // click target and the anchor for its hint tooltip. The power switch and
  // brightness slider live outside it, so hovering a control never shows the hint.
  const headerLabel = (
    <>
      <span
        className={cn(
          "flex shrink-0 items-center justify-center",
          sizeMode === "small"
            ? "size-8"
            : sizeMode === "large"
              ? "size-10"
              : "size-9",
          lit ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <p
        className={cn(
          "min-w-0 flex-1 truncate font-medium",
          sizeMode === "small"
            ? "text-sm"
            : sizeMode === "large"
              ? "text-base"
              : "text-[15px]",
        )}
      >
        {name}
      </p>
    </>
  );

  return (
    <Card
      size="sm"
      // `h-full` + flex column lets the card fill its grid cell, which the grid
      // stretches to the tallest card in the row — so cards on a row share one
      // height. The scene area (the last child) grows to absorb any extra height,
      // keeping its strip flush to the card's bottom rather than floating.
      className="flex h-full flex-col gap-0 overflow-hidden border border-tile-border bg-card bg-clip-padding p-0 ring-0"
    >
      {/* Lit control header — the real space/light tile treatment. */}
      <div
        // `text-foreground` re-declares `color` *inside* the scope where the lit
        // theme overrides `--foreground`, so the unstyled name `<p>` below inherits
        // the computed tile ink. Without it the `<p>` inherits the Card's already-
        // resolved color (the widget window's theme), and the ink choice never
        // reaches the text.
        className={cn(
          "flex flex-col text-foreground",
          sizeMode === "small"
            ? "gap-2 p-2.5"
            : sizeMode === "large"
              ? "gap-3 p-3.5"
              : "gap-2.5 p-3",
          TILE_INTERACTION_TRANSITION_CLASS,
          // A double-click on the header surface jumps to the space in the app;
          // hint that with a select-none surface so the label text doesn't get
          // highlighted mid double-click.
          onOpen && "cursor-default select-none",
        )}
        onDoubleClick={
          onOpen
            ? (event) => {
                // Leave the toggle and brightness slider to own their clicks;
                // only a double-click on the bare header opens the space.
                if (
                  (event.target as HTMLElement).closest(
                    'button,input,a,[role="slider"],[role="switch"]',
                  )
                ) {
                  return;
                }
                onOpen();
              }
            : undefined
        }
        style={
          lit
            ? ({
                "--tile-ease": `${UI_EASE_MS.tileBackground}ms`,
                // Only dim the header by brightness when the target actually
                // reports one; a non-dimmable lit target keeps its full color.
                ...activeTileTheme(
                  tileBackground,
                  tileTint ?? tileBackground,
                  brightness ?? undefined,
                ),
              } as CSSProperties)
            : undefined
        }
      >
        <div className={cn("flex items-center", rowGapClass)}>
          {onOpen ? (
            <TooltipProvider delay={OPEN_HINT_DELAY_MS}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <div
                      className={cn(
                        "flex min-w-0 flex-1 items-center",
                        rowGapClass,
                      )}
                    >
                      {headerLabel}
                    </div>
                  }
                />
                <TooltipContent side="top">
                  Double-click to open {name} in the app
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            headerLabel
          )}
          {partialSync && (
            <SyncIndicator
              syncedCount={syncedCount}
              totalCount={totalCount}
              showCount
            />
          )}
          {fullSync ? (
            <SyncIndicator syncedCount={syncedCount} totalCount={totalCount} />
          ) : (
            <Switch
              size="xl"
              className={TILE_POWER_SWITCH_CLASS}
              checked={isOn}
              aria-label={`Toggle ${name}`}
              onCheckedChange={onToggle}
            />
          )}
        </div>

        {showBrightness && dimmable ? (
          fullSync ? (
            <span
              aria-hidden="true"
              className="block h-1 overflow-hidden rounded-full bg-primary/15"
            >
              <span className="block h-full w-full animate-pulse bg-primary/40" />
            </span>
          ) : (
            <PacedSlider
              value={isOn ? Math.max(1, pct) : 1}
              min={1}
              ariaLabel={`${name} brightness`}
              className={cn(
                TILE_BRIGHTNESS_SLIDER_CLASS,
                !isOn && "tile-brightness-slider-off",
              )}
              size="default"
              isGroup
              animateKey={hueEventRevision}
              onCommit={onBrightness}
            />
          )
        ) : null}
      </div>

      {/* Neutral scene area: legible against the (possibly tinted) header. It
          grows (`flex-1`) so its strip fills any extra height the row's tallest
          sibling forces onto this card. */}
      {scenes.length > 0 ? (
        <div
          className={cn(
            "flex-1 border-t border-tile-border/70 bg-[oklch(0.95_0_0)] px-2 dark:bg-[oklch(0.22_0_0)]",
            compact ? "py-2" : "pt-1.5 pb-1",
          )}
        >
          <SceneCardRail>
            {scenes.map((scene) => (
              <SceneRailItem key={scene.id}>
                {compact ? (
                  <SceneButton
                    scene={scene}
                    disabled={scenesLocked}
                    onActivate={() => onActivateScene(scene)}
                  />
                ) : (
                  <WidgetSceneCard
                    scene={scene}
                    disabled={scenesLocked}
                    onActivate={() => onActivateScene(scene)}
                    onTogglePlay={() => onToggleScenePlay(scene)}
                  />
                )}
              </SceneRailItem>
            ))}
          </SceneCardRail>
        </div>
      ) : null}
    </Card>
  );
};

const UnavailableCard = ({ label }: { label: string }) => (
  <Card size="sm" className="border border-tile-border bg-tile-off">
    <div className="px-(--card-spacing) py-1">
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">
        This target isn’t available right now.
      </p>
    </div>
  </Card>
);

/** The live display state a single toggle chip needs, resolved from the store. */
interface ToggleItem {
  key: string;
  name: string;
  sceneName?: string;
  icon: React.ReactNode;
  isOn: boolean;
  /** The chip's live color when on, or null (renders neutral). */
  background: string | null;
  glow: string | null;
  brightness: number | null;
  onToggle: () => void;
}

/**
 * One on/off toggle chip inside a {@link TogglesCard}. Wears the scene-tile look
 * — a circled icon over a two-line name — but taps to power its target on/off,
 * tinting the whole tile with the target's live color while on (matching the
 * real Home/Space tiles) and sitting neutral while off.
 */
const ToggleTile = ({
  item,
  sizeMode,
}: {
  item: ToggleItem;
  sizeMode: WidgetSizeMode;
}) => {
  const lit = item.isOn && item.background != null;
  const size = sizeMode === "large" ? "sm" : "xs";
  return (
    <SceneTile
      size={size}
      name={item.name}
      subtitle={item.sceneName}
      ariaPressed={item.isOn}
      activeBackground={lit}
      onActivate={item.onToggle}
      // On-without-a-color (e.g. a sync-locked light) still reads as "on" via a
      // faint fill, so the chip doesn't look identical to its off state.
      className={cn(
        !lit && item.isOn && "bg-foreground/10",
        item.sceneName && (size === "xs" ? "w-24" : "w-28"),
      )}
      style={
        lit && item.background
          ? activeTileTheme(
              item.background,
              item.glow ?? item.background,
              item.brightness ?? undefined,
            )
          : undefined
      }
      visual={
        <span
          className={cn(
            "flex items-center justify-center rounded-full bg-foreground/10 ring-1 ring-foreground/10",
            size === "xs" ? "size-7" : "size-10",
            item.isOn ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {item.icon}
        </span>
      }
    />
  );
};

/**
 * A compact multi-target card: a horizontal rail of on/off toggle chips, one per
 * configured room/zone/light. It's the widget's scene strip repurposed for quick
 * power toggles — no header, no brightness, no scenes.
 */
const TogglesCard = ({
  control,
  sizeMode = "default",
}: {
  control: TogglesWidgetControl;
  sizeMode?: WidgetSizeMode;
}) => {
  const iconSize = sizeMode === "small" ? 16 : sizeMode === "large" ? 20 : 18;
  const roomZones = useHueResourcesStore((state) => state.roomZones);
  const lights = useHueResourcesStore((state) => state.lights);
  const scenes = useHueResourcesStore((state) => state.scenes);
  const setRoomZoneState = useHueResourcesStore(
    (state) => state.setRoomZoneState,
  );
  const setLightState = useHueResourcesStore((state) => state.setLightState);
  const activateScene = useHueResourcesStore((state) => state.activateScene);
  const syncedLightIds = useEntertainmentStore((state) => state.syncedLightIds);
  const syncedIds = new Set(syncedLightIds);

  const resolveItem = (item: ToggleTarget): ToggleItem | null => {
    if (item.kind === "light") {
      const light = lights.find((candidate) => candidate.id === item.id);
      if (!light) return null;
      const hex =
        light.isOn && !syncedIds.has(light.id) ? lightColorHex(light) : null;
      return {
        key: `light:${light.id}`,
        name: light.name,
        icon: <Lightbulb size={iconSize} strokeWidth={2.5} />,
        isOn: light.isOn,
        background: hex,
        glow: hex,
        brightness: light.brightness,
        onToggle: () => setLightState(light, !light.isOn, null),
      };
    }

    const roomZone = roomZones.find((candidate) => candidate.id === item.id);
    if (!roomZone) return null;
    // Color the chip from the lights the widget can actually drive: a sync-locked
    // light ignores commands, so leaving it out keeps the chip's tint honest.
    const controllable = lights.filter(
      (light) =>
        roomZone.lightIds.includes(light.id) && !syncedIds.has(light.id),
    );
    const tile = roomZoneTileColor(controllable);
    const Icon = getRoomZoneIcon(roomZone.class);

    // A "scene" chip launches a saved scene: it reads as on while that scene is
    // the live one, and tapping it while active powers the space back off.
    if (toggleAction(item) === "scene") {
      const scene = scenes.find((candidate) => candidate.id === item.sceneId);
      if (scene) {
        const active = isSceneActive(scene);
        const bubble = sceneBubbleCss(scene);
        return {
          key: `scene:${roomZone.id}:${scene.id}`,
          name: roomZone.name,
          sceneName: scene.name,
          icon: (
            <span
              aria-hidden
              className="size-4 shrink-0 rounded-full ring-1 ring-foreground/20"
              style={{ background: bubble ?? "var(--muted-foreground)" }}
            />
          ),
          isOn: active,
          background: active ? tile.background : null,
          glow: active ? tile.glow : null,
          brightness: roomZone.brightness,
          onToggle: () => {
            if (active) setRoomZoneState(roomZone, false, null);
            else void activateScene(scene);
          },
        };
      }
      // The chosen scene was deleted on the bridge — fall back to a power chip.
    }

    return {
      key: `${item.kind}:${roomZone.id}`,
      name: roomZone.name,
      icon: <Icon size={iconSize} strokeWidth={2.5} />,
      isOn: roomZone.anyOn,
      background: tile.background,
      glow: tile.glow,
      brightness: roomZone.brightness,
      onToggle: () => setRoomZoneState(roomZone, !roomZone.anyOn, null),
    };
  };

  // Guard against a card persisted before `targets` was always serialized.
  const items = (control.targets ?? [])
    .map(resolveItem)
    .filter((item): item is ToggleItem => item != null);

  return (
    <Card
      size="sm"
      className="flex h-full flex-col gap-0 overflow-hidden border border-tile-border bg-card bg-clip-padding p-0 ring-0"
    >
      {control.label ? (
        <p
          className={cn(
            "truncate font-medium text-muted-foreground",
            sizeMode === "small"
              ? "px-2.5 pt-2 text-xs"
              : sizeMode === "large"
                ? "px-3.5 pt-3 text-sm"
                : "px-3 pt-2.5 text-[13px]",
          )}
        >
          {control.label}
        </p>
      ) : null}
      <div
        className={cn("flex-1 px-2", control.label ? "pt-1 pb-1.5" : "py-2")}
      >
        {items.length > 0 ? (
          <SceneCardRail>
            {items.map((item) => (
              <SceneRailItem key={item.key}>
                <ToggleTile item={item} sizeMode={sizeMode} />
              </SceneRailItem>
            ))}
          </SceneCardRail>
        ) : (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            No toggles yet — add rooms or lights in Settings.
          </p>
        )}
      </div>
    </Card>
  );
};

/**
 * A single-target control: resolves its target from the shared Hue store and
 * renders the constrained control — a power toggle, an optional brightness
 * slider, and (for room/zone targets) the chosen scene buttons.
 */
const SingleControlCard = ({
  control,
  sizeMode = "default",
}: {
  control: SingleWidgetControl;
  sizeMode?: WidgetSizeMode;
}) => {
  const iconSize = sizeMode === "small" ? 20 : sizeMode === "large" ? 24 : 22;
  const roomZones = useHueResourcesStore((state) => state.roomZones);
  const lights = useHueResourcesStore((state) => state.lights);
  const scenes = useHueResourcesStore((state) => state.scenes);
  const hueEventRevision = useHueResourcesStore(
    (state) => state.hueEventRevision,
  );
  const setRoomZoneState = useHueResourcesStore(
    (state) => state.setRoomZoneState,
  );
  const setLightState = useHueResourcesStore((state) => state.setLightState);
  const activateScene = useHueResourcesStore((state) => state.activateScene);
  const syncedLightIds = useEntertainmentStore((state) => state.syncedLightIds);

  if (control.target.kind === "light") {
    const light = lights.find(
      (candidate) => candidate.id === control.target.id,
    );
    if (!light) return <UnavailableCard label={control.label ?? "Light"} />;
    const syncLocked = syncedLightIds.includes(light.id);
    const hex = light.isOn && !syncLocked ? lightColorHex(light) : null;
    return (
      <ControlView
        name={control.label ?? light.name}
        icon={<Lightbulb size={iconSize} strokeWidth={2.5} />}
        isOn={light.isOn}
        brightness={light.brightness}
        tileBackground={hex}
        tileTint={hex}
        dimmable={light.brightness != null}
        showBrightness={!control.compact && control.showBrightness}
        scenes={[]}
        compact={control.compact ?? false}
        hueEventRevision={hueEventRevision}
        sizeMode={sizeMode}
        syncedCount={syncLocked ? 1 : 0}
        totalCount={1}
        onToggle={(next) => setLightState(light, next, null)}
        onBrightness={(pct, phase) => setLightState(light, true, pct, phase)}
        onActivateScene={() => undefined}
        onToggleScenePlay={() => undefined}
      />
    );
  }

  const roomZone: HueRoomZone | undefined = roomZones.find(
    (candidate) => candidate.id === control.target.id,
  );
  if (!roomZone) return <UnavailableCard label={control.label ?? "Room"} />;

  const members: HueLight[] = lights.filter((light) =>
    roomZone.lightIds.includes(light.id),
  );
  const syncedIds = new Set(syncedLightIds);
  const syncedMemberCount = members.filter((light) =>
    syncedIds.has(light.id),
  ).length;
  const fullSync = members.length > 0 && syncedMemberCount === members.length;
  const partialSync = syncedMemberCount > 0 && !fullSync;
  const controllableMembers = members.filter(
    (light) => !syncedIds.has(light.id),
  );
  // Partial sync mirrors the Home tile: display and control the remainder of
  // the room, since the synced lights ignore commands while streaming.
  const onControllable = controllableMembers.filter((light) => light.isOn);
  const isOn = partialSync ? onControllable.length > 0 : roomZone.anyOn;
  const brightness = partialSync
    ? onControllable.length > 0
      ? onControllable.reduce(
          (sum, light) => sum + (light.brightness ?? 0),
          0,
        ) / onControllable.length
      : 0
    : roomZone.brightness;
  const tile = fullSync
    ? { background: null, glow: null }
    : roomZoneTileColor(partialSync ? controllableMembers : members);
  // Resolve the chosen scenes in the order the control stored them, dropping
  // any that no longer exist on the bridge.
  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
  const controlScenes = control.sceneIds
    .map((id) => sceneById.get(id))
    .filter((scene): scene is HueScene => scene != null);

  const Icon = getRoomZoneIcon(roomZone.class);
  return (
    <ControlView
      name={control.label ?? roomZone.name}
      icon={<Icon size={iconSize} strokeWidth={2.5} />}
      isOn={isOn}
      brightness={brightness}
      tileBackground={tile.background}
      tileTint={tile.glow ?? tile.background}
      dimmable={roomZone.groupedLightId != null}
      showBrightness={!control.compact && control.showBrightness}
      scenes={controlScenes}
      compact={control.compact ?? false}
      hueEventRevision={hueEventRevision}
      sizeMode={sizeMode}
      syncedCount={syncedMemberCount}
      totalCount={members.length}
      onOpen={() =>
        void invoke("open-widget-target", {
          kind: control.target.kind,
          id: control.target.id,
        }).catch(() => undefined)
      }
      onToggle={(next) => setRoomZoneState(roomZone, next, null)}
      onBrightness={(pct, phase) =>
        setRoomZoneState(roomZone, true, pct, phase)
      }
      onActivateScene={(scene) => void activateScene(scene)}
      onToggleScenePlay={(scene) => void activateScene(scene, "dynamic")}
    />
  );
};

/**
 * One configured card on the widget. A "toggles" card renders the multi-target
 * {@link TogglesCard}; every other card renders the single-target
 * {@link SingleControlCard}. Both branches are components (not inline hook
 * calls), so each card's hooks run unconditionally within its own component.
 */
export const ControlCard = ({
  control,
  sizeMode = "default",
}: {
  control: WidgetControl;
  sizeMode?: WidgetSizeMode;
}) =>
  control.type === "toggles" ? (
    <TogglesCard control={control} sizeMode={sizeMode} />
  ) : (
    <SingleControlCard control={control} sizeMode={sizeMode} />
  );
