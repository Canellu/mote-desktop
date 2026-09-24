import {
  hsvToRgb,
  rgbToCss,
  rgbToHex,
  rgbToXy,
} from "@/features/space-screen/utils/color";
import {
  paintColorWheel,
  WHEEL_CANVAS_SIZE,
} from "@/features/space-screen/utils/wheel-canvas";
import {
  pinToHueSaturation,
  xyToPin,
} from "@/features/space-screen/utils/wheel-color";
import type { HueLight } from "@/types/hue";
import { getLightIcon } from "@/features/space-screen/utils/light-icons";
import {
  wheelThumbClasses,
  wheelThumbHitRadius,
  wheelThumbStyle,
} from "@/features/space-screen/utils/wheel-thumb";
import { foregroundForBackground } from "@/lib/tile-theme";
import { useEffect, useRef, useState } from "react";

interface MultiColorWheelProps {
  /** Color-capable lights of the space; each gets its own draggable thumb. */
  lights: HueLight[];
  selectedIds: ReadonlySet<string>;
  focusedId: string | null;
  onFocusedIdChange: (id: string | null) => void;
  onPickMany: (
    picks: { light: HueLight; xy: [number, number]; vividHex: string }[],
  ) => void;
}

const THROTTLE_MS = 180;
const SNAP_RADIUS = 0.065;
const EXPANDED_RING_RADIUS = 0.27;
const EXPANDED_PAGE_SIZE = 8;

type Pin = { x: number; y: number };

const pinForLight = (light: HueLight): Pin =>
  light.xy ? xyToPin(light.xy) : { x: 0.5, y: 0.5 };

/**
 * Group color picker: the same HSV wheel as {@link ColorWheel}, but with one
 * thumb per color light so a whole room/zone can be tuned at once. Pressing the
 * wheel grabs the nearest thumb; dragging moves only that light's color. Each
 * thumb reflects its light's live color when idle and tracks the drag instantly.
 */
