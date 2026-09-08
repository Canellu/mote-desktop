import {
  ArrowLeft,
  Check,
  ChevronRight,
  Layers,
  Lightbulb,
  Power,
  PencilRuler,
  Ruler,
  X,
} from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { MapEditorCanvas, type EditorTool } from "./components/MapEditorCanvas";
import { FloorEditor } from "./components/FloorEditor";
import { EditorToolbar } from "./components/EditorToolbar";
import { PointEditor } from "./components/PointEditor";
import { HueChangeReview } from "./components/HueChangeReview";
import { LightTrayPanel } from "./components/LightTrayPanel";
import { RoomEditorPanel } from "./components/RoomEditorPanel";
import { WallEditor } from "./components/WallEditor";
import { blinkableLightIds, useBlinkLights } from "@/hooks/useBlinkLights";
import { locatePoint, signedArea } from "./geometry";
import {
  calibrateFloorFromWall,
  convertLength,
  releaseWallLength,
  setWallLengthForWall,
} from "./measurements";
import {
  nearestIncrement,
  readSnapSettings,
  writeSnapSettings,
  type SnapSettings,
} from "./snapping";
import type {
  HomeMapDocument,
  MapControlTarget,
  MapFloor,
  MapPoint,
} from "./types";
import { type WallStep } from "./wallDisplay";
import {
  addOutlineArea,
  combineMapAreas,
  removeMapArea,
  renameMapArea,
  setMapAreaTarget,
  splitMapArea,
} from "./operations";
import {
  addFloor,
  buildTray,
  placeLight,
  removeFloor,
  renameFloor,
  unplaceLight,
} from "./placement";
import {
  insertCorner,
  listWalls,
  mergeCorners,
  moveWall,
  removeCorner,
} from "./walls";
import type { HomeMapLighting } from "./lighting";
import { getMapControlScope } from "./controlScope";
import { getFloorControlScope } from "./floorScope";
import { PANEL_INSET, ZOOM_ALLOWANCE } from "./layout";
import {
  lightsInArea,
  type MapHueOperation,
  type QueuedHueOperation,
} from "./hueOperations";
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
  /** Placement spans floors, so it edits the whole map. */
  onEditMap?: (map: HomeMapDocument) => void;
  /** The editor owns the window, so its state lives in the route. */
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
  onUndo?: () => void;
  canUndo?: boolean;
  busy?: boolean;
  /** Reviewed Hue changes waiting for the next save. */
  hueQueue?: QueuedHueOperation[];
  hueRunning?: boolean;
  /** Returns a reason when the change cannot be queued, or null. */
  onQueueHueOperation?: (operation: MapHueOperation) => string | null;
  onRemoveHueOperation?: (operationId: string) => void;
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
  onEditMap,
  editing = false,
  onEditingChange,
  onUndo,
  canUndo = false,
  busy = false,
  hueQueue = [],
  hueRunning = false,
  onQueueHueOperation,
  onRemoveHueOperation,
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
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [wallStep, setWallStep] = useState<WallStep>(0.5);
  const [wallError, setWallError] = useState<string | null>(null);
  const [snap, setSnap] = useState<SnapSettings>(() => readSnapSettings());
  useEffect(() => {
    // Snapping in metres on a foot map would offer no round increments.
    setSnap((current) => {
      const increment = nearestIncrement(current.incrementMeters, map.units);
      if (increment === current.incrementMeters) return current;
      const next = { ...current, incrementMeters: increment };
      writeSnapSettings(next);
      return next;
    });
  }, [map.units]);
  const [tool, setTool] = useState<EditorTool>("select");
  const [combineIds, setCombineIds] = useState<string[]>([]);
  const [selectedVertexId, setSelectedVertexId] = useState<string | null>(null);
  const [placingLightId, setPlacingLightId] = useState<string | null>(null);
  const { blinkingKeys, blink } = useBlinkLights();
  const floor =
    map.floors.find((entry) => entry.id === selectedFloorId) ?? map.floors[0];
  const walls = editing ? listWalls(floor) : [];
  const floorScope = getFloorControlScope({
    document: map,
    floor,
    roomZones,
    lights: lighting.lights,
    syncedLightIds: lighting.syncedLightIds,
    bridgeConnected: lighting.bridgeConnected,
    resourcesLoading: lighting.resourcesLoading,
  });
  const floorOffDisabled =
    floorScope.disabledReason !== null || floorScope.onCount === 0;

  function turnFloorOff() {
    if (floorOffDisabled) return;
    // One command per distinct target: shared targets must not be sent twice.
    for (const target of floorScope.targets) lighting.onToggle(target, false);
  }

  function createFloor() {
    const id = crypto.randomUUID();
    const result = addFloor(map, {
      id,
      name: `Floor ${map.floors.length + 1}`,
    });
    if (!result.ok) {
      setWallError(result.error);
      return;
    }
    setWallError(null);
    onEditMap?.(result.value);
    // A new floor is empty, so the draw tool is the only useful next step.
    onSelect(id, null);
    setSelectedWallId(null);
    setTool("draw");
  }

  function deleteFloor() {
    const result = removeFloor(map, floor.id);
    if (!result.ok) {
      setWallError(result.error);
      return;
    }
    setWallError(null);
    onEditMap?.(result.value);
    onSelect(result.value.floors[0].id, null);
  }

  function drawRoom(ring: MapPoint[]) {
    if (!onEditFloor) return;
    // Named by position for now; renaming and Hue links follow with divide.
    const name = `Room ${floor.areas.length + 1}`;
    const result = addOutlineArea(
      floor,
      ring,
      { id: crypto.randomUUID(), name },
      () => crypto.randomUUID(),
    );
    if (!result.ok) {
      setWallError(result.error);
      return;
    }
    setWallError(null);
    onEditFloor(result.value);
  }

  function applyMapEdit(result: ReturnType<typeof placeLight>) {
    if (!onEditMap) return;
    if (!result.ok) {
      setWallError(result.error);
      return;
    }
    setWallError(null);
    onEditMap(result.value);
  }

  /** Returns whether the edit was accepted, so tools stay open on failure. */
  function applyEdit(result: ReturnType<typeof renameMapArea>) {
    if (!onEditFloor) return false;
    if (!result.ok) {
      setWallError(result.error);
      return false;
    }
    setWallError(null);
    onEditFloor(result.value);
    return true;
  }

  function divideRoom(divider: MapPoint[]) {
    if (!selected) return;
    const applied = applyEdit(
      splitMapArea(
        floor,
        selected.id,
        divider,
        { id: crypto.randomUUID(), name: `${selected.name} 2` },
        () => crypto.randomUUID(),
      ),
    );
    if (applied) setTool("select");
  }

  function combineRooms() {
    const first = floor.areas.find((area) => area.id === combineIds[0]);
    if (!first) return;
    const applied = applyEdit(
      combineMapAreas(floor, combineIds, {
        id: first.id,
        name: first.name,
        target: first.target,
      }),
    );
    if (!applied) return;
    setCombineIds([]);
    setTool("select");
  }

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
  const zoneCandidates = selected
    ? lightsInArea(floor, selected, lighting.lights)
    : [];
  // Devices in this area that Hue still counts as part of another room.
  const moveCandidates = selected?.target
    ? zoneCandidates.filter((light) => {
        const owner = roomZones.find(
          (candidate) =>
            candidate.resourceType === "room" &&
            candidate.lightIds.includes(light.id),
        );
        return Boolean(
          light.deviceId &&
          owner &&
          (selected.target?.resourceType !== "room" ||
            owner.id !== selected.target.resourceId),
        );
      })
    : [];

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

  const panelContent = (
    <>
      {editing ? (
        <div className="space-y-6">
          {hueQueue.length > 0 && (
            <HueChangeReview
              queue={hueQueue}
              lights={lighting.lights}
              roomZones={roomZones}
              running={hueRunning}
              onRemove={(id) => onRemoveHueOperation?.(id)}
            />
          )}
          {onEditMap && (
            <FloorEditor
              map={map}
              floor={floor}
              busy={busy}
              onRename={(name) =>
                applyMapEdit(renameFloor(map, floor.id, name))
              }
              onAddFloor={createFloor}
              onRemoveFloor={deleteFloor}
            />
          )}
          {tool === "points" ? (
            <PointEditor
              floor={floor}
              vertexId={selectedVertexId}
              units={map.units}
              busy={busy}
              onRemove={(id) => {
                if (applyEdit(removeCorner(floor, id)))
                  setSelectedVertexId(null);
              }}
              onMerge={(fromId, intoId) => {
                if (applyEdit(mergeCorners(floor, fromId, intoId)))
                  setSelectedVertexId(intoId);
              }}
              onClear={() => setSelectedVertexId(null)}
            />
          ) : tool === "lights" ? (
            <LightTrayPanel
              entries={buildTray(map, lighting.lights, roomZones)}
              floor={floor}
              placingLightId={placingLightId}
              blinkingKeys={blinkingKeys}
              busy={busy}
              onChoose={setPlacingLightId}
              onIdentify={(light) =>
                void blink(light.id, blinkableLightIds(light, lighting.lights))
              }
              onRemove={(lightId) => applyMapEdit(unplaceLight(map, lightId))}
              onPlaceInArea={(entry) => {
                if (!entry.suggestedFloorId || !entry.suggestedPoint) return;
                applyMapEdit(
                  placeLight(
                    map,
                    entry.suggestedFloorId,
                    entry.light.id,
                    entry.suggestedPoint,
                  ),
                );
                setPlacingLightId(null);
              }}
            />
          ) : (
            <RoomEditorPanel
              floor={floor}
              area={selected}
              roomZones={roomZones}
              combineIds={combineIds}
              dividing={tool === "divide"}
              combining={tool === "combine"}
              busy={busy}
              onRename={(name) =>
                selected && applyEdit(renameMapArea(floor, selected.id, name))
              }
              onLink={(target: MapControlTarget | null) =>
                selected &&
                applyEdit(setMapAreaTarget(floor, selected.id, target))
              }
              onRemove={() => {
                if (!selected) return;
                applyEdit(removeMapArea(floor, selected.id));
                onSelect(floor.id, null);
              }}
              onStartDivide={() => {
                setWallError(null);
                setTool("divide");
              }}
              onStartCombine={() => {
                setWallError(null);
                setCombineIds(selected ? [selected.id] : []);
                setTool("combine");
              }}
              zoneCandidateCount={zoneCandidates.length}
              moveCandidateCount={
                new Set(
                  moveCandidates.flatMap((light) =>
                    light.deviceId ? [light.deviceId] : [],
                  ),
                ).size
              }
              onCreateZone={() => {
                if (!selected || zoneCandidates.length === 0) return;
                setWallError(
                  onQueueHueOperation?.({
                    id: crypto.randomUUID(),
                    kind: "create-zone",
                    areaId: selected.id,
                    name: selected.name,
                    lightIds: zoneCandidates.map((light) => light.id),
                  }) ?? null,
                );
              }}
              onMoveDevices={() => {
                if (
                  !selected?.target ||
                  selected.target.resourceType !== "room" ||
                  moveCandidates.length === 0
                )
                  return;
                const target = roomZones.find(
                  (candidate) =>
                    candidate.id === selected.target?.resourceId &&
                    candidate.resourceType === "room",
                );
                if (!target) return;
                setWallError(
                  onQueueHueOperation?.({
                    id: crypto.randomUUID(),
                    kind: "move-devices",
                    areaId: selected.id,
                    roomId: target.id,
                    roomName: target.name,
                    deviceIds: [
                      ...new Set(
                        moveCandidates.flatMap((light) =>
                          light.deviceId ? [light.deviceId] : [],
                        ),
                      ),
                    ],
                    lightIds: moveCandidates.map((light) => light.id),
                  }) ?? null,
                );
              }}
              onCombine={combineRooms}
              onCancelTool={() => {
                setWallError(null);
                setCombineIds([]);
                setTool("select");
              }}
            />
          )}
          <WallEditor
            measured={map.drawingMode === "measured"}
            onSetLength={(wall, meters) =>
              applyEdit(
                setWallLengthForWall(floor, wall, meters, "start", () =>
                  crypto.randomUUID(),
                ),
              )
            }
            onReleaseLength={(dimension) =>
              applyEdit(releaseWallLength(floor, dimension.id))
            }
            onSetScale={(wall, meters) => {
              const scaled = calibrateFloorFromWall(floor, wall, meters, () =>
                crypto.randomUUID(),
              );
              if (!scaled.ok || !onEditMap) {
                applyEdit(scaled);
                return;
              }
              // A measured scale turns the sketch into a measured plan.
              setWallError(null);
              onEditMap({
                ...map,
                drawingMode: "measured",
                floors: map.floors.map((entry) =>
                  entry.id === floor.id ? scaled.value : entry,
                ),
              });
              setShowDimensions(true);
            }}
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
        </div>
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
        </>
      )}
    </>
  );

  const editorCanvas = (className: string) => (
    <MapEditorCanvas
      floor={floor}
      tool={tool}
      onDrawRoom={drawRoom}
      onDivideRoom={divideRoom}
      placingLightId={placingLightId}
      lightLabels={Object.fromEntries(
        lighting.lights.map((light) => [light.id, light.name]),
      )}
      onPlaceLight={(lightId, point) => {
        applyMapEdit(placeLight(map, floor.id, lightId, point));
        setPlacingLightId(null);
      }}
      combineIds={combineIds}
      onToggleCombine={(areaId) =>
        setCombineIds((current) =>
          current.includes(areaId)
            ? current.filter((id) => id !== areaId)
            : [...current, areaId],
        )
      }
      units={map.units}
      snap={snap}
      selectedAreaId={selected?.id ?? null}
      selectedWallId={selectedWallId}
      onSelectArea={(id) => onSelect(floor.id, id)}
      onSelectWall={setSelectedWallId}
      onCommit={(next) => onEditFloor?.(next)}
      selectedVertexId={selectedVertexId}
      onSelectVertex={setSelectedVertexId}
      onMergeCorners={(fromId, intoId) => {
        if (applyEdit(mergeCorners(floor, fromId, intoId)))
          setSelectedVertexId(intoId);
      }}
      onInsertCorner={(point) => {
        const result = insertCorner(floor, point, () => crypto.randomUUID());
        if (!result.ok) {
          setWallError(result.error);
          return null;
        }
        setWallError(null);
        onEditFloor?.(result.value.floor);
        return result.value;
      }}
      onError={setWallError}
      className={className}
      insetRight={PANEL_INSET}
      overlayInsetClassName="right-[calc(23rem+1.5rem)] 2xl:right-[calc(25rem+1.5rem)]"
    />
  );
  const editorLeading = (
    <>
      <Select
        value={floor.id}
        onValueChange={(value) => {
          if (value) onSelect(value, null);
        }}
      >
        <SelectTrigger size="sm" aria-label="Floor" className="max-w-44">
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
      <Button
        size="icon-sm"
        variant={showDimensions ? "secondary" : "ghost"}
        aria-pressed={showDimensions}
        aria-label="Dimensions"
        title="Dimensions"
        onClick={() => setShowDimensions(!showDimensions)}
      >
        <Ruler />
      </Button>
    </>
  );
  const editorToolbar = (
    <EditorToolbar
      leading={editorLeading}
      rightInset={PANEL_INSET + ZOOM_ALLOWANCE}
      tool={tool}
      snap={snap}
      units={map.units}
      canUndo={canUndo}
      busy={busy}
      onToolChange={(next) => {
        setWallError(null);
        setCombineIds(next === "combine" && selected ? [selected.id] : []);
        setPlacingLightId(null);
        setSelectedWallId(null);
        if (next !== "points") setSelectedVertexId(null);
        setTool(next);
      }}
      onSnapChange={(next) => {
        setSnap(next);
        writeSnapSettings(next);
      }}
      onUndo={() => {
        setWallError(null);
        onUndo?.();
      }}
    />
  );

  if (editing && onEditFloor)
    return (
      <section
        aria-label="Home map editor"
        className="relative h-full min-h-0 w-full overflow-hidden"
      >
        {/* The plan runs behind the floating panel so it can be panned freely. */}
        <div className="absolute inset-0">
          {editorCanvas("h-full w-full rounded-none border-0 bg-transparent")}
        </div>

        {editorToolbar}

        <aside
          aria-label="Map editor panel"
          // The ruler strip fills the top inset, so the panel starts below it.
          className="absolute top-[2.875rem] right-6 bottom-6 z-10 flex w-80 flex-col overflow-hidden rounded-3xl border border-border bg-card text-card-foreground shadow-xl 2xl:w-88"
        >
          <ScrollArea
            fade
            hideScrollbar
            className="min-h-0 flex-1"
            viewportClassName="px-5 py-5"
            contentClassName="min-w-0!"
          >
            {panelContent}
          </ScrollArea>
          <div className="shrink-0 space-y-2 border-t border-border p-5">
            {wallError && (
              <p
                role="alert"
                className="text-sm wrap-anywhere text-destructive"
              >
                {wallError}
              </p>
            )}
            <Button
              className="w-full"
              onClick={() => {
                setSelectedWallId(null);
                setWallError(null);
                setTool("select");
                setCombineIds([]);
                setPlacingLightId(null);
                setSelectedVertexId(null);
                onEditingChange?.(false);
              }}
            >
              Done editing
            </Button>
          </div>
        </aside>
      </section>
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
          className="flex min-w-0 flex-wrap items-center gap-1"
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
          {!editing && (
            <Button
              size="sm"
              variant="ghost"
              disabled={floorOffDisabled}
              aria-describedby={
                floorScope.disabledReason ? "map-floor-scope" : undefined
              }
              title={floorScope.disabledReason ?? undefined}
              onClick={turnFloorOff}
            >
              <Power />
              {floorScope.onCount > 0 && !floorScope.disabledReason
                ? `All off · ${floorScope.onCount} on`
                : "All off on this floor"}
            </Button>
          )}
          {onEditFloor && (
            <Button
              size="sm"
              variant={editing ? "secondary" : "ghost"}
              aria-pressed={editing}
              onClick={() => {
                setSelectedWallId(null);
                setWallError(null);
                setTool("select");
                setCombineIds([]);
                setPlacingLightId(null);
                setSelectedVertexId(null);
                onEditingChange?.(!editing);
              }}
            >
              <PencilRuler />
              {editing ? "Done editing" : "Edit walls"}
            </Button>
          )}
        </div>
      </div>

      {!editing &&
        (floorScope.disabledReason ||
          floorScope.missingTargetAreaNames.length > 0) && (
          <div className="space-y-1">
            {floorScope.disabledReason && (
              <p
                id="map-floor-scope"
                className="text-sm wrap-anywhere text-muted-foreground"
              >
                {`All off on this floor is unavailable. ${floorScope.disabledReason}`}
              </p>
            )}
            {floorScope.missingTargetAreaNames.length > 0 && (
              <p
                role="status"
                className="text-sm wrap-anywhere text-muted-foreground"
              >
                {`${floorScope.missingTargetAreaNames.join(", ")} ${
                  floorScope.missingTargetAreaNames.length === 1 ? "is" : "are"
                } linked to a Hue room or zone that is no longer on this bridge. Open Edit walls to link ${
                  floorScope.missingTargetAreaNames.length === 1 ? "it" : "them"
                } again.`}
              </p>
            )}
          </div>
        )}

      <div className="grid min-w-0 items-start gap-6 min-[1000px]:grid-cols-[minmax(0,1fr)_280px]">
        {
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
          />
        }
        <ScrollArea
          fade
          hideScrollbar
          className={cn(
            "min-w-0",
            editing
              ? "min-[1000px]:h-[min(74vh,860px)]"
              : "min-[1000px]:h-[min(64vh,720px)]",
          )}
          viewportClassName="min-[1000px]:pr-3"
          contentClassName="min-w-0!"
        >
          <aside aria-label="Rooms and selection" className="min-w-0 space-y-6">
            {panelContent}
          </aside>
        </ScrollArea>
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
