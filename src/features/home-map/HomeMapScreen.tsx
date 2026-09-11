import {
  ChevronDown,
  Layers,
  Lightbulb,
  Power,
  PencilRuler,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { MapPopover } from "./components/MapPopover";
import { MeasurementDisplayMenu } from "./components/MeasurementDisplayMenu";
import { Input } from "@/components/ui/input";
import { PacedSlider } from "@/components/PacedSlider";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { HueRoomZone } from "@/types/hue";
import {
  MapEditorCanvas,
  type EditorTool,
  type MapViewportControls,
} from "./components/MapEditorCanvas";
import { ZoomMenu } from "./components/ZoomMenu";
import { DeleteMapButton } from "./components/DeleteMapButton";
import { EditorToolbar } from "./components/EditorToolbar";
import { PointEditor } from "./components/PointEditor";
import { HueChangeReview } from "./components/HueChangeReview";
import { LightTrayPanel } from "./components/LightTrayPanel";
import { RoomEditorPanel } from "./components/RoomEditorPanel";
import { useBlinkLights } from "@/hooks/useBlinkLights";
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
  placeFixture,
  rejoinFixture,
  removeFloor,
  renameFloor,
  splitFixture,
  targetsOfLights,
  unplaceFixture,
} from "./placement";
import { groupFixtures, indexFixtures } from "./fixtures";
import { insertCorner, mergeCorners, removeCorner } from "./walls";
import type { HomeMapLighting } from "./lighting";
import { getMapControlScope } from "./controlScope";
import { getFloorControlScope } from "./floorScope";
import {
  readMeasurementDisplay,
  writeMeasurementDisplay,
} from "./measurementDisplay";
import {
  lightsInArea,
  type MapHueOperation,
  type QueuedHueOperation,
} from "./hueOperations";
import { MapRoomControls } from "./components/MapRoomControls";
import { RULER_SIZE } from "./components/MapRulers";
import { PANEL_INSET, PANEL_STRIP } from "./layout";
import { cn } from "@/lib/utils";

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
  onDeleteMap?: () => Promise<void>;
  /** The editor owns the window, so its state lives in the route. */
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
  onUndo?: () => void;
  onSave?: () => void;
  onRevert?: () => void;
  hasChanges?: boolean;
  saveError?: string | null;
  canUndo?: boolean;
  busy?: boolean;
  /**
   * Header-row element the map's own actions render into, so the floor menu
   * and the edit controls share the row with the Dashboard/Map switch.
   */
  actionsSlot?: HTMLElement | null;
  /** Reviewed Hue changes waiting for the next save. */
  hueQueue?: QueuedHueOperation[];
  hueRunning?: boolean;
  /** Returns a reason when the change cannot be queued, or null. */
  onQueueHueOperation?: (operation: MapHueOperation) => string | null;
  onRemoveHueOperation?: (operationId: string) => void;
}

