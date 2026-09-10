import { useEffect, useId, useMemo, useState } from "react";
import { Combine, Loader2, MousePointer2, PenLine, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useBlinkLights } from "@/hooks/useBlinkLights";
import { useGlobalKeyboardShortcut } from "@/hooks/useGlobalKeyboardShortcut";
import type { HueLight, HueRoomZone } from "@/types/hue";
import { groupFixtures, indexFixtures } from "../fixtures";
import { createHomeMapDocument } from "../creation";
import {
  combineMapAreas,
  removeMapArea,
  renameMapArea,
  splitMapArea,
} from "../operations";
import { buildTray, placeFixture, unplaceFixture } from "../placement";
import {
  nearestIncrement,
  readSnapSettings,
  writeSnapSettings,
} from "../snapping";
import type { HomeMapDocument, MapFloor, MapPoint, MapResult } from "../types";
import { insertCorner, listWalls, mergeCorners } from "../walls";
import { PANEL_INSET } from "../layout";
import {
  readMeasurementDisplay,
  writeMeasurementDisplay,
} from "../measurementDisplay";
import { MapEditorCanvas, type MapViewportControls } from "./MapEditorCanvas";
import { MeasurementDisplayMenu } from "./MeasurementDisplayMenu";
import { LightTrayPanel } from "./LightTrayPanel";
import { SnapSettingsMenu } from "./SnapSettingsMenu";
import { ZoomMenu } from "./ZoomMenu";

type Units = HomeMapDocument["units"];
type Step = "outline" | "rooms" | "lights";
type RoomTool = "move" | "divide" | "combine";

/** The whole map is made here, one decision at a time, in this order. */
const STEPS: { id: Step; title: string; hint: string }[] = [
  { id: "outline", title: "Outline", hint: "Draw the shape of this floor." },
  {
    id: "rooms",
    title: "Rooms",
    hint: "Draw walls across the floor to split it into rooms.",
  },
  {
    id: "lights",
    title: "Lights",
    hint: "Put each light where the lamp actually is.",
  },
];

/** Preview identities stay stable so the canvas keeps its zoom while typing. */
function previewIds() {
  let count = 0;
  return () => `preview-${(count += 1)}`;
}

