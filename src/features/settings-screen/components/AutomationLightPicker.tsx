import { Check, Lightbulb, type LucideIcon } from "lucide-react";
import type { AutomationTarget } from "@/features/automations/model";
import { SceneTile } from "@/features/space-screen/components/SceneTile";
import { foregroundForBackground } from "@/lib/tile-theme";
import { cn } from "@/lib/utils";
import {
  PICKER_TILE_ROW,
  PICKER_TILE_SURFACE,
  PickerGroups,
} from "./AutomationPickerGroups";

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
  onChange,
}: {
  groups: AutomationLightGroup[];
  selected: AutomationTarget[];
  labelledBy: string;
  onChange: (next: AutomationTarget[]) => void;
}) {
  const options = groups.flatMap((group) => group.options);
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

  return (
    <PickerGroups
      labelledBy={labelledBy}
      groups={[
        ...groups.map((group) => ({
          id: group.id,
          name: group.name,
          selected: group.options.filter((option) =>
            selected.some((item) => same(item, option)),
          ).length,
          children: tiles(group.options),
        })),
        ...(unavailable.length
          ? [
              {
                id: "unavailable",
                name: "No longer on this bridge",
                selected: unavailable.length,
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
