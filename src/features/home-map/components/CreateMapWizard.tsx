import { useEffect, useId, useMemo, useState } from "react";
import { Loader2, PenLine, RectangleHorizontal } from "lucide-react";
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
import { blinkableLightIds, useBlinkLights } from "@/hooks/useBlinkLights";
import type { HueLight, HueRoomZone } from "@/types/hue";
import { createHomeMapDocument, type FloorShape } from "../creation";
import { convertLength } from "../measurements";
import { renameMapArea, splitMapArea } from "../operations";
import { buildTray, placeLight, unplaceLight } from "../placement";
import {
  nearestIncrement,
  readSnapSettings,
  writeSnapSettings,
} from "../snapping";
import type { HomeMapDocument, MapFloor, MapPoint, MapResult } from "../types";
import { PANEL_INSET } from "../layout";
import { MapEditorCanvas, type MapViewportControls } from "./MapEditorCanvas";
import { MapPreviewCanvas } from "./MapPreviewCanvas";
import { LightTrayPanel } from "./LightTrayPanel";
import { SnapSettingsMenu } from "./SnapSettingsMenu";
import { ZoomMenu } from "./ZoomMenu";

type Mode = HomeMapDocument["drawingMode"];
type Units = HomeMapDocument["units"];
type Step = "outline" | "rooms" | "lights";

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

