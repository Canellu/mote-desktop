import { Crosshair, GripVertical, MapPin, Loader2, X } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MapFloor } from "../types";
import type { MapFixture } from "../fixtures";
import type { TrayFixture } from "../placement";

export function LightTrayPanel({
  entries,
  floor,
  placingFixtureId,
  liftedFixtureId,
  blinkingKeys,
  busy,
  onChoose,
  onLift,
  onIdentify,
  onRemove,
  onPlaceInArea,
}: {
  entries: TrayFixture[];
  floor: MapFloor;
  placingFixtureId: string | null;
  /** The fixture being dragged out of the tray right now. */
  liftedFixtureId: string | null;
  blinkingKeys: ReadonlySet<string>;
  busy: boolean;
  onChoose: (fixtureId: string | null) => void;
  /** Starts a drag onto the map; the canvas follows the pointer from here. */
  onLift: (fixture: MapFixture) => void;
  onIdentify: (fixture: MapFixture) => void;
  onRemove: (fixture: MapFixture) => void;
  /** Places without aiming, so a mouse drag is never required. */
  onPlaceInArea: (entry: TrayFixture) => void;
}) {
  const onThisFloor = entries.filter((entry) => entry.floorId === floor.id);
  const elsewhere = entries.filter(
    (entry) => entry.floorId !== null && entry.floorId !== floor.id,
  );
  const unplaced = entries.filter((entry) => entry.floorId === null);
  const pointer = useRef<{ x: number; y: number; dragged: boolean } | null>(
    null,
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-medium">Place fixtures</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {`${onThisFloor.length} of ${entries.length} placed on ${floor.name}.`}{" "}
          Drag a fixture onto the map, or select it and click its position. A
          fixture with several bulbs is placed as one marker.
        </p>
      </div>

      {entries.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No lights are available from this bridge.
        </p>
      )}

      {[
        { title: "Not placed", rows: unplaced },
        { title: `On ${floor.name}`, rows: onThisFloor },
        { title: "On other floors", rows: elsewhere },
      ]
        .filter((group) => group.rows.length > 0)
        .map((group) => (
          <div key={group.title}>
            <h4 className="mb-1.5 text-xs text-muted-foreground">
              {group.title}
            </h4>
            <ul className="space-y-1">
              {group.rows.map((entry) => {
                const fixture = entry.fixture;
                const choosing = placingFixtureId === fixture.id;
                const lifted = liftedFixtureId === fixture.id;
                const heads = fixture.lights.length;
                return (
                  <li
                    key={fixture.id}
                    className={cn(
                      "rounded-lg px-2 py-1.5",
                      (choosing || lifted) && "bg-accent",
                    )}
                  >
                    <div className="flex items-center gap-1">
                      <GripVertical
                        className="size-4 shrink-0 text-muted-foreground/60"
                        aria-hidden
                      />
                      <button
                        type="button"
                        aria-pressed={choosing}
                        disabled={busy}
                        onPointerDown={(event) => {
                          if (busy || event.button !== 0) return;
                          pointer.current = {
                            x: event.clientX,
                            y: event.clientY,
                            dragged: false,
                          };
                          event.currentTarget.setPointerCapture(
                            event.pointerId,
                          );
                        }}
                        onPointerMove={(event) => {
                          const start = pointer.current;
                          if (
                            !start ||
                            start.dragged ||
                            Math.hypot(
                              event.clientX - start.x,
                              event.clientY - start.y,
                            ) < 6
                          )
                            return;
                          start.dragged = true;
                          onLift(fixture);
                        }}
                        onPointerCancel={() => {
                          pointer.current = null;
                        }}
                        onClick={() => {
                          if (!pointer.current?.dragged)
                            onChoose(choosing ? null : fixture.id);
                          pointer.current = null;
                        }}
                        className="min-w-0 flex-1 cursor-grab touch-none select-none rounded text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:cursor-grabbing"
                      >
                        <span className="block truncate text-sm">
                          {fixture.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {heads > 1 ? `${heads} bulbs · ` : ""}
                          {entry.target
                            ? `Controlled by ${entry.target.name}`
                            : "Not in a Hue room or zone"}
                          {entry.floorName && entry.areaName
                            ? ` · ${entry.areaName}`
                            : ""}
                        </span>
                      </button>
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
                        <MapPin
                          className="mx-2 size-4 shrink-0 text-muted-foreground/30"
                          aria-hidden
                        />
                      )}
                    </div>

                    {heads > 1 && (
                      <p className="mt-1 truncate pl-5 text-xs text-muted-foreground/80">
                        {fixture.lights.map((light) => light.name).join(", ")}
                      </p>
                    )}

                    {entry.splitTarget && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Its bulbs answer to different Hue rooms or zones.
                      </p>
                    )}

                    {entry.outsideTarget && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Sitting in {entry.areaName}, which controls a different
                        Hue room or zone.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
    </div>
  );
}
