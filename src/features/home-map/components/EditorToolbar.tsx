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
  leading,
  rightInset,
  onToolChange,
  onSnapChange,
  onUndo,
}: {
  tool: EditorTool;
  snap: SnapSettings;
  units: "metric" | "imperial";
  canUndo: boolean;
  busy: boolean;
  /** Floor and layer controls, kept in the same bar as the tools. */
  leading?: React.ReactNode;
  /** Width taken by the panel and the zoom group, so the bar centres clear. */
  rightInset: number;
  onToolChange: (tool: EditorTool) => void;
  onSnapChange: (settings: SnapSettings) => void;
  onUndo: () => void;
}) {
  return (
    // Centred on the strip the panel and the zoom group leave free.
    <div
      className="pointer-events-none absolute bottom-6 left-0 flex justify-center"
      style={{ right: rightInset }}
    >
      <div
        role="toolbar"
        aria-label="Map editor tools"
        aria-orientation="horizontal"
        className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-border bg-background/95 p-1.5 shadow-lg backdrop-blur"
      >
        {leading}
        {leading && <div className="mx-1 h-5 w-px bg-border" />}
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
        <SnapSettingsMenu
          settings={snap}
          units={units}
          onChange={onSnapChange}
        />
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
    </div>
  );
}
