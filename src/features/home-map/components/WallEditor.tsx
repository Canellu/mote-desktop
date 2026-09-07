import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Lock,
  Ruler,
  Undo2,
} from "lucide-react";
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
import { convertLength } from "../measurements";
import type { MapDimension, MapFloor } from "../types";
import { WALL_STEPS, wallLabel, type WallStep } from "../wallDisplay";
import type { MapWall } from "../walls";

export function WallEditor({
  floor,
  walls,
  selectedWallId,
  units,
  step,
  error,
  busy,
  canUndo,
  measured,
  onSelectWall,
  onStepChange,
  onMove,
  onUndo,
  onSetLength,
  onReleaseLength,
  onSetScale,
}: {
  floor: MapFloor;
  walls: MapWall[];
  selectedWallId: string | null;
  units: "metric" | "imperial";
  step: WallStep;
  error: string | null;
  busy: boolean;
  canUndo: boolean;
  /** Measured maps show and keep entered lengths; sketches start with a scale. */
  measured: boolean;
  onSelectWall: (id: string | null) => void;
  onStepChange: (step: WallStep) => void;
  onMove: (direction: -1 | 1) => void;
  onUndo: () => void;
  onSetLength: (wall: MapWall, lengthMeters: number) => void;
  onReleaseLength: (dimension: MapDimension) => void;
  onSetScale: (wall: MapWall, lengthMeters: number) => void;
}) {
  const selected = walls.find((wall) => wall.id === selectedWallId) ?? null;
  const unit = units === "metric" ? "m" : "ft";
  const shared = walls.filter((wall) => wall.dividing);
  const dimension = selected
    ? (floor.dimensions.find(
        (entry) =>
          (entry.startVertexId === selected.startVertexId &&
            entry.endVertexId === selected.endVertexId) ||
          (entry.startVertexId === selected.endVertexId &&
            entry.endVertexId === selected.startVertexId),
      ) ?? null)
    : null;
  const shownLength = selected
    ? convertLength(selected.lengthMeters, "m", unit)
    : 0;
  const [length, setLength] = useState("");
  const selectedLength = selected?.lengthMeters ?? null;
  useEffect(() => {
    setLength(
      selectedLength === null
        ? ""
        : String(
            Math.round(convertLength(selectedLength, "m", unit) * 100) / 100,
          ),
    );
  }, [selectedLength, unit]);

  function submitLength(mode: "length" | "scale") {
    if (!selected) return;
    const entered = Number.parseFloat(length.replace(",", "."));
    if (!Number.isFinite(entered) || entered <= 0) return;
    const meters =
      units === "metric" ? entered : convertLength(entered, "ft", "m");
    if (mode === "scale") onSetScale(selected, meters);
    else onSetLength(selected, meters);
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-medium">Edit walls</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {shared.length > 0
            ? "Drag a wall or a corner on the map. Moving a shared wall resizes both rooms it separates."
            : "Drag a wall or a corner on the map. This floor has one room, so every wall is an outside wall."}
        </p>
      </div>

      {selected ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-3">
          <div>
            <p className="text-sm font-medium">
              {wallLabel(selected, floor, units).kind}
            </p>
            <p className="mt-0.5 text-xs wrap-anywhere text-muted-foreground">
              {wallLabel(selected, floor, units).rooms} ·{" "}
              <span className="tabular-nums">
                {wallLabel(selected, floor, units).length}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="icon-sm"
              variant="outline"
              disabled={busy}
              aria-label={
                selected.orientation === "vertical"
                  ? `Move wall left by ${step} ${unit}`
                  : `Move wall up by ${step} ${unit}`
              }
              onClick={() => onMove(-1)}
            >
              {selected.orientation === "vertical" ? (
                <ArrowLeft />
              ) : (
                <ArrowUp />
              )}
            </Button>
            <Button
              size="icon-sm"
              variant="outline"
              disabled={busy}
              aria-label={
                selected.orientation === "vertical"
                  ? `Move wall right by ${step} ${unit}`
                  : `Move wall down by ${step} ${unit}`
              }
              onClick={() => onMove(1)}
            >
              {selected.orientation === "vertical" ? (
                <ArrowRight />
              ) : (
                <ArrowDown />
              )}
            </Button>
            <Select
              value={String(step)}
              onValueChange={(value) => onStepChange(Number(value) as WallStep)}
            >
              <SelectTrigger size="sm" aria-label="Move distance">
                <SelectValue>{`${step} ${unit}`}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {WALL_STEPS.map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {`${value} ${unit}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="ghost"
              disabled={!canUndo || busy}
              onClick={onUndo}
            >
              <Undo2 />
              Undo
            </Button>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="map-wall-length">
              {measured ? `Length (${unit})` : `Known length (${unit})`}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="map-wall-length"
                inputMode="decimal"
                className="tabular-nums"
                value={length}
                disabled={busy}
                onChange={(event) => setLength(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  submitLength(measured ? "length" : "scale");
                }}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => submitLength(measured ? "length" : "scale")}
              >
                <Ruler />
                {measured ? "Set" : "Set scale"}
              </Button>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {measured
                ? "An entered length is kept, and other walls move to fit it."
                : `This sketch has no scale yet. Entering one wall's real length rescales the floor; it currently reads ${
                    Math.round(shownLength * 100) / 100
                  } ${unit}.`}
            </p>
          </div>
          {dimension?.locked && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="size-3.5" aria-hidden />
                Length kept at{" "}
                <span className="tabular-nums">
                  {Math.round(
                    convertLength(dimension.lengthMeters, "m", unit) * 100,
                  ) / 100}{" "}
                  {unit}
                </span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => onReleaseLength(dimension)}
              >
                Release length
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Drag the wall on the map, or use these buttons. Arrow keys also move
            it while the map has focus.
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Select a wall on the map, or from the list below.
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm wrap-anywhere text-destructive">
          {error}
        </p>
      )}

      {floor.dimensions.some((entry) => entry.locked) && (
        <div>
          <h4 className="mb-1.5 text-xs text-muted-foreground">Kept lengths</h4>
          {/* Any kept length can block an edit, including one on another wall. */}
          <ul className="space-y-1">
            {floor.dimensions
              .filter((entry) => entry.locked)
              .map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Lock className="size-3.5 shrink-0" aria-hidden />
                    <span className="tabular-nums">
                      {Math.round(
                        convertLength(entry.lengthMeters, "m", unit) * 100,
                      ) / 100}{" "}
                      {unit}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => onReleaseLength(entry)}
                  >
                    Release
                  </Button>
                </li>
              ))}
          </ul>
        </div>
      )}

      <ul className="space-y-1">
        {walls.map((wall) => {
          const label = wallLabel(wall, floor, units);
          return (
            <li key={wall.id}>
              <button
                type="button"
                aria-pressed={selectedWallId === wall.id}
                onClick={() => onSelectWall(wall.id)}
                className={cn(
                  "w-full rounded-lg px-3 py-2 text-left transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  selectedWallId === wall.id
                    ? "bg-accent"
                    : "hover:bg-accent/60",
                )}
              >
                <span className="block text-sm">{label.kind}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {label.rooms} ·{" "}
                  <span className="tabular-nums">{label.length}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
