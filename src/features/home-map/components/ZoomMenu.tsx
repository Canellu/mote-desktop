import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MapViewportControls } from "./MapEditorCanvas";

/** The zoom readout doubles as its menu, as drawing tools usually do. */
export function ZoomMenu({
  controls,
}: {
  controls: MapViewportControls | null;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            disabled={!controls}
            aria-label={
              controls ? `Zoom, currently ${controls.percent}%` : "Zoom"
            }
            className="px-2 text-xs tabular-nums"
          />
        }
      >
        {controls ? `${controls.percent}%` : "—"}
        <ChevronDown className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem onClick={() => controls?.zoomIn()}>
          Zoom in
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => controls?.zoomOut()}>
          Zoom out
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => controls?.fit()}>
          Zoom to fit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {[50, 100, 200].map((percent) => (
          <DropdownMenuItem
            key={percent}
            onClick={() => controls?.zoomTo(percent)}
          >
            Zoom to {percent}%
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
