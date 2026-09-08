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
import {
  createHomeMapDocument,
  type FloorShape,
  type NotchCorner,
} from "../creation";
import { convertLength } from "../measurements";
import { readSnapSettings, writeSnapSettings } from "../snapping";
import type { HomeMapDocument } from "../types";
import { MapPreviewCanvas } from "./MapPreviewCanvas";
import { SnapSettingsMenu } from "./SnapSettingsMenu";

type Mode = HomeMapDocument["drawingMode"];
type Units = HomeMapDocument["units"];

const CORNERS: { value: NotchCorner; label: string }[] = [
  { value: "top-left", label: "Top left" },
  { value: "top-right", label: "Top right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-right", label: "Bottom right" },
];

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
  const [kind, setKind] = useState<FloorShape["kind"]>("rectangle");
  const [corner, setCorner] = useState<NotchCorner>("top-right");
  const [width, setWidth] = useState("8");
  const [depth, setDepth] = useState("6");
  const [notchWidth, setNotchWidth] = useState("3");
  const [notchDepth, setNotchDepth] = useState("2");
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
    setNotchWidth(restate(notchWidth));
    setNotchDepth(restate(notchDepth));
    setUnits(next);
  }
  const shape: FloorShape =
    kind === "rectangle"
      ? {
          kind,
          widthMeters: toMeters(width),
          depthMeters: toMeters(depth),
        }
      : {
          kind,
          widthMeters: toMeters(width),
          depthMeters: toMeters(depth),
          notchWidthMeters: toMeters(notchWidth),
          notchDepthMeters: toMeters(notchDepth),
          corner,
        };

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
      kind,
      corner,
      width,
      depth,
      notchWidth,
      notchDepth,
    ],
  );
  const problem = preview.ok ? null : preview.error;

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
      <div className="absolute inset-y-0 right-0 left-0 min-[1000px]:right-92">
        {preview.ok ? (
          <MapPreviewCanvas
            floor={preview.value.floors[0]}
            units={units}
            snap={snap}
            className="h-full w-full rounded-none border-0 bg-transparent"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <p className="max-w-xs text-sm text-muted-foreground">
              {problem ?? "Enter a floor size to see its outline."}
            </p>
          </div>
        )}
      </div>

      <div className="absolute top-6 left-6 z-10">
        <h2 className="font-heading text-xl font-semibold">Create your map</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          One floor to start · divide it and place lights afterwards
        </p>
      </div>

      <div
        role="group"
        aria-label="Floor shape"
        className="absolute top-6 right-6 z-20 flex items-center gap-1 rounded-2xl border border-border bg-background/90 p-1.5 shadow-lg backdrop-blur min-[1000px]:right-[23.5rem] 2xl:right-[25.5rem]"
      >
        <Button
          size="sm"
          variant={kind === "rectangle" ? "secondary" : "ghost"}
          aria-pressed={kind === "rectangle"}
          onClick={() => setKind("rectangle")}
        >
          <RectangleHorizontal />
          Rectangle
        </Button>
        <Button
          size="sm"
          variant={kind === "l-shape" ? "secondary" : "ghost"}
          aria-pressed={kind === "l-shape"}
          onClick={() => setKind("l-shape")}
        >
          <PenLine />
          L-shape
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <SnapSettingsMenu settings={snap} units={units} onChange={setSnap} />
      </div>

      <aside
        aria-label="Map settings"
        className="absolute inset-y-6 right-6 z-10 flex w-80 flex-col overflow-hidden rounded-3xl border border-border bg-card text-card-foreground shadow-xl 2xl:w-88"
      >
        <ScrollArea
          fade
          hideScrollbar
          className="min-h-0 flex-1"
          viewportClassName="p-5"
          contentClassName="min-w-0!"
        >
          <div className="space-y-6">
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
              {kind === "l-shape" && (
                <>
                  <LengthField
                    id={`${fieldId}-notch-width`}
                    label="Cut-out width"
                    unit={unitLabel}
                    value={notchWidth}
                    onChange={setNotchWidth}
                  />
                  <LengthField
                    id={`${fieldId}-notch-depth`}
                    label="Cut-out depth"
                    unit={unitLabel}
                    value={notchDepth}
                    onChange={setNotchDepth}
                  />
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label htmlFor={`${fieldId}-corner`}>Cut-out corner</Label>
                    <Select
                      value={corner}
                      onValueChange={(value) => setCorner(value as NotchCorner)}
                    >
                      <SelectTrigger
                        id={`${fieldId}-corner`}
                        className="w-full"
                      >
                        <SelectValue>
                          {CORNERS.find((option) => option.value === corner)
                            ?.label ?? "Top right"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {CORNERS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
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
        <div className="shrink-0 space-y-3 border-t border-border p-4">
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
