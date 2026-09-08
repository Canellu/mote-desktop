import { cn } from "@/lib/utils";
import type { HostSyncDisplay } from "@/types/host-sync";
import type { HuePosition } from "@/types/hue";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent,
} from "react";
import {
  combinedRoomFrame,
  displayBounds,
  displayPointToPosition,
  nearestDisplay,
  positionToDisplayPoint,
  roomFrameOptionsFor,
  sampleRegionForPosition,
} from "./display-geometry";
import type { RoomPin } from "./RoomCanvas";

interface DisplayCalibrationCanvasProps {
  configurationType: string | null;
  displays: HostSyncDisplay[];
  displayDetails?: string;
  pins: RoomPin[];
  activeKey: string | null;
  onActivate: (key: string) => void;
  onMove: (key: string, update: Partial<HuePosition>) => void;
  className?: string;
  overlayInsetClassName?: string;
}

/**
 * Slack kept around the display arrangement at the default zoom, as a fraction
 * of each axis, so the screens sit comfortably inside the canvas instead of
 * running up against its edges.
 */
const FIT_MARGIN = 0.4;
const MIN_ZOOM = 0.7;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.25;
const WHEEL_ZOOM_RATE = 0.001;

/** Zoom level plus the user-space point held at the centre of the canvas. */
interface CanvasView {
  zoom: number;
  cx: number;
  cy: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const svgPoint = (
  svg: SVGSVGElement,
  event: { clientX: number; clientY: number },
) => {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(svg.getScreenCTM()?.inverse());
};

/**
 * A light outside the screen frame projects onto the nearest screen edge.
 * While a drag stays on that edge, keep the out-of-frame axis so sliding a
 * desk light along the bottom of the picture doesn't lift it into the frame.
 */
const holdOutsideFrame = (
  current: number,
  next: number,
  min: number,
  max: number,
) => {
  const epsilon = 1e-5;
  return (current < min && next <= min + epsilon) ||
    (current > max && next >= max - epsilon)
    ? current
    : next;
};

export const DisplayCalibrationCanvas = ({
  configurationType,
  displays,
  displayDetails,
  pins,
  activeKey,
  onActivate,
  onMove,
  className,
  overlayInsetClassName,
}: DisplayCalibrationCanvasProps) => {
  const bounds = useMemo(() => displayBounds(displays), [displays]);
  const frame = useMemo(
    () =>
      bounds
        ? combinedRoomFrame(bounds, roomFrameOptionsFor(configurationType))
        : null,
    [bounds, configurationType],
  );
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  // Null is "the default fit". A different display arrangement falls back to
  // it rather than keeping a pan aimed at screens that are no longer there.
  const [view, setView] = useState<CanvasView | null>(null);
  const panPointer = useRef<{ x: number; y: number } | null>(null);
  const panScale = useRef(1);

  useEffect(() => setView(null), [bounds]);

  if (!bounds || !frame) return null;

  const unit = Math.max(bounds.width, bounds.height);
  const marginX = bounds.width * FIT_MARGIN;
  const marginY = bounds.height * FIT_MARGIN;
  const fitWidth = bounds.width + marginX * 2;
  const fitHeight = bounds.height + marginY * 2;
  const defaultView: CanvasView = {
    zoom: 1,
    cx: bounds.minX + bounds.width / 2,
    cy: bounds.minY + bounds.height / 2,
  };
  const { zoom, cx, cy } = view ?? defaultView;
  const viewWidth = fitWidth / zoom;
  const viewHeight = fitHeight / zoom;
  const viewMoved =
    zoom !== defaultView.zoom || cx !== defaultView.cx || cy !== defaultView.cy;

  // Pin and label sizes stay in user space, so they zoom with the screens
  // rather than floating over them at a fixed size.
  const pinRadius = unit * 0.022;
  const labelSize = unit * 0.022;

  const clampView = (next: CanvasView): CanvasView => ({
    zoom: next.zoom,
    cx: clamp(next.cx, bounds.minX - marginX, bounds.maxX + marginX),
    cy: clamp(next.cy, bounds.minY - marginY, bounds.maxY + marginY),
  });

  /** Zooms about `anchor` (the pointer) or, without one, the canvas centre. */
  const zoomBy = (factor: number, anchor?: { x: number; y: number }) => {
    setView((current) => {
      const from = current ?? defaultView;
      const nextZoom = clamp(from.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      if (nextZoom === from.zoom) return current;
      const point = anchor ?? { x: from.cx, y: from.cy };
      const ratio = from.zoom / nextZoom;
      return clampView({
        zoom: nextZoom,
        cx: point.x - (point.x - from.cx) * ratio,
        cy: point.y - (point.y - from.cy) * ratio,
      });
    });
  };

  const movePin = (event: PointerEvent<SVGSVGElement>, key: string) => {
    const pin = pins.find((candidate) => candidate.key === key);
    if (!pin) return;
    const pointer = svgPoint(event.currentTarget, event);
    const rawX = pointer.x + dragOffset.current.x;
    const rawY = pointer.y + dragOffset.current.y;
    const display = nearestDisplay(displays, rawX, rawY);
    const x = Math.max(display.x, Math.min(display.x + display.width, rawX));
    const y = Math.max(display.y, Math.min(display.y + display.height, rawY));
    const next = displayPointToPosition(x, y, bounds, frame);
    onMove(key, {
      x: holdOutsideFrame(pin.position.x, next.x, frame.left, frame.right),
      z: holdOutsideFrame(pin.position.z, next.z, frame.bottom, frame.top),
    });
  };

  const endGesture = () => {
    setDraggingKey(null);
    panPointer.current = null;
  };

  return (
    <div
      className={cn(
        "relative h-full min-h-72 w-full overflow-hidden rounded-3xl border border-foreground/15 bg-muted/20",
        className,
      )}
    >
      <svg
        role="group"
        aria-label="Light sampling regions on selected displays"
        className="h-full w-full cursor-grab touch-none select-none active:cursor-grabbing"
        viewBox={`${cx - viewWidth / 2} ${cy - viewHeight / 2} ${viewWidth} ${viewHeight}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={(event) => {
          const target = (event.target as SVGElement).closest<SVGGElement>(
            "[data-pin-key]",
          );
          const key = target?.dataset.pinKey;
          if (!key) {
            // Empty canvas: the drag moves the view, not a light.
            panPointer.current = { x: event.clientX, y: event.clientY };
            panScale.current = event.currentTarget.getScreenCTM()?.a || 1;
            event.currentTarget.setPointerCapture(event.pointerId);
            return;
          }
          const pin = pins.find((candidate) => candidate.key === key);
          if (!pin) return;
          const pointer = svgPoint(event.currentTarget, event);
          const anchor = positionToDisplayPoint(pin.position, bounds, frame);
          dragOffset.current = {
            x: anchor.x - pointer.x,
            y: anchor.y - pointer.y,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          onActivate(key);
          setDraggingKey(key);
        }}
        onPointerMove={(event) => {
          if (draggingKey) {
            movePin(event, draggingKey);
            return;
          }
          const from = panPointer.current;
          if (!from) return;
          // Measured in client space, so moves batched into one frame can't
          // compound against a viewBox that has already shifted under them.
          const dx = (event.clientX - from.x) / panScale.current;
          const dy = (event.clientY - from.y) / panScale.current;
          panPointer.current = { x: event.clientX, y: event.clientY };
          setView((current) => {
            const base = current ?? defaultView;
            return clampView({ ...base, cx: base.cx - dx, cy: base.cy - dy });
          });
        }}
        onPointerUp={(event) => {
          if (draggingKey) movePin(event, draggingKey);
          endGesture();
        }}
        onPointerCancel={endGesture}
        // No preventDefault: React listens for wheel passively, and nothing
        // around the canvas scrolls, so the gesture is ours already.
        onWheel={(event: WheelEvent<SVGSVGElement>) => {
          zoomBy(
            Math.exp(-event.deltaY * WHEEL_ZOOM_RATE),
            svgPoint(event.currentTarget, event),
          );
        }}
      >
        {displays.map((display) => (
          <g key={display.id}>
            <rect
              x={display.x}
              y={display.y}
              width={display.width}
              height={display.height}
              rx={unit * 0.012}
              className="fill-background stroke-foreground/20"
              strokeWidth={unit * 0.003}
            />
            <text
              x={display.x + display.width / 2}
              y={display.y + display.height / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              className="pointer-events-none fill-muted-foreground font-medium"
              fontSize={labelSize}
            >
              {display.name}
            </text>
            <text
              x={display.x + display.width / 2}
              y={display.y + display.height / 2 + labelSize * 1.3}
              textAnchor="middle"
              dominantBaseline="middle"
              className="pointer-events-none fill-muted-foreground/70"
              fontSize={labelSize * 0.72}
            >
              {displayDetails ?? `${display.width} × ${display.height}`}
            </text>
          </g>
        ))}

        {pins.map((pin) => {
          const point = positionToDisplayPoint(pin.position, bounds, frame);
          const region = sampleRegionForPosition(
            pin.position,
            displays,
            bounds,
            frame,
          );
          const active = pin.key === activeKey;
          return (
            <g
              key={pin.key}
              data-pin-key={pin.key}
              className="cursor-grab active:cursor-grabbing"
            >
              <rect
                x={region.left}
                y={region.top}
                width={region.right - region.left}
                height={region.bottom - region.top}
                rx={unit * 0.009}
                fill={pin.color ?? "var(--primary)"}
                fillOpacity={pin.color ? 0.28 : active ? 0.2 : 0.1}
                stroke={pin.color ?? "var(--primary)"}
                strokeOpacity={active ? 1 : 0.65}
                strokeWidth={unit * (active ? 0.006 : 0.004)}
              />
              <circle
                cx={point.x}
                cy={point.y}
                r={pinRadius}
                fill={pin.color ?? "var(--primary)"}
                className={
                  pin.color
                    ? "stroke-placement-pin-foreground"
                    : "stroke-background"
                }
                strokeOpacity={pin.color ? 0.65 : 1}
                strokeWidth={unit * 0.005}
              />
              <text
                x={point.x}
                y={point.y}
                textAnchor="middle"
                dominantBaseline="central"
                className={
                  pin.color
                    ? "pointer-events-none fill-placement-pin-foreground font-semibold"
                    : "pointer-events-none fill-primary-foreground font-semibold"
                }
                fontSize={pinRadius}
              >
                {pin.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div
        className={cn(
          "absolute top-3 right-3 z-10 flex items-center gap-1",
          overlayInsetClassName,
        )}
      >
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out"
          disabled={zoom <= MIN_ZOOM}
          onClick={() => zoomBy(1 / ZOOM_STEP)}
          className="flex size-8 cursor-pointer items-center justify-center rounded-full border border-foreground/15 bg-background/80 text-muted-foreground backdrop-blur hover:text-foreground disabled:cursor-default disabled:opacity-40"
        >
          <ZoomOut className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom in"
          disabled={zoom >= MAX_ZOOM}
          onClick={() => zoomBy(ZOOM_STEP)}
          className="flex size-8 cursor-pointer items-center justify-center rounded-full border border-foreground/15 bg-background/80 text-muted-foreground backdrop-blur hover:text-foreground disabled:cursor-default disabled:opacity-40"
        >
          <ZoomIn className="size-3.5" />
        </button>
        {viewMoved && (
          <button
            type="button"
            onClick={() => setView(null)}
            className="flex cursor-pointer items-center gap-1.5 rounded-full border border-foreground/15 bg-background/80 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur hover:text-foreground"
          >
            <RotateCcw className="size-3.5" /> Reset view
          </button>
        )}
      </div>

      <p
        className={cn(
          "pointer-events-none absolute right-3 bottom-2 text-[10px] font-medium tracking-wide text-muted-foreground/60 uppercase",
          overlayInsetClassName,
        )}
      >
        Drag to pan · Scroll to zoom
      </p>
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
        Drag a light to choose the screen area it follows
      </div>
    </div>
  );
};
