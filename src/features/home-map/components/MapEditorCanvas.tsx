import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { convertLength } from "../measurements";
import {
  appendOutlineCorner,
  constrainCorner,
  outlineCloseError,
} from "../outline";
import { distance } from "../geometry";
import { snapWorldPoint, type SnapGuide, type SnapSettings } from "../snapping";
import { locatePoint } from "../geometry";
import type { MapFloor, MapPoint } from "../types";
import {
  getAreaLabelPoint,
  getAreaLabelWidth,
  getMapBounds,
} from "../viewGeometry";
import {
  emptyViewport,
  fitViewport,
  niceStep,
  panViewport,
  toScreen,
  toWorld,
  zoomViewportAt,
  type MapViewport,
} from "../viewport";
import { listWalls, moveCorner, moveWall, type MapWall } from "../walls";
import { MapRulers, RULER_SIZE } from "./MapRulers";

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
      kind: "light";
      lightId: string;
      grabOffset: MapPoint;
      moved: boolean;
    }
  | {
      kind: "wall";
      wallId: string;
      orientation: MapWall["orientation"];
      base: MapFloor;
      startWorld: MapPoint;
      moved: boolean;
    };

export type EditorTool =
  | "view"
  | "select"
  | "points"
  | "draw"
  | "divide"
  | "combine"
  | "lights";

export interface MapEditorCanvasProps {
  floor: MapFloor;
  tool: EditorTool;
  /** Receives a closed, orthogonal outline in world meters. */
  onDrawRoom: (ring: MapPoint[]) => void;
  /** Receives a divider drawn from one wall of the selected room to another. */
  onDivideRoom: (divider: MapPoint[]) => void;
  combineIds: string[];
  onToggleCombine: (areaId: string) => void;
  /** The light waiting for a position, chosen in the tray. */
  placingLightId: string | null;
  lightLabels: Record<string, string>;
  onPlaceLight: (lightId: string, point: MapPoint) => void;
  units: "metric" | "imperial";
  snap: SnapSettings;
  selectedAreaId: string | null;
  selectedWallId: string | null;
  onSelectArea: (id: string | null) => void;
  onSelectWall: (id: string | null) => void;
  /** Called once per completed drag, so a draft records whole moves. */
  onCommit: (floor: MapFloor) => void;
  /** Adds a corner on a wall and returns the floor holding it. */
  onInsertCorner: (
    point: MapPoint,
  ) => { floor: MapFloor; vertexId: string } | null;
  selectedVertexId: string | null;
  onSelectVertex: (vertexId: string | null) => void;
  /** Welds a dragged corner onto the one it was dropped on. */
  onMergeCorners: (fromVertexId: string, intoVertexId: string) => void;
  onError: (message: string | null) => void;
  className?: string;
  /** Screen pixels hidden by a floating panel, so framing stays centred. */
  insetRight?: number;
  /** Moves the zoom group clear of that panel. */
  overlayInsetClassName?: string;
}

export function MapEditorCanvas(props: MapEditorCanvasProps) {
  return <EditorSurface key={props.floor.id} {...props} />;
}

