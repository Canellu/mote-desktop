import { Check, Lightbulb, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AutomationTarget } from "@/features/automations/model";
import { SceneTile } from "@/features/space-screen/components/SceneTile";
import { foregroundForBackground } from "@/lib/tile-theme";
import { cn } from "@/lib/utils";
import {
  PICKER_TILE_ROW,
  PICKER_TILE_SURFACE,
  PickerGroups,
} from "./AutomationPickerGroups";
import type { PickerFolding } from "@/features/automations/usePickerFolding";

/** A light, room, or zone an automation can change. */
export interface AutomationLightOption {
  kind: AutomationTarget["kind"];
  /** The light id, or the grouped light of a room or zone. */
  id: string;
  /** Saved with the automation, so it reads on its own. */
  name: string;
  /** Shown on the tile instead of `name`, e.g. "Whole room". */
  label?: string;
  detail?: string;
  icon: LucideIcon;
  /** The light's current color while it is on. */
  color: string | null;
}

export interface AutomationLightGroup {
  id: string;
  name: string;
  options: AutomationLightOption[];
}

/** What a folded room holds: its lights, or for the zones row, its zones. */
const contents = (options: AutomationLightOption[]) => {
  const lights = options.filter((option) => option.kind === "light").length;
  const count = lights || options.length;
  const noun = lights ? "light" : "zone";
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
};

const same = (
  a: { kind: string; id: string },
  b: { kind: string; id: string },
) => a.kind === b.kind && a.id === b.id;

/**
 * Lights under their rooms, drawn like the room screen's scene cards and
 * toggled on and off with a tap.
 */
export function AutomationLightPicker({
  groups,
  selected,
  labelledBy,
  folding,
  view = "all",
  onChange,
}: {
  groups: AutomationLightGroup[];
  selected: AutomationTarget[];
  labelledBy: string;
  /** Shared folded state, for a fold-all button outside the picker. */
  folding?: PickerFolding;
  /**
   * "all" offers everything in one list. A caller that switches between the
   * two asks for "rooms" — whole rooms and zones — or "lights", which keeps
   * zones in the spaces view.
   */
  view?: "all" | "lights" | "rooms";
  onChange: (next: AutomationTarget[]) => void;
}) {
  const options = groups.flatMap((group) => group.options);
  const visibleGroups =
    view === "lights"
      ? groups
          .map((group) => ({
            ...group,
            options: group.options.filter((option) => option.kind !== "zone"),
          }))
          .filter((group) => group.options.length > 0)
      : groups;
  const unavailable = selected.filter(
    (target) => !options.some((option) => same(option, target)),
  );
  const toggle = (target: AutomationTarget) =>
    onChange(
      selected.some((item) => same(item, target))
        ? selected.filter((item) => !same(item, target))
        : [
            ...selected,
            { kind: target.kind, id: target.id, name: target.name },
          ],
    );

  if (options.length === 0 && unavailable.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        No lights are on this bridge yet.
      </p>
    );

  const tiles = (items: AutomationLightOption[], missing = false) => (
    <div className={PICKER_TILE_ROW}>
      {items.map((option) => (
        <LightTile
          key={`${option.kind}:${option.id}`}
          option={option}
          missing={missing}
          selected={selected.some((item) => same(item, option))}
          onToggle={() => toggle(option)}
        />
      ))}
    </div>
  );

  /**
   * Whole rooms and zones as one tile each, for when the room is the unit
   * being chosen and its lights are beside the point.
   */
  if (view === "rooms") {
    const spaces = groups.flatMap((group) =>
      group.options.filter(
        (option) => option.kind === "room" || option.kind === "zone",
      ),
    );
    if (spaces.length === 0)
      return (
        <p className="text-sm text-muted-foreground">
          This bridge has no rooms or zones yet. Choose lights instead.
        </p>
      );
    return (
      <div
        role="group"
        aria-labelledby={labelledBy}
        className="grid min-w-0 grid-cols-2 gap-3 @lg:grid-cols-3 @3xl:grid-cols-4"
      >
        {spaces.map((space) => (
          <SpaceTile
            key={`${space.kind}:${space.id}`}
            option={space}
            selected={selected.some((item) => same(item, space))}
            onToggle={() => toggle(space)}
          />
        ))}
      </div>
    );
  }

  /**
   * A room's lights, with Select all and Clear above them. The room's own
   * "whole room" tile is not offered any more — Select all says the same
   * thing — but one saved before still shows, so it can be taken off.
   */
  const groupBody = (group: AutomationLightGroup) => {
    const shown = group.options.filter(
      (option) =>
        option.kind !== "room" || selected.some((item) => same(item, option)),
    );
    const all = group.options.filter((option) => option.kind !== "room");
    const chosen = all.filter((option) =>
      selected.some((item) => same(item, option)),
    ).length;
    const anyChosen = group.options.some((option) =>
      selected.some((item) => same(item, option)),
    );
    return (
      <div className="grid min-w-0 gap-3">
        {all.length > 1 && (
          <div className="flex min-w-0 items-center justify-end gap-1.5">
            <PickerPill
              disabled={chosen === all.length}
              onClick={() =>
                onChange([
                  ...selected,
                  ...all
                    .filter(
                      (option) => !selected.some((item) => same(item, option)),
                    )
                    .map((option) => ({
                      kind: option.kind,
                      id: option.id,
                      name: option.name,
                    })),
                ])
              }
            >
              Select all
            </PickerPill>
            <PickerPill
              disabled={!anyChosen}
              onClick={() =>
                onChange(
                  selected.filter(
                    (item) =>
                      !group.options.some((option) => same(item, option)),
                  ),
                )
              }
            >
              Clear
            </PickerPill>
          </div>
        )}
        {tiles(shown)}
      </div>
    );
  };

  return (
    <PickerGroups
      labelledBy={labelledBy}
      folding={folding}
      groups={[
        ...visibleGroups.map((group) => ({
          id: group.id,
          name: group.name,
          selectedNames: group.options
            .filter((option) => selected.some((item) => same(item, option)))
            .map((option) => option.label ?? option.name),
          contents: contents(group.options),
          children: groupBody(group),
        })),
        ...(unavailable.length
          ? [
              {
                id: "unavailable",
                name: "No longer on this bridge",
                selectedNames: unavailable.map((target) => target.name),
                children: tiles(
                  unavailable.map((target) => ({
                    ...target,
                    detail: "Tap to remove",
                    icon: Lightbulb,
                    color: null,
                  })),
                  true,
                ),
              },
            ]
          : []),
      ]}
    />
  );
}

