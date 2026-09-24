import { rgbToCss } from "@/features/space-screen/utils/color";
import {
  paintTemperatureWheel,
  WHEEL_CANVAS_SIZE,
} from "@/features/space-screen/utils/wheel-canvas";
import {
  tempWheelY,
  temperatureWheelColor,
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

interface MultiTemperatureWheelProps {
  /** Color-temperature-capable lights; each gets its own draggable thumb. */
  lights: HueLight[];
  selectedIds: ReadonlySet<string>;
  focusedId: string | null;
  onFocusedIdChange: (id: string | null) => void;
  onPickMany: (picks: { light: HueLight; value: number }[]) => void;
}

const DEFAULT_CT_MIN = 153;
const DEFAULT_CT_MAX = 500;
const THROTTLE_MS = 180;
const SNAP_RADIUS = 0.065;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const ctMinOf = (light: HueLight): number => light.ctMin ?? DEFAULT_CT_MIN;
const ctMaxOf = (light: HueLight): number => light.ctMax ?? DEFAULT_CT_MAX;

const valueFromY = (y: number, light: HueLight): number => {
  const min = ctMinOf(light);
  const max = ctMaxOf(light);
  return Math.round(max - clamp01(y) * (max - min));
};

// Spread newly-seen thumbs across the available chord at their current
// temperature so lights at the same temperature don't stack invisibly.
const initialX = (index: number, count: number, y: number): number => {
  if (count <= 1) return 0.5;
  const chordRadius = Math.sqrt(Math.max(0, 0.25 - (y - 0.5) ** 2));
  const insetRadius = chordRadius * 0.8;
  return 0.5 + ((index / (count - 1)) * 2 - 1) * insetRadius;
};

type Pin = { x: number; y: number };

const yForLight = (light: HueLight): number =>
  light.ct != null ? tempWheelY(light.ct, ctMinOf(light), ctMaxOf(light)) : 0.5;

const pinForLight = (light: HueLight, index: number, count: number): Pin => {
  const y = yForLight(light);
  return { x: initialX(index, count, y), y };
};

/**
 * Group white-temperature picker: the same warm→cool disk as
 * {@link TemperatureWheel}, with one thumb per ct light. Dragging a thumb moves
 * it freely in the disk and changes only that light's temperature.
 */
export const MultiTemperatureWheel: React.FC<MultiTemperatureWheelProps> = ({
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
  const pointerStart = useRef({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const lastEmit = useRef(0);
  const trailing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEmitted = useRef<Record<string, number>>({});

  const [pins, setPins] = useState<Record<string, Pin>>(() =>
    Object.fromEntries(
      lights.map((light, index) => [
        light.id,
        pinForLight(light, index, lights.length),
      ]),
    ),
  );
  const [snapId, setSnapId] = useState<string | null>(null);
  const [pointerPin, setPointerPin] = useState<Pin | null>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) paintTemperatureWheel(ctx);
  }, []);

  // Reflect each light's live temperature onto its thumb's vertical position
  // when idle, preserving its local x position.
  useEffect(() => {
    if (dragging.current) return;
    setPins((prev) => {
      const next: Record<string, Pin> = {};
      lights.forEach((light, index) => {
        const fallback = pinForLight(light, index, lights.length);
        const x = prev[light.id]?.x ?? fallback.x;
        const sent = lastEmitted.current[light.id];
        if (
          sent != null &&
          light.ct != null &&
          Math.abs(sent - light.ct) <= 1
        ) {
          next[light.id] = prev[light.id] ?? fallback;
        } else {
          next[light.id] = { x, y: yForLight(light) };
        }
      });
      return next;
    });
  }, [lights]);

  useEffect(
    () => () => {
      if (trailing.current) clearTimeout(trailing.current);
    },
    [],
  );

  const emit = (targets: HueLight[], y: number, force: boolean) => {
    const picks = targets.map((light) => {
      const value = valueFromY(y, light);
      lastEmitted.current[light.id] = value;
      return { light, value };
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

  const handlePointer = (clientX: number, clientY: number, force: boolean) => {
    const id = activeId.current;
    if (!id) return;
    const light = lights.find((candidate) => candidate.id === id);
    if (!light) return;
    const lightIndex = lights.findIndex((candidate) => candidate.id === id);
    const activePin =
      pins[id] ?? pinForLight(light, lightIndex, lights.length);
    const snappedCluster = lights.filter((candidate, index) => {
      const candidatePin =
        pins[candidate.id] ?? pinForLight(candidate, index, lights.length);
      return (
        Math.abs(candidatePin.x - activePin.x) < 0.002 &&
        Math.abs(candidatePin.y - activePin.y) < 0.002
      );
    });
    const targets =
      selectedIds.has(id) && selectedIds.size > 0
        ? lights.filter((candidate) => selectedIds.has(candidate.id))
        : snappedCluster;
    const pos = positionFromEvent(clientX, clientY);
    if (!pos) return;
    setPointerPin(pos);
    const movingIds = new Set(targets.map((target) => target.id));
    let nearest: string | null = null;
    let nearestDistance = SNAP_RADIUS;
    lights.forEach((candidate, index) => {
      if (movingIds.has(candidate.id)) return;
      const candidatePin =
        pins[candidate.id] ?? pinForLight(candidate, index, lights.length);
      const distance = Math.hypot(candidatePin.x - pos.x, candidatePin.y - pos.y);
      if (distance < nearestDistance) {
        nearest = candidate.id;
        nearestDistance = distance;
      }
    });
    setSnapId(nearest);
    const destination = nearest ? (pins[nearest] ?? pos) : pos;
    setPins((prev) => ({
      ...prev,
      ...Object.fromEntries(targets.map((target) => [target.id, destination])),
    }));
    const snappedTargets = nearest
      ? [...targets, lights.find((candidate) => candidate.id === nearest)!]
      : targets;
    emit(snappedTargets, destination.y, force);
  };

  const grabNearest = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    let nearest: string | null = null;
    let best = Infinity;
    lights.forEach((light, index) => {
      const pin = pins[light.id] ?? pinForLight(light, index, lights.length);
      const tx = rect.left + pin.x * rect.width;
      const ty = rect.top + pin.y * rect.height;
      const distance = Math.hypot(clientX - tx, clientY - ty);
      if (distance < best) {
        best = distance;
        nearest = light.id;
      }
    });
    const grabbed = best <= wheelThumbHitRadius(rect.width) ? nearest : null;
    activeId.current = grabbed;
    onFocusedIdChange(grabbed);
    dragOffset.current = { x: 0, y: 0 };
  };

  return (
    <div
      ref={containerRef}
      className="@container relative aspect-square w-full cursor-pointer touch-none rounded-full"
      style={wheelThumbStyle}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        grabNearest(e.clientX, e.clientY);
        pointerStart.current = { x: e.clientX, y: e.clientY };
        setIsDragging(activeId.current != null);
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
        }
        handlePointer(e.clientX, e.clientY, false);
      }}
      onPointerUp={(e) => {
        if (dragging.current) {
          handlePointer(e.clientX, e.clientY, true);
        }
        dragging.current = false;
        setIsDragging(false);
        activeId.current = null;
        setSnapId(null);
        setPointerPin(null);
        onFocusedIdChange(null);
      }}
      onPointerCancel={() => {
        dragging.current = false;
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
      {lights.map((light, index) => {
        const pin = pins[light.id] ?? pinForLight(light, index, lights.length);
        const cluster = lights.filter((candidate, candidateIndex) => {
          if (!selectedIds.has(candidate.id)) return false;
          const candidatePin =
            pins[candidate.id] ??
            pinForLight(candidate, candidateIndex, lights.length);
          return (
            Math.abs(candidatePin.x - pin.x) < 0.002 &&
            Math.abs(candidatePin.y - pin.y) < 0.002
          );
        });
        if (
          selectedIds.has(light.id) &&
          cluster.length > 1 &&
          cluster[0]?.id !== light.id
        ) {
          return null;
        }
        const selected = selectedIds.has(light.id);
        const focused = cluster.some((candidate) => candidate.id === focusedId);
        const draggingPin = isDragging && activeId.current === light.id;
        const snapTarget = snapId === light.id;
        const displayPin = draggingPin && pointerPin ? pointerPin : pin;
        const Icon = getLightIcon(light.typeName);
        const fill = rgbToCss(temperatureWheelColor(displayPin.y));
        return (
          <span
            key={light.id}
            className={`absolute flex cursor-pointer items-center justify-center border-2 border-white shadow-md ring-black/30 transition-[width,height,opacity,border-radius,box-shadow,transform] ${draggingPin || snapTarget ? `${wheelThumbClasses.lifted} rounded-[50%_50%_50%_0] opacity-75` : `${wheelThumbClasses.base} rounded-full`} ${selected ? "z-20 ring-2" : "z-10 ring-1"} ${focused ? "scale-110 ring-2 ring-ring" : wheelThumbClasses.hover}`}
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
                draggingPin || snapTarget ? "rotate(-45deg)" : undefined,
            }}
            onPointerEnter={() => onFocusedIdChange(light.id)}
            onPointerLeave={() => {
              if (!dragging.current) onFocusedIdChange(null);
            }}
          >
            <Icon
              className={wheelThumbClasses.icon}
              style={{
                transform:
                  draggingPin || snapTarget ? "rotate(45deg)" : undefined,
              }}
            />
          </span>
        );
      })}
    </div>
  );
};