function EditorSurface({
  floor,
  tool,
  onDrawRoom,
  onDivideRoom,
  combineIds,
  onToggleCombine,
  placingLightId,
  lightLabels,
  onPlaceLight,
  units,
  snap,
  selectedAreaId,
  selectedWallId,
  onSelectArea,
  onSelectWall,
  onCommit,
  onInsertCorner,
  selectedVertexId,
  onSelectVertex,
  onMergeCorners,
  onError,
  className,
  insetRight = 0,
  overlayInsetClassName,
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
  const [outline, setOutline] = useState<MapPoint[]>([]);
  const [outlineHover, setOutlineHover] = useState<MapPoint | null>(null);
  // Framing follows the container until the view is moved by hand.
  const viewTouched = useRef(false);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
  const [lightPreview, setLightPreview] = useState<{
    lightId: string;
    point: MapPoint;
  } | null>(null);

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

  // Content is framed inside the part of the canvas the panel does not cover.
  const framed = {
    width: Math.max(1, size.width - insetRight),
    height: size.height,
  };

  useEffect(() => {
    const element = surfaceRef.current;
    if (!element) return;
    const measure = () =>
      setSize((current) =>
        current.width === element.clientWidth &&
        current.height === element.clientHeight
          ? current
          : { width: element.clientWidth, height: element.clientHeight },
      );
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    // Some webviews resize the window without resizing the observed box.
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    if (viewTouched.current || size.width < 2) return;
    setView(
      floor.vertices.length === 0
        ? emptyViewport(framed)
        : fitViewport(getMapBounds(floor.vertices), framed, 48 + RULER_SIZE),
    );
    // framed is derived from size and insetRight, which are both listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, size, insetRight, floor.vertices]);

  useEffect(() => {
    if (tool !== "draw" && tool !== "divide") {
      setOutline([]);
      setOutlineHover(null);
    }
  }, [tool]);

  // A preview is framed by the shape it shows, so it refits as that changes.
  const previewKey =
    tool === "view"
      ? floor.vertices
          .map((vertex) => `${vertex.x.toFixed(3)},${vertex.y.toFixed(3)}`)
          .join(";")
      : "";
  useEffect(() => {
    if (tool !== "view" || size.width < 2) return;
    setView(
      floor.vertices.length === 0
        ? emptyViewport(framed)
        : fitViewport(getMapBounds(floor.vertices), framed, 48 + RULER_SIZE),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, previewKey, size.width, size.height, insetRight]);

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
      viewTouched.current = true;
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

  /** The next corner: axis-constrained from the last one, then snapped. */
  function draftCorner(event: { clientX: number; clientY: number }) {
    const world = pointerWorld(event);
    const previous = outline[outline.length - 1] ?? null;
    const constrained = constrainCorner(previous, world, {
      snapMeters: snap.enabled ? snap.incrementMeters : 0,
      angleDegrees: snap.enabled ? snap.angleDegrees : 0,
    });
    const result = snapWorldPoint(constrained, {
      settings: snap,
      corners: [...floor.vertices, ...outline],
      toleranceMeters: SNAP_TOLERANCE_PX / current.scale,
    });
    // Re-constrain: a corner snap may pull the point off the drawn axis.
    const point = previous
      ? {
          x:
            Math.abs(constrained.x - previous.x) > 0
              ? result.point.x
              : previous.x,
          y:
            Math.abs(constrained.y - previous.y) > 0
              ? result.point.y
              : previous.y,
        }
      : result.point;
    return { point, guides: result.guides };
  }

  const selectedRing = selectedAreaId
    ? (shown.areas
        .find((area) => area.id === selectedAreaId)
        ?.vertexIds.flatMap((id) => {
          const vertex = vertices.get(id);
          return vertex ? [vertex] : [];
        }) ?? null)
    : null;

  function placeDividerCorner(event: React.PointerEvent) {
    if (!selectedRing) {
      onError("Select the room to divide first.");
      return;
    }
    const { point } = draftCorner(event);
    const where = locatePoint(point, selectedRing);
    if (outline.length === 0) {
      if (where !== "boundary") {
        onError("Start the divider on a wall of the selected room.");
        return;
      }
      onError(null);
      setOutline([point]);
      return;
    }
    // A divider ends as soon as it reaches another wall of the same room.
    if (where === "boundary") {
      onError(null);
      onDivideRoom([...outline, point]);
      setOutline([]);
      setOutlineHover(null);
      return;
    }
    const next = appendOutlineCorner(outline, point);
    if (!next.ok) {
      onError(next.error);
      return;
    }
    onError(null);
    setOutline(next.value);
  }

  function placeCorner(event: React.PointerEvent) {
    const { point } = draftCorner(event);
    const first = outline[0];
    const closeTolerance = SNAP_TOLERANCE_PX / current.scale;
    if (
      first &&
      outline.length >= 3 &&
      Math.abs(point.x - first.x) <= closeTolerance &&
      Math.abs(point.y - first.y) <= closeTolerance
    ) {
      finishOutline();
      return;
    }
    const next = appendOutlineCorner(outline, point);
    if (!next.ok) {
      onError(next.error);
      return;
    }
    onError(null);
    setOutline(next.value);
  }

  function finishOutline() {
    const error = outlineCloseError(outline);
    if (error) {
      onError(error);
      return;
    }
    onError(null);
    onDrawRoom(outline);
    setOutline([]);
    setOutlineHover(null);
  }

  function applyPreview(next: MapFloor | null, error: string | null) {
    if (next) setPreview(next);
    onError(error);
  }

  function handlePointerMove(event: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) {
      if (tool === "draw" || tool === "divide") {
        const draft = draftCorner(event);
        setOutlineHover(draft.point);
        setGuides(draft.guides);
      }
      return;
    }
    if (drag.kind === "pan") {
      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      dragRef.current = {
        ...drag,
        lastX: event.clientX,
        lastY: event.clientY,
        moved: drag.moved || Math.abs(dx) > 2 || Math.abs(dy) > 2,
      };
      viewTouched.current = true;
      setView((value) => panViewport(value ?? current, dx, dy));
      return;
    }
    const world = pointerWorld(event);
    if (drag.kind === "light") {
      const result = snapped(
        { x: world.x + drag.grabOffset.x, y: world.y + drag.grabOffset.y },
        [],
      );
      setGuides([]);
      dragRef.current = { ...drag, moved: true };
      setLightPreview({ lightId: drag.lightId, point: result.point });
      return;
    }
    if (drag.kind === "corner") {
      const result = snapped(
        {
          x: world.x + drag.grabOffset.x,
          y: world.y + drag.grabOffset.y,
        },
        [drag.vertexId],
      );
      setGuides(result.guides);
      dragRef.current = { ...drag, moved: true };
      // Landing on another corner is a merge, not an invalid position.
      const onto = drag.base.vertices.find(
        (vertex) =>
          vertex.id !== drag.vertexId &&
          distance(vertex, result.point) <= SNAP_TOLERANCE_PX / current.scale,
      );
      setMergeTargetId(onto?.id ?? null);
      if (onto) {
        onError(null);
        return;
      }
      const moved = moveCorner(drag.base, drag.vertexId, result.point);
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
    const anchor = drag.base.vertices.find(
      (vertex) => vertex.id === wall.startVertexId,
    )!;
    const result = snapped(world, wall.vertexIds);
    setGuides(
      wall.orientation === "angled"
        ? []
        : result.guides.filter((guide) =>
            wall.orientation === "vertical"
              ? guide.axis === "x"
              : guide.axis === "y",
          ),
    );
    // Distance from the wall's line, measured along the side it moves towards.
    const delta =
      (result.point.x - anchor.x) * wall.normal.x +
      (result.point.y - anchor.y) * wall.normal.y;
    dragRef.current = { ...drag, moved: true };
    const moved = moveWall(drag.base, drag.wallId, delta);
    applyPreview(moved.ok ? moved.value : null, moved.ok ? null : moved.error);
  }

  function endDrag(event: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    capture(event, true);
    const committed = previewRef.current;
    if (drag.kind === "light") {
      const moved = lightPreview;
      setLightPreview(null);
      setDrag(null);
      setGuides([]);
      if (drag.moved && moved) onPlaceLight(moved.lightId, moved.point);
      return;
    }
    if (drag.kind === "corner" && drag.moved && mergeTargetId) {
      const onto = mergeTargetId;
      setDrag(null);
      setPreview(null);
      setGuides([]);
      setMergeTargetId(null);
      onMergeCorners(drag.vertexId, onto);
      return;
    }
    if (drag.kind !== "pan" && committed && drag.moved) onCommit(committed);
    if (drag.kind === "pan" && !drag.moved) {
      if (tool === "draw") placeCorner(event);
      else if (tool === "lights") {
        if (placingLightId) {
          const { point } = draftCorner(event);
          onPlaceLight(placingLightId, point);
        } else onSelectArea(null);
      } else if (tool === "divide") placeDividerCorner(event);
      else if (tool !== "combine") {
        onSelectArea(null);
        onSelectWall(null);
      }
    }
    setDrag(null);
    setPreview(null);
    setGuides([]);
    setMergeTargetId(null);
  }

  const gridStep = useMemo(
    () =>
      // Round steps only, so grid lines meet the rulers and whole-metre walls.
      snap.showGrid ? niceStep(current.scale, 16, units) : 0,
    [snap.showGrid, current.scale, units],
  );

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
        "relative min-h-80 min-w-0 flex-1 touch-none overflow-hidden rounded-3xl border border-border/60 bg-muted/20 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        tool === "draw" || tool === "divide" || placingLightId
          ? "cursor-crosshair"
          : drag?.kind === "pan"
            ? "cursor-grabbing"
            : "cursor-grab",
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
      onDragOver={(event) => {
        if (tool !== "lights") return;
        // Accepting the drag is what makes the drop cursor appear.
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        if (tool !== "lights") return;
        event.preventDefault();
        const lightId = event.dataTransfer.getData("text/plain");
        if (!lightId) return;
        const { point } = draftCorner(event);
        onPlaceLight(lightId, point);
      }}
      onDoubleClick={() => {
        if (tool === "draw") finishOutline();
      }}
      tabIndex={0}
      onKeyDown={(event) => {
        if (tool === "draw") {
          if (event.key === "Enter") {
            event.preventDefault();
            finishOutline();
            return;
          }
          if (event.key === "Backspace") {
            event.preventDefault();
            onError(null);
            setOutline((points) => points.slice(0, -1));
            return;
          }
          if (event.key === "Escape") {
            setOutline([]);
            setOutlineHover(null);
            onError(null);
            return;
          }
        }
        if (event.key === "Escape") {
          onSelectWall(null);
          onSelectArea(null);
          return;
        }
        if (!selectedWallId) return;
        const wall = walls.find((candidate) => candidate.id === selectedWallId);
        if (!wall) return;
        const back =
          wall.orientation === "horizontal" ? "ArrowUp" : "ArrowLeft";
        const forward =
          wall.orientation === "horizontal" ? "ArrowDown" : "ArrowRight";
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
        aria-label={
          tool === "draw"
            ? `${floor.name} editor. Click to place corners, click the first corner to finish.`
            : tool === "divide"
              ? `${floor.name} editor. Click one wall of the selected room, then the wall opposite.`
              : tool === "points"
                ? `${floor.name} editor. Drag corners, add corners on walls, or drop one corner on another to merge.`
                : tool === "combine"
                  ? `${floor.name} editor. Click the rooms to combine.`
                  : tool === "lights"
                    ? `${floor.name} editor. Drag light markers, or click to place the chosen light.`
                    : tool === "view"
                      ? `${floor.name} preview. Drag to pan, scroll to zoom.`
                      : `${floor.name} editor. Drag corners and walls; drag the background to pan.`
        }
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
                  combineIds.includes(area.id)
                    ? "fill-primary/25 stroke-foreground/60"
                    : selectedAreaId === area.id
                      ? "fill-primary/12 stroke-foreground/60"
                      : "fill-tile-off stroke-transparent hover:fill-foreground/10",
                )}
                strokeWidth={1}
                onPointerDown={
                  tool === "draw" || tool === "divide"
                    ? undefined
                    : (event) => {
                        event.stopPropagation();
                        if (tool === "combine") onToggleCombine(area.id);
                        else {
                          onSelectArea(area.id);
                          onSelectWall(null);
                        }
                      }
                }
                pointerEvents={
                  tool === "select" || tool === "combine" ? undefined : "none"
                }
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
                pointerEvents={
                  tool === "select" || tool === "points" ? undefined : "none"
                }
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

        {shown.lights.map((light) => {
          const live =
            lightPreview?.lightId === light.lightId
              ? lightPreview.point
              : light;
          const position = project(live);
          const label = lightLabels[light.lightId] ?? "Light";
          const dragging = lightPreview?.lightId === light.lightId;
          return (
            <g key={light.lightId}>
              <circle
                cx={position.x}
                cy={position.y}
                r={dragging ? 8 : 6}
                strokeWidth={2}
                className={cn(
                  dragging
                    ? "fill-primary stroke-background"
                    : "fill-background stroke-foreground/70",
                  tool === "lights" ? "cursor-move" : "pointer-events-none",
                )}
                aria-label={label}
                onPointerDown={
                  tool === "lights"
                    ? (event) => {
                        event.stopPropagation();
                        capture(event);
                        onError(null);
                        const world = pointerWorld(event);
                        setDrag({
                          kind: "light",
                          lightId: light.lightId,
                          grabOffset: {
                            x: light.x - world.x,
                            y: light.y - world.y,
                          },
                          moved: false,
                        });
                      }
                    : undefined
                }
              />
            </g>
          );
        })}

        {outline.length > 0 && (
          <g className="pointer-events-none">
            <polyline
              points={[...outline, ...(outlineHover ? [outlineHover] : [])]
                .map((point) => {
                  const position = project(point);
                  return `${position.x},${position.y}`;
                })
                .join(" ")}
              className="fill-none stroke-primary"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {outline.map((point, index) => {
              const position = project(point);
              return (
                <circle
                  key={index}
                  cx={position.x}
                  cy={position.y}
                  r={index === 0 && outline.length >= 3 ? 7 : 4}
                  strokeWidth={2}
                  className={
                    index === 0 && outline.length >= 3
                      ? "fill-background stroke-primary"
                      : "fill-primary stroke-background"
                  }
                />
              );
            })}
          </g>
        )}

        {tool === "points" &&
          walls.flatMap((wall) =>
            wall.vertexIds.slice(0, -1).flatMap((startId, index) => {
              const start = vertices.get(startId);
              const end = vertices.get(wall.vertexIds[index + 1]);
              if (!start || !end) return [];
              const middle = {
                x: (start.x + end.x) / 2,
                y: (start.y + end.y) / 2,
              };
              const position = project(middle);
              return [
                <circle
                  key={`add-${startId}-${wall.vertexIds[index + 1]}`}
                  cx={position.x}
                  cy={position.y}
                  r={5}
                  strokeWidth={1.5}
                  aria-label="Add a corner here"
                  className="cursor-copy fill-background/60 stroke-dashed stroke-foreground/40 hover:fill-primary hover:stroke-background"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    capture(event);
                    onError(null);
                    // Insert where the pointer is, then drag the new corner.
                    const result = onInsertCorner(snapped(middle, []).point);
                    if (!result) return;
                    // Selecting it puts Remove and Merge one click away.
                    onSelectVertex(result.vertexId);
                    setPreview(result.floor);
                    setDrag({
                      kind: "corner",
                      vertexId: result.vertexId,
                      base: result.floor,
                      grabOffset: { x: 0, y: 0 },
                      moved: false,
                    });
                  }}
                />,
              ];
            }),
          )}

        {(tool === "select" || tool === "points") &&
          shown.vertices.map((vertex) => {
            const position = project(vertex);
            const merging = mergeTargetId === vertex.id;
            const active =
              (drag?.kind === "corner" && drag.vertexId === vertex.id) ||
              selectedVertexId === vertex.id;
            // Corners are squares so they never read as light markers.
            const size = merging ? 14 : active ? 11 : 8;
            return (
              <rect
                key={vertex.id}
                x={position.x - size / 2}
                y={position.y - size / 2}
                width={size}
                height={size}
                rx={1.5}
                strokeWidth={2}
                role="button"
                aria-label={`Corner at ${vertex.x.toFixed(2)}, ${vertex.y.toFixed(2)}`}
                aria-pressed={selectedVertexId === vertex.id}
                className={cn(
                  "cursor-move",
                  merging
                    ? "fill-primary stroke-primary"
                    : active
                      ? "fill-primary stroke-background"
                      : "fill-background stroke-foreground/70 hover:fill-primary/40",
                )}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  capture(event);
                  onError(null);
                  onSelectWall(null);
                  onSelectVertex(vertex.id);
                  const world = pointerWorld(event);
                  setDrag({
                    kind: "corner",
                    vertexId: vertex.id,
                    base: shown,
                    // Keeps the corner where it was grabbed instead of jumping.
                    grabOffset: {
                      x: vertex.x - world.x,
                      y: vertex.y - world.y,
                    },
                    moved: false,
                  });
                }}
              />
            );
          })}
      </svg>

      {tool === "lights" && (
        <p
          role="status"
          className="pointer-events-none absolute top-8 left-1/2 -translate-x-1/2 rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm"
        >
          {placingLightId
            ? "Click where this light is in the room."
            : "Drag a light marker to move it, or choose a light in the list."}
        </p>
      )}
      {tool === "points" && (
        <p
          role="status"
          className="pointer-events-none absolute top-8 left-1/2 -translate-x-1/2 rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm"
        >
          Drag a square corner to move it. Dashed circles add a corner. Drop a
          corner on another to merge them.
        </p>
      )}
      {tool === "divide" && (
        <p
          role="status"
          className="pointer-events-none absolute top-8 left-1/2 -translate-x-1/2 rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm"
        >
          {!selectedRing
            ? "Select a room in the list, then draw the dividing wall."
            : outline.length === 0
              ? "Click a wall of the selected room to start the divider."
              : "Click the opposite wall to finish the divider."}
        </p>
      )}
      {tool === "draw" && (
        <p
          role="status"
          className="pointer-events-none absolute top-8 left-1/2 -translate-x-1/2 rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm"
        >
          {outline.length === 0
            ? "Click to place the first corner of a room."
            : outline.length < 3
              ? "Keep clicking corners. Walls stay horizontal or vertical."
              : "Click the first corner to finish. Backspace removes the last one."}
        </p>
      )}
      <MapRulers view={current} size={size} units={units} />

      <div
        className={cn(
          "absolute right-3 bottom-3 flex items-center gap-0.5 rounded-full border border-border bg-background p-1 shadow-sm",
          overlayInsetClassName,
        )}
        role="group"
        aria-label="Map zoom"
      >
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Zoom out"
          onClick={() => {
            viewTouched.current = true;
            setView((value) =>
              zoomViewportAt(
                value ?? current,
                { x: size.width / 2, y: size.height / 2 },
                1 / 1.25,
              ),
            );
          }}
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
          onClick={() => {
            viewTouched.current = true;
            setView((value) =>
              zoomViewportAt(
                value ?? current,
                { x: size.width / 2, y: size.height / 2 },
                1.25,
              ),
            );
          }}
        >
          <Plus />
        </Button>
        <div className="mx-1 h-4 w-px bg-border" />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Fit floor"
          onClick={() => {
            viewTouched.current = false;
            setView(
              shown.vertices.length === 0
                ? emptyViewport(framed)
                : fitViewport(bounds, framed, 48 + RULER_SIZE),
            );
          }}
        >
          <Maximize />
        </Button>
      </div>
    </div>
  );
}
