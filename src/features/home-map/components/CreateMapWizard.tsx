import { useId, useMemo, useState } from "react";
import { Loader2, PenLine, RectangleHorizontal } from "lucide-react";
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
import { createHomeMapDocument, type FloorShape } from "../creation";
import { convertLength } from "../measurements";
import {
  nearestIncrement,
  readSnapSettings,
  writeSnapSettings,
} from "../snapping";
import type { HomeMapDocument, MapPoint } from "../types";
import { PANEL_INSET, ZOOM_ALLOWANCE } from "../layout";
import { MapEditorCanvas } from "./MapEditorCanvas";
import { MapPreviewCanvas } from "./MapPreviewCanvas";
import { SnapSettingsMenu } from "./SnapSettingsMenu";

type Mode = HomeMapDocument["drawingMode"];
type Units = HomeMapDocument["units"];

/** Preview identities stay stable so the canvas keeps its zoom while typing. */
function previewIds() {
  let count = 0;
  return () => `preview-${(count += 1)}`;
}

function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-lg border px-3 py-2 text-left transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            value === option.value
              ? "border-foreground/40 bg-primary/10"
              : "border-border bg-card hover:bg-accent",
          )}
        >
          <span className="block text-sm font-medium">{option.label}</span>
          {option.hint && (
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {option.hint}
            </span>
          )}
        </button>
      ))}
    </div>
  );
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
  onCreate,
  onCancel,
}: {
  bridgeId: string;
  busy: boolean;
  error: string | null;
  onCreate: (document: HomeMapDocument) => void;
  onCancel: () => void;
}) {
  const fieldId = useId();
  const [name, setName] = useState("My home");
  const [floorName, setFloorName] = useState("Ground floor");
  const [roomName, setRoomName] = useState("Whole floor");
  const [mode, setMode] = useState<Mode>("measured");
  const [units, setUnits] = useState<Units>("metric");
  // Drawing is the starting point; a rectangle is the shortcut for the
  // common case, and any shape can be reshaped afterwards in the editor.
  const [source, setSource] = useState<"draw" | "rectangle">("draw");
  const [drawnRing, setDrawnRing] = useState<MapPoint[] | null>(null);
  const [width, setWidth] = useState("8");
  const [depth, setDepth] = useState("6");
  const [snap, setSnapState] = useState(() => readSnapSettings());
  const setSnap = (next: typeof snap) => {
    setSnapState(next);
    writeSnapSettings(next);
  };

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

  const preview = useMemo(
    () =>
      createHomeMapDocument({
        bridgeId,
        name,
        drawingMode: mode,
        units,
        floorName,
        roomName,
        shape,
        createId: previewIds(),
      }),
    // The shape object is rebuilt every render; depend on its values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      bridgeId,
      name,
      floorName,
      roomName,
      mode,
      units,
      source,
      drawnRing,
      width,
      depth,
    ],
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

  function submit() {
    const created = createHomeMapDocument({
      bridgeId,
      name,
      drawingMode: mode,
      units,
      floorName,
      roomName,
      shape,
    });
    if (created.ok) onCreate(created.value);
  }

  return (
    <section
      aria-label="Create your home map"
      className="relative h-full min-h-0 w-full overflow-hidden"
    >
      {/* The outline runs behind the panel, so the work area is the page. */}
      <div className="absolute inset-0">
        {drawing ? (
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
            onDrawRoom={(ring) => setDrawnRing([...ring])}
            onError={() => {}}
            className="h-full w-full rounded-none border-0 bg-transparent"
            insetRight={PANEL_INSET}
            overlayInsetClassName="right-[calc(23rem+1.5rem)] 2xl:right-[calc(25rem+1.5rem)]"
          />
        ) : preview.ok ? (
          <MapPreviewCanvas
            floor={preview.value.floors[0]}
            units={units}
            snap={snap}
            className="h-full w-full rounded-none border-0 bg-transparent"
            insetRight={PANEL_INSET}
            overlayInsetClassName="right-[calc(23rem+1.5rem)] 2xl:right-[calc(25rem+1.5rem)]"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <p className="max-w-xs text-sm text-muted-foreground">
              {problem ?? "Enter a floor size to see its outline."}
            </p>
          </div>
        )}
      </div>

      {/* One bottom bar, on the feedback button's baseline. */}
      <div
        className="pointer-events-none absolute bottom-6 left-0 flex justify-center"
        style={{ right: PANEL_INSET + ZOOM_ALLOWANCE }}
      >
        <div
          role="group"
          aria-label="Starting point"
          className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-border bg-background/95 p-1.5 shadow-lg backdrop-blur"
        >
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
          <SnapSettingsMenu settings={snap} units={units} onChange={setSnap} />
        </div>
      </div>

      <aside
        aria-label="Map settings"
        // The ruler strip fills the top inset, so the panel starts below it.
        className="absolute top-[2.875rem] right-6 bottom-6 z-10 flex w-80 flex-col overflow-hidden rounded-3xl border border-border bg-card text-card-foreground shadow-xl 2xl:w-88"
      >
        <div className="shrink-0 space-y-1 p-5 pb-3">
          <h2 className="font-heading text-lg font-semibold">
            Create your map
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            One floor to start · divide it and place lights afterwards
          </p>
        </div>
        <ScrollArea
          fade
          hideScrollbar
          className="min-h-0 flex-1"
          viewportClassName="px-5 pt-1 pb-5"
          contentClassName="min-w-0!"
        >
          <div className="space-y-6 pb-1">
            <div className="grid gap-1.5">
              <Label htmlFor={`${fieldId}-name`}>Map name</Label>
              <Input
                id={`${fieldId}-name`}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-medium">Drawing mode</h3>
              <ChoiceGroup<Mode>
                label="Drawing mode"
                value={mode}
                onChange={setMode}
                options={[
                  {
                    value: "sketch",
                    label: "Quick sketch",
                    hint: "Approximate sizes, no measurements shown.",
                  },
                  {
                    value: "measured",
                    label: "Measured plan",
                    hint: "Keeps the lengths you enter.",
                  },
                ]}
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
              {source === "draw" && (
                <p className="text-sm leading-relaxed text-muted-foreground sm:col-span-2">
                  {drawnRing
                    ? "Outline drawn. Create the map, then reshape it in the editor."
                    : "Click corners on the plan to draw the outline, then click the first corner to close it."}
                </p>
              )}
              {source === "draw" && drawnRing && (
                <Button
                  size="sm"
                  variant="outline"
                  className="sm:col-span-2"
                  onClick={() => setDrawnRing(null)}
                >
                  Draw it again
                </Button>
              )}
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor={`${fieldId}-room`}>Room name</Label>
                <Input
                  id={`${fieldId}-room`}
                  value={roomName}
                  onChange={(event) => setRoomName(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  The whole floor starts as one room. Divide and link it to your
                  Hue rooms later.
                </p>
              </div>
            </div>

            {/* The reason stays with the fields that fix it. */}
            {(error || problem) && (
              <p
                role="alert"
                className="text-sm wrap-anywhere text-destructive"
              >
                {error ?? problem}
              </p>
            )}
          </div>
        </ScrollArea>
        <div className="shrink-0 space-y-2 border-t border-border p-5">
          {(error || problem) && (
            <p role="alert" className="text-sm wrap-anywhere text-destructive">
              {error ?? problem}
            </p>
          )}
          <Button
            className="w-full"
            onClick={submit}
            disabled={!preview.ok || busy}
          >
            {busy && (
              <Loader2 className="animate-spin motion-reduce:animate-none" />
            )}
            Create map
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </Button>
        </div>
      </aside>
    </section>
  );
}
