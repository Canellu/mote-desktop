import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/**
 * Selection-mode dress for a tile, shared by a space's Manage mode and
 * Settings › Scenes so both look and behave the same: a checkbox in the corner,
 * and a gentle wiggle on every tile that can still be ticked.
 *
 * With `onToggle` the checkbox is its own control. Without it the checkbox is a
 * picture only and the click falls through to the tile, for surfaces whose
 * section already turns a tile click into a selection toggle.
 */
export const SelectableTileFrame = ({
  selecting,
  selected,
  index,
  label,
  onToggle,
  children,
}: {
  selecting: boolean;
  selected: boolean;
  /** Position in its list; staggers the wiggle so a grid doesn't sway in step. */
  index: number;
  /** What the tile is, for the checkbox's accessible name. */
  label: string;
  onToggle?: () => void;
  children: React.ReactNode;
}) => (
  <div
    className={cn("relative", selecting && !selected && "animate-wiggle")}
    style={
      selecting ? { animationDelay: `${-(index % 5) * 110}ms` } : undefined
    }
  >
    {children}
    {selecting && (
      <Checkbox
        checked={selected}
        aria-label={`Select ${label}`}
        onCheckedChange={onToggle ? () => onToggle() : undefined}
        onClick={onToggle ? (event) => event.stopPropagation() : undefined}
        tabIndex={onToggle ? undefined : -1}
        className={cn(
          "absolute top-3 left-3 z-10 shadow-sm",
          !onToggle && "pointer-events-none",
        )}
      />
    )}
  </div>
);
