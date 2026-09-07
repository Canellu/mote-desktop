import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { MapFloor } from "../types";
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
  onSelectWall,
  onStepChange,
  onMove,
  onUndo,
}: {
  floor: MapFloor;
  walls: MapWall[];
  selectedWallId: string | null;
  units: "metric" | "imperial";
  step: WallStep;
  error: string | null;
  busy: boolean;
  canUndo: boolean;
  onSelectWall: (id: string | null) => void;
  onStepChange: (step: WallStep) => void;
  onMove: (direction: -1 | 1) => void;
  onUndo: () => void;
}) {
  const selected = walls.find((wall) => wall.id === selectedWallId) ?? null;
  const unit = units === "metric" ? "m" : "ft";
  const shared = walls.filter((wall) => wall.dividing);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-medium">Edit walls</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {shared.length > 0
            ? "Moving a shared wall resizes both rooms it separates."
            : "This floor has one room, so every wall is an outside wall."}
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
          <p className="text-xs text-muted-foreground">
            Arrow keys move the selected wall while the map has focus.
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
