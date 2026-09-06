import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Layers,
  Lightbulb,
  Ruler,
  X,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { HueRoomZone } from "@/types/hue";
import { MapCanvas } from "./components/MapCanvas";
import { locatePoint, signedArea } from "./geometry";
import type { HomeMapDocument } from "./types";

export interface HomeMapScreenProps {
  map: HomeMapDocument;
  selectedFloorId?: string;
  selectedAreaId?: string;
  roomZones: HueRoomZone[];
  preview?: boolean;
  onSelect: (floorId: string, areaId: string | null) => void;
  onOpenSpace: (id: string) => void;
}

export function HomeMapScreen({
  map,
  selectedFloorId,
  selectedAreaId,
  roomZones,
  preview = false,
  onSelect,
  onOpenSpace,
}: HomeMapScreenProps) {
  const [showLights, setShowLights] = useState(true);
  const [showDimensions, setShowDimensions] = useState(
    map.drawingMode === "measured",
  );
  const floor =
    map.floors.find((entry) => entry.id === selectedFloorId) ?? map.floors[0];
  const selected =
    floor.areas.find((area) => area.id === selectedAreaId) ?? null;
  const vertices = new Map(floor.vertices.map((vertex) => [vertex.id, vertex]));
  const ringFor = (ids: string[]) => ids.map((id) => vertices.get(id)!);
  const target = selected?.target
    ? roomZones.find(
        (room) =>
          room.id === selected.target!.resourceId &&
          room.resourceType === selected.target!.resourceType,
      )
    : null;
  const areaSize = selected
    ? Math.abs(signedArea(ringFor(selected.vertexIds)))
    : 0;
  const areaText = `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(map.units === "metric" ? areaSize : areaSize / 0.3048 ** 2)} ${map.units === "metric" ? "m²" : "ft²"}`;

  return (
    <section aria-label="Home map" className="min-w-0 space-y-5">
      {preview && (
        <p role="status" className="text-sm text-muted-foreground">
          Example home · Preview only. Your home and lights are unchanged.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Select
            value={floor.id}
            onValueChange={(value) => {
              if (value) onSelect(value, null);
            }}
          >
            <SelectTrigger aria-label="Floor" className="max-w-64">
              <Layers />
              <SelectValue>{floor.name}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {map.floors.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">
            {floor.areas.length} rooms · {floor.lights.length} placed lights
          </span>
        </div>
        <div
          role="group"
          aria-label="Map details"
          className="flex items-center gap-1"
        >
          <Button
            size="sm"
            variant={showLights ? "secondary" : "ghost"}
            aria-pressed={showLights}
            onClick={() => setShowLights(!showLights)}
          >
            <Lightbulb />
            Lights
          </Button>
          <Button
            size="sm"
            variant={showDimensions ? "secondary" : "ghost"}
            aria-pressed={showDimensions}
            onClick={() => setShowDimensions(!showDimensions)}
          >
            <Ruler />
            Dimensions
          </Button>
        </div>
      </div>

      <div className="grid min-w-0 items-start gap-6 min-[1000px]:grid-cols-[minmax(0,1fr)_240px]">
        <MapCanvas
          key={`${map.id}:${floor.id}`}
          floor={floor}
          selectedAreaId={selected?.id ?? null}
          onSelectArea={(id) => onSelect(floor.id, id)}
          showLights={showLights}
          showDimensions={showDimensions}
          units={map.units}
          className="h-[min(64vh,720px)] min-h-[400px]"
        />
        <aside aria-label="Rooms and selection" className="min-w-0 space-y-6">
          <div>
            <h2 className="mb-3 text-base font-medium">Rooms on this floor</h2>
            <ul className="grid gap-1 min-[750px]:max-[999px]:grid-cols-2">
              {floor.areas.map((area) => {
                const count = floor.lights.filter(
                  (light) =>
                    locatePoint(light, ringFor(area.vertexIds)) === "inside",
                ).length;
                const active = selected?.id === area.id;
                return (
                  <li key={area.id}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => onSelect(floor.id, area.id)}
                      className={cn(
                        "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active
                          ? "bg-selection-surface text-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {area.name}
                        </span>
                        <span className="text-xs">
                          {count} placed {count === 1 ? "light" : "lights"}
                        </span>
                      </span>
                      {active ? (
                        <Check className="size-4 shrink-0" />
                      ) : (
                        <ChevronRight className="size-4 shrink-0" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            {floor.areas.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No rooms on this floor yet.
              </p>
            )}
          </div>
          <div className="border-t border-border pt-5" aria-live="polite">
            {selected ? (
              <>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="min-w-0 wrap-anywhere text-xl font-medium">
                    {selected.name}
                  </h3>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Clear room selection"
                    onClick={() => onSelect(floor.id, null)}
                  >
                    <X />
                  </Button>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {areaText}
                  {map.drawingMode === "sketch" ? " · Approximate" : ""}
                </p>
                {preview ? (
                  <p className="mt-4 text-sm text-muted-foreground">
                    Select rooms to explore this example floor plan.
                  </p>
                ) : target ? (
                  <>
                    <p className="mt-4 text-sm text-muted-foreground">
                      Linked to {target.name} · {target.lightIds.length} lights
                    </p>
                    <Button
                      className="mt-3"
                      variant="outline"
                      onClick={() => onOpenSpace(target.id)}
                    >
                      Open room controls
                      <ArrowUpRight />
                    </Button>
                  </>
                ) : (
                  <p className="mt-4 text-sm text-muted-foreground">
                    {selected.target
                      ? "The linked Hue room or zone is unavailable."
                      : "This area has no linked lights."}
                  </p>
                )}
              </>
            ) : (
              <>
                <h3 className="text-base font-medium">Select a room</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Choose a room on the map or in the list to see its details.
                </p>
              </>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
