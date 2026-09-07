import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { convertLength } from "../measurements";
import { snapWorldPoint, type SnapGuide, type SnapSettings } from "../snapping";
import type { MapFloor, MapPoint } from "../types";
import {
  getAreaLabelPoint,
  getAreaLabelWidth,
  getMapBounds,
} from "../viewGeometry";
import {
  fitViewport,
  panViewport,
  toScreen,
  toWorld,
  zoomViewportAt,
  type MapViewport,
} from "../viewport";
import { listWalls, moveCorner, moveWall } from "../walls";

/** Screen pixels within which the pointer aligns to an existing corner. */
const SNAP_TOLERANCE_PX = 12;

type Drag =
  | { kind: "pan"; lastX: number; lastY: number; moved: boolean }
  | {
      kind: "corner";
      vertexId: string;
      base: MapFloor;
      grabOffset: MapPoint;
      moved: boolean;
    }
  | {
      kind: "wall";
      wallId: string;
      orientation: "horizontal" | "vertical";
      base: MapFloor;
      startWorld: MapPoint;
      moved: boolean;
    };

export interface MapEditorCanvasProps {
  floor: MapFloor;
  units: "metric" | "imperial";
  snap: SnapSettings;
  selectedAreaId: string | null;
  selectedWallId: string | null;
  onSelectArea: (id: string | null) => void;
  onSelectWall: (id: string | null) => void;
  /** Called once per completed drag, so a draft records whole moves. */
  onCommit: (floor: MapFloor) => void;
  onError: (message: string | null) => void;
  className?: string;
}

export function MapEditorCanvas(props: MapEditorCanvasProps) {
  return <EditorSurface key={props.floor.id} {...props} />;
}