export function HomeMapScreen({
  map,
  actionsSlot,
  selectedFloorId,
  selectedAreaId,
  roomZones,
  lighting,
  preview = false,
  onSelect,
  onOpenSpace,
  onEditFloor,
  onEditMap,
  onDeleteMap,
  editing = false,
  onEditingChange,
  onUndo,
  onSave,
  onRevert,
  hasChanges = false,
  saveError,
  canUndo = false,
  busy = false,
  hueQueue = [],
  hueRunning = false,
  onQueueHueOperation,
  onRemoveHueOperation,
}: HomeMapScreenProps) {
  const [showLights, setShowLights] = useState(() => {
    try {
      return localStorage.getItem("mote-map-show-fixtures") !== "false";
    } catch {
      return true;
    }
  });
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [wallError, setWallError] = useState<string | null>(null);
  const [snap, setSnap] = useState<SnapSettings>(() => readSnapSettings());
  const [measurementDisplay, setMeasurementDisplay] = useState(() =>
    readMeasurementDisplay(),
  );
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
  const [tool, setTool] = useState<EditorTool>("move");
  const [selectedVertexId, setSelectedVertexId] = useState<string | null>(null);
  const [zoomControls, setZoomControls] = useState<MapViewportControls | null>(
    null,
  );
  const [placingFixtureId, setPlacingFixtureId] = useState<string | null>(null);
  const [liftedFixtureId, setLiftedFixtureId] = useState<string | null>(null);
  // The tray is a palette docked clear of the plan, not a sheet over it.
  const [trayOpen, setTrayOpen] = useState(false);
  // A fixture in flight, from the tray or off its own marker, so the tray can
  // offer itself as the place to drop it to take it off the map.
  const [fixtureDrag, setFixtureDrag] = useState<{
    fixtureId: string;
    overRemoveZone: boolean;
  } | null>(null);
  const removeZoneRef = useRef<HTMLDivElement>(null);
  const { blinkingKeys, blink } = useBlinkLights();
  // Markers, labels and placement all work on whole products, not single bulbs.
  const fixtures = useMemo(
    () =>
      indexFixtures(
        groupFixtures(lighting.lights, {
          targetOfLight: targetsOfLights(roomZones),
          overrides: map.fixtures,
        }),
      ),
    [lighting.lights, roomZones, map.fixtures],
  );
  // Every bridge fixture measured against the map, so the screen can say how
  // many are still waiting to be placed before the editor is even opened.
  const tray = useMemo(
    () => buildTray(map, lighting.lights, roomZones),
    [map, lighting.lights, roomZones],
  );
  const unplacedCount = tray.filter((entry) => entry.floorId === null).length;
  /** Leaves the editor's transient selections behind before a mode change. */
  function resetEditorSelection() {
    setSelectedWallId(null);
    setWallError(null);
    setPlacingFixtureId(null);
    setSelectedVertexId(null);
  }
  const floor =
    map.floors.find((entry) => entry.id === selectedFloorId) ?? map.floors[0];
  const trayVisible = editing && tool === "lights" && trayOpen;
  // Only a fixture already on the plan can be dropped back out of it.
  const removing = fixtureDrag
    ? tray.find(
        (entry) =>
          entry.fixture.id === fixtureDrag.fixtureId && entry.floorId !== null,
      )
    : undefined;

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

  function applyMapEdit(result: ReturnType<typeof placeFixture>) {
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

  function divideRoom(areaId: string, divider: MapPoint[]) {
    const area = floor.areas.find((entry) => entry.id === areaId);
    if (!area) return;
    const applied = applyEdit(
      splitMapArea(
        floor,
        area.id,
        divider,
        { id: crypto.randomUUID(), name: `${area.name} 2` },
        () => crypto.randomUUID(),
      ),
    );
    if (applied) setTool("move");
  }

  /** The first ID is the room the map keeps: its name and Hue link survive. */
  function combineRooms(areaIds: string[]) {
    const first = floor.areas.find((area) => area.id === areaIds[0]);
    if (!first) return;
    const applied = applyEdit(
      combineMapAreas(floor, areaIds, {
        id: first.id,
        name: first.name,
        target: first.target,
      }),
    );
    if (!applied) return;
    onSelect(floor.id, first.id);
    setTool("move");
  }

  const selected =
    floor.areas.find((area) => area.id === selectedAreaId) ?? null;
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

  const roomDetails = (
    <RoomEditorPanel
      floor={floor}
      area={selected}
      roomZones={roomZones}
      dividing={tool === "divide"}
      combining={tool === "combine"}
      busy={busy}
      onRename={(name) =>
        selected && applyEdit(renameMapArea(floor, selected.id, name))
      }
      onLink={(target: MapControlTarget | null) =>
        selected && applyEdit(setMapAreaTarget(floor, selected.id, target))
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
        setSelectedWallId(null);
        setSelectedVertexId(null);
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
      onCancelTool={() => {
        setWallError(null);
        setTool("move");
      }}
    />
  );
  const fixtureTray = (
    <LightTrayPanel
      entries={tray}
      floor={floor}
      scrollable
      onClose={() => setTrayOpen(false)}
      placingFixtureId={placingFixtureId}
      liftedFixtureId={liftedFixtureId}
      blinkingKeys={blinkingKeys}
      busy={busy}
      onChoose={setPlacingFixtureId}
      onLift={(fixture) => setLiftedFixtureId(fixture.id)}
      onIdentify={(fixture) => void blink(fixture.id, fixture.lightIds)}
      onSplit={(fixture) =>
        applyMapEdit(splitFixture(map, lighting.lights, roomZones, fixture.id))
      }
      onRejoin={(fixture) =>
        applyMapEdit(rejoinFixture(map, lighting.lights, roomZones, fixture.id))
      }
      onRemove={(fixture) =>
        applyMapEdit(unplaceFixture(map, fixture.lightIds))
      }
      onPlaceInArea={(entry) => {
        if (!entry.suggestedFloorId || !entry.suggestedPoint) return;
        applyMapEdit(
          placeFixture(
            map,
            entry.suggestedFloorId,
            entry.fixture.lightIds,
            entry.suggestedPoint,
          ),
        );
        setPlacingFixtureId(null);
      }}
    />
  );
  const pointDetails = (
    <PointEditor
      floor={floor}
      vertexId={selectedVertexId}
      units={map.units}
      busy={busy}
      onRemove={(id) => {
        if (applyEdit(removeCorner(floor, id))) setSelectedVertexId(null);
      }}
      onMerge={(fromId, intoId) => {
        if (applyEdit(mergeCorners(floor, fromId, intoId)))
          setSelectedVertexId(intoId);
      }}
      onClear={() => setSelectedVertexId(null)}
    />
  );

  function roomControl(areaId: string) {
    const area = floor.areas.find((entry) => entry.id === areaId)!;
    if (editing)
      return (
        <MapPopover
          title="Room properties"
          trigger={
            <Button
              size="sm"
              variant="secondary"
              className="max-w-48 truncate"
              onClick={() => onSelect(floor.id, areaId)}
            >
              {area.name}
              <ChevronDown />
            </Button>
          }
        >
          {selected?.id === areaId && roomDetails}
        </MapPopover>
      );
    const scope = getMapControlScope({
      document: map,
      floor,
      area,
      roomZones,
      ...lighting,
    });
    return (
      <div className="flex items-center rounded-xl border border-border bg-background">
        <Button
          size="icon-sm"
          variant={scope.anyOn ? "secondary" : "ghost"}
          aria-label={`Turn ${area.name} ${scope.anyOn ? "off" : "on"}`}
          title={scope.controlsDisabledReason ?? undefined}
          disabled={scope.controlsDisabledReason !== null}
          onClick={() =>
            scope.target && lighting.onToggle(scope.target, !scope.anyOn)
          }
        >
          <Power />
        </Button>
        <MapPopover
          title={area.name}
          trigger={
            <Button size="sm" variant="ghost" className="max-w-36 truncate">
              {area.name}
              <ChevronDown />
            </Button>
          }
        >
          <MapRoomControls
            scope={scope}
            lighting={lighting}
            preview={preview}
            onOpenSpace={onOpenSpace}
          />
        </MapPopover>
      </div>
    );
  }

  function fixtureControl(id: string) {
    const fixture = fixtures.byId.get(id);
    if (!fixture) return null;
    const available = fixture.lights.filter(
      (light) => light.reachable && !lighting.syncedLightIds.includes(light.id),
    );
    const disabled =
      !lighting.bridgeConnected ||
      lighting.resourcesLoading ||
      available.length === 0 ||
      !lighting.onFixtureState;
    const on = fixture.lights.some((light) => light.isOn);
    const brightness = Math.round(
      fixture.lights.reduce(
        (total, light) => total + (light.brightness ?? 0),
        0,
      ) / fixture.lights.length,
    );
    return (
      <MapPopover
        title={fixture.name}
        trigger={
          <Button
            size="icon-sm"
            variant={on ? "secondary" : "outline"}
            aria-label={`Control ${fixture.name}`}
          >
            <Lightbulb />
          </Button>
        }
      >
        <div className="space-y-4">
          <Button
            variant={on ? "secondary" : "outline"}
            disabled={disabled}
            onClick={() => lighting.onFixtureState?.(fixture.lightIds, !on)}
          >
            <Power />
            {on ? "Turn off" : "Turn on"}
          </Button>
          <PacedSlider
            isGroup={false}
            value={Math.max(1, brightness)}
            min={1}
            disabled={disabled}
            ariaLabel={`${fixture.name} brightness`}
            onCommit={(value, phase) => {
              if (phase === "final")
                lighting.onFixtureState?.(fixture.lightIds, true, value);
            }}
          />
          {disabled && (
            <p className="text-sm text-muted-foreground">
              This fixture is offline or controlled by sync.
            </p>
          )}
        </div>
      </MapPopover>
    );
  }

  const floorMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="sm" aria-label="Floors" />}
      >
        <Layers />
        {floor.name}
        <ChevronDown />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-52">
        {map.floors.map((entry) => (
          <DropdownMenuItem
            key={entry.id}
            onClick={() => {
              resetEditorSelection();
              onSelect(entry.id, null);
            }}
          >
            {entry.name}
          </DropdownMenuItem>
        ))}
        {editing && onEditMap && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={busy} onClick={createFloor}>
              <Plus />
              Add floor
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={busy || map.floors.length < 2}
              onClick={deleteFloor}
            >
              <Trash2 />
              Remove {floor.name}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  /**
   * Floor and map actions live in the Home header row, in line with the
   * Dashboard/Map switch, so the map keeps one row of chrome above the plan.
   */
  const actions = (
    <>
      {floorMenu}
      {editing && (
        <MapPopover
          title="Rename floor"
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label="Rename floor">
              <PencilRuler />
            </Button>
          }
        >
          <Input
            key={floor.id + floor.name}
            aria-label="Floor name"
            defaultValue={floor.name}
            onBlur={(event) => {
              if (
                event.target.value.trim() &&
                event.target.value !== floor.name
              )
                applyMapEdit(renameFloor(map, floor.id, event.target.value));
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        </MapPopover>
      )}
      {preview && (
        <span className="text-xs text-muted-foreground">Example home</span>
      )}
      {editing ? (
        <>
          {hueQueue.length > 0 && (
            <MapPopover
              title="Hue changes"
              trigger={
                <Button size="sm" variant="outline">
                  Review changes · {hueQueue.length}
                </Button>
              }
            >
              <HueChangeReview
                queue={hueQueue}
                lights={lighting.lights}
                roomZones={roomZones}
                running={hueRunning}
                onRemove={(id) => onRemoveHueOperation?.(id)}
              />
            </MapPopover>
          )}
          {onDeleteMap && (
            <DeleteMapButton
              mapName={map.name}
              busy={busy}
              onDelete={onDeleteMap}
            />
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !hasChanges}
            onClick={onRevert}
          >
            Revert changes
          </Button>
          <Button size="sm" disabled={busy} onClick={onSave}>
            Save
          </Button>
        </>
      ) : (
        onEditFloor && (
          <Button
            size="sm"
            onClick={() => {
              resetEditorSelection();
              setTool("move");
              onEditingChange?.(true);
            }}
          >
            <PencilRuler />
            Edit
          </Button>
        )
      )}
    </>
  );

  return (
    <section
      aria-label={editing ? "Home map editor" : "Home map"}
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden"
    >
      {actionsSlot && createPortal(actions, actionsSlot)}
      <div className="relative min-h-0 flex-1">
        <MapEditorCanvas
          floor={floor}
          tool={editing ? tool : "view"}
          renderAreaControl={roomControl}
          renderFixtureControl={fixtureControl}
          showLights={showLights}
          onDrawRoom={drawRoom}
          onDivideRoom={divideRoom}
          onCombineRooms={combineRooms}
          placingFixtureId={editing ? placingFixtureId : null}
          liftedFixtureId={editing ? liftedFixtureId : null}
          onLiftEnd={() => setLiftedFixtureId(null)}
          removeZoneRef={removeZoneRef}
          onRemoveFixture={(id) => {
            const fixture = fixtures.byId.get(id);
            if (fixture) applyMapEdit(unplaceFixture(map, fixture.lightIds));
            setPlacingFixtureId(null);
          }}
          onFixtureDragChange={setFixtureDrag}
          fixtureLabels={Object.fromEntries(
            [...fixtures.byId].map(([id, fixture]) => [id, fixture.name]),
          )}
          fixtureOf={Object.fromEntries(fixtures.ofLight)}
          onPlaceFixture={(id, position) => {
            const fixture = fixtures.byId.get(id);
            if (fixture)
              applyMapEdit(
                placeFixture(map, floor.id, fixture.lightIds, position),
              );
            setPlacingFixtureId(null);
          }}
          units={map.units}
          snap={snap}
          measurementDisplay={measurementDisplay}
          selectedAreaId={editing ? (selected?.id ?? null) : null}
          selectedWallId={editing ? selectedWallId : null}
          onSelectArea={(id) => onSelect(floor.id, id)}
          onSelectWall={setSelectedWallId}
          onCommit={(next) => onEditFloor?.(next)}
          selectedVertexId={editing ? selectedVertexId : null}
          onSelectVertex={setSelectedVertexId}
          onMergeCorners={(fromId, intoId) => {
            if (applyEdit(mergeCorners(floor, fromId, intoId)))
              setSelectedVertexId(intoId);
          }}
          onInsertCorner={(position) => {
            const result = insertCorner(floor, position, () =>
              crypto.randomUUID(),
            );
            if (!result.ok) {
              setWallError(result.error);
              return null;
            }
            onEditFloor?.(result.value.floor);
            return result.value;
          }}
          onError={setWallError}
          className="h-full w-full rounded-none border-0 bg-transparent"
          insetRight={trayVisible ? PANEL_INSET : 0}
          showNavigationHint={false}
          onViewportControls={setZoomControls}
        />
        {/* The tray is a palette you drag out of, so it keeps to the right
          edge and leaves the plan — and the middle of the window — clear. It
          runs the height of the grid, which starts below the top ruler; there
          is no ruler along the bottom, so the inset is equal from there. */}
        {trayVisible && (
          <div
            className="absolute right-6 bottom-6 z-20 flex w-80 flex-col rounded-2xl border border-border bg-background/95 p-4 shadow-lg backdrop-blur"
            style={{ top: RULER_SIZE + 24 }}
          >
            {fixtureTray}
            {/* Dropping a placed fixture back into the tray takes it off the
              plan — the whole product, every bulb, in one drag. */}
            {removing && (
              <div
                ref={removeZoneRef}
                className={cn(
                  "pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed backdrop-blur-sm transition-colors",
                  fixtureDrag?.overRemoveZone
                    ? "border-destructive bg-destructive/15 text-destructive"
                    : "border-border bg-background/70 text-muted-foreground",
                )}
              >
                <Trash2 className="size-6" />
                <p className="px-6 text-center text-sm font-medium">
                  Drop here to remove {removing.fixture.name} from the map
                </p>
              </div>
            )}
          </div>
        )}
        {editing && (
          <EditorToolbar
            rightInset={trayVisible ? PANEL_STRIP : 0}
            tool={tool}
            snap={snap}
            measurements={measurementDisplay}
            units={map.units}
            canUndo={canUndo}
            busy={busy}
            onToolChange={(next) => {
              resetEditorSelection();
              setTool(next);
              // Picking the tool is the request for the tray; it opens with it.
              setTrayOpen(next === "lights");
              if (next === "lights") setShowLights(true);
            }}
            onSnapChange={(next) => {
              setSnap(next);
              writeSnapSettings(next);
            }}
            onMeasurementChange={(next) => {
              setMeasurementDisplay(next);
              writeMeasurementDisplay(next);
            }}
            onUndo={() => {
              setWallError(null);
              onUndo?.();
            }}
            leading={
              tool === "lights" ? (
                <Button
                  size="sm"
                  variant={trayOpen ? "secondary" : "ghost"}
                  aria-pressed={trayOpen}
                  aria-label="Fixtures"
                  onClick={() => setTrayOpen((open) => !open)}
                >
                  <Lightbulb />
                  Fixtures
                  {unplacedCount > 0 && (
                    <span className="text-muted-foreground tabular-nums">
                      · {unplacedCount} left
                    </span>
                  )}
                </Button>
              ) : selectedVertexId ? (
                <MapPopover
                  title="Corner"
                  trigger={
                    <Button size="sm" variant="secondary">
                      Corner
                    </Button>
                  }
                >
                  {pointDetails}
                </MapPopover>
              ) : undefined
            }
          />
        )}
        {/* Every control that acts on the plan itself floats in one corner,
          clear of the plan and of the editor's tool bar. */}
        <div
          className="absolute top-6 z-20 flex items-center gap-1 rounded-xl border border-border bg-background p-1 transition-[right] duration-200"
          style={{ right: trayVisible ? PANEL_STRIP : 24 }}
          aria-label="Map controls"
        >
          {!editing && (
            <>
              <Button
                size="sm"
                variant="ghost"
                disabled={floorOffDisabled}
                title={floorScope.disabledReason ?? undefined}
                onClick={turnFloorOff}
              >
                <Power />
                All off
              </Button>
              <div className="mx-0.5 h-5 w-px bg-border" />
            </>
          )}
          <MeasurementDisplayMenu
            settings={measurementDisplay}
            showLights={showLights}
            onShowLightsChange={(next) => {
              setShowLights(next);
              try {
                localStorage.setItem("mote-map-show-fixtures", String(next));
              } catch {
                /* Session preference still applies. */
              }
            }}
            onChange={(next) => {
              setMeasurementDisplay(next);
              writeMeasurementDisplay(next);
            }}
          />
          <ZoomMenu controls={zoomControls} />
        </div>
        {(wallError || saveError || lighting.error) && (
          <p
            role="alert"
            className="absolute top-12 left-1/2 z-30 max-w-lg -translate-x-1/2 rounded-xl border border-border bg-background px-4 py-3 text-sm text-destructive"
          >
            {wallError || saveError || lighting.error}
          </p>
        )}
      </div>
    </section>
  );
}
