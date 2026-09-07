import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { convertLength } from "../measurements";
import type { MapFloor, MapPoint } from "../types";
import { listWalls } from "../walls";
import {
  getAreaLabelPoint,
  getAreaLabelWidth,
  getMapBounds,
} from "../viewGeometry";

interface MapCanvasProps {
  floor: MapFloor;
  selectedAreaId: string | null;
  controlledAreaIds?: string[];
  onSelectArea: (id: string | null) => void;
  showLights?: boolean;
  showDimensions?: boolean;
  units: "metric" | "imperial";
  className?: string;
  /** "walls" hands selection to wall segments so boundaries can be moved. */
  mode?: "select" | "walls";
  selectedWallId?: string | null;
  onSelectWall?: (id: string | null) => void;
  /** -1 moves the selected wall left or up; 1 moves it right or down. */
  onMoveSelectedWall?: (direction: -1 | 1) => void;
}

export function MapCanvas(props: MapCanvasProps) {
  return <FloorCanvas key={props.floor.id} {...props} />;
}

function FloorCanvas({
  floor,
  selectedAreaId,
  controlledAreaIds = [],
  onSelectArea,
  showLights = true,
  showDimensions = false,
  units,
  className,
  mode = "select",
  selectedWallId = null,
  onSelectWall,
  onMoveSelectedWall,
}: MapCanvasProps) {
  const editingWalls = mode === "walls";
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 720, height: 480 });
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setViewport({ width: element.clientWidth, height: element.clientHeight });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const geometry = useMemo(() => {
    const vertices = new Map(
      floor.vertices.map((vertex) => [vertex.id, vertex]),
    );
    const walls = new Map<string, [MapPoint, MapPoint]>();
    const areas = floor.areas.map((area) => {
      const ring = area.vertexIds.flatMap((id) => {
        const vertex = vertices.get(id);
        return vertex ? [vertex] : [];
      });
      for (let index = 0; index < ring.length; index++) {
        const start = ring[index];
        const end = ring[(index + 1) % ring.length];
        walls.set([start.id, end.id].sort().join(":"), [start, end]);
      }
      const labelPoint = getAreaLabelPoint(ring);
      return {
        ...area,
        ring,
        labelPoint,
        labelWidth: labelPoint ? getAreaLabelWidth(ring, labelPoint) : 0,
      };
    });
    return {
      vertices,
      walls,
      areas,
      bounds: getMapBounds(floor.vertices),
      segments: listWalls(floor),
    };
  }, [floor]);

  const width = Math.max(1, viewport.width) * zoom;
  const height = Math.max(1, viewport.height) * zoom;
  const padding = 48 * zoom;
  const scale = Math.min(
    Math.max(1, width - padding * 2) / geometry.bounds.width,
    Math.max(1, height - padding * 2) / geometry.bounds.height,
  );
  const offsetX = (width - geometry.bounds.width * scale) / 2;
  const offsetY = (height - geometry.bounds.height * scale) / 2;
  const project = (point: MapPoint) => ({
    x: offsetX + (point.x - geometry.bounds.minX) * scale,
    y: offsetY + (point.y - geometry.bounds.minY) * scale,
  });

  function fitFloor() {
    setZoom(1);
    viewportRef.current?.scrollTo({ top: 0, left: 0 });
  }

  return (
    <div
      className={cn(
        "relative min-h-80 min-w-0 flex-1 overflow-hidden rounded-3xl border border-border/60 bg-muted/20",
        className,
      )}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          if (editingWalls) onSelectWall?.(null);
          else onSelectArea(null);
          return;
        }
        if (!editingWalls || !selectedWallId || !onMoveSelectedWall) return;
        const wall = geometry.segments.find(
          (segment) => segment.id === selectedWallId,
        );
        if (!wall) return;
        const back = wall.orientation === "vertical" ? "ArrowLeft" : "ArrowUp";
        const forward =
          wall.orientation === "vertical" ? "ArrowRight" : "ArrowDown";
        if (event.key !== back && event.key !== forward) return;
        // Arrow keys replace dragging entirely, not only as a fallback.
        event.preventDefault();
        event.stopPropagation();
        onMoveSelectedWall(event.key === back ? -1 : 1);
      }}
    >
      <div
        ref={viewportRef}
        className="absolute inset-0 overflow-auto overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        role="region"
        aria-label={
          editingWalls
            ? `${floor.name} walls. Select a wall, then move it with the arrow keys.`
            : `${floor.name} map. Select a room, or zoom and scroll to explore.`
        }
        tabIndex={0}
      >
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="group"
          aria-label={`${floor.name} rooms`}
          className="block select-none"
          onClick={(event) => {
            if (event.target === event.currentTarget) onSelectArea(null);
          }}
        >
          {geometry.areas.map((area) => (
            <polygon
              key={area.id}
              points={area.ring
                .map((point) => {
                  const position = project(point);
                  return `${position.x},${position.y}`;
                })
                .join(" ")}
              role="button"
              aria-label={area.name}
              aria-pressed={selectedAreaId === area.id}
              aria-description={
                controlledAreaIds.includes(area.id) &&
                selectedAreaId !== area.id
                  ? "Shares lighting controls with the selected room"
                  : undefined
              }
              tabIndex={editingWalls ? -1 : 0}
              aria-hidden={editingWalls || undefined}
              className={cn(
                "stroke-transparent stroke-3 outline-none transition-colors focus-visible:stroke-ring motion-reduce:transition-none",
                editingWalls ? "pointer-events-none" : "cursor-pointer",
                selectedAreaId === area.id
                  ? "fill-primary/12 stroke-foreground/60"
                  : controlledAreaIds.includes(area.id)
                    ? "fill-primary/8 hover:fill-primary/12"
                    : "fill-tile-off hover:fill-foreground/10",
              )}
              strokeLinejoin="round"
              onClick={() => onSelectArea(area.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectArea(area.id);
                }
              }}
            />
          ))}
          {editingWalls && (
            <g role="group" aria-label={`${floor.name} walls`}>
              {geometry.segments.map((segment) => {
                const a = project(
                  geometry.vertices.get(segment.startVertexId)!,
                );
                const b = project(geometry.vertices.get(segment.endVertexId)!);
                const rooms = segment.areaIds
                  .map(
                    (id) =>
                      floor.areas.find((area) => area.id === id)?.name ?? id,
                  )
                  .join(" and ");
                const length = convertLength(
                  segment.lengthMeters,
                  "m",
                  units === "metric" ? "m" : "ft",
                );
                return (
                  <line
                    key={segment.id}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    role="button"
                    tabIndex={0}
                    aria-label={`${segment.dividing ? "Shared wall" : "Outside wall"} of ${rooms}, ${length.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${units === "metric" ? "meters" : "feet"}`}
                    aria-pressed={selectedWallId === segment.id}
                    // The thin wall stroke draws over this band, so it stays visible.
                    className={cn(
                      "cursor-pointer outline-none focus-visible:stroke-ring",
                      selectedWallId === segment.id
                        ? "stroke-primary/45"
                        : "stroke-transparent hover:stroke-foreground/15",
                    )}
                    strokeWidth={12}
                    strokeLinecap="round"
                    onClick={() => onSelectWall?.(segment.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelectWall?.(segment.id);
                      }
                    }}
                  />
                );
              })}
            </g>
          )}
          <g aria-hidden="true" className="pointer-events-none">
            {[...geometry.walls].map(([key, [start, end]]) => {
              const a = project(start);
              const b = project(end);
              return (
                <line
                  key={key}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  className="stroke-foreground/50"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                />
              );
            })}
            {geometry.areas.map((area) => {
              if (!area.labelPoint) return null;
              const position = project(area.labelPoint);
              // Reserve one em per character, including wide glyphs, plus wall padding.
              const limit = Math.max(
                0,
                Math.floor((area.labelWidth * scale - 24) / 14),
              );
              if (limit === 0) return null;
              const characters = Array.from(area.name);
              const label =
                characters.length <= limit
                  ? area.name
                  : `${characters.slice(0, limit - 1).join("")}…`;
              return (
                <text
                  key={area.id}
                  x={position.x}
                  y={position.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className={cn(
                    "fill-foreground text-[14px] font-medium",
                    selectedAreaId !== area.id && "fill-foreground/80",
                  )}
                >
                  {label}
                </text>
              );
            })}
            {showLights &&
              floor.lights.map((light) => {
                const position = project(light);
                return (
                  <circle
                    key={light.lightId}
                    cx={position.x}
                    cy={position.y}
                    r={5}
                    className="fill-background stroke-foreground/70"
                    strokeWidth={2}
                  />
                );
              })}
            {showDimensions &&
              floor.dimensions.map((dimension) => {
                const start = geometry.vertices.get(dimension.startVertexId);
                const end = geometry.vertices.get(dimension.endVertexId);
                if (!start || !end) return null;
                const position = project({
                  x: (start.x + end.x) / 2,
                  y: (start.y + end.y) / 2,
                });
                const vertical = Math.abs(start.x - end.x) < 1e-7;
                const unit = units === "metric" ? "m" : "ft";
                const length = convertLength(dimension.lengthMeters, "m", unit);
                return (
                  <text
                    key={dimension.id}
                    transform={`translate(${position.x} ${position.y})${vertical ? " rotate(-90)" : ""}`}
                    y={-9}
                    textAnchor="middle"
                    paintOrder="stroke"
                    strokeWidth={4}
                    strokeLinejoin="round"
                    className="fill-muted-foreground stroke-background text-[12px] font-medium tabular-nums"
                  >
                    {`${length.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`}
                  </text>
                );
              })}
          </g>
        </svg>
      </div>
      <div
        className="absolute right-3 bottom-3 flex items-center gap-0.5 rounded-full border border-border bg-background p-1 shadow-sm"
        role="group"
        aria-label="Map zoom"
      >
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Zoom out"
          title="Zoom out"
          disabled={zoom <= 1}
          onClick={() => setZoom((value) => Math.max(1, value - 0.5))}
        >
          <Minus />
        </Button>
        <span className="w-11 text-center text-xs text-muted-foreground tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Zoom in"
          title="Zoom in"
          disabled={zoom >= 3}
          onClick={() => setZoom((value) => Math.min(3, value + 0.5))}
        >
          <Plus />
        </Button>
        <div className="mx-1 h-4 w-px bg-border" />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Fit floor"
          title="Fit floor"
          onClick={fitFloor}
        >
          <Maximize />
        </Button>
      </div>
    </div>
  );
}
