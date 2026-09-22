import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ExpandableRow,
  ExpandableRowGroup,
} from "@/components/ui/expandable-row";
import type {
  PickerFolding,
  usePickerFolding,
} from "@/features/automations/usePickerFolding";

export interface PickerGroup {
  id: string;
  name: string;
  /** Names of what is chosen here; a folded group lists them. */
  selectedNames?: string[];
  /** What the group holds, e.g. "4 lights", for a folded group with none chosen. */
  contents?: string;
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

/**
 * Tiles grouped under their room or zone. A home's every light at once made
 * these pages long, so each room folds to one row naming what is chosen in
 * it; rooms with a choice start open, or the first room when there is none.
 */
export function PickerGroups({
  groups,
  labelledBy,
  folding,
}: {
  groups: PickerGroup[];
  labelledBy: string;
  /** Shared state, so the section's title row can fold every room at once. */
  folding?: PickerFolding;
}) {
  const ids = groups.map((group) => group.id).join("|");
  const chosen = groups
    .filter((group) => group.selectedNames?.length)
    .map((group) => group.id)
    .join("|");
  // Rooms with a choice start open, or the first room when there is none.
  const initial = useMemo(
    () => new Set(chosen ? chosen.split("|") : ids.split("|").slice(0, 1)),
    [chosen, ids],
  );
  const [ownOpen, setOwnOpen] = useState<Set<string>>(initial);
  const register = folding?.setIds;
  useEffect(() => {
    register?.(ids ? ids.split("|") : []);
  }, [ids, register]);
  const open = folding ? (folding.open ?? initial) : ownOpen;
  const setOpen = folding ? folding.setOpen : setOwnOpen;
  const toggle = (id: string, next: boolean) => {
    const updated = new Set(open);
    if (next) updated.add(id);
    else updated.delete(id);
    setOpen(updated);
  };
  // One room has nothing to fold away from.
  const foldable = groups.length > 1;

  return (
    // No scroller of its own: the page is the only thing that scrolls.
    <ExpandableRowGroup role="group" aria-labelledby={labelledBy}>
      {groups.map((group) => {
        const chosen = group.selectedNames ?? [];
        const expanded = !foldable || open.has(group.id);
        return (
          <ExpandableRow
            key={group.id}
            title={group.name}
            value={
              chosen.length
                ? expanded
                  ? `${chosen.length} selected`
                  : chosen.join(", ")
                : group.contents
            }
            valueTone={chosen.length ? "strong" : "muted"}
            disabled={!foldable}
            open={expanded}
            onOpenChange={(next) => toggle(group.id, next)}
          >
            {group.children}
          </ExpandableRow>
        );
      })}
    </ExpandableRowGroup>
  );
}

/** Folds every room of a picker at once, from its section's title row. */
export function FoldAllButton({
  state,
}: {
  state: ReturnType<typeof usePickerFolding>;
}) {
  if (!state.foldable) return null;
  const label = state.allClosed ? "Open every room" : "Fold every room";
  return (
    <Button
      size="icon"
      variant="ghost"
      aria-label={label}
      title={label}
      /* Its chevron lands in the rooms' chevron column. That column sits a
         panel border, the panel's row padding, the list's border and the
         room's own 12px in from the section edge, plus half a 16px chevron:
         24px (28px once the panel pads by 5), less half this 28px box. */
      className="mr-6 size-7 shrink-0 text-muted-foreground hover:text-foreground @3xl:mr-7"
      onClick={state.toggleAll}
    >
      {state.allClosed ? (
        <ChevronsUpDown size={15} />
      ) : (
        <ChevronsDownUp size={15} />
      )}
    </Button>
  );
}
