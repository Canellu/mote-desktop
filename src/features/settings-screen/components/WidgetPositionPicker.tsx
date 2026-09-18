import { Button } from "@/components/ui/button";
import type {
  MonitorInfo,
  WidgetBounds,
  WidgetPlacement,
} from "@/features/widget-screen/types";
import { describeCommandError } from "@/lib/entitlement-errors";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Crosshair, Monitor, RotateCcw } from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { ProTag } from "./ProTag";

// Fallback widget size (physical px) used to anchor a widget whose real size
// isn't known yet — i.e. a closed widget that's never been placed. Mirrors the
// Rust DEFAULT_WIDGET_WIDTH/HEIGHT so the preview rectangle matches.
const FALLBACK_WIDTH = 360;
const FALLBACK_HEIGHT = 136;
// Caps the preview height; its width then follows from the desktop aspect ratio
// so a wide multi-monitor layout stays short rather than overflowing the panel.
const MAX_PREVIEW_HEIGHT = 200;

const ROW_LABELS = ["Top", "Middle", "Bottom"] as const;
const COL_LABELS = ["left", "center", "right"] as const;

const regionLabel = (row: number, col: number) =>
  row === 1 && col === 1 ? "Center" : `${ROW_LABELS[row]} ${COL_LABELS[col]}`;

const clampAxis = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

/** The virtual-desktop box enclosing every monitor and the widget — so an
 * off-screen widget is still visible in the preview and reachable. */
const desktopExtent = (placement: WidgetPlacement) => {
  const rects = placement.monitors.map((m) => ({
    x: m.x,
    y: m.y,
    width: m.width,
    height: m.height,
  }));
  if (placement.bounds) rects.push(placement.bounds);

  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.width));
  const maxY = Math.max(...rects.map((r) => r.y + r.height));
  return { minX, minY, width: maxX - minX || 1, height: maxY - minY || 1 };
};

