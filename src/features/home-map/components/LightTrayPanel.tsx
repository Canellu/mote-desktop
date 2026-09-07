import { Crosshair, GripVertical, MapPin, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HueLight } from "@/types/hue";
import type { MapFloor } from "../types";
import type { TrayLight } from "../placement";

export function LightTrayPanel({
  entries,
  floor,
  placingLightId,
  blinkingKeys,
  busy,
  onChoose,
  onIdentify,
  onRemove,
  onPlaceInArea,
}: {
  entries: TrayLight[];
  floor: MapFloor;
  placingLightId: string | null;
  blinkingKeys: ReadonlySet<string>;
  busy: boolean;
  onChoose: (lightId: string | null) => void;
  onIdentify: (light: HueLight) => void;
  onRemove: (lightId: string) => void;
  /** Places without aiming, so a mouse click on the canvas is never required. */
  onPlaceInArea: (entry: TrayLight) => void;
}) {
  const onThisFloor = entries.filter((entry) => entry.floorId === floor.id);
  const elsewhere = entries.filter(
    (entry) => entry.floorId !== null && entry.floorId !== floor.id,
  );
  const unplaced = entries.filter((entry) => entry.floorId === null);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-medium">Place lights</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {`${onThisFloor.length} of ${entries.length} placed on ${floor.name}.`}{" "}
          Drag a light onto the map, or select it and click its position.
          Markers show where a lamp is; its room membership still decides what a
          control affects.
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
                const choosing = placingLightId === entry.light.id;
                return (
                  <li
                    key={entry.light.id}
                    className={cn(
                      "rounded-lg px-2 py-1.5",
                      choosing && "bg-accent",
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
                        draggable={!busy}
                        onDragStart={(event) => {
                          event.dataTransfer.setData(
                            "text/plain",
                            entry.light.id,
                          );
                          event.dataTransfer.effectAllowed = "move";
                          onChoose(entry.light.id);
                        }}
                        onDragEnd={() => onChoose(null)}
                        onClick={() =>
                          onChoose(choosing ? null : entry.light.id)
                        }
                        className="min-w-0 flex-1 cursor-grab rounded text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:cursor-grabbing"
                      >
                        <span className="block truncate text-sm">
                          {entry.light.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
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
                        aria-label={`Identify ${entry.light.name}`}
                        title="Identify"
                        disabled={busy}
                        onClick={() => onIdentify(entry.light)}
                      >
                        {blinkingKeys.has(entry.light.id) ? (
                          <Loader2 className="animate-spin motion-reduce:animate-none" />
                        ) : (
                          <Crosshair />
                        )}
                      </Button>
                      {entry.floorId ? (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Remove ${entry.light.name} from the map`}
                          title="Remove marker"
                          disabled={busy}
                          onClick={() => onRemove(entry.light.id)}
                        >
                          <X />
                        </Button>
                      ) : entry.suggestedAreaName ? (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Place ${entry.light.name} in ${entry.suggestedAreaName}`}
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
