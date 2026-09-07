import {
  ArrowLeft,
  Check,
  ChevronRight,
  Layers,
  Lightbulb,
  PencilRuler,
  Ruler,
  X,
} from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { HueRoomZone } from "@/types/hue";
import { MapCanvas } from "./components/MapCanvas";
import { WallEditor } from "./components/WallEditor";
import { locatePoint, signedArea } from "./geometry";
import { convertLength } from "./measurements";
import type { HomeMapDocument, MapFloor } from "./types";
import { type WallStep } from "./wallDisplay";
import { listWalls, moveWall } from "./walls";
import type { HomeMapLighting } from "./lighting";
import { getMapControlScope } from "./controlScope";
import { MapRoomControls } from "./components/MapRoomControls";

const wideQuery = "(min-width: 1000px)";
function subscribeToWidth(notify: () => void) {
  const query = window.matchMedia(wideQuery);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}

export interface HomeMapScreenProps {
  map: HomeMapDocument;
  selectedFloorId?: string;
  selectedAreaId?: string;
  roomZones: HueRoomZone[];
  lighting: HomeMapLighting;
  preview?: boolean;
  onSelect: (floorId: string, areaId: string | null) => void;
  onOpenSpace: (id: string) => void;
  /** Provided only where geometry edits can be kept as a draft. */
  onEditFloor?: (floor: MapFloor) => void;
  onUndo?: () => void;
  canUndo?: boolean;
  busy?: boolean;
}