export const WidgetPositionPicker = ({
  widgetId,
  onProRequired,
}: {
  widgetId: string;
  /**
   * Set on Free. Placing the widget from here is Pro, so dragging the preview or
   * picking a region calls this instead. Reset stays free: it is recovery, not
   * placement.
   */
  onProRequired?: () => void;
}) => {
  const [placement, setPlacement] = useState<WidgetPlacement | null>(null);
  const [busy, setBusy] = useState(false);
  // While the user drags the preview rectangle, the widget's bounds are driven
  // optimistically from here so the rectangle tracks the pointer at 60fps without
  // waiting on the round-trip to move the real window. `null` when not dragging,
  // in which case the live `placement.bounds` is shown instead.
  const [dragBounds, setDragBounds] = useState<WidgetBounds | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  // True for the lifetime of a preview drag. Gates the incoming `widget-moved`
  // event so the live window echo can't fight the optimistic local position.
  const draggingRef = useRef(false);

  const load = useCallback(async () => {
    try {
      setPlacement(
        await invoke<WidgetPlacement>("get-widget-placement", { widgetId }),
      );
    } catch {
      // Non-critical: leave the last layout shown if the lookup fails.
    }
  }, [widgetId]);

  useEffect(() => {
    void load();
    // The widget can be dragged or resized directly; refresh when the user
    // returns to this window so the preview reflects its real spot.
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  // Live half of the two-way sync: when the real widget window is dragged on the
  // desktop, the backend streams its new bounds here so the preview rectangle
  // follows in real time. Ignored while the user is dragging the preview itself,
  // so the optimistic local position isn't overwritten by its own echo.
  useEffect(() => {
    const unlisten = listen<{ widgetId: string; bounds: WidgetBounds }>(
      "widget-moved",
      (event) => {
        if (event.payload.widgetId !== widgetId || draggingRef.current) return;
        setPlacement((current) =>
          current ? { ...current, bounds: event.payload.bounds } : current,
        );
      },
    );
    return () => void unlisten.then((dispose) => dispose());
  }, [widgetId]);

  const moveTo = useCallback(
    async (x: number, y: number) => {
      setBusy(true);
      try {
        await invoke("set-widget-position", {
          widgetId,
          x: Math.round(x),
          y: Math.round(y),
        });
        await load();
      } catch (error) {
        toast.error(describeCommandError(error) || "Unable to move widget");
      } finally {
        setBusy(false);
      }
    },
    [load, widgetId],
  );

  const reset = useCallback(async () => {
    setBusy(true);
    try {
      await invoke("reset-widget-position", { widgetId });
      await load();
    } catch (error) {
      toast.error(
        describeCommandError(error) || "Unable to reset widget position",
      );
    } finally {
      setBusy(false);
    }
  }, [load, widgetId]);

  // Coalesces the per-frame position writes during a drag: `set-widget-position`
  // moves the real window but skips the reload `moveTo` does, and we only fire at
  // most one per animation frame so streaming the drag stays cheap.
  const applyFrameRef = useRef<number | null>(null);
  const pendingRef = useRef<{ x: number; y: number } | null>(null);

  const applyPosition = useCallback(
    (x: number, y: number) => {
      void invoke("set-widget-position", {
        widgetId,
        x: Math.round(x),
        y: Math.round(y),
      }).catch(() => {
        // Best-effort while dragging; pointer-up reconciles via `load`.
      });
    },
    [widgetId],
  );

  const scheduleApply = useCallback(
    (x: number, y: number) => {
      pendingRef.current = { x, y };
      if (applyFrameRef.current != null) return;
      applyFrameRef.current = requestAnimationFrame(() => {
        applyFrameRef.current = null;
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (pending) applyPosition(pending.x, pending.y);
      });
    },
    [applyPosition],
  );

  // Drag the preview rectangle to move the widget: maps pointer travel through
  // the preview's scale into virtual-desktop pixels, drives the rectangle
  // optimistically, and streams the real window along with it.
  const startRectDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const preview = previewRef.current;
    if (!placement?.bounds || !preview || busy) return;
    event.preventDefault();
    event.stopPropagation();
    if (onProRequired) {
      onProRequired();
      return;
    }

    const extent = desktopExtent(placement);
    const rect = preview.getBoundingClientRect();
    const start = placement.bounds;
    const perPxX = extent.width / rect.width;
    const perPxY = extent.height / rect.height;
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const maxX = extent.minX + extent.width - start.width;
    const maxY = extent.minY + extent.height - start.height;

    draggingRef.current = true;

    const onMove = (move: PointerEvent) => {
      const next = {
        ...start,
        x: clampAxis(
          start.x + (move.clientX - startClientX) * perPxX,
          extent.minX,
          maxX,
        ),
        y: clampAxis(
          start.y + (move.clientY - startClientY) * perPxY,
          extent.minY,
          maxY,
        ),
      };
      setDragBounds(next);
      scheduleApply(next.x, next.y);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      // Apply the final spot immediately rather than waiting on the next frame,
      // then reconcile with the window's actual (clamped) position.
      if (applyFrameRef.current != null) {
        cancelAnimationFrame(applyFrameRef.current);
        applyFrameRef.current = null;
      }
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) applyPosition(pending.x, pending.y);
      draggingRef.current = false;
      setDragBounds(null);
      void load();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // Snap the widget to one of a monitor's nine regions (corners, edges, centre).
  const snapToRegion = (monitor: MonitorInfo, row: number, col: number) => {
    if (onProRequired) {
      onProRequired();
      return;
    }
    const w = Math.min(
      placement?.bounds?.width ?? FALLBACK_WIDTH,
      monitor.workWidth,
    );
    const h = Math.min(
      placement?.bounds?.height ?? FALLBACK_HEIGHT,
      monitor.workHeight,
    );

    const byCol = [
      monitor.workX,
      monitor.workX + (monitor.workWidth - w) / 2,
      monitor.workX + monitor.workWidth - w,
    ];
    const byRow = [
      monitor.workY,
      monitor.workY + (monitor.workHeight - h) / 2,
      monitor.workY + monitor.workHeight - h,
    ];

    const clamp = (value: number, min: number, max: number) =>
      Math.min(Math.max(value, min), max);
    const x = clamp(
      byCol[col],
      monitor.workX,
      monitor.workX + monitor.workWidth - w,
    );
    const y = clamp(
      byRow[row],
      monitor.workY,
      monitor.workY + monitor.workHeight - h,
    );
    void moveTo(x, y);
  };

  if (!placement || placement.monitors.length === 0) return null;

  const extent = desktopExtent(placement);
  const pct = (value: number, origin: number, span: number) =>
    ((value - origin) / span) * 100;
  const bounds = placement.bounds;
  // While dragging, render the optimistic local bounds so the rectangle tracks
  // the pointer instantly; otherwise show the widget's real (live) bounds.
  const displayBounds = dragBounds ?? bounds;

  return (
    <div className="mb-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium">
            Position
            {onProRequired ? <ProTag /> : null}
          </p>
          <p className="text-xs text-muted-foreground">
            Drag the widget, or click a region to move it there.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="rounded-lg"
          disabled={busy}
          onClick={() => void reset()}
        >
          <RotateCcw size={14} />
          Reset position
        </Button>
      </div>

      <div className="flex justify-center">
        <div
          ref={previewRef}
          className="relative w-full overflow-hidden rounded-xl border border-border/60 bg-muted/40"
          style={{
            aspectRatio: `${extent.width} / ${extent.height}`,
            maxWidth: (MAX_PREVIEW_HEIGHT * extent.width) / extent.height,
          }}
        >
          {placement.monitors.map((monitor, index) => (
            <div
              key={`${monitor.x},${monitor.y},${index}`}
              className="absolute rounded-md border border-border/70 bg-card/60 shadow-sm"
              style={{
                left: `${pct(monitor.x, extent.minX, extent.width)}%`,
                top: `${pct(monitor.y, extent.minY, extent.height)}%`,
                width: `${(monitor.width / extent.width) * 100}%`,
                height: `${(monitor.height / extent.height) * 100}%`,
              }}
            >
              <span className="pointer-events-none absolute left-1 top-1 z-20 flex items-center gap-1 rounded bg-background/70 px-1 py-0.5 text-[9px] font-medium text-muted-foreground">
                <Monitor size={9} />
                {monitor.isPrimary
                  ? "Primary"
                  : `${monitor.width}×${monitor.height}`}
              </span>
              <div className="absolute inset-0 z-10 grid grid-cols-3 grid-rows-3">
                {Array.from({ length: 9 }).map((_, cell) => {
                  const row = Math.floor(cell / 3);
                  const col = cell % 3;
                  return (
                    <button
                      key={cell}
                      type="button"
                      disabled={busy}
                      title={`${regionLabel(row, col)}${monitor.isPrimary ? "" : " · this monitor"}`}
                      onClick={() => snapToRegion(monitor, row, col)}
                      className="group flex items-center justify-center border border-transparent transition-colors hover:border-primary/40 hover:bg-primary/10 disabled:cursor-not-allowed"
                    >
                      <span className="size-1 rounded-full bg-muted-foreground/30 transition-all group-hover:size-1.5 group-hover:bg-primary" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {displayBounds ? (
            <div
              role="button"
              tabIndex={0}
              aria-label="Drag to move the widget"
              onPointerDown={startRectDrag}
              className={cn(
                "absolute z-30 flex touch-none select-none items-center justify-center rounded-sm border-2 border-primary bg-primary/25 transition-colors hover:bg-primary/35",
                dragBounds ? "cursor-grabbing" : "cursor-grab",
                busy && "pointer-events-none",
              )}
              style={{
                left: `${pct(displayBounds.x, extent.minX, extent.width)}%`,
                top: `${pct(displayBounds.y, extent.minY, extent.height)}%`,
                width: `${(displayBounds.width / extent.width) * 100}%`,
                height: `${(displayBounds.height / extent.height) * 100}%`,
              }}
            >
              <Crosshair
                size={12}
                className="pointer-events-none text-primary"
              />
            </div>
          ) : null}
        </div>
      </div>

      {!bounds ? (
        <p className="mt-2 text-xs text-muted-foreground">
          The widget isn't placed yet — pick a region to set where it opens.
        </p>
      ) : null}
    </div>
  );
};
