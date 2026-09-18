import type { ReactNode } from "react";

export interface PickerGroup {
  id: string;
  name: string;
  /** How many of the group's tiles are chosen, shown beside its name. */
  selected?: number;
  children: ReactNode;
}

/** Tiles keep the room screen's scene-card shape and wrap onto new rows. */
export const PICKER_TILE_ROW = "flex flex-wrap gap-3";

/**
 * The room screen's scene tiles sit a step above the page. These sit on a
 * settings card, so dark mode lifts them a step above the card instead.
 */
export const PICKER_TILE_SURFACE =
  "bg-scene-tile dark:bg-(--settings-surface-hover)";

/** Tiles grouped under their room or zone, every group shown. */
export function PickerGroups({
  groups,
  labelledBy,
}: {
  groups: PickerGroup[];
  labelledBy: string;
}) {
  return (
    // No scroller of its own: the settings page is the only thing that scrolls.
    <div
      role="group"
      aria-labelledby={labelledBy}
      className="grid min-w-0 content-start gap-5"
    >
      {groups.map((group) => (
        <section
          key={group.id}
          aria-label={group.name}
          className="grid min-w-0 gap-3"
        >
          {/* The count says what you picked here; the tiles already say how
              many there are, so a bare number beside the name only reads as
              part of it. */}
          <div className="flex min-w-0 items-baseline justify-between gap-3">
            <h3 className="truncate text-sm font-medium text-muted-foreground">
              {group.name}
            </h3>
            {!!group.selected && (
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {group.selected} selected
              </span>
            )}
          </div>
          {group.children}
        </section>
      ))}
    </div>
  );
}