export function HomeMapScreen({
  map,
  selectedFloorId,
  selectedAreaId,
  roomZones,
  lighting,
  preview = false,
  onSelect,
  onOpenSpace,
  onEditFloor,
  onUndo,
  canUndo = false,
  busy = false,
}: HomeMapScreenProps) {
  const wide = useSyncExternalStore(
    subscribeToWidth,
    () => window.matchMedia(wideQuery).matches,
    () => true,
  );
  const [showLights, setShowLights] = useState(true);
  const [showDimensions, setShowDimensions] = useState(
    map.drawingMode === "measured",
  );
  const [editing, setEditing] = useState(false);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [wallStep, setWallStep] = useState<WallStep>(0.5);
  const [wallError, setWallError] = useState<string | null>(null);
  const floor =
    map.floors.find((entry) => entry.id === selectedFloorId) ?? map.floors[0];
  const walls = editing ? listWalls(floor) : [];

  function moveSelectedWall(direction: -1 | 1) {
    if (!onEditFloor || !selectedWallId) return;
    // The step is shown in the map's units; geometry stays in meters.
    const meters =
      map.units === "metric" ? wallStep : convertLength(wallStep, "ft", "m");
    const result = moveWall(floor, selectedWallId, direction * meters);
    if (!result.ok) {
      setWallError(result.error);
      return;
    }
    setWallError(null);
    onEditFloor(result.value);
  }
  const selected =
    floor.areas.find((area) => area.id === selectedAreaId) ?? null;
  const vertices = new Map(floor.vertices.map((vertex) => [vertex.id, vertex]));
  const ringFor = (ids: string[]) => ids.map((id) => vertices.get(id)!);
  const scope = selected
    ? getMapControlScope({
        document: map,
        floor,
        area: selected,
        roomZones,
        ...lighting,
      })
    : null;
  const areaSize = selected
    ? Math.abs(signedArea(ringFor(selected.vertexIds)))
    : 0;
  const areaText = `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(map.units === "metric" ? areaSize : areaSize / 0.3048 ** 2)} ${map.units === "metric" ? "m²" : "ft²"}`;
  const selectionDetails =
    selected && scope ? (
      <>
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 wrap-anywhere text-xl font-medium">
            {selected.name}
          </h3>
          {wide && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Clear room selection"
              onClick={() => onSelect(floor.id, null)}
            >
              <X />
            </Button>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {areaText}
          {map.drawingMode === "sketch" ? " · Approximate" : ""}
        </p>
        <MapRoomControls
          key={`${map.bridgeId}:${selected.id}:${scope.target?.id ?? "unlinked"}`}
          scope={scope}
          lighting={lighting}
          preview={preview}
          onOpenSpace={onOpenSpace}
        />
      </>
    ) : (
      <>
        <h3 className="text-base font-medium">Select a room</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Choose a room on the map or in the list to control its lights.
        </p>
      </>
    );

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
            {floor.areas.length} {floor.areas.length === 1 ? "room" : "rooms"} ·{" "}
            {floor.lights.length} placed{" "}
            {floor.lights.length === 1 ? "light" : "lights"}
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
          {onEditFloor && (
            <Button
              size="sm"
              variant={editing ? "secondary" : "ghost"}
              aria-pressed={editing}
              onClick={() => {
                setSelectedWallId(null);
                setWallError(null);
                setEditing(!editing);
                if (!editing) onSelect(floor.id, null);
              }}
            >
              <PencilRuler />
              {editing ? "Done editing" : "Edit walls"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid min-w-0 items-start gap-6 min-[1000px]:grid-cols-[minmax(0,1fr)_280px]">
        <MapCanvas
          key={`${map.id}:${floor.id}`}
          floor={floor}
          selectedAreaId={selected?.id ?? null}
          controlledAreaIds={scope?.currentFloorAreaIds}
          onSelectArea={(id) => onSelect(floor.id, id)}
          showLights={showLights}
          showDimensions={showDimensions}
          units={map.units}
          className="h-[min(64vh,720px)] min-h-[400px]"
          mode={editing ? "walls" : "select"}
          selectedWallId={selectedWallId}
          onSelectWall={(id) => {
            setWallError(null);
            setSelectedWallId(id);
          }}
          onMoveSelectedWall={moveSelectedWall}
        />
        <aside aria-label="Rooms and selection" className="min-w-0 space-y-6">
          {editing ? (
            <WallEditor
              floor={floor}
              walls={walls}
              selectedWallId={selectedWallId}
              units={map.units}
              step={wallStep}
              error={wallError}
              busy={busy}
              canUndo={canUndo}
              onSelectWall={(id) => {
                setWallError(null);
                setSelectedWallId(id);
              }}
              onStepChange={setWallStep}
              onMove={moveSelectedWall}
              onUndo={() => {
                setWallError(null);
                onUndo?.();
              }}
            />
          ) : (
            <>
              {wide && (
                <section
                  aria-label="Selected room controls"
                  className="border-b border-border pb-6"
                >
                  {selectionDetails}
                </section>
              )}
              <div>
                <h2 className="mb-3 text-base font-medium">
                  Rooms on this floor
                </h2>
                <ul className="grid gap-1 min-[750px]:max-[999px]:grid-cols-2">
                  {floor.areas.map((area) => {
                    const count = floor.lights.filter(
                      (light) =>
                        locatePoint(light, ringFor(area.vertexIds)) ===
                        "inside",
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
            </>
          )}
        </aside>
      </div>
      {!wide && (
        <Sheet
          open={selected !== null && !editing}
          onOpenChange={(open) => {
            if (!open) onSelect(floor.id, null);
          }}
        >
          <SheetContent
            side="right"
            showCloseButton={false}
            className="overflow-y-auto p-6 motion-reduce:transition-none"
          >
            <Button
              variant="ghost"
              className="mb-5 self-start"
              onClick={() => onSelect(floor.id, null)}
            >
              <ArrowLeft />
              Back to map
            </Button>
            <SheetTitle className="sr-only">
              {selected?.name ?? "Room"} controls
            </SheetTitle>
            <SheetDescription className="sr-only">
              Control the linked Hue room or zone.
            </SheetDescription>
            {selectionDetails}
          </SheetContent>
        </Sheet>
      )}
    </section>
  );
}