export function CreateMapWizard({
  bridgeId,
  busy,
  error,
  lights,
  roomZones,
  onCreate,
  onCancel,
  onDirtyChange,
}: {
  bridgeId: string;
  busy: boolean;
  error: string | null;
  lights: HueLight[];
  roomZones: HueRoomZone[];
  onCreate: (document: HomeMapDocument) => void;
  onCancel: () => void;
  /** Tells the screen there is work here that leaving would throw away. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const fieldId = useId();
  const [step, setStep] = useState<Step>("outline");
  const [name, setName] = useState("My home");
  const [floorName, setFloorName] = useState("Ground floor");
  const [units, setUnits] = useState<Units>("metric");
  const [drawnRing, setDrawnRing] = useState<MapPoint[] | null>(null);
  const [zoomControls, setZoomControls] = useState<MapViewportControls | null>(
    null,
  );
  const [snap, setSnapState] = useState(() => readSnapSettings());
  const setSnap = (next: typeof snap) => {
    setSnapState(next);
    writeSnapSettings(next);
  };
  const [measurementDisplay, setMeasurementDisplayState] = useState(() =>
    readMeasurementDisplay(),
  );
  const setMeasurementDisplay = (next: typeof measurementDisplay) => {
    setMeasurementDisplayState(next);
    writeMeasurementDisplay(next);
  };

  // Steps two and three work on a real document that is saved only at the end.
  const [document, setDocument] = useState<HomeMapDocument | null>(null);
  const [builtFrom, setBuiltFrom] = useState<string | null>(null);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [selectedVertexId, setSelectedVertexId] = useState<string | null>(null);
  const [roomTool, setRoomTool] = useState<RoomTool>("move");
  const [placingFixtureId, setPlacingFixtureId] = useState<string | null>(null);
  const [liftedFixtureId, setLiftedFixtureId] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [confirmingExit, setConfirmingExit] = useState(false);
  const [confirmingAreaDelete, setConfirmingAreaDelete] = useState<
    string | null
  >(null);
  const { blinkingKeys, blink } = useBlinkLights();

  /** Changing units restates the same floor; it never resizes it. */
  function changeUnits(next: Units) {
    if (next === units) return;
    setSnap({
      ...snap,
      incrementMeters: nearestIncrement(snap.incrementMeters, next),
    });
    setUnits(next);
  }

  const shape = { kind: "drawn" as const, ring: drawnRing ?? [] };
  const outlineInput = JSON.stringify({ name, floorName, units, shape });

  const preview = useMemo(
    () =>
      createHomeMapDocument({
        bridgeId,
        name,
        drawingMode: "sketch",
        units,
        floorName,
        roomName: "Room 1",
        shape,
        createId: previewIds(),
      }),
    // The shape object is rebuilt every render; depend on its values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bridgeId, outlineInput],
  );
  const drawing = !drawnRing;
  // Nothing is wrong before an outline exists; that is an instruction.
  const problem = drawing || preview.ok ? null : preview.error;
  const blankFloor = useMemo(
    () => ({
      id: "new-floor",
      name: floorName.trim() || "Ground floor",
      vertices: [],
      areas: [],
      dimensions: [],
      lights: [],
    }),
    [floorName],
  );

  const floor = document?.floors[0] ?? null;
  const tray = useMemo(
    () => (document ? buildTray(document, lights, roomZones) : []),
    [document, lights, roomZones],
  );
  // Markers, labels and placement all work on whole products, not single bulbs.
  const fixtures = useMemo(
    () => indexFixtures(groupFixtures(lights)),
    [lights],
  );

  function editFloor(result: MapResult<MapFloor>) {
    if (!result.ok) {
      setStepError(result.error);
      return;
    }
    setStepError(null);
    setDocument((current) =>
      current ? { ...current, floors: [result.value] } : current,
    );
  }

  function editMap(result: MapResult<HomeMapDocument>) {
    if (!result.ok) {
      setStepError(result.error);
      return;
    }
    setStepError(null);
    setDocument(result.value);
  }

  /** Leaving the outline behind builds the document the later steps edit. */
  function openRooms() {
    if (!preview.ok) return;
    setStepError(null);
    // Reshaping the outline restarts the map, so keep what is already divided
    // and placed whenever the outline has not changed.
    if (document && builtFrom === outlineInput) {
      setStep("rooms");
      return;
    }
    const built = createHomeMapDocument({
      bridgeId,
      name,
      drawingMode: "sketch",
      units,
      floorName,
      roomName: "Room 1",
      shape,
    });
    if (!built.ok) {
      setStepError(built.error);
      return;
    }
    setDocument(built.value);
    setBuiltFrom(outlineInput);
    setSelectedAreaId(built.value.floors[0].areas[0]?.id ?? null);
    setStep("rooms");
  }

  function divideRoom(areaId: string, divider: MapPoint[]) {
    if (!floor) return;
    const area = floor.areas.find((entry) => entry.id === areaId);
    if (!area) return;
    const usedNames = new Set(floor.areas.map((entry) => entry.name));
    let roomNumber = floor.areas.length + 1;
    while (usedNames.has(`Room ${roomNumber}`)) roomNumber += 1;
    const newAreaId = crypto.randomUUID();
    const result = splitMapArea(
      floor,
      area.id,
      divider,
      { id: newAreaId, name: `Room ${roomNumber}` },
      () => crypto.randomUUID(),
    );
    editFloor(result);
    if (result.ok) {
      setSelectedAreaId(newAreaId);
      setSelectedWallId(null);
      setRoomTool("move");
    }
  }

  function combineRooms(areaIds: string[]) {
    if (!floor || areaIds.length < 2) return;
    const areas = areaIds.flatMap((id) => {
      const area = floor.areas.find((entry) => entry.id === id);
      return area ? [area] : [];
    });
    if (areas.length < 2) return;
    const target = areas.every(
      (area) => JSON.stringify(area.target) === JSON.stringify(areas[0].target),
    )
      ? areas[0].target
      : null;
    const result = combineMapAreas(floor, areaIds, {
      id: areas[0].id,
      name: areas[0].name,
      target,
    });
    editFloor(result);
    if (result.ok) {
      setSelectedAreaId(areas[0].id);
      setSelectedWallId(null);
      setRoomTool("move");
    }
  }

  function deleteRoom(areaId: string) {
    if (!floor) return;
    const result = removeMapArea(floor, areaId);
    editFloor(result);
    if (!result.ok) return;
    setSelectedAreaId(result.value.areas[0]?.id ?? null);
    setSelectedWallId(null);
    setConfirmingAreaDelete(null);
  }

  const selectedWall =
    floor && selectedWallId
      ? (listWalls(floor).find((wall) => wall.id === selectedWallId) ?? null)
      : null;
  const selectedArea =
    floor && selectedAreaId
      ? (floor.areas.find((area) => area.id === selectedAreaId) ?? null)
      : null;
  const areaPendingDeletion =
    floor && confirmingAreaDelete
      ? (floor.areas.find((area) => area.id === confirmingAreaDelete) ?? null)
      : null;

  function deleteSelection() {
    if (step === "outline" && drawnRing) {
      setDrawnRing(null);
      return;
    }
    if (step !== "rooms" || !floor) return;
    if (selectedWall?.dividing && selectedWall.areaIds.length >= 2) {
      combineRooms(selectedWall.areaIds);
      return;
    }
    if (selectedArea && floor.areas.length > 1) {
      setConfirmingAreaDelete(selectedArea.id);
    }
  }

  useGlobalKeyboardShortcut(
    { key: "Delete", enabled: step !== "lights" },
    deleteSelection,
  );
  useGlobalKeyboardShortcut(
    { key: "Backspace", enabled: step !== "lights" },
    deleteSelection,
  );

  // Nothing here is saved until the last step, so any progress is at risk.
  const dirty = drafting || drawnRing !== null || document !== null;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const stepIndex = STEPS.findIndex((entry) => entry.id === step);
  const current = STEPS[stepIndex];
  const canContinue =
    step === "outline" ? preview.ok && !drawing : document !== null;
  const message = error ?? stepError ?? (step === "outline" ? problem : null);

  const canvas =
    step === "outline" ? (
      drawing ? (
        <MapEditorCanvas
          floor={blankFloor}
          tool="draw"
          units={units}
          snap={snap}
          selectedAreaId={null}
          selectedWallId={null}
          selectedVertexId={null}
          placingFixtureId={null}
          fixtureLabels={{}}
          fixtureOf={{}}
          onSelectArea={() => {}}
          onSelectWall={() => {}}
          onSelectVertex={() => {}}
          onCombineRooms={() => {}}
          onPlaceFixture={() => {}}
          onDivideRoom={() => {}}
          onMergeCorners={() => {}}
          onCommit={() => {}}
          onInsertCorner={() => null}
          onDrawRoom={(ring) => {
            // A new plan is stored from its first corner, without the
            // work area moving under the pointer while it is drawn.
            const [origin] = ring;
            setDrawnRing(
              ring.map((point) => ({
                x: Math.round((point.x - origin.x) * 1e6) / 1e6,
                y: Math.round((point.y - origin.y) * 1e6) / 1e6,
              })),
            );
          }}
          onError={() => {}}
          onDraftingChange={setDrafting}
          className="h-full w-full rounded-none border-0 bg-transparent"
          insetRight={PANEL_INSET}
          onViewportControls={setZoomControls}
        />
      ) : preview.ok ? (
        <MapEditorCanvas
          floor={preview.value.floors[0]}
          tool="view"
          units={units}
          snap={snap}
          measurementDisplay={{ ...measurementDisplay, wallLengths: "all" }}
          selectedAreaId={null}
          selectedWallId={null}
          selectedVertexId={null}
          placingFixtureId={null}
          fixtureLabels={{}}
          fixtureOf={{}}
          onSelectArea={() => {}}
          onSelectWall={() => {}}
          onSelectVertex={() => {}}
          onCombineRooms={() => {}}
          onPlaceFixture={() => {}}
          onDrawRoom={() => {}}
          onDivideRoom={() => {}}
          onMergeCorners={() => {}}
          onCommit={() => {}}
          onInsertCorner={() => null}
          onError={() => {}}
          className="h-full w-full rounded-none border-0 bg-transparent"
          insetRight={PANEL_INSET}
          onViewportControls={setZoomControls}
        />
      ) : (
        <div className="flex h-full items-center justify-center px-6 text-center">
          <p className="max-w-xs text-sm text-muted-foreground">
            {problem ?? "Enter a floor size to see its outline."}
          </p>
        </div>
      )
    ) : floor && document ? (
      <MapEditorCanvas
        floor={floor}
        tool={step === "rooms" ? roomTool : "lights"}
        units={units}
        snap={snap}
        measurementDisplay={measurementDisplay}
        selectedAreaId={selectedAreaId}
        selectedWallId={selectedWallId}
        selectedVertexId={selectedVertexId}
        placingFixtureId={placingFixtureId}
        liftedFixtureId={liftedFixtureId}
        onLiftEnd={() => setLiftedFixtureId(null)}
        fixtureLabels={Object.fromEntries(
          [...fixtures.byId].map(([id, fixture]) => [id, fixture.name]),
        )}
        fixtureOf={Object.fromEntries(fixtures.ofLight)}
        onSelectArea={setSelectedAreaId}
        onSelectWall={setSelectedWallId}
        onSelectVertex={setSelectedVertexId}
        onCombineRooms={combineRooms}
        onPlaceFixture={(fixtureId, point) => {
          const fixture = fixtures.byId.get(fixtureId);
          if (!fixture) return;
          editMap(placeFixture(document, floor.id, fixture.lightIds, point));
          setPlacingFixtureId(null);
        }}
        onDivideRoom={divideRoom}
        onMergeCorners={(fromId, intoId) =>
          editFloor(mergeCorners(floor, fromId, intoId))
        }
        onCommit={(next) => editFloor({ ok: true, value: next })}
        onInsertCorner={(point) => {
          const result = insertCorner(floor, point, () => crypto.randomUUID());
          if (!result.ok) {
            setStepError(result.error);
            return null;
          }
          setStepError(null);
          editFloor({ ok: true, value: result.value.floor });
          return result.value;
        }}
        onDrawRoom={() => {}}
        onError={setStepError}
        className="h-full w-full rounded-none border-0 bg-transparent"
        insetRight={PANEL_INSET}
        onViewportControls={setZoomControls}
      />
    ) : null;

  return (
    <section
      aria-label="Create your home map"
      className="relative h-full min-h-0 w-full overflow-hidden"
    >
      {/* The plan runs behind the panel, so the work area is the page. */}
      <div className="absolute inset-0">{canvas}</div>

      {/* One bottom bar, 24px up, matching the editor's tool pill. */}
      {step !== "lights" && (
        <div
          className="pointer-events-none absolute bottom-6 left-0 flex justify-center"
          style={{ right: PANEL_INSET }}
        >
          <div
            role="group"
            aria-label={step === "outline" ? "Starting point" : "Drawing"}
            // Wraps instead of running off a narrow window.
            className="pointer-events-auto flex max-w-[calc(100%-1.5rem)] flex-wrap items-center justify-center gap-1 rounded-2xl border border-border bg-background/95 p-1.5 shadow-lg backdrop-blur"
          >
            {step === "outline" && drawnRing && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  title="Clear outline (Delete)"
                  onClick={() => setDrawnRing(null)}
                >
                  <Trash2 />
                  Clear outline
                </Button>
                <div className="mx-1 h-5 w-px bg-border" />
              </>
            )}
            {step === "rooms" && (
              <>
                <Button
                  size="sm"
                  variant={roomTool === "move" ? "secondary" : "ghost"}
                  aria-pressed={roomTool === "move"}
                  title="Move walls and points"
                  onClick={() => setRoomTool("move")}
                >
                  <MousePointer2 />
                  Move
                </Button>
                <Button
                  size="sm"
                  variant={roomTool === "divide" ? "secondary" : "ghost"}
                  aria-pressed={roomTool === "divide"}
                  title="Draw divider"
                  onClick={() => {
                    setRoomTool("divide");
                    setSelectedWallId(null);
                  }}
                >
                  <PenLine />
                  Pen
                </Button>
                {selectedArea && floor && floor.areas.length > 1 && (
                  <Button
                    size="sm"
                    variant={roomTool === "combine" ? "secondary" : "ghost"}
                    aria-pressed={roomTool === "combine"}
                    title="Combine the selected room with an adjoining room"
                    onClick={() => {
                      if (roomTool === "combine") setRoomTool("move");
                      else {
                        setRoomTool("combine");
                        setSelectedWallId(null);
                      }
                    }}
                  >
                    <Combine />
                    {roomTool === "combine" ? "Cancel combine" : "Combine"}
                  </Button>
                )}
                {selectedWall?.dividing && selectedWall.areaIds.length >= 2 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    title="Remove selected divider (Delete)"
                    onClick={() => combineRooms(selectedWall.areaIds)}
                  >
                    <Trash2 />
                    Remove divider
                  </Button>
                )}
                {selectedArea &&
                  !selectedWall &&
                  roomTool === "move" &&
                  floor &&
                  floor.areas.length > 1 && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete ${selectedArea.name}`}
                      title="Delete selected room (Delete)"
                      onClick={() => setConfirmingAreaDelete(selectedArea.id)}
                    >
                      <Trash2 />
                    </Button>
                  )}
                <div className="mx-1 h-5 w-px bg-border" />
              </>
            )}
            <SnapSettingsMenu
              settings={snap}
              units={units}
              onChange={setSnap}
            />
            {step === "rooms" && (
              <MeasurementDisplayMenu
                settings={measurementDisplay}
                onChange={setMeasurementDisplay}
              />
            )}
          </div>
        </div>
      )}

      <aside
        aria-label="Map settings"
        // The ruler strip fills the top inset, so the panel starts below it.
        className="absolute top-[2.875rem] right-6 bottom-6 z-10 flex w-80 flex-col overflow-hidden rounded-3xl border border-border bg-card text-card-foreground shadow-xl 2xl:w-88"
      >
        <div className="flex shrink-0 items-start justify-between gap-2 p-5 pr-2 pb-3">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Step {stepIndex + 1} of {STEPS.length}
            </p>
            <h2 className="font-heading text-lg font-semibold">
              {current.title}
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {current.hint}
            </p>
          </div>
          <ZoomMenu controls={zoomControls} />
        </div>

        {/* The steps are the map's own order, so they read as progress. */}
        <ol className="flex shrink-0 gap-1 px-5 pb-3" aria-label="Steps">
          {STEPS.map((entry, index) => (
            <li key={entry.id} className="flex-1">
              <span
                aria-current={entry.id === step ? "step" : undefined}
                aria-label={entry.title}
                className={cn(
                  "block h-1 rounded-full",
                  index <= stepIndex ? "bg-primary" : "bg-border",
                )}
              />
            </li>
          ))}
        </ol>

        <ScrollArea
          fade
          hideScrollbar
          className="min-h-0 flex-1"
          viewportClassName="px-5 pt-1 pb-5"
          contentClassName="min-w-0!"
        >
          <div className="space-y-6 pb-1">
            {step === "outline" && (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor={`${fieldId}-name`}>Map name</Label>
                  <Input
                    id={`${fieldId}-name`}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor={`${fieldId}-units`}>Units</Label>
                    <Select
                      value={units}
                      onValueChange={(value) => changeUnits(value as Units)}
                    >
                      <SelectTrigger id={`${fieldId}-units`} className="w-full">
                        <SelectValue>
                          {units === "metric" ? "Meters" : "Feet"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="metric">Meters</SelectItem>
                        <SelectItem value="imperial">Feet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`${fieldId}-floor`}>Floor name</Label>
                    <Input
                      id={`${fieldId}-floor`}
                      value={floorName}
                      onChange={(event) => setFloorName(event.target.value)}
                    />
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {drawnRing
                    ? "Outline complete. Continue when its shape looks right."
                    : "Click each corner of the floor, then click the first corner or press Enter to close it. Backspace removes the last point; Esc clears the current line."}
                </p>
              </>
            )}

            {step === "rooms" && floor && (
              <div className="space-y-4">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {roomTool === "combine"
                    ? "Drag one room onto another, or click two rooms that touch and then the dot on the wall between them."
                    : roomTool === "divide"
                      ? "Start on one wall and finish on another to divide the room under the pointer."
                      : "Click a room, wall, or corner on the map to select it. Drag walls and corners to reshape the floor."}
                </p>
                <p className="text-xs text-muted-foreground">
                  {floor.areas.length}{" "}
                  {floor.areas.length === 1 ? "room" : "rooms"}
                  {selectedWall?.dividing
                    ? " · Divider selected — press Delete to remove it"
                    : selectedArea
                      ? ` · ${selectedArea.name} selected`
                      : " · Nothing selected"}
                </p>
                {selectedArea && roomTool !== "combine" && (
                  <div className="grid gap-1.5">
                    <Label htmlFor={`${fieldId}-room-name`}>
                      Selected room
                    </Label>
                    <Input
                      id={`${fieldId}-room-name`}
                      aria-label={`Name of ${selectedArea.name}`}
                      value={selectedArea.name}
                      onChange={(event) =>
                        editFloor(
                          renameMapArea(
                            floor,
                            selectedArea.id,
                            event.target.value,
                          ),
                        )
                      }
                    />
                  </div>
                )}
              </div>
            )}

            {step === "lights" && floor && document && (
              <LightTrayPanel
                entries={tray}
                floor={floor}
                placingFixtureId={placingFixtureId}
                liftedFixtureId={liftedFixtureId}
                blinkingKeys={blinkingKeys}
                busy={busy}
                onChoose={setPlacingFixtureId}
                onLift={(fixture) => setLiftedFixtureId(fixture.id)}
                onIdentify={(fixture) =>
                  void blink(fixture.id, fixture.lightIds)
                }
                onRemove={(fixture) =>
                  editMap(unplaceFixture(document, fixture.lightIds))
                }
                onPlaceInArea={(entry) => {
                  if (!entry.suggestedFloorId || !entry.suggestedPoint) return;
                  editMap(
                    placeFixture(
                      document,
                      entry.suggestedFloorId,
                      entry.fixture.lightIds,
                      entry.suggestedPoint,
                    ),
                  );
                  setPlacingFixtureId(null);
                }}
              />
            )}
          </div>
        </ScrollArea>

        <div className="shrink-0 space-y-2 border-t border-border p-5">
          {message && (
            <p role="alert" className="text-sm wrap-anywhere text-destructive">
              {message}
            </p>
          )}
          <Button
            className="w-full"
            disabled={!canContinue || busy}
            onClick={() => {
              if (step === "outline") openRooms();
              else if (step === "rooms") setStep("lights");
              else if (document) onCreate(document);
            }}
          >
            {busy && (
              <Loader2 className="animate-spin motion-reduce:animate-none" />
            )}
            {step === "lights" ? "Create map" : "Next"}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            disabled={busy}
            onClick={() => {
              setStepError(null);
              if (step !== "outline")
                setStep(step === "lights" ? "rooms" : "outline");
              else if (dirty) setConfirmingExit(true);
              else onCancel();
            }}
          >
            {step === "outline" ? "Cancel" : "Back"}
          </Button>
        </div>
      </aside>

      <AlertDialog
        open={areaPendingDeletion !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmingAreaDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {areaPendingDeletion?.name ?? "this room"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the room from the map only. Your Hue room and lights
              are not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (areaPendingDeletion) deleteRoom(areaPendingDeletion.id);
              }}
            >
              Delete room
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmingExit} onOpenChange={setConfirmingExit}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this map?</AlertDialogTitle>
            <AlertDialogDescription>
              Nothing is saved until the last step, so the outline, the rooms
              and the light positions all go with it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep going</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                onDirtyChange?.(false);
                onCancel();
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
