import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { SceneTile } from "@/features/space-screen/components/SceneTile";
import {
  sceneBrightness,
  sceneBubbleCss,
  sceneHexes,
} from "@/features/space-screen/utils/color-state";
import {
  isSceneActive,
  isSceneDynamicActive,
} from "@/features/space-screen/utils/scene-status";
import { selectableVariants } from "@/lib/selection-styles";
import { activeTileTheme } from "@/lib/tile-theme";
import { cn } from "@/lib/utils";
import type { HueScene } from "@/types/hue";
import { Palette, Play, Square } from "lucide-react";

/** The scene's color bubble, or a palette placeholder when it has no colors. */
const SceneBubble = ({
  bubble,
  size = "default",
}: {
  bubble: string | null;
  /** "xs" matches the miniature widget rail tile. */
  size?: "default" | "xs";
}) => {
  const tiny = size === "xs";
  return bubble ? (
    <span
      className={cn(
        "shrink-0 rounded-full shadow-sm ring-1 ring-foreground/15",
        tiny ? "size-7" : "size-10",
      )}
      style={{ background: bubble }}
    />
  ) : (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground ring-1 ring-foreground/10",
        tiny ? "size-7" : "size-10",
      )}
    >
      <Palette className={tiny ? "size-3.5" : "size-5"} />
    </span>
  );
};

/**
 * Horizontal, drag-scrollable rail of scene cards. Overflow is communicated by
 * the edge fade alone — there are no page dots or arrow buttons; the rail just
 * drags. Children are expected to be {@link CarouselItem}s; use
 * {@link SceneRailItem} to wrap each card.
 */
export const SceneCardRail = ({ children }: { children: React.ReactNode }) => {
  return (
    <Carousel
      opts={{
        align: "start",
        slidesToScroll: "auto",
        containScroll: "trimSnaps",
      }}
      className="min-w-0"
    >
      <CarouselContent fade className="-ml-2 py-1">
        {children}
      </CarouselContent>
    </Carousel>
  );
};

/** Wraps a single scene card as a carousel slide sized to its content. */
export const SceneRailItem = ({ children }: { children: React.ReactNode }) => (
  <CarouselItem className="basis-auto pl-2">{children}</CarouselItem>
);

/** A scene card that applies the scene on tap (the live widget display). */
export const WidgetSceneCard = ({
  scene,
  disabled = false,
  onActivate,
  onTogglePlay,
}: {
  scene: HueScene;
  /** Locked while light sync owns the room's lights — the tap would do nothing. */
  disabled?: boolean;
  onActivate: () => void;
  onTogglePlay: () => void;
}) => {
  const bubble = sceneBubbleCss(scene);
  const active = isSceneActive(scene);
  const dynamicActive = isSceneDynamicActive(scene);
  const activeBackground = active && bubble != null;
  const DynamicIcon = dynamicActive ? Square : Play;
  return (
    <SceneTile
      size="xs"
      name={scene.name}
      ariaPressed={active}
      disabled={disabled}
      activeBackground={activeBackground}
      className={cn(
        activeBackground
          ? "text-foreground"
          : active
            ? "bg-foreground/10"
            : undefined,
        disabled && "opacity-40",
      )}
      style={
        activeBackground && bubble
          ? activeTileTheme(
              bubble,
              sceneHexes(scene)[0] ?? bubble,
              sceneBrightness(scene),
            )
          : undefined
      }
      onActivate={onActivate}
      visual={
        scene.dynamic ? (
          <button
            type="button"
            disabled={disabled}
            aria-label={
              dynamicActive ? `Stop ${scene.name}` : `Play ${scene.name}`
            }
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-full shadow-sm ring-1 ring-foreground/15 outline-none focus-visible:ring-2 focus-visible:ring-ring",
              bubble ? "text-white" : "bg-foreground/15 text-foreground",
            )}
            style={bubble ? { background: bubble } : undefined}
            onClick={(event) => {
              event.stopPropagation();
              onTogglePlay();
            }}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <DynamicIcon
              className={cn(
                "size-3.5 fill-current drop-shadow",
                !dynamicActive && "ml-px",
              )}
              strokeWidth={2.5}
            />
          </button>
        ) : (
          <SceneBubble bubble={bubble} size="xs" />
        )
      }
    />
  );
};

/**
 * A scene card used in the settings pickers: tapping toggles whether the scene
 * is one of the control's quick scenes.
 */
export const SelectableSceneCard = ({
  scene,
  selected,
  disabled,
  fullWidth = false,
  onToggle,
}: {
  scene: HueScene;
  selected: boolean;
  disabled: boolean;
  /** Fill a grid cell instead of the rail's fixed width. */
  fullWidth?: boolean;
  onToggle: () => void;
}) => {
  const bubble = sceneBubbleCss(scene);
  return (
    <SceneTile
      size="sm"
      fullWidth={fullWidth}
      name={scene.name}
      ariaPressed={selected}
      selected={selected}
      disabled={disabled}
      onActivate={onToggle}
      className={cn(selectableVariants(), disabled && "opacity-40")}
      visual={<SceneBubble bubble={bubble} />}
    />
  );
};