function LengthField({
  id,
  label,
  unit,
  value,
  onChange,
}: {
  id: string;
  label: string;
  unit: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {label} ({unit})
      </Label>
      <Input
        id={id}
        inputMode="decimal"
        className="tabular-nums"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
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
  // Drawing is the starting point; a rectangle is the shortcut for the
  // common case, and any shape can be reshaped afterwards in the editor.
  const [source, setSource] = useState<"draw" | "rectangle">("draw");
  // Typed sides are measurements; a drawn outline stays a sketch until a wall
  // is measured in the editor, which promotes the map on its own.
  const mode: Mode = source === "rectangle" ? "measured" : "sketch";
  const [drawnRing, setDrawnRing] = useState<MapPoint[] | null>(null);
  const [width, setWidth] = useState("8");
  const [depth, setDepth] = useState("6");
  const [zoomControls, setZoomControls] = useState<MapViewportControls | null>(
    null,
  );
  const [snap, setSnapState] = useState(() => readSnapSettings());
  const setSnap = (next: typeof snap) => {
    setSnapState(next);
    writeSnapSettings(next);
  };

  // Steps two and three work on a real document that is saved only at the end.
  const [document, setDocument] = useState<HomeMapDocument | null>(null);
  const [builtFrom, setBuiltFrom] = useState<string | null>(null);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [placingLightId, setPlacingLightId] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [confirmingExit, setConfirmingExit] = useState(false);
  const { blinkingKeys, blink } = useBlinkLights();

  const unitLabel = units === "metric" ? "m" : "ft";
  const parse = (value: string) => Number.parseFloat(value.replace(",", "."));
  const toMeters = (value: string) => {
    const parsed = parse(value);
    if (!Number.isFinite(parsed)) return Number.NaN;
    return units === "metric" ? parsed : convertLength(parsed, "ft", "m");
  };

  /** Changing units restates the same floor; it never resizes it. */
  function changeUnits(next: Units) {
    if (next === units) return;
    const from = units === "metric" ? "m" : "ft";
    const to = next === "metric" ? "m" : "ft";
    const restate = (value: string) => {
      const parsed = parse(value);
      if (!Number.isFinite(parsed)) return value;
      return String(Math.round(convertLength(parsed, from, to) * 100) / 100);
    };
    setWidth(restate(width));
    setDepth(restate(depth));
    setSnap({
      ...snap,
      incrementMeters: nearestIncrement(snap.incrementMeters, next),
    });
    setUnits(next);
  }

  const shape: FloorShape =
    source === "rectangle"
      ? {
          kind: "rectangle",
          widthMeters: toMeters(width),
          depthMeters: toMeters(depth),
        }
      : { kind: "drawn", ring: drawnRing ?? [] };
  const outlineInput = JSON.stringify({ name, floorName, units, mode, shape });

  const preview = useMemo(
    () =>
      createHomeMapDocument({
        bridgeId,
        name,
        drawingMode: mode,
        units,
        floorName,
        roomName: "Whole floor",
        shape,
        createId: previewIds(),
      }),
    // The shape object is rebuilt every render; depend on its values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bridgeId, outlineInput],
  );
  const drawing = source === "draw" && !drawnRing;
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
      drawingMode: mode,
      units,
      floorName,
      roomName: "Whole floor",
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

  function divideRoom(divider: MapPoint[]) {
    if (!floor || !selectedAreaId) return;
    const area = floor.areas.find((entry) => entry.id === selectedAreaId);
    if (!area) return;
    editFloor(
      splitMapArea(
        floor,
        area.id,
        divider,
        { id: crypto.randomUUID(), name: `${area.name} 2` },
        () => crypto.randomUUID(),
      ),
    );
  }

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
          combineIds={[]}
          placingLightId={null}
          lightLabels={{}}
          onSelectArea={() => {}}
          onSelectWall={() => {}}
          onSelectVertex={() => {}}
          onToggleCombine={() => {}}
          onPlaceLight={() => {}}
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
        <MapPreviewCanvas
          floor={preview.value.floors[0]}
          units={units}
          snap={snap}
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
        tool={step === "rooms" ? "divide" : "lights"}
        units={units}
        snap={snap}
        selectedAreaId={selectedAreaId}
        selectedWallId={null}
        selectedVertexId={null}
        combineIds={[]}
        placingLightId={placingLightId}
        lightLabels={Object.fromEntries(
          lights.map((light) => [light.id, light.name]),
        )}
        onSelectArea={setSelectedAreaId}
        onSelectWall={() => {}}
        onSelectVertex={() => {}}
        onToggleCombine={() => {}}
        onPlaceLight={(lightId, point) => {
          editMap(placeLight(document, floor.id, lightId, point));
          setPlacingLightId(null);
        }}
        onDivideRoom={divideRoom}
        onMergeCorners={() => {}}
        onCommit={(next) => editFloor({ ok: true, value: next })}
        onInsertCorner={() => null}
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

      {/* One bottom bar, on the feedback button's baseline. */}
      {step !== "lights" && (
        <div
          className="pointer-events-none absolute bottom-6 left-0 flex justify-center"
          style={{ right: PANEL_INSET }}
        >
          <div
            role="group"
            aria-label={step === "outline" ? "Starting point" : "Drawing"}
            className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-border bg-background/95 p-1.5 shadow-lg backdrop-blur"
          >
            {step === "outline" && (
              <>
                <Button
                  size="sm"
                  variant={source === "draw" ? "secondary" : "ghost"}
                  aria-pressed={source === "draw"}
                  onClick={() => {
                    setSource("draw");
                    setDrawnRing(null);
                  }}
                >
                  <PenLine />
                  Draw outline
                </Button>
                <Button
                  size="sm"
                  variant={source === "rectangle" ? "secondary" : "ghost"}
                  aria-pressed={source === "rectangle"}
                  onClick={() => setSource("rectangle")}
                >
                  <RectangleHorizontal />
                  Rectangle
                </Button>
                <div className="mx-1 h-5 w-px bg-border" />
              </>
            )}
            <SnapSettingsMenu
              settings={snap}
              units={units}
              onChange={setSnap}
            />
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
                  {source === "rectangle" && (
                    <>
                      <LengthField
                        id={`${fieldId}-width`}
                        label="Width"
                        unit={unitLabel}
                        value={width}
                        onChange={setWidth}
                      />
                      <LengthField
                        id={`${fieldId}-depth`}
                        label="Depth"
                        unit={unitLabel}
                        value={depth}
                        onChange={setDepth}
                      />
                    </>
                  )}
                </div>
                {source === "draw" && (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {drawnRing
                      ? "Outline drawn. Continue to split it into rooms."
                      : "Click corners on the plan to draw the outline. Close it by clicking the first corner, pressing Enter, or double-clicking. Backspace removes the last corner and Esc starts over."}
                  </p>
                )}
                {source === "draw" && drawnRing && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => setDrawnRing(null)}
                  >
                    Draw it again
                  </Button>
                )}
              </>
            )}

            {step === "rooms" && floor && (
              <div className="space-y-4">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Select a room, then click one of its walls and the wall
                  opposite to draw the divider. Esc cancels a half-drawn wall.
                  Leaving the floor as one room is fine; it can be divided
                  later.
                </p>
                <div className="space-y-2">
                  {floor.areas.map((area) => (
                    <div
                      key={area.id}
                      className={cn(
                        "space-y-1 rounded-xl border p-2",
                        area.id === selectedAreaId
                          ? "border-foreground/40 bg-primary/10"
                          : "border-border",
                      )}
                    >
                      <Input
                        aria-label={`Name of ${area.name}`}
                        value={area.name}
                        onFocus={() => setSelectedAreaId(area.id)}
                        onChange={(event) =>
                          editFloor(
                            renameMapArea(floor, area.id, event.target.value),
                          )
                        }
                      />
                      {area.id === selectedAreaId ? (
                        <p className="text-xs text-muted-foreground">
                          Draw the divider across this room.
                        </p>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="w-full"
                          onClick={() => setSelectedAreaId(area.id)}
                        >
                          Divide this room
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === "lights" && floor && document && (
              <LightTrayPanel
                entries={tray}
                floor={floor}
                placingLightId={placingLightId}
                blinkingKeys={blinkingKeys}
                busy={busy}
                onChoose={setPlacingLightId}
                onIdentify={(light) =>
                  void blink(light.id, blinkableLightIds(light, lights))
                }
                onRemove={(lightId) => editMap(unplaceLight(document, lightId))}
                onPlaceInArea={(entry) => {
                  if (!entry.suggestedFloorId || !entry.suggestedPoint) return;
                  editMap(
                    placeLight(
                      document,
                      entry.suggestedFloorId,
                      entry.light.id,
                      entry.suggestedPoint,
                    ),
                  );
                  setPlacingLightId(null);
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
