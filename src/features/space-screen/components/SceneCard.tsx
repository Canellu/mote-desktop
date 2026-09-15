import { Palette, PanelRightOpen, Play, Square } from "lucide-react";

import { SyncIndicator } from "@/components/SyncIndicator";
import { Button } from "@/components/ui/button";
import {
  sceneBrightness,
  sceneBubbleCss,
  sceneHexes,
} from "@/features/space-screen/utils/color-state";
import { isSceneDynamicActive } from "@/features/space-screen/utils/scene-status";
import { activeTileTheme } from "@/lib/tile-theme";
import { cn } from "@/lib/utils";
import type { HueScene } from "@/types/hue";
import { SceneTile } from "./SceneTile";

export const SceneCard: React.FC<{
  scene: HueScene;
  active?: boolean;
  compact?: boolean;
  /** In edit mode the play/stop control is muted and the overflow menu hidden. */
  editing?: boolean;
  disabled?: boolean;
  playDisabled?: boolean;
  onApply: (scene: HueScene) => void;
  /** Open the scene in the side pane without applying it. */
  onInspect: (scene: HueScene) => void;
  onTogglePlay: (scene: HueScene) => void;
}> = ({
  scene,
  active = false,
  compact = false,
  editing = false,
  disabled = false,
  playDisabled = false,
  onApply,
  onInspect,
  onTogglePlay,
}) => {
  const bubble = sceneBubbleCss(scene);
  const activeBackground = active && bubble != null && !disabled;
  const dynamicActive = isSceneDynamicActive(scene);

  return (
    <SceneTile
      editId={scene.id}
      name={scene.name}
      ariaPressed={active}
      disabled={disabled}
      activeBackground={activeBackground}
      fullWidth={compact}
      className={cn(
        disabled && "cursor-not-allowed opacity-60",
        activeBackground
          ? "text-foreground"
          : active && !disabled
            ? "bg-accent"
            : "bg-scene-tile",
      )}
      cornerLabelLeft={
        disabled ? <SyncIndicator syncedCount={1} totalCount={1} /> : undefined
      }
      style={
        activeBackground && bubble
          ? activeTileTheme(
              bubble,
              sceneHexes(scene)[0] ?? bubble,
              sceneBrightness(scene),
            )
          : undefined
      }
      // Tapping a scene always applies its colors to the room's lights.
      onActivate={() => onApply(scene)}
      // The panel button opens the inspector side pane (details + edit)
      // without applying the scene. Hidden while editing — there the tap is a
      // multiselect toggle and the card body is a reorder handle.
      topRightAction={
        editing ? undefined : (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Open ${scene.name} details`}
            title="Open scene details"
            className={cn(
              "text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
              activeBackground &&
                "text-foreground/75 hover:bg-white/20 hover:text-foreground",
            )}
            onClick={(event) => {
              event.stopPropagation();
              onInspect(scene);
            }}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <PanelRightOpen className="size-4" />
          </Button>
        )
      }
      visual={
        <SceneCardVisual
          active={active}
          bubble={bubble}
          compact={compact}
          editing={editing}
          disabled={disabled || playDisabled}
          dynamic={scene.dynamic}
          dynamicActive={dynamicActive}
          sceneName={scene.name}
          onTogglePlay={() => onTogglePlay(scene)}
        />
      }
    />
  );
};

const SceneCardVisual: React.FC<{
  active: boolean;
  bubble: string | null;
  compact: boolean;
  editing?: boolean;
  disabled?: boolean;
  dynamic: boolean;
  dynamicActive: boolean;
  sceneName: string;
  onTogglePlay: () => void;
}> = ({
  active,
  bubble,
  compact,
  editing = false,
  disabled = false,
  dynamic,
  dynamicActive,
  sceneName,
  onTogglePlay,
}) => {
  const size = compact ? "size-12" : "size-14";

  if (dynamic) {
    const Icon = dynamicActive ? Square : Play;
    // Show the scene's palette behind the play/stop icon so a dynamic scene
    // still reads as colorful at a glance. On the active card (whose own
    // background is already the palette) fall back to a translucent white chip
    // so it doesn't stack palette-on-palette.
    const showBubble = bubble != null && !active;
    // The play/stop chip is its own button: tapping it toggles the dynamic
    // palette, while tapping anywhere else on the card applies the colors.
    return (
      <button
        type="button"
        disabled={disabled}
        aria-label={dynamicActive ? `Stop ${sceneName}` : `Play ${sceneName}`}
        aria-disabled={editing || disabled || undefined}
        tabIndex={editing || disabled ? -1 : undefined}
        onClick={(event) => {
          if (editing || disabled) return;
          event.stopPropagation();
          onTogglePlay();
        }}
        onKeyDown={(event) => event.stopPropagation()}
        className={cn(
          "flex aspect-square shrink-0 items-center justify-center rounded-full shadow-sm ring-1 ring-foreground/15 backdrop-blur-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
          showBubble
            ? "text-white"
            : active || bubble
              ? "bg-white/30 text-white"
              : "bg-foreground/15 text-foreground",
          // Let pointer gestures pass through to the sortable tile in edit mode.
          (editing || disabled) && "pointer-events-none",
          size,
        )}
        style={showBubble ? { background: bubble } : undefined}
      >
        <Icon
          className={cn(
            "size-6 fill-current drop-shadow",
            !dynamicActive && "ml-0.5",
          )}
          strokeWidth={2.5}
        />
      </button>
    );
  }

  if (bubble) {
    return (
      <span
        className={cn(
          "aspect-square shrink-0 rounded-full shadow-sm ring-1 ring-foreground/15",
          size,
        )}
        style={{ background: bubble }}
      />
    );
  }

  return (
    <span
      className={cn(
        "flex aspect-square shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground ring-1 ring-foreground/10",
        size,
      )}
    >
      <Palette className="size-6" />
    </span>
  );
};