export const MultiColorWheel: React.FC<MultiColorWheelProps> = ({
  lights,
  selectedIds,
  focusedId,
  onFocusedIdChange,
  onPickMany,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const activeId = useRef<string | null>(null);
  const dragSingleLight = useRef(false);
  const backgroundTarget = useRef(false);
  const pointerStart = useRef({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  // Client-pixel offset from the cursor to the grabbed thumb centre, locked on
  // press so a grab inside a thumb drags it without snapping it to the cursor.
  const dragOffset = useRef({ x: 0, y: 0 });
  const lastEmit = useRef(0);
  const trailing = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The xy we last sent per light. A pick is clamped into the light's gamut, so
  // the echoed xy can pull a rim thumb back inside; ignore inbound xy that is
  // (within rounding) the value we just sent so the thumb stays put.
  const lastEmitted = useRef<Record<string, [number, number]>>({});

  // Local pin positions (0–1 within the disk) keyed by light id, so dragging
  // feels instant and survives store updates mid-drag.
  const [pins, setPins] = useState<Record<string, Pin>>(() =>
    Object.fromEntries(lights.map((light) => [light.id, pinForLight(light)])),
  );
  const [snapId, setSnapId] = useState<string | null>(null);
  const [pointerPin, setPointerPin] = useState<Pin | null>(null);
  const [armedIds, setArmedIds] = useState<string[] | null>(null);
  const [expandedIds, setExpandedIds] = useState<string[] | null>(null);
  const [expandedPage, setExpandedPage] = useState(0);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) paintColorWheel(ctx);
  }, []);

  // Reflect each light's live color onto its thumb when idle, skipping the thumb
  // whose echo we are still ignoring (see `lastEmitted`).
  useEffect(() => {
    if (dragging.current) return;
    setPins((prev) => {
      const next: Record<string, Pin> = {};
      for (const light of lights) {
        const sent = lastEmitted.current[light.id];
        if (
          light.xy &&
          sent &&
          Math.abs(sent[0] - light.xy[0]) < 0.012 &&
          Math.abs(sent[1] - light.xy[1]) < 0.012
        ) {
          next[light.id] = prev[light.id] ?? pinForLight(light);
        } else {
          next[light.id] = pinForLight(light);
        }
      }
      return next;
    });
  }, [lights]);

  useEffect(
    () => () => {
      if (trailing.current) clearTimeout(trailing.current);
    },
    [],
  );

  useEffect(() => {
    const cancelActivePin = (event: PointerEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key !== "Escape"
          : containerRef.current?.contains(event.target as Node)
      ) {
        return;
      }
      setArmedIds(null);
      setExpandedIds(null);
    };
    window.addEventListener("pointerdown", cancelActivePin);
    window.addEventListener("keydown", cancelActivePin);
    return () => {
      window.removeEventListener("pointerdown", cancelActivePin);
      window.removeEventListener("keydown", cancelActivePin);
    };
  }, []);

  const emit = (
    targets: HueLight[],
    px: number,
    py: number,
    force: boolean,
  ) => {
    const [hue, saturation] = pinToHueSaturation(px, py);
    const rgb = hsvToRgb(hue, saturation, 1);
    const vividHex = rgbToHex(rgb);
    const picks = targets.map((light) => {
      const xy = rgbToXy(rgb.r, rgb.g, rgb.b, light.gamut);
      lastEmitted.current[light.id] = xy;
      return { light, xy, vividHex };
    });
    const now = Date.now();
    if (trailing.current) {
      clearTimeout(trailing.current);
      trailing.current = null;
    }
    if (force || now - lastEmit.current >= THROTTLE_MS) {
      lastEmit.current = now;
      onPickMany(picks);
    } else {
      trailing.current = setTimeout(() => {
        lastEmit.current = Date.now();
        onPickMany(picks);
      }, THROTTLE_MS);
    }
  };

  const positionFromEvent = (clientX: number, clientY: number): Pin | null => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    let nx = (clientX + dragOffset.current.x - rect.left) / rect.width;
    let ny = (clientY + dragOffset.current.y - rect.top) / rect.height;
    const dx = nx - 0.5;
    const dy = ny - 0.5;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0.5) {
      nx = 0.5 + (dx / dist) * 0.5;
      ny = 0.5 + (dy / dist) * 0.5;
    }
    return { x: nx, y: ny };
  };

  const handlePointer = (clientX: number, clientY: number, commit: boolean) => {
    const id = activeId.current;
    if (!id) return;
    const light = lights.find((candidate) => candidate.id === id);
    if (!light) return;
    const activePin = pins[id] ?? pinForLight(light);
    const snappedCluster = lights.filter((candidate) => {
      const candidatePin = pins[candidate.id] ?? pinForLight(candidate);
      return (
        Math.abs(candidatePin.x - activePin.x) < 0.002 &&
        Math.abs(candidatePin.y - activePin.y) < 0.002
      );
    });
    const clusterContainsLinkedLight = snappedCluster.some((candidate) =>
      selectedIds.has(candidate.id),
    );
    const targets = dragSingleLight.current
      ? [light]
      : clusterContainsLinkedLight && selectedIds.size > 0
        ? lights.filter((candidate) => selectedIds.has(candidate.id))
        : snappedCluster;
    const pos = positionFromEvent(clientX, clientY);
    if (!pos) return;
    setPointerPin(pos);
    const movingIds = new Set(targets.map((target) => target.id));
    let nearest: string | null = null;
    let nearestDistance = SNAP_RADIUS;
    for (const candidate of lights) {
      if (movingIds.has(candidate.id)) continue;
      const candidatePin = pins[candidate.id] ?? pinForLight(candidate);
      const distance = Math.hypot(candidatePin.x - pos.x, candidatePin.y - pos.y);
      if (distance < nearestDistance) {
        nearest = candidate.id;
        nearestDistance = distance;
      }
    }
    setSnapId(nearest);
    const destination = commit && nearest ? (pins[nearest] ?? pos) : pos;
    setPins((prev) => ({
      ...prev,
      ...Object.fromEntries(targets.map((target) => [target.id, destination])),
    }));
    const destinationCluster =
      commit && nearest
        ? lights.filter((candidate) => {
            const candidatePin = pins[candidate.id] ?? pinForLight(candidate);
            const targetPin = pins[nearest] ?? pos;
            return (
              Math.abs(candidatePin.x - targetPin.x) < 0.002 &&
              Math.abs(candidatePin.y - targetPin.y) < 0.002
            );
          })
        : [];
    const emittedTargets = [
      ...targets,
      ...destinationCluster.filter(
        (candidate) => !movingIds.has(candidate.id),
      ),
    ];
    emit(emittedTargets, destination.x, destination.y, commit);
  };

  // Pick the thumb whose centre is closest to the press, and lock the grab
  // offset only when the press lands within the thumb's hit radius.
  const grabNearest = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    let nearest: string | null = null;
    let best = Infinity;
    for (const light of lights) {
      const pin = pins[light.id] ?? pinForLight(light);
      const tx = rect.left + pin.x * rect.width;
      const ty = rect.top + pin.y * rect.height;
      const distance = Math.hypot(clientX - tx, clientY - ty);
      if (distance < best) {
        best = distance;
        nearest = light.id;
      }
    }
    const grabbed = best <= wheelThumbHitRadius(rect.width) ? nearest : null;
    activeId.current = grabbed;
    onFocusedIdChange(grabbed);
    dragOffset.current = { x: 0, y: 0 };
  };

  const clusterForId = (id: string): HueLight[] => {
    const light = lights.find((candidate) => candidate.id === id);
    if (!light) return [];
    const pin = pins[id] ?? pinForLight(light);
    return lights.filter((candidate) => {
      const candidatePin = pins[candidate.id] ?? pinForLight(candidate);
      return (
        Math.abs(candidatePin.x - pin.x) < 0.002 &&
        Math.abs(candidatePin.y - pin.y) < 0.002
      );
    });
  };

  const beginExpandedPinDrag = (
    event: React.PointerEvent<HTMLSpanElement>,
    id: string,
  ) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    activeId.current = id;
    dragSingleLight.current = true;
    dragging.current = false;
    pointerStart.current = { x: event.clientX, y: event.clientY };
    dragOffset.current = { x: 0, y: 0 };
    setIsDragging(true);
    setPointerPin(pins[id] ?? null);
    onFocusedIdChange(id);
  };

  const expandedLights = expandedIds
    ?.map((id) => lights.find((light) => light.id === id))
    .filter((light): light is HueLight => light != null);
  const expandedAnchor =
    expandedLights && expandedLights.length > 0
      ? pins[expandedLights[0].id] ?? pinForLight(expandedLights[0])
      : null;
  const expandedAngle = expandedAnchor
    ? Math.atan2(expandedAnchor.y - 0.5, expandedAnchor.x - 0.5)
    : 0;
  const expandedPageCount = expandedLights
    ? Math.ceil(expandedLights.length / EXPANDED_PAGE_SIZE)
    : 0;
  const visibleExpandedLights = expandedLights?.slice(
    expandedPage * EXPANDED_PAGE_SIZE,
    (expandedPage + 1) * EXPANDED_PAGE_SIZE,
  );
  const sameIds = (left: string[] | null, right: string[]): boolean =>
    left?.length === right.length &&
    right.every((id) => left.includes(id));

  return (
    <div className="flex w-full flex-col gap-3">
      <div
        ref={containerRef}
        className="@container relative aspect-square w-full cursor-pointer touch-none rounded-full"
        style={wheelThumbStyle}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          grabNearest(e.clientX, e.clientY);
          dragSingleLight.current = false;
          backgroundTarget.current = activeId.current == null;
          if (backgroundTarget.current) {
            const targetId =
              lights.find((light) => selectedIds.has(light.id))?.id ??
              armedIds?.[0] ??
              null;
            activeId.current = targetId;
            onFocusedIdChange(targetId);
          }
          if (!activeId.current) {
            setArmedIds(null);
            setExpandedIds(null);
          }
          pointerStart.current = { x: e.clientX, y: e.clientY };
          setIsDragging(false);
          setPointerPin(
            activeId.current
              ? positionFromEvent(e.clientX, e.clientY)
              : null,
          );
        }}
        onPointerMove={(e) => {
          if (!activeId.current) return;
          if (!dragging.current) {
            if (
              e.clientX === pointerStart.current.x &&
              e.clientY === pointerStart.current.y
            ) {
              return;
            }
            dragging.current = true;
            setIsDragging(true);
            setArmedIds(null);
            setExpandedIds(null);
          }
          handlePointer(e.clientX, e.clientY, false);
        }}
        onPointerUp={(e) => {
          if (backgroundTarget.current && activeId.current) {
            handlePointer(e.clientX, e.clientY, true);
            if (selectedIds.size === 0) setArmedIds(null);
            setExpandedIds(null);
          } else if (dragging.current) {
            handlePointer(e.clientX, e.clientY, true);
          } else if (activeId.current && !dragSingleLight.current) {
            const cluster = clusterForId(activeId.current);
            const clusterIds = cluster.map((light) => light.id);
            if (cluster.length > 1 && sameIds(armedIds, clusterIds)) {
              setExpandedIds(clusterIds);
              setExpandedPage(0);
              setArmedIds(null);
            } else if (cluster.length === 1 && sameIds(armedIds, clusterIds)) {
              setArmedIds(null);
              setExpandedIds(null);
            } else {
              setArmedIds(clusterIds);
              setExpandedIds(null);
            }
          }
          dragging.current = false;
          dragSingleLight.current = false;
          backgroundTarget.current = false;
          setIsDragging(false);
          activeId.current = null;
          setSnapId(null);
          setPointerPin(null);
          onFocusedIdChange(null);
        }}
        onPointerCancel={() => {
          dragging.current = false;
          dragSingleLight.current = false;
          backgroundTarget.current = false;
          setIsDragging(false);
          activeId.current = null;
          setSnapId(null);
          setPointerPin(null);
          onFocusedIdChange(null);
        }}
      >
        <canvas
          ref={canvasRef}
          width={WHEEL_CANVAS_SIZE}
          height={WHEEL_CANVAS_SIZE}
          className="size-full rounded-full"
        />
        {lights.map((light) => {
          const pin = pins[light.id] ?? pinForLight(light);
          const cluster = lights.filter((candidate) => {
            const candidatePin = pins[candidate.id] ?? pinForLight(candidate);
            return (
              Math.abs(candidatePin.x - pin.x) < 0.002 &&
              Math.abs(candidatePin.y - pin.y) < 0.002
            );
          });
          const activeClusterMember = cluster.find(
            (candidate) => candidate.id === activeId.current,
          );
          const representative = activeClusterMember ?? cluster[0];
          if (expandedIds?.includes(light.id)) return null;
          if (
            cluster.length > 1 &&
            representative?.id !== light.id
          ) {
            return null;
          }
          const selected = cluster.some((candidate) =>
            selectedIds.has(candidate.id),
          );
          const selectedCount = cluster.filter((candidate) =>
            selectedIds.has(candidate.id),
          ).length;
          const focused = cluster.some(
            (candidate) => candidate.id === focusedId,
          );
          const draggingPin = isDragging && activeClusterMember != null;
          const snapTarget = cluster.some(
            (candidate) => candidate.id === snapId,
          );
          const armedPin =
            cluster.every((candidate) => armedIds?.includes(candidate.id)) &&
            armedIds?.length === cluster.length;
          const displayPin = draggingPin && pointerPin ? pointerPin : pin;
          const Icon = getLightIcon(light.typeName);
          const [displayHue, displaySaturation] = pinToHueSaturation(
            displayPin.x,
            displayPin.y,
          );
          const fill = rgbToCss(
            hsvToRgb(displayHue, displaySaturation, 1),
          );
          return (
            <span
              key={light.id}
              className={`absolute flex -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center border-2 border-white shadow-md ring-black/30 transition-[width,height,opacity,clip-path,box-shadow,transform] ${draggingPin || snapTarget || armedPin ? `${wheelThumbClasses.lifted} rounded-[50%_50%_50%_0]` : `${wheelThumbClasses.base} rounded-full`} ${draggingPin || snapTarget ? "opacity-75" : ""} ${selected ? "z-20 ring-2" : "z-10 ring-1"} ${focused ? "scale-110 ring-2 ring-ring" : wheelThumbClasses.hover}`}
              style={{
                left: `${displayPin.x * 100}%`,
                top: `${displayPin.y * 100}%`,
                background: fill,
                color: foregroundForBackground(fill),
                translate:
                  draggingPin || snapTarget
                    ? wheelThumbClasses.liftTranslate
                    : "-50% -50%",
                transform:
                  draggingPin || snapTarget || armedPin
                    ? "rotate(-45deg)"
                    : undefined,
              }}
              onPointerEnter={() => onFocusedIdChange(light.id)}
              onPointerLeave={() => {
                if (!dragging.current) onFocusedIdChange(null);
              }}
            >
              {cluster.length > 1 ? (
                <span
                  className="text-xs font-semibold tabular-nums"
                  style={{
                    transform:
                      draggingPin || snapTarget || armedPin
                        ? "rotate(45deg)"
                        : undefined,
                  }}
                >
                  {selectedCount > 0 && selectedCount < cluster.length
                    ? `${selectedCount}/${cluster.length}`
                    : cluster.length}
                </span>
              ) : (
                <Icon
                  className={wheelThumbClasses.icon}
                  style={{
                    transform:
                      draggingPin || snapTarget || armedPin
                        ? "rotate(45deg)"
                        : undefined,
                  }}
                />
              )}
            </span>
          );
        })}
        {expandedLights &&
          visibleExpandedLights &&
          expandedLights.length > 1 && (
          <>
            <div
              className="absolute inset-[23%] z-30 rounded-full border-2 border-white/80 bg-background/55 shadow-xl backdrop-blur-md"
              onPointerDown={(event) => event.stopPropagation()}
              onWheel={(event) => {
                if (expandedPageCount <= 1) return;
                event.stopPropagation();
                const direction = event.deltaY > 0 ? 1 : -1;
                setExpandedPage((page) =>
                  Math.max(
                    0,
                    Math.min(expandedPageCount - 1, page + direction),
                  ),
                );
              }}
            />
            {visibleExpandedLights.map((light, index) => {
              const angle =
                expandedAngle +
                (index * Math.PI * 2) / visibleExpandedLights.length;
              const x = 0.5 + Math.cos(angle) * EXPANDED_RING_RADIUS;
              const y = 0.5 + Math.sin(angle) * EXPANDED_RING_RADIUS;
              const Icon = getLightIcon(light.typeName);
              const [hue, saturation] = pinToHueSaturation(
                expandedAnchor?.x ?? 0.5,
                expandedAnchor?.y ?? 0.5,
              );
              const fill = rgbToCss(hsvToRgb(hue, saturation, 1));

              return (
                <span
                  key={light.id}
                  role="button"
                  aria-label={`Drag ${light.name}`}
                  className="absolute z-40 flex size-10 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border-2 border-white shadow-lg ring-1 ring-black/30 transition-transform hover:scale-110 active:cursor-grabbing"
                  style={{
                    left: `${x * 100}%`,
                    top: `${y * 100}%`,
                    background: fill,
                    color: foregroundForBackground(fill),
                  }}
                  onPointerDown={(event) =>
                    beginExpandedPinDrag(event, light.id)
                  }
                  onPointerEnter={() => onFocusedIdChange(light.id)}
                  onPointerLeave={() => onFocusedIdChange(null)}
                >
                  <Icon className="size-5" />
                </span>
              );
            })}
            {expandedPageCount > 1 && (
              <div
                className="absolute top-1/2 left-1/2 z-40 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full bg-background/35 px-2.5 py-2 shadow-sm backdrop-blur-sm"
                role="tablist"
                aria-label="Light pages"
                onPointerDown={(event) => event.stopPropagation()}
              >
                {Array.from({ length: expandedPageCount }, (_, page) => (
                  <button
                    key={page}
                    type="button"
                    role="tab"
                    aria-label={`Show light page ${page + 1}`}
                    aria-selected={page === expandedPage}
                    className={`h-1.5 rounded-full transition-[width,background-color] ${
                      page === expandedPage
                        ? "w-8 bg-foreground"
                        : "w-5 bg-foreground/20 hover:bg-foreground/40"
                    }`}
                    onClick={() => setExpandedPage(page)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