function EditorSurface({
  floor,
  units,
  snap,
  selectedAreaId,
  selectedWallId,
  onSelectArea,
  onSelectWall,
  onCommit,
  onError,
  className,
}: MapEditorCanvasProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 520 });
  const [view, setView] = useState<MapViewport | null>(null);
  // Drags live in refs: a pointermove can arrive before React commits state,
  // and a dropped first move loses the whole gesture.
  const dragRef = useRef<Drag | null>(null);
  const previewRef = useRef<MapFloor | null>(null);
  const [drag, setDragState] = useState<Drag | null>(null);
  const [preview, setPreviewState] = useState<MapFloor | null>(null);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const [hoverWallId, setHoverWallId] = useState<string | null>(null);

  /** Capture is best-effort: a browser may reject it mid-gesture. */
  function capture(event: React.PointerEvent, release = false) {
    try {
      const target = event.target as Element;
      if (release) target.releasePointerCapture?.(event.pointerId);
      else target.setPointerCapture?.(event.pointerId);
    } catch {
      // Dragging still works through the events that reach the surface.
    }
  }

  function setDrag(next: Drag | null) {
    dragRef.current = next;
    setDragState(next);
  }

  function setPreview(next: MapFloor | null) {
    previewRef.current = next;
    setPreviewState(next);
  }

  const shown = preview ?? floor;
  const bounds = useMemo(() => getMapBounds(shown.vertices), [shown.vertices]);
  const walls = useMemo(() => listWalls(shown), [shown]);
  const vertices = useMemo(
    () => new Map(shown.vertices.map((vertex) => [vertex.id, vertex])),
    [shown],
  );

  useEffect(() => {
    const element = surfaceRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setSize({ width: element.clientWidth, height: element.clientHeight });
    });
    observer.observe(element);
    setSize({ width: element.clientWidth, height: element.clientHeight });
    return () => observer.disconnect();
  }, []);

  // The first usable size decides the starting view; later edits keep it.
  useEffect(() => {
    if (view || size.width < 2) return;
    setView(fitViewport(getMapBounds(floor.vertices), size));
  }, [view, size, floor.vertices]);

  const current: MapViewport = view ?? { scale: 40, offsetX: 40, offsetY: 40 };
  const project = (point: MapPoint) => toScreen(point, current);

  useEffect(() => {
    const element = surfaceRef.current;
    if (!element) return;
    // Registered manually so the page does not scroll while zooming the map.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const pointer = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      setView((value) =>
        zoomViewportAt(
          value ?? current,
          pointer,
          Math.exp(-event.deltaY * 0.0015),
        ),
      );
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
    // current is only a fallback for the first wheel before the fit runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pointerWorld(event: { clientX: number; clientY: number }) {
    const rect = surfaceRef.current!.getBoundingClientRect();
    return toWorld(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      current,
    );
  }

  function snapped(point: MapPoint, exclude: string[]) {
    const source = previewRef.current ?? floor;
    return snapWorldPoint(point, {
      settings: snap,
      corners: source.vertices.filter((vertex) => !exclude.includes(vertex.id)),
      toleranceMeters: SNAP_TOLERANCE_PX / current.scale,
    });
  }

  function applyPreview(next: MapFloor | null, error: string | null) {
    if (next) setPreview(next);
    onError(error);
  }

  function handlePointerMove(event: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === "pan") {
      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      dragRef.current = {
        ...drag,
        lastX: event.clientX,
        lastY: event.clientY,
        moved: drag.moved || Math.abs(dx) > 2 || Math.abs(dy) > 2,
      };
      setView((value) => panViewport(value ?? current, dx, dy));
      return;
    }
    const world = pointerWorld(event);
    if (drag.kind === "corner") {
      const result = snapped(
        {
          x: world.x + drag.grabOffset.x,
          y: world.y + drag.grabOffset.y,
        },
        [drag.vertexId],
      );
      setGuides(result.guides);
      const moved = moveCorner(drag.base, drag.vertexId, result.point);
      dragRef.current = { ...drag, moved: true };
      applyPreview(
        moved.ok ? moved.value : null,
        moved.ok ? null : moved.error,
      );
      return;
    }
    const wall = listWalls(drag.base).find(
      (candidate) => candidate.id === drag.wallId,
    );
    if (!wall) return;
    const axis = drag.orientation === "vertical" ? "x" : "y";
    const anchor = drag.base.vertices.find(
      (vertex) => vertex.id === wall.startVertexId,
    )!;
    const result = snapped(world, wall.vertexIds);
    setGuides(result.guides.filter((guide) => guide.axis === axis));
    const delta = result.point[axis] - anchor[axis];
    dragRef.current = { ...drag, moved: true };
    const moved = moveWall(drag.base, drag.wallId, delta);
    applyPreview(moved.ok ? moved.value : null, moved.ok ? null : moved.error);
  }

  function endDrag(event: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    capture(event, true);
    const committed = previewRef.current;
    if (drag.kind !== "pan" && committed && drag.moved) onCommit(committed);
    if (drag.kind === "pan" && !drag.moved) {
      onSelectArea(null);
      onSelectWall(null);
    }
    setDrag(null);
    setPreview(null);
    setGuides([]);
  }

  const gridStep = useMemo(() => {
    if (!snap.showGrid) return 0;
    const base = snap.enabled ? snap.incrementMeters : 0.5;
    // Keep grid lines at least 12 screen pixels apart at any zoom.
    let step = base;
    while (step * current.scale < 12) step *= 2;
    return step;
  }, [snap.showGrid, snap.enabled, snap.incrementMeters, current.scale]);

  const gridLines = useMemo(() => {
    if (gridStep <= 0 || size.width < 2)
      return { vertical: [], horizontal: [] };
    const topLeft = toWorld({ x: 0, y: 0 }, current);
    const bottomRight = toWorld({ x: size.width, y: size.height }, current);
    const range = (from: number, to: number) => {
      const values: number[] = [];
      const start = Math.floor(from / gridStep) * gridStep;
      for (
        let value = start;
        value <= to && values.length < 400;
        value += gridStep
      )
        values.push(value);
      return values;
    };
    return {
      vertical: range(topLeft.x, bottomRight.x),
      horizontal: range(topLeft.y, bottomRight.y),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    gridStep,
    size.width,
    size.height,
    current.scale,
    current.offsetX,
    current.offsetY,
  ]);

  const unit = units === "metric" ? "m" : "ft";
  const lengthLabel = (meters: number) =>
    `${convertLength(meters, "m", unit).toLocaleString(undefined, {
      maximumFractionDigits: 2,
    })} ${unit}`;

  return (
    <div
      ref={surfaceRef}
      className={cn(
        "relative min-h-80 min-w-0 flex-1 touch-none overflow-hidden rounded-3xl border border-border/60 bg-muted/20",
        drag?.kind === "pan" ? "cursor-grabbing" : "cursor-grab",
        className,
      )}
      onPointerDown={(event) => {
        if (event.button !== 0 && event.button !== 1) return;
        capture(event);
        setDrag({
          kind: "pan",
          lastX: event.clientX,
          lastY: event.clientY,
          moved: false,
        });
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onSelectWall(null);
          onSelectArea(null);
          return;
        }
        if (!selectedWallId) return;
        const wall = walls.find((candidate) => candidate.id === selectedWallId);
        if (!wall) return;
        const back = wall.orientation === "vertical" ? "ArrowLeft" : "ArrowUp";
        const forward =
          wall.orientation === "vertical" ? "ArrowRight" : "ArrowDown";
        if (event.key !== back && event.key !== forward) return;
        // Keyboard moves use the snap increment so both routes agree.
        event.preventDefault();
        const step = snap.enabled ? snap.incrementMeters : 0.1;
        const moved = moveWall(
          floor,
          selectedWallId,
          event.key === back ? -step : step,
        );
        if (moved.ok) {
          onError(null);
          onCommit(moved.value);
        } else onError(moved.error);
      }}
    >
      <svg
        width={size.width}
        height={size.height}
        className="block select-none"
        role="application"
        aria-label={`${floor.name} editor. Drag corners and walls; drag the background to pan.`}
      >
        {gridStep > 0 && (
          <g aria-hidden="true" className="pointer-events-none">
            {gridLines.vertical.map((value) => (
              <line
                key={`v${value}`}
                x1={project({ x: value, y: 0 }).x}
                y1={0}
                x2={project({ x: value, y: 0 }).x}
                y2={size.height}
                className="stroke-foreground/8"
                strokeWidth={1}
              />
            ))}
            {gridLines.horizontal.map((value) => (
              <line
                key={`h${value}`}
                x1={0}
                y1={project({ x: 0, y: value }).y}
                x2={size.width}
                y2={project({ x: 0, y: value }).y}
                className="stroke-foreground/8"
                strokeWidth={1}
              />
            ))}
          </g>
        )}

        {shown.areas.map((area) => {
          const ring = area.vertexIds.flatMap((id) => {
            const vertex = vertices.get(id);
            return vertex ? [project(vertex)] : [];
          });
          const labelPoint = getAreaLabelPoint(
            area.vertexIds.flatMap((id) => {
              const vertex = vertices.get(id);
              return vertex ? [vertex] : [];
            }),
          );
          return (
            <g key={area.id}>
              <polygon
                points={ring.map((point) => `${point.x},${point.y}`).join(" ")}
                className={cn(
                  "cursor-pointer transition-colors motion-reduce:transition-none",
                  selectedAreaId === area.id
                    ? "fill-primary/12 stroke-foreground/60"
                    : "fill-tile-off stroke-transparent hover:fill-foreground/10",
                )}
                strokeWidth={1}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onSelectArea(area.id);
                  onSelectWall(null);
                }}
              />
              {labelPoint &&
                getAreaLabelWidth(
                  area.vertexIds.flatMap((id) => {
                    const vertex = vertices.get(id);
                    return vertex ? [vertex] : [];
                  }),
                  labelPoint,
                ) *
                  current.scale >
                  48 && (
                  <text
                    x={project(labelPoint).x}
                    y={project(labelPoint).y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="pointer-events-none fill-foreground/80 text-[13px] font-medium"
                  >
                    {area.name}
                  </text>
                )}
            </g>
          );
        })}

        {walls.map((wall) => {
          const start = project(vertices.get(wall.startVertexId)!);
          const end = project(vertices.get(wall.endVertexId)!);
          const active =
            selectedWallId === wall.id ||
            (drag?.kind === "wall" && drag.wallId === wall.id);
          return (
            <g key={wall.id}>
              <line
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                strokeWidth={14}
                strokeLinecap="round"
                className={cn(
                  wall.orientation === "vertical"
                    ? "cursor-col-resize"
                    : "cursor-row-resize",
                  active
                    ? "stroke-primary/40"
                    : hoverWallId === wall.id
                      ? "stroke-foreground/15"
                      : "stroke-transparent",
                )}
                onPointerEnter={() => setHoverWallId(wall.id)}
                onPointerLeave={() =>
                  setHoverWallId((value) => (value === wall.id ? null : value))
                }
                onPointerDown={(event) => {
                  event.stopPropagation();
                  capture(event);
                  onSelectWall(wall.id);
                  onSelectArea(null);
                  onError(null);
                  setDrag({
                    kind: "wall",
                    wallId: wall.id,
                    orientation: wall.orientation,
                    base: shown,
                    startWorld: pointerWorld(event),
                    moved: false,
                  });
                }}
              />
              <line
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                className="pointer-events-none stroke-foreground/60"
                strokeWidth={1.5}
                strokeLinecap="round"
              />
              {active && (
                <text
                  x={(start.x + end.x) / 2}
                  y={(start.y + end.y) / 2 - 10}
                  textAnchor="middle"
                  paintOrder="stroke"
                  strokeWidth={4}
                  strokeLinejoin="round"
                  className="pointer-events-none fill-foreground stroke-background text-[12px] font-medium tabular-nums"
                >
                  {lengthLabel(wall.lengthMeters)}
                </text>
              )}
            </g>
          );
        })}

        {guides.map((guide, index) => (
          <line
            key={`${guide.axis}${index}`}
            x1={guide.axis === "x" ? project(guide.through).x : 0}
            y1={guide.axis === "x" ? 0 : project(guide.through).y}
            x2={guide.axis === "x" ? project(guide.through).x : size.width}
            y2={guide.axis === "x" ? size.height : project(guide.through).y}
            className="pointer-events-none stroke-primary/70"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        ))}

        {shown.vertices.map((vertex) => {
          const position = project(vertex);
          const active = drag?.kind === "corner" && drag.vertexId === vertex.id;
          return (
            <circle
              key={vertex.id}
              cx={position.x}
              cy={position.y}
              r={active ? 7 : 5}
              strokeWidth={2}
              className={cn(
                "cursor-move",
                active
                  ? "fill-primary stroke-background"
                  : "fill-background stroke-foreground/70 hover:fill-primary/40",
              )}
              onPointerDown={(event) => {
                event.stopPropagation();
                capture(event);
                onError(null);
                onSelectWall(null);
                const world = pointerWorld(event);
                setDrag({
                  kind: "corner",
                  vertexId: vertex.id,
                  base: shown,
                  // Keeps the corner where it was grabbed instead of jumping.
                  grabOffset: { x: vertex.x - world.x, y: vertex.y - world.y },
                  moved: false,
                });
              }}
            />
          );
        })}
      </svg>

      <div
        className="absolute right-3 bottom-3 flex items-center gap-0.5 rounded-full border border-border bg-background p-1 shadow-sm"
        role="group"
        aria-label="Map zoom"
      >
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Zoom out"
          onClick={() =>
            setView((value) =>
              zoomViewportAt(
                value ?? current,
                { x: size.width / 2, y: size.height / 2 },
                1 / 1.25,
              ),
            )
          }
        >
          <Minus />
        </Button>
        <span className="w-12 text-center text-xs text-muted-foreground tabular-nums">
          {Math.round((current.scale / 40) * 100)}%
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Zoom in"
          onClick={() =>
            setView((value) =>
              zoomViewportAt(
                value ?? current,
                { x: size.width / 2, y: size.height / 2 },
                1.25,
              ),
            )
          }
        >
          <Plus />
        </Button>
        <div className="mx-1 h-4 w-px bg-border" />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Fit floor"
          onClick={() => setView(fitViewport(bounds, size))}
        >
          <Maximize />
        </Button>
      </div>
    </div>
  );
}