/** A whole room or zone, as a card the size the room deserves. */
function SpaceTile({
  option,
  selected,
  onToggle,
}: {
  option: AutomationLightOption;
  selected: boolean;
  onToggle: () => void;
}) {
  const Icon = option.icon;
  return (
    <SceneTile
      fullWidth
      name={option.name}
      subtitle={option.detail ?? (option.kind === "zone" ? "Zone" : "Room")}
      ariaPressed={selected}
      selected={selected}
      className={cn(
        PICKER_TILE_SURFACE,
        "aspect-[4/3] h-auto justify-around rounded-lg px-4 py-4",
        selected && "ring-2 ring-selection-border",
      )}
      style={
        option.color
          ? {
              backgroundImage: `linear-gradient(145deg, color-mix(in oklch, ${option.color} 18%, transparent), transparent 58%)`,
            }
          : undefined
      }
      cornerLabel={
        selected ? (
          <span className="flex size-4 items-center justify-center rounded-full bg-selection-border text-background">
            <Check className="size-3" strokeWidth={3} />
          </span>
        ) : undefined
      }
      onActivate={onToggle}
      visual={
        <span
          className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-foreground/8 text-foreground shadow-sm ring-1 ring-foreground/10 transition-transform group-hover:-translate-y-0.5"
          style={
            option.color
              ? {
                  background: option.color,
                  color: foregroundForBackground(option.color),
                }
              : undefined
          }
        >
          <Icon className="size-7" />
        </span>
      }
    />
  );
}

function LightTile({
  option,
  selected,
  missing,
  onToggle,
}: {
  option: AutomationLightOption;
  selected: boolean;
  missing: boolean;
  onToggle: () => void;
}) {
  const Icon = option.icon;
  return (
    <SceneTile
      size="sm"
      name={option.label ?? option.name}
      subtitle={option.detail}
      ariaPressed={selected}
      selected={selected}
      className={cn(
        PICKER_TILE_SURFACE,
        selected && "ring-2 ring-selection-border",
        missing && "opacity-60",
      )}
      cornerLabel={
        selected ? (
          <span className="flex size-4 items-center justify-center rounded-full bg-selection-border text-background">
            <Check className="size-3" strokeWidth={3} />
          </span>
        ) : undefined
      }
      onActivate={onToggle}
      visual={
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-full shadow-sm ring-1 ring-foreground/15"
          style={{
            background: option.color ?? "var(--muted)",
            color: option.color
              ? foregroundForBackground(option.color)
              : "var(--foreground)",
          }}
        >
          <Icon className="size-5" />
        </span>
      }
    />
  );
}

/** Select all / Clear above a room's lights: quiet until there is a point. */
function PickerPill({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={disabled}
      onClick={onClick}
      className="h-7 rounded-full px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
    >
      {children}
    </Button>
  );
}
