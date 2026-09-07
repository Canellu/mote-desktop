import { useId, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import type { HomeMapDocument } from "../types";
import { MapCanvas } from "./MapCanvas";

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
    <section aria-label="Create your home map" className="px-6 py-6">
      <header className="mb-6">
        <h2 className="text-2xl font-medium">Create your home map</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Start with the outline of one floor. A rough plan is enough to control
          your lights; you can divide it into rooms and place lights afterwards.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="order-2 lg:order-1">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h3 className="text-base font-medium">Preview</h3>
            <p className="text-xs text-muted-foreground">
              Not saved until you create the map.
            </p>
          </div>
          {preview.ok ? (
            <MapCanvas
              floor={preview.value.floors[0]}
              selectedAreaId={null}
              onSelectArea={() => {}}
              showLights={false}
              showDimensions
              units={units}
              className="min-h-[320px]"
            />
          ) : (
            <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-border bg-muted/40 px-6 text-center">
              <p className="text-sm text-muted-foreground">
                Enter a floor size to see its outline.
              </p>
            </div>
          )}
        </div>

        <div className="order-1 space-y-6 lg:order-2">
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

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Floor shape</h3>
            <ChoiceGroup<FloorShape["kind"]>
              label="Floor shape"
              value={kind}
              onChange={setKind}
              options={[
                { value: "rectangle", label: "Rectangle" },
                { value: "l-shape", label: "L-shape" },
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
                    <SelectTrigger id={`${fieldId}-corner`} className="w-full">
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
            <p role="alert" className="text-sm wrap-anywhere text-destructive">
              {error ?? problem}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <Button onClick={submit} disabled={!preview.ok || busy}>
              {busy && (
                <Loader2 className="animate-spin motion-reduce:animate-none" />
              )}
              Create map
            </Button>
            <Button variant="outline" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
