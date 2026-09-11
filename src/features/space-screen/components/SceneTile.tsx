import { Card } from "@/components/ui/card";
import {
  SCENE_TILE_SURFACE_CLASS,
  TILE_INTERACTION_TRANSITION_CLASS,
} from "@/lib/tile-theme";
import { UI_EASE_MS } from "@/lib/transitions";
import { cn } from "@/lib/utils";

/**
 * The shared visual shell for a scene tile — used by both the saved-scene cards
 * in the horizontal rail and the gallery preset cards in the picker. It pins the
 * circle visual to the top and a fixed two-line name box to the bottom, so a
 * one-line name sits vertically centered against where a two-line name would be.
 * Behavior (what a tap does, the play button, the lit/preview background) is
 * supplied by the caller — only the layout is shared.
 */
export const SceneTile: React.FC<{
  name: string;
  subtitle?: string;
  visual: React.ReactNode;
  onActivate: () => void;
  /** The tile paints its own palette as the background (drop-shadowed name). */
  activeBackground?: boolean;
  /** Stretch to fill a grid cell instead of the fixed rail width. */
  fullWidth?: boolean;
  /** Small label pinned to the top-right corner (e.g. brightness). */
  cornerLabel?: React.ReactNode;
  /** Small label pinned to the top-left corner (e.g. dynamic speed). */
  cornerLabelLeft?: React.ReactNode;
  /**
   * Interactive control pinned to the top-right corner, revealed on hover/focus
   * (e.g. the scene's overflow menu). Sits above {@link cornerLabel}.
   */
  topRightAction?: React.ReactNode;
  disabled?: boolean;
  ariaPressed?: boolean;
  /** Persistent picker selection; separate from a scene's live active state. */
  selected?: boolean;
  /** "sm" shrinks the tile for tight surfaces; "xs" is the miniature widget rail. */
  size?: "default" | "sm" | "xs";
  className?: string;
  style?: React.CSSProperties;
  editId?: string;
}> = ({
  name,
  subtitle,
  visual,
  onActivate,
  activeBackground = false,
  fullWidth = false,
  cornerLabel,
  cornerLabelLeft,
  topRightAction,
  disabled = false,
  ariaPressed,
  selected = false,
  size = "default",
  className,
  style,
  editId,
}) => {
  const tiny = size === "xs";
  const small = size === "sm";
  return (
    <Card
      data-edit-id={editId}
      data-selected={selected ? "" : undefined}
      size="sm"
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-pressed={ariaPressed}
      aria-disabled={disabled || undefined}
      aria-label={subtitle ? `${name}: ${subtitle}` : undefined}
      title={subtitle ? `${name}: ${subtitle}` : undefined}
      onClick={() => {
        if (!disabled) onActivate();
      }}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActivate();
        }
      }}
      className={cn(
        "group relative shrink-0 cursor-pointer items-center justify-between bg-tile text-center outline-none ring-transparent focus-visible:ring-2 focus-visible:ring-ring",
        SCENE_TILE_SURFACE_CLASS,
        TILE_INTERACTION_TRANSITION_CLASS,
        tiny
          ? "gap-1 px-1.5 py-2"
          : small
            ? "gap-1.5 px-2 py-3"
            : "gap-2 px-3 py-3.5",
        tiny
          ? fullWidth
            ? "h-20 w-full"
            : "h-20 w-16"
          : small
            ? fullWidth
              ? "h-28 w-full"
              : "h-28 w-24"
            : fullWidth
              ? "h-36 w-full"
              : "h-36 w-32",
        className,
      )}
      style={
        {
          "--tile-ease": `${UI_EASE_MS.tileBackground}ms`,
          ...style,
        } as React.CSSProperties
      }
    >
      {topRightAction != null && (
        <span className="absolute top-1 right-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {topRightAction}
        </span>
      )}
      {cornerLabel != null && (
        <span
          className={cn(
            "pointer-events-none absolute top-3 right-3 text-xs font-medium tabular-nums",
            activeBackground
              ? "text-foreground/80 drop-shadow"
              : "text-muted-foreground",
          )}
        >
          {cornerLabel}
        </span>
      )}
      {cornerLabelLeft != null && (
        <span
          className={cn(
            "pointer-events-none absolute top-3 left-3 flex items-center gap-0.5 text-xs font-medium tabular-nums",
            activeBackground
              ? "text-foreground/80 drop-shadow"
              : "text-muted-foreground",
          )}
        >
          {cornerLabelLeft}
        </span>
      )}
      <div className={cn("flex", tiny ? "mt-0.5" : small ? "mt-1" : "mt-2")}>
        {visual}
      </div>
      <span
        className={cn(
          "flex w-full min-w-0 flex-col items-center justify-center",
          tiny ? "h-7" : small ? "h-9" : "h-11",
        )}
      >
        <span
          className={cn(
            "max-w-full font-medium wrap-normal",
            subtitle ? "w-full truncate" : "line-clamp-2",
            tiny
              ? "text-[11px] leading-tight tracking-[0.03em]"
              : small
                ? "text-xs leading-snug"
                : "text-base leading-snug",
            activeBackground && "drop-shadow",
          )}
        >
          {name}
        </span>
        {subtitle && (
          <span
            className={cn(
              "w-full truncate text-xs leading-tight",
              tiny && "text-[11px]",
              activeBackground
                ? "text-foreground/80 drop-shadow"
                : "text-muted-foreground",
            )}
          >
            {subtitle}
          </span>
        )}
      </span>
    </Card>
  );
};
