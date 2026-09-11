import {
  Crosshair,
  GripVertical,
  Lightbulb,
  Link2,
  Loader2,
  MapPin,
  Unlink2,
  X,
} from "lucide-react";
import { useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { MapFloor } from "../types";
import type { MapFixture } from "../fixtures";
import type { TrayFixture } from "../placement";

interface TrayActions {
  blinkingKeys: ReadonlySet<string>;
  busy: boolean;
  onChoose: (fixtureId: string | null) => void;
  /** Starts a drag onto the map; the canvas follows the pointer from here. */
  onLift: (fixture: MapFixture) => void;
  onIdentify: (fixture: MapFixture) => void;
  onRemove: (fixture: MapFixture) => void;
  /** Places without aiming, so a mouse drag is never required. */
  onPlaceInArea: (entry: TrayFixture) => void;
  /** Breaks a joined-up product back into the devices the bridge reports. */
  onSplit: (fixture: MapFixture) => void;
  /** Lets a split product group itself up again. */
  onRejoin: (fixture: MapFixture) => void;
}

export function LightTrayPanel({
  entries,
  floor,
  placingFixtureId,
  liftedFixtureId,
  scrollable = false,
  onClose,
  ...actions
}: TrayActions & {
  entries: TrayFixture[];
  floor: MapFloor;
  placingFixtureId: string | null;
  /** The fixture being dragged out of the tray right now. */
  liftedFixtureId: string | null;
  /** Owns its own scrolling, for hosts that give it a fixed height. */
  scrollable?: boolean;
  /** Renders a close control, for hosts the tray can be dismissed from. */
  onClose?: () => void;
}) {
  const onThisFloor = entries.filter((entry) => entry.floorId === floor.id);
  const elsewhere = entries.filter(
    (entry) => entry.floorId !== null && entry.floorId !== floor.id,
  );
  const unplaced = entries.filter((entry) => entry.floorId === null);

  const sections = [
    { title: "Not placed", rows: unplaced },
    { title: `On ${floor.name}`, rows: onThisFloor },
    { title: "On other floors", rows: elsewhere },
  ].filter((section) => section.rows.length > 0);

  const list = (
    <div className="space-y-4">
      {entries.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No lights are available from this bridge.
        </p>
      )}

      {sections.map((section) => {
        const groups = groupByTarget(section.rows);
        return (
          <div key={section.title}>
            <h4 className="mb-1.5 flex items-baseline gap-1.5 text-xs font-medium">
              {section.title}
              <span className="text-muted-foreground">
                {section.rows.length}
              </span>
            </h4>
            <div className="space-y-2">
              {groups.map((group) => (
                <div key={group.key}>
                  {/* Fixtures in one Hue space are placed together, so that
                    space names the run instead of repeating on every row. */}
                  {groups.length > 1 && (
                    <p className="mb-0.5 pl-2 text-[11px] text-muted-foreground/80">
                      {group.label}
                    </p>
                  )}
                  <ul>
                    {group.rows.map((entry) => (
                      <TrayRow
                        key={entry.fixture.id}
                        entry={entry}
                        floor={floor}
                        choosing={placingFixtureId === entry.fixture.id}
                        lifted={liftedFixtureId === entry.fixture.id}
                        {...actions}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-2 pb-3">
        <div>
          <h3 className="text-base font-medium">Place fixtures</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {`${onThisFloor.length} of ${entries.length} placed on ${floor.name}.`}{" "}
            Drag a row onto the map, or select it and click where it goes.
            {/* Only worth saying once something is out there to drag back. */}
            {onThisFloor.length > 0 &&
              " Drag a placed fixture back here to take it off."}
            {/* And only worth saying when a product here actually has heads. */}
            {entries.some((entry) => entry.fixture.lights.length > 1) &&
              " A fixture with several bulbs places as one marker."}
          </p>
        </div>
        {onClose && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Close fixtures"
            onClick={onClose}
          >
            <X />
          </Button>
        )}
      </div>
      {scrollable ? (
        <ScrollArea
          fade
          className="min-h-0 flex-1 overflow-hidden"
          viewportClassName="pr-3"
        >
          {list}
        </ScrollArea>
      ) : (
        list
      )}
    </div>
  );
}

interface TargetGroup {
  key: string;
  label: string;
  rows: TrayFixture[];
}

/** Splits one placement bucket by the Hue room or zone that controls it. */
function groupByTarget(rows: readonly TrayFixture[]): TargetGroup[] {
  const groups: TargetGroup[] = [];
  for (const row of rows) {
    const key = row.target
      ? `${row.target.resourceType}:${row.target.id}`
      : "unassigned";
    const existing = groups.find((group) => group.key === key);
    if (existing) existing.rows.push(row);
    else
      groups.push({
        key,
        label: row.target?.name ?? "Not in a Hue room or zone",
        rows: [row],
      });
  }
  return groups;
}

function TrayRow({
  entry,
  floor,
  choosing,
  lifted,
  blinkingKeys,
  busy,
  onChoose,
  onLift,
  onIdentify,
  onRemove,
  onPlaceInArea,
  onSplit,
  onRejoin,
}: TrayActions & {
  entry: TrayFixture;
  floor: MapFloor;
  choosing: boolean;
  lifted: boolean;
}) {
  const nameId = useId();
  const pointer = useRef<{ x: number; y: number; dragged: boolean } | null>(
    null,
  );
  const fixture = entry.fixture;
  const heads = fixture.lights.length;
  const meta = [
    heads > 1 ? `${heads} bulbs` : null,
    entry.floorId && entry.floorId !== floor.id ? entry.floorName : null,
    entry.areaName,
  ].filter(Boolean);

  return (
    <li
      data-selected={choosing || lifted ? "" : undefined}
      title={
        heads > 1
          ? fixture.lights.map((light) => light.name).join(", ")
          : undefined
      }
      className={cn(
        "group/row relative rounded-xl ring-1 ring-inset ring-transparent transition-colors",
        "hover:bg-interactive-hover hover:ring-border",
        "data-[selected]:bg-selection-surface data-[selected]:ring-2 data-[selected]:ring-selection-border",
      )}
    >
      {/* The whole row is the grab target, so a fixture drags from anywhere on
        it rather than out of a handle. The actions sit above this layer. */}
      <button
        type="button"
        aria-labelledby={nameId}
        aria-pressed={choosing}
        disabled={busy}
        onPointerDown={(event) => {
          if (busy || event.button !== 0) return;
          pointer.current = {
            x: event.clientX,
            y: event.clientY,
            dragged: false,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = pointer.current;
          if (
            !start ||
            start.dragged ||
            Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6
          )
            return;
          start.dragged = true;
          onLift(fixture);
        }}
        onPointerCancel={() => {
          pointer.current = null;
        }}
        onClick={() => {
          if (!pointer.current?.dragged) onChoose(choosing ? null : fixture.id);
          pointer.current = null;
        }}
        className="absolute inset-0 cursor-grab touch-none rounded-xl outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring active:cursor-grabbing"
      />

      <div className="pointer-events-none relative flex items-center gap-2 py-1.5 pr-1 pl-2">
        {/* The grip takes the bulb's place under the pointer: it marks the row
          as draggable without claiming to be the only hold on it. */}
        <span className="relative size-4 shrink-0 text-muted-foreground group-hover/row:text-foreground">
          <Lightbulb
            className="size-4 transition-opacity group-hover/row:opacity-0"
            aria-hidden
          />
          <GripVertical
            className="absolute inset-0 size-4 opacity-0 transition-opacity group-hover/row:opacity-100"
            aria-hidden
          />
        </span>
        <span className="min-w-0 flex-1">
          <span id={nameId} className="block truncate text-sm">
            {fixture.name}
          </span>
          {meta.length > 0 && (
            <span className="block truncate text-xs text-muted-foreground">
              {meta.join(" · ")}
            </span>
          )}
        </span>
        <span className="pointer-events-auto flex items-center">
          {fixture.deviceCount > 1 ? (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Split ${fixture.name} into ${fixture.deviceCount} fixtures`}
              title={`Split into ${fixture.deviceCount} fixtures`}
              disabled={busy}
              onClick={() => onSplit(fixture)}
            >
              <Unlink2 />
            </Button>
          ) : entry.rejoins ? (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Group ${fixture.name} back into ${entry.rejoins}`}
              title={`Group back into ${entry.rejoins}`}
              disabled={busy}
              onClick={() => onRejoin(fixture)}
            >
              <Link2 />
            </Button>
          ) : null}
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Identify ${fixture.name}`}
            title="Identify"
            disabled={busy}
            onClick={() => onIdentify(fixture)}
          >
            {blinkingKeys.has(fixture.id) ? (
              <Loader2 className="animate-spin motion-reduce:animate-none" />
            ) : (
              <Crosshair />
            )}
          </Button>
          {entry.floorId ? (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Remove ${fixture.name} from the map`}
              title="Remove marker"
              disabled={busy}
              onClick={() => onRemove(fixture)}
            >
              <X />
            </Button>
          ) : entry.suggestedAreaName ? (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Place ${fixture.name} in ${entry.suggestedAreaName}`}
              title={`Place in ${entry.suggestedAreaName}`}
              disabled={busy}
              onClick={() => onPlaceInArea(entry)}
            >
              <MapPin />
            </Button>
          ) : (
            <span className="size-9 shrink-0" aria-hidden />
          )}
        </span>
      </div>

      {choosing && (
        <p className="pointer-events-none relative pr-2 pb-1.5 pl-8 text-xs">
          Click the map to place it.
        </p>
      )}

      {entry.splitTarget && (
        <p className="pointer-events-none relative pr-2 pb-1.5 pl-8 text-xs text-muted-foreground">
          Its bulbs answer to different Hue spaces.
        </p>
      )}

      {entry.outsideTarget && (
        <p className="pointer-events-none relative pr-2 pb-1.5 pl-8 text-xs text-muted-foreground">
          {entry.areaName} controls a different Hue space.
        </p>
      )}
    </li>
  );
}
