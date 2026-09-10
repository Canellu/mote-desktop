import { Merge, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { convertLength } from "../measurements";
import type { MapFloor } from "../types";
import { nearestCorner } from "../walls";

/** Point actions that need no dragging: remove, or weld onto the nearest one. */
export function PointEditor({
  floor,
  vertexId,
  units,
  busy,
  onRemove,
  onMerge,
  onClear,
}: {
  floor: MapFloor;
  vertexId: string | null;
  units: "metric" | "imperial";
  busy: boolean;
  onRemove: (vertexId: string) => void;
  onMerge: (fromVertexId: string, intoVertexId: string) => void;
  onClear: () => void;
}) {
  const vertex = floor.vertices.find((entry) => entry.id === vertexId) ?? null;
  const unit = units === "metric" ? "m" : "ft";
  const rooms = vertex
    ? floor.areas
        .filter((area) => area.vertexIds.includes(vertex.id))
        .map((area) => area.name)
    : [];
  const nearest = vertex ? nearestCorner(floor, vertex.id) : null;
  const gap = nearest ? convertLength(nearest.distanceMeters, "m", unit) : 0;

  if (!vertex)
    return (
      <div className="space-y-2">
        <h3 className="text-base font-medium">Points</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Square handles are corners. Hover a wall for the dashed circle that
          adds one. Select a corner to remove it or merge it with another.
        </p>
      </div>
    );

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-medium">Corner</h3>
        <p className="mt-1 text-xs wrap-anywhere text-muted-foreground">
          <span className="tabular-nums">
            {convertLength(vertex.x, "m", unit).toFixed(2)},{" "}
            {convertLength(vertex.y, "m", unit).toFixed(2)} {unit}
          </span>
          {rooms.length > 0 && ` · ${rooms.join(", ")}`}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => onRemove(vertex.id)}
        >
          <Trash2 />
          Remove point
        </Button>
        {nearest && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onMerge(vertex.id, nearest.vertexId)}
          >
            <Merge />
            Merge with nearest ({gap.toFixed(2)} {unit})
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onClear}>
          Clear
        </Button>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Dropping a corner on another merges them, and every room using a corner
        keeps sharing it.
      </p>
    </div>
  );
}
