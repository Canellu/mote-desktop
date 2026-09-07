import {
  Combine,
  Lightbulb,
  MousePointer2,
  PenLine,
  Scissors,
  Spline,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EditorTool } from "./MapEditorCanvas";
import { SnapSettingsMenu } from "./SnapSettingsMenu";
import type { SnapSettings } from "../snapping";

const TOOLS: {
  value: EditorTool;
  label: string;
  icon: typeof MousePointer2;
}[] = [
  { value: "select", label: "Select", icon: MousePointer2 },
  { value: "points", label: "Points", icon: Spline },
  { value: "draw", label: "Draw room", icon: PenLine },
  { value: "divide", label: "Divide room", icon: Scissors },
  { value: "combine", label: "Combine rooms", icon: Combine },
  { value: "lights", label: "Place lights", icon: Lightbulb },
];

/** Floats over the plan so the canvas stays the centre of the editor. */
export function EditorToolbar({
  tool,
  snap,
  units,
  canUndo,
  busy,
  onToolChange,
  onSnapChange,
  onUndo,
}: {
  tool: EditorTool;
  snap: SnapSettings;
  units: "metric" | "imperial";
  canUndo: boolean;
  busy: boolean;
  onToolChange: (tool: EditorTool) => void;
  onSnapChange: (settings: SnapSettings) => void;
  onUndo: () => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Map editor tools"
      aria-orientation="horizontal"
      className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-border bg-background/95 p-1.5 shadow-lg backdrop-blur"
    >
      {TOOLS.map((entry) => {
        const Icon = entry.icon;
        const active = tool === entry.value;
        return (
          <Button
            key={entry.value}
            size="icon-sm"
            variant={active ? "secondary" : "ghost"}
            aria-pressed={active}
            aria-label={entry.label}
            title={entry.label}
            disabled={busy}
            className={cn(active && "text-foreground")}
            onClick={() => onToolChange(entry.value)}
          >
            <Icon />
          </Button>
        );
      })}
      <div className="mx-1 h-5 w-px bg-border" />
      <SnapSettingsMenu settings={snap} units={units} onChange={onSnapChange} />
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Undo"
        title="Undo"
        disabled={!canUndo || busy}
        onClick={onUndo}
      >
        <Undo2 />
      </Button>
    </div>
  );
}
