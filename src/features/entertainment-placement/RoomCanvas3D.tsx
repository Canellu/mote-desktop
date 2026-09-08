import { useTheme } from "@/context/ThemeContext";
import { overlaySelectionClassName } from "@/lib/selection-styles";
import { cn } from "@/lib/utils";
import type { HostSyncDisplay } from "@/types/host-sync";
import type { HuePosition } from "@/types/hue";
import { Canvas, useThree } from "@react-three/fiber";
import {
  Grid2x2,
  RectangleHorizontal,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  BackSide,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  MathUtils,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Shape,
  Vector2,
  Vector3,
} from "three";
import type { RoomPin } from "./RoomCanvas";
import { roomDisplayFrames, roomFrameOptionsFor } from "./display-geometry";

const CAMERA_FOV = 38;
const CAMERA_ASPECT = 16 / 10;
const DEFAULT_CAMERA_RADIUS = 6.5;
const MIN_CAMERA_RADIUS = 2.6;
const MAX_CAMERA_RADIUS = 12;
/** The camera distance at which a pin overlay renders at its full size. */
const PIN_FULL_SIZE_DISTANCE = 3.8;
const DEFAULT_CAMERA_TARGET = { x: 0, y: -0.05, z: 0 };
// Three-quarter view: both the screen wall and one side wall stay readable,
// and the whole room sits inside the canvas.
const DEFAULT_YAW = -0.75;
const DEFAULT_TILT = 0.3;
const MIN_TILT = -0.08;
const MAX_TILT = Math.PI / 2;
const ORBIT_YAW_RATE = 2.6;
const ORBIT_TILT_RATE = 2.4;
const PAN_RATE = 2.2;
const WHEEL_ZOOM_RATE = 0.001;
const FLOOR_PLANE = new Plane(new Vector3(0, 1, 0), 1);

const STRUCTURE_COLOR = "#8b8b8b";
const PROP_COLOR = "#777777";
const ACCENT_COLOR = "#d6a84f";
const ROOM_WIDTH = 2.3;
const ROOM_DEPTH = 2.3;
const ROOM_HALF_WIDTH = ROOM_WIDTH / 2;
const ROOM_HALF_DEPTH = ROOM_DEPTH / 2;
const ROOM_EDGE_INSET = 0.008;
const ROOM_SURFACE_COLOR = {
  light: "#f8f8f8",
  dark: "#292929",
} as const;

interface RoomCanvas3DProps {
  configurationType: string | null;
  displays?: HostSyncDisplay[];
  pins: RoomPin[];
  activeKey: string | null;
  onActivate: (key: string) => void;
  onMove: (key: string, update: Partial<HuePosition>) => void;
  className?: string;
  overlayInsetClassName?: string;
  viewportRightInset?: number;
}

interface CameraTarget {
  x: number;
  y: number;
  z: number;
}

interface CameraView {
  yaw: number;
  tilt: number;
  radius: number;
  target: CameraTarget;
}

/**
 * Below this tilt the camera is effectively level with the room, so pin drags
 * edit left/right + height on a wall-parallel plane — a floor raycast at such
 * a grazing angle would fling lights across the room's depth.
 */
const FRONTAL_TILT = 0.12;

const CAMERA_PRESETS: Record<"default" | "front" | "top", CameraView> = {
  default: {
    yaw: DEFAULT_YAW,
    tilt: DEFAULT_TILT,
    radius: DEFAULT_CAMERA_RADIUS,
    target: DEFAULT_CAMERA_TARGET,
  },
  // Head-on elevation (the old "front view"): drags set left/right + height.
  front: {
    yaw: 0,
    tilt: 0.02,
    radius: DEFAULT_CAMERA_RADIUS,
    target: DEFAULT_CAMERA_TARGET,
  },
  // Overhead floor plan: left/right + depth at a glance.
  top: {
    yaw: 0,
    tilt: MAX_TILT,
    radius: DEFAULT_CAMERA_RADIUS,
    target: DEFAULT_CAMERA_TARGET,
  },
};

const clampAxis = (value: number) =>
  Math.max(-1, Math.min(1, Math.round(value * 100) / 100));

const updateCamera = (
  camera: PerspectiveCamera,
  yaw: number,
  tilt: number,
  radius: number,
  target: CameraTarget,
) => {
  const horizontalRadius = radius * Math.cos(tilt);
  camera.position.set(
    target.x + Math.sin(yaw) * horizontalRadius,
    target.y + radius * Math.sin(tilt),
    target.z - Math.cos(yaw) * horizontalRadius,
  );
  camera.up
    .set(
      -Math.sin(yaw) * Math.sin(tilt),
      Math.cos(tilt),
      Math.cos(yaw) * Math.sin(tilt),
    )
    .normalize();
  camera.lookAt(target.x, target.y, target.z);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
};

// The default camera faces Three.js +Z, where screen-right is world -X.
// Hue +X is physical right when seated facing the screen.
const positionToWorld = ({ x, y, z }: HuePosition) =>
  new Vector3(-x * ROOM_HALF_WIDTH, z, y * ROOM_HALF_DEPTH);

const projectToCanvas = (world: Vector3, camera: PerspectiveCamera) => {
  const projected = world.clone().project(camera);
  return {
    left: `${((projected.x + 1) / 2) * 100}%`,
    top: `${((1 - projected.y) / 2) * 100}%`,
  };
};

export const RoomCanvas3D = ({
  configurationType,
  displays,
  pins,
  activeKey,
  onActivate,
  onMove,
  className,
  overlayInsetClassName,
  viewportRightInset = 0,
}: RoomCanvas3DProps) => {
  const { resolvedThemeMode } = useTheme();
  const [yaw, setYaw] = useState(DEFAULT_YAW);
  const [tilt, setTilt] = useState(DEFAULT_TILT);
  const [radius, setRadius] = useState(DEFAULT_CAMERA_RADIUS);
  const [target, setTarget] = useState<CameraTarget>(DEFAULT_CAMERA_TARGET);
  // The HTML pin overlays project through this camera outside the R3F frame
  // loop, so camera projection and overlay positions share the measured size.
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({
    width: CAMERA_ASPECT,
    height: 1,
  });
  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setViewportSize((current) =>
          current.width === width && current.height === height
            ? current
            : { width, height },
        );
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  // While a pin drag is in flight its latest position lives here, so every
  // pointer move re-renders only this canvas; whoever owns the pins gets a
  // single onMove commit when the drag ends. The ref mirrors the state so the
  // finishing pointer-up can commit a move rendered in the same frame.
  const [liveDrag, setLiveDrag] = useState<{
    key: string;
    update: Partial<HuePosition>;
  } | null>(null);
  const liveDragRef = useRef<{
    key: string;
    update: Partial<HuePosition>;
  } | null>(null);
  const gestureBounds = useRef<DOMRect | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const navigationFrom = useRef<{ u: number; v: number } | null>(null);
  const navigationMode = useRef<"orbit" | "pan" | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  // Which plane the current pin drag moves on, and — for wall drags — the
  // depth the wall plane sits at (the pin's y when it was grabbed).
  const dragPlaneMode = useRef<"floor" | "frontal">("floor");
  const dragDepth = useRef(0);
  const animationFrame = useRef<number | null>(null);
  const raycaster = useMemo(() => new Raycaster(), []);
  const floorHit = useMemo(() => new Vector3(), []);
  const wallPlane = useMemo(() => new Plane(new Vector3(0, 0, 1), 0), []);
  const camera = useMemo(
    () =>
      Object.assign(
        new PerspectiveCamera(CAMERA_FOV, CAMERA_ASPECT, 0.1, 100),
        { manual: true },
      ),
    [],
  );
  const visibleWidth = Math.max(
    1,
    viewportSize.width -
      MathUtils.clamp(viewportRightInset, 0, viewportSize.width - 1),
  );
  // Render across the full canvas while keeping the camera's optical axis in
  // the center of the workspace that is not covered by the side panel.
  camera.setViewOffset(
    visibleWidth,
    viewportSize.height,
    0,
    0,
    viewportSize.width,
    viewportSize.height,
  );
  updateCamera(camera, yaw, tilt, radius, target);
  // Everything rendered reads pins through this: committed positions with the
  // in-flight drag layered on top.
  const displayPins = liveDrag
    ? pins.map((pin) =>
        pin.key === liveDrag.key
          ? { ...pin, position: { ...pin.position, ...liveDrag.update } }
          : pin,
      )
    : pins;
  const cameraMoved =
    yaw !== DEFAULT_YAW ||
    tilt !== DEFAULT_TILT ||
    radius !== DEFAULT_CAMERA_RADIUS ||
    target.x !== DEFAULT_CAMERA_TARGET.x ||
    target.y !== DEFAULT_CAMERA_TARGET.y ||
    target.z !== DEFAULT_CAMERA_TARGET.z;

  const pointerUV = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Measured once per gesture: getBoundingClientRect on every move forces a
    // synchronous layout right after the previous move dirtied it.
    const bounds =
      gestureBounds.current ?? event.currentTarget.getBoundingClientRect();
    return {
      u: (event.clientX - bounds.left) / bounds.width,
      v: (event.clientY - bounds.top) / bounds.height,
    };
  };

  const floorPoint = (u: number, v: number) => {
    raycaster.setFromCamera(new Vector2(u * 2 - 1, 1 - v * 2), camera);
    const point = raycaster.ray.intersectPlane(FLOOR_PLANE, floorHit);
    return point
      ? {
          x: -point.x / ROOM_HALF_WIDTH,
          y: point.z / ROOM_HALF_DEPTH,
        }
      : null;
  };

  /** Pointer hit on a wall-parallel plane at Hue depth `depthY`. */
  const frontalPoint = (u: number, v: number, depthY: number) => {
    raycaster.setFromCamera(new Vector2(u * 2 - 1, 1 - v * 2), camera);
    wallPlane.constant = -depthY * ROOM_HALF_DEPTH;
    const point = raycaster.ray.intersectPlane(wallPlane, floorHit);
    return point ? { x: -point.x / ROOM_HALF_WIDTH, z: point.y } : null;
  };

  const cancelCameraAnimation = () => {
    if (animationFrame.current == null) return;
    cancelAnimationFrame(animationFrame.current);
    animationFrame.current = null;
    setIsAnimating(false);
  };

  /** Glides the camera to a preset instead of snapping. */
  const flyTo = (view: CameraView) => {
    cancelCameraAnimation();
    const from = { yaw, tilt, radius, target };
    // Head for the closest equivalent yaw so a well-orbited camera doesn't
    // unwind through full turns.
    const toYaw =
      view.yaw +
      Math.round((from.yaw - view.yaw) / (Math.PI * 2)) * Math.PI * 2;
    const start = performance.now();
    const duration = 320;
    setIsAnimating(true);
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      if (t >= 1) {
        // Land exactly on the preset so `cameraMoved` can turn back off.
        setYaw(view.yaw);
        setTilt(view.tilt);
        setRadius(view.radius);
        setTarget(view.target);
        animationFrame.current = null;
        setIsAnimating(false);
        return;
      }
      const k = 1 - (1 - t) ** 3;
      const mix = (a: number, b: number) => a + (b - a) * k;
      setYaw(mix(from.yaw, toYaw));
      setTilt(mix(from.tilt, view.tilt));
      setRadius(mix(from.radius, view.radius));
      setTarget({
        x: mix(from.target.x, view.target.x),
        y: mix(from.target.y, view.target.y),
        z: mix(from.target.z, view.target.z),
      });
      animationFrame.current = requestAnimationFrame(step);
    };
    animationFrame.current = requestAnimationFrame(step);
  };

  useEffect(
    () => () => {
      if (animationFrame.current != null) {
        cancelAnimationFrame(animationFrame.current);
      }
    },
    [],
  );

  const finishGesture = (event?: ReactPointerEvent<HTMLDivElement>) => {
    if (event && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (liveDragRef.current) {
      onMove(liveDragRef.current.key, liveDragRef.current.update);
      liveDragRef.current = null;
    }
    setLiveDrag(null);
    setDraggingKey(null);
    navigationFrom.current = null;
    navigationMode.current = null;
    setIsNavigating(false);
    gestureBounds.current = null;
  };

  const zoomBy = (factor: number) => {
    setRadius((current) =>
      MathUtils.clamp(current * factor, MIN_CAMERA_RADIUS, MAX_CAMERA_RADIUS),
    );
  };

  return (
    <div
      ref={containerRef}
      data-placement-canvas
      className={cn(
        "relative h-auto shrink-0 touch-none self-start overflow-hidden rounded-3xl border border-foreground/15",
        "bg-[radial-gradient(circle_at_center,var(--border)_1px,transparent_1px)] bg-[size:24px_24px] select-none",
        navigationMode.current === "pan"
          ? "cursor-move"
          : "cursor-grab active:cursor-grabbing",
        className,
      )}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest("[data-camera-control]")) {
          return;
        }
        cancelCameraAnimation();
        gestureBounds.current = event.currentTarget.getBoundingClientRect();

        const pinElement = (event.target as HTMLElement).closest<HTMLElement>(
          "[data-pin-key]",
        );
        const key = pinElement?.dataset.pinKey;
        const pointer = pointerUV(event);
        event.currentTarget.setPointerCapture(event.pointerId);

        if (key) {
          const pin = pins.find((candidate) => candidate.key === key);
          if (!pin) {
            finishGesture(event);
            return;
          }
          if (tilt < FRONTAL_TILT) {
            const hit = frontalPoint(pointer.u, pointer.v, pin.position.y);
            if (!hit) {
              finishGesture(event);
              return;
            }
            dragPlaneMode.current = "frontal";
            // The offset's second component tracks height (z) in this mode.
            dragOffset.current = {
              x: pin.position.x - hit.x,
              y: pin.position.z - hit.z,
            };
          } else {
            const hit = floorPoint(pointer.u, pointer.v);
            if (!hit) {
              finishGesture(event);
              return;
            }
            dragPlaneMode.current = "floor";
            dragOffset.current = {
              x: pin.position.x - hit.x,
              y: pin.position.y - hit.y,
            };
          }
          dragDepth.current = pin.position.y;
          onActivate(key);
          setDraggingKey(key);
          return;
        }

        navigationFrom.current = pointer;
        navigationMode.current =
          event.shiftKey || event.button === 1 || event.button === 2
            ? "pan"
            : "orbit";
        setIsNavigating(true);
      }}
      onPointerMove={(event) => {
        const pointer = pointerUV(event);
        if (draggingKey) {
          let update: Partial<HuePosition> | null = null;
          if (dragPlaneMode.current === "frontal") {
            const hit = frontalPoint(pointer.u, pointer.v, dragDepth.current);
            if (hit) {
              update = {
                x: clampAxis(hit.x + dragOffset.current.x),
                z: clampAxis(hit.z + dragOffset.current.y),
              };
            }
          } else {
            const hit = floorPoint(pointer.u, pointer.v);
            if (hit) {
              update = {
                x: clampAxis(hit.x + dragOffset.current.x),
                y: clampAxis(hit.y + dragOffset.current.y),
              };
            }
          }
          if (update) {
            liveDragRef.current = { key: draggingKey, update };
            setLiveDrag(liveDragRef.current);
          }
          return;
        }

        if (!navigationFrom.current || !navigationMode.current) return;
        const du = pointer.u - navigationFrom.current.u;
        const dv = pointer.v - navigationFrom.current.v;
        navigationFrom.current = pointer;

        if (navigationMode.current === "pan") {
          const panScale = PAN_RATE * (radius / DEFAULT_CAMERA_RADIUS);
          const right = new Vector3().setFromMatrixColumn(
            camera.matrixWorld,
            0,
          );
          const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
          const movement = right
            .multiplyScalar(-du * panScale)
            .add(up.multiplyScalar(dv * panScale));
          setTarget((current) => ({
            x: current.x + movement.x,
            y: current.y + movement.y,
            z: current.z + movement.z,
          }));
          return;
        }

        setYaw((current) => current + du * ORBIT_YAW_RATE);
        setTilt((current) =>
          MathUtils.clamp(current - dv * ORBIT_TILT_RATE, MIN_TILT, MAX_TILT),
        );
      }}
      onPointerUp={finishGesture}
      onPointerCancel={() => finishGesture()}
      onContextMenu={(event) => event.preventDefault()}
      onWheel={(event: ReactWheelEvent<HTMLDivElement>) => {
        event.preventDefault();
        cancelCameraAnimation();
        zoomBy(Math.exp(event.deltaY * WHEEL_ZOOM_RATE));
      }}
    >
      <div className="absolute inset-0">
        <Canvas
          camera={camera}
          dpr={[1, 1.5]}
          frameloop="demand"
          gl={{ alpha: true, antialias: true }}
        >
          <InvalidateCameraFrame
            yaw={yaw}
            tilt={tilt}
            radius={radius}
            target={target}
            viewportHeight={viewportSize.height}
            viewportRightInset={viewportRightInset}
            viewportWidth={viewportSize.width}
          />
          <RoomScene
            cameraHeight={camera.position.y}
            configurationType={configurationType}
            displays={displays}
            pins={displayPins}
            surfaceColor={ROOM_SURFACE_COLOR[resolvedThemeMode]}
            yaw={yaw}
          />
        </Canvas>
      </div>

      <p
        className={cn(
          "pointer-events-none absolute right-3 bottom-2 text-[10px] font-medium tracking-wide text-muted-foreground/60 uppercase",
          overlayInsetClassName,
        )}
      >
        {tilt < FRONTAL_TILT
          ? "Facing the screen · drags set left/right + height"
          : "Drag to rotate · Shift-drag to pan · Scroll to zoom"}
      </p>
      <div
        data-camera-control
        className={cn(
          "absolute top-3 right-3 z-50 flex items-center gap-1",
          overlayInsetClassName,
        )}
      >
        <button
          type="button"
          title="Face the screen wall — drags set left/right and height"
          onClick={() => flyTo(CAMERA_PRESETS.front)}
          className={cn(
            "flex cursor-pointer items-center gap-1.5 rounded-full border border-foreground/15 bg-background/80 px-3 py-1.5 text-xs font-medium backdrop-blur",
            tilt < FRONTAL_TILT
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <RectangleHorizontal className="size-3.5" /> Front
        </button>
        <button
          type="button"
          title="Overhead floor plan — drags set left/right and depth"
          onClick={() => flyTo(CAMERA_PRESETS.top)}
          className={cn(
            "flex cursor-pointer items-center gap-1.5 rounded-full border border-foreground/15 bg-background/80 px-3 py-1.5 text-xs font-medium backdrop-blur",
            tilt > MAX_TILT - 0.05
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Grid2x2 className="size-3.5" /> Top
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out"
          disabled={radius >= MAX_CAMERA_RADIUS}
          onClick={() => zoomBy(1.25)}
          className="flex size-8 cursor-pointer items-center justify-center rounded-full border border-foreground/15 bg-background/80 text-muted-foreground backdrop-blur hover:text-foreground disabled:cursor-default disabled:opacity-40"
        >
          <ZoomOut className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom in"
          disabled={radius <= MIN_CAMERA_RADIUS}
          onClick={() => zoomBy(0.8)}
          className="flex size-8 cursor-pointer items-center justify-center rounded-full border border-foreground/15 bg-background/80 text-muted-foreground backdrop-blur hover:text-foreground disabled:cursor-default disabled:opacity-40"
        >
          <ZoomIn className="size-3.5" />
        </button>
        {cameraMoved && (
          <button
            type="button"
            onClick={() => flyTo(CAMERA_PRESETS.default)}
            className="flex cursor-pointer items-center gap-1.5 rounded-full border border-foreground/15 bg-background/80 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur hover:text-foreground"
          >
            <RotateCcw className="size-3.5" /> Reset view
          </button>
        )}
      </div>

      {[
        {
          label: "Left",
          position: new Vector3(
            ROOM_HALF_WIDTH * 0.92,
            -0.93,
            -ROOM_HALF_DEPTH * 0.9,
          ),
        },
        {
          label: "Right",
          position: new Vector3(
            -ROOM_HALF_WIDTH * 0.92,
            -0.93,
            -ROOM_HALF_DEPTH * 0.9,
          ),
        },
      ].map(({ label, position }) => (
        <span
          key={label}
          style={projectToCanvas(position, camera)}
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-[10px] font-medium tracking-wide text-muted-foreground/65 uppercase"
        >
          {label}
        </span>
      ))}

      {displayPins.map((pin) => {
        const world = positionToWorld(pin.position);
        const distance = camera.position.distanceTo(world);
        // Pins track the zoom rather than floating at a fixed size, so a
        // zoomed-out room isn't buried under its own numbers.
        const scale = MathUtils.clamp(
          PIN_FULL_SIZE_DISTANCE / distance,
          0.5,
          1.3,
        );
        const active = activeKey === pin.key;
        return (
          <button
            key={pin.key}
            type="button"
            data-pin-key={pin.key}
            aria-label={`Place ${pin.name}`}
            title={pin.name}
            style={{
              ...projectToCanvas(world, camera),
              transform: `translate(-50%, -50%) scale(${scale})`,
              zIndex: active ? 40 : 20,
              backgroundColor: pin.color ?? undefined,
            }}
            className={cn(
              "absolute flex size-11 cursor-grab items-center justify-center rounded-full border-2 font-semibold shadow-md active:cursor-grabbing",
              draggingKey !== pin.key &&
                !isNavigating &&
                !isAnimating &&
                "transition-[left,top,transform] duration-300 ease-out",
              pin.color
                ? "border-placement-pin-foreground/65 text-placement-pin-foreground"
                : "bg-background",
              active
                ? overlaySelectionClassName
                : !pin.color && "border-foreground/20",
            )}
          >
            {pin.label}
          </button>
        );
      })}
    </div>
  );
};

const InvalidateCameraFrame = ({
  yaw,
  tilt,
  radius,
  target,
  viewportHeight,
  viewportRightInset,
  viewportWidth,
}: {
  yaw: number;
  tilt: number;
  radius: number;
  target: CameraTarget;
  viewportHeight: number;
  viewportRightInset: number;
  viewportWidth: number;
}) => {
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    invalidate();
  }, [
    invalidate,
    radius,
    target.x,
    target.y,
    target.z,
    tilt,
    viewportHeight,
    viewportRightInset,
    viewportWidth,
    yaw,
  ]);
  return null;
};

const RoomScene = ({
  cameraHeight,
  configurationType,
  displays,
  pins,
  surfaceColor,
  yaw,
}: {
  cameraHeight: number;
  configurationType: string | null;
  displays?: HostSyncDisplay[];
  pins: RoomPin[];
  surfaceColor: string;
  yaw: number;
}) => {
  const farX = Math.sin(yaw) >= 0 ? -1 : 1;
  const farZ = Math.cos(yaw) >= 0 ? 1 : -1;
  const showCeilingEdges = cameraHeight < 1 - ROOM_EDGE_INSET;

  const roomEdges = useMemo(() => {
    const halfWidth = (ROOM_WIDTH - ROOM_EDGE_INSET) / 2;
    const halfDepth = (ROOM_DEPTH - ROOM_EDGE_INSET) / 2;
    const halfHeight = 1 - ROOM_EDGE_INSET / 2;
    const visiblePositions: number[] = [];
    const addedEdges = new Set<string>();
    const addEdge = (start: Vector3, end: Vector3) => {
      const startKey = start.toArray().join(",");
      const endKey = end.toArray().join(",");
      const key =
        startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;
      if (addedEdges.has(key)) return;
      addedEdges.add(key);
      visiblePositions.push(...start.toArray(), ...end.toArray());
    };
    const x = farX * halfWidth;
    const z = farZ * halfDepth;

    // Outline exactly the two selected far walls.
    addEdge(
      new Vector3(-halfWidth, -halfHeight, z),
      new Vector3(halfWidth, -halfHeight, z),
    );
    addEdge(
      new Vector3(-halfWidth, halfHeight, z),
      new Vector3(halfWidth, halfHeight, z),
    );
    addEdge(
      new Vector3(-halfWidth, -halfHeight, z),
      new Vector3(-halfWidth, halfHeight, z),
    );
    addEdge(
      new Vector3(halfWidth, -halfHeight, z),
      new Vector3(halfWidth, halfHeight, z),
    );
    addEdge(
      new Vector3(x, -halfHeight, -halfDepth),
      new Vector3(x, -halfHeight, halfDepth),
    );
    addEdge(
      new Vector3(x, halfHeight, -halfDepth),
      new Vector3(x, halfHeight, halfDepth),
    );
    addEdge(
      new Vector3(x, -halfHeight, -halfDepth),
      new Vector3(x, halfHeight, -halfDepth),
    );
    addEdge(
      new Vector3(x, -halfHeight, halfDepth),
      new Vector3(x, halfHeight, halfDepth),
    );

    // The floor always needs a complete boundary. When the camera dips below
    // the roof, do the same for the visible ceiling face.
    for (const y of [-halfHeight, ...(showCeilingEdges ? [halfHeight] : [])]) {
      addEdge(
        new Vector3(-halfWidth, y, -halfDepth),
        new Vector3(halfWidth, y, -halfDepth),
      );
      addEdge(
        new Vector3(-halfWidth, y, halfDepth),
        new Vector3(halfWidth, y, halfDepth),
      );
      addEdge(
        new Vector3(-halfWidth, y, -halfDepth),
        new Vector3(-halfWidth, y, halfDepth),
      );
      addEdge(
        new Vector3(halfWidth, y, -halfDepth),
        new Vector3(halfWidth, y, halfDepth),
      );
    }

    const visibleEdges = new BufferGeometry();
    visibleEdges.setAttribute(
      "position",
      new Float32BufferAttribute(visiblePositions, 3),
    );
    return visibleEdges;
  }, [farX, farZ, showCeilingEdges]);

  useEffect(() => () => roomEdges.dispose(), [roomEdges]);

  return (
    <>
      <ambientLight intensity={1.25} />
      <directionalLight position={[-3, 5, -4]} intensity={1.5} />

      {/* Select one far wall per horizontal axis so the two near sides remain
          open at every orbit angle. */}
      <mesh
        position={[farX * ROOM_HALF_WIDTH, 0, 0]}
        rotation={[0, farX * (Math.PI / 2), 0]}
      >
        <planeGeometry args={[ROOM_DEPTH, 2]} />
        <meshBasicMaterial color={surfaceColor} side={BackSide} />
      </mesh>
      <mesh
        position={[0, 0, farZ * ROOM_HALF_DEPTH]}
        rotation={[0, farZ < 0 ? Math.PI : 0, 0]}
      >
        <planeGeometry args={[ROOM_WIDTH, 2]} />
        <meshBasicMaterial color={surfaceColor} side={BackSide} />
      </mesh>
      <mesh position={[0, -1, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ROOM_WIDTH, ROOM_DEPTH]} />
        <meshBasicMaterial color={surfaceColor} side={BackSide} />
      </mesh>
      <mesh position={[0, 1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ROOM_WIDTH, ROOM_DEPTH]} />
        <meshBasicMaterial color={surfaceColor} side={BackSide} />
      </mesh>

      <mesh position={[0, -1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ROOM_WIDTH, ROOM_DEPTH]} />
        <meshStandardMaterial
          color={STRUCTURE_COLOR}
          transparent
          opacity={0.1}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <gridHelper
        args={[ROOM_WIDTH, 7, STRUCTURE_COLOR, STRUCTURE_COLOR]}
        position={[0, -0.995, 0]}
        material-transparent
        material-opacity={0.18}
      />
      <lineSegments geometry={roomEdges}>
        <lineBasicMaterial color={STRUCTURE_COLOR} transparent opacity={0.55} />
      </lineSegments>

      <SceneProps3D configurationType={configurationType} displays={displays} />

      {pins.map((pin) => (
        <PinMarker3D key={pin.key} pin={pin} />
      ))}
    </>
  );
};

const PinMarker3D = ({ pin }: { pin: RoomPin }) => {
  const height = Math.max(0.01, pin.position.z + 1);
  const color = pin.color ?? ACCENT_COLOR;
  return (
    <group>
      <mesh
        position={[
          -pin.position.x * ROOM_HALF_WIDTH,
          -1 + height / 2,
          pin.position.y * ROOM_HALF_DEPTH,
        ]}
      >
        <cylinderGeometry args={[0.008, 0.008, height, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.55} />
      </mesh>
      <mesh
        position={[
          -pin.position.x * ROOM_HALF_WIDTH,
          -0.992,
          pin.position.y * ROOM_HALF_DEPTH,
        ]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[0.065, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.25} />
      </mesh>
      <mesh
        position={[
          -pin.position.x * ROOM_HALF_WIDTH,
          pin.position.z,
          pin.position.y * ROOM_HALF_DEPTH,
        ]}
      >
        <sphereGeometry args={[0.045, 16, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.2}
        />
      </mesh>
    </group>
  );
};

const BoxProp = ({
  position,
  scale,
  color = PROP_COLOR,
  opacity = 0.28,
}: {
  position: [number, number, number];
  scale: [number, number, number];
  color?: string;
  opacity?: number;
}) => (
  <mesh position={position}>
    <boxGeometry args={scale} />
    <meshStandardMaterial color={color} transparent opacity={opacity} />
  </mesh>
);

const SceneProps3D = ({
  configurationType,
  displays,
}: {
  configurationType: string | null;
  displays?: HostSyncDisplay[];
}) => {
  switch (configurationType) {
    case "monitor":
      return <DeskSetup3D displays={displays} />;
    case "screen":
      return <TvSetup3D displays={displays} />;
    case "music":
      return <MusicSetup3D />;
    case "3dspace":
      return <SpaceSetup3D />;
    default:
      return <OtherSetup3D />;
  }
};

const DeskSetup3D = ({ displays = [] }: { displays?: HostSyncDisplay[] }) => {
  const displayFrames = roomDisplayFrames(
    displays,
    roomFrameOptionsFor("monitor"),
  );
  const screens =
    displayFrames.length > 0
      ? displayFrames
      : [
          {
            id: "default",
            name: "Monitor",
            x: 0,
            z: 0.07,
            width: 0.82,
            height: 0.48,
          },
        ];

  return (
    <group>
      <BoxProp position={[0, -0.42, 0.55]} scale={[1.25, 0.08, 0.52]} />
      <BoxProp position={[-0.52, -0.7, 0.55]} scale={[0.07, 0.55, 0.42]} />
      <BoxProp position={[0.52, -0.7, 0.55]} scale={[0.07, 0.55, 0.42]} />
      {screens.map((screen) => (
        <group key={screen.id}>
          <BoxProp
            position={[-screen.x, screen.z, 0.76]}
            scale={[screen.width, screen.height, 0.05]}
            color={ACCENT_COLOR}
            opacity={0.22}
          />
          <BoxProp
            position={[
              -screen.x,
              (-0.25 + screen.z - screen.height / 2) / 2,
              0.69,
            ]}
            scale={[
              0.04,
              Math.max(0.04, screen.z - screen.height / 2 + 0.25),
              0.04,
            ]}
          />
        </group>
      ))}
    </group>
  );
};

const TvSetup3D = ({ displays = [] }: { displays?: HostSyncDisplay[] }) => {
  const [screen] = roomDisplayFrames(displays, roomFrameOptionsFor("screen"));
  const frame = screen ?? {
    x: 0,
    z: 0.22,
    width: 1.35,
    height: 0.76,
  };

  return (
    <group>
      <BoxProp
        position={[-frame.x, frame.z, 0.93]}
        scale={[frame.width, frame.height, 0.06]}
        color={ACCENT_COLOR}
        opacity={0.2}
      />
      <BoxProp position={[0, -0.67, 0.72]} scale={[1.45, 0.34, 0.42]} />
      <SofaProp />
    </group>
  );
};

const SofaProp = () => {
  const profile = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(-0.8, -1);
    shape.lineTo(-0.3, -1);
    shape.lineTo(-0.3, -0.7);
    shape.lineTo(-0.63, -0.7);
    shape.lineTo(-0.63, -0.32);
    shape.lineTo(-0.81, -0.32);
    shape.lineTo(-0.81, -1);
    shape.closePath();
    return shape;
  }, []);

  return (
    <mesh position={[0.675, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
      <extrudeGeometry
        args={[profile, { depth: 1.35, bevelEnabled: false, curveSegments: 1 }]}
      />
      <meshStandardMaterial color={PROP_COLOR} transparent opacity={0.28} />
    </mesh>
  );
};

const MusicSetup3D = () => (
  <group>
    <BoxProp position={[-0.7, -0.35, 0.55]} scale={[0.28, 1.15, 0.3]} />
    <BoxProp position={[0.7, -0.35, 0.55]} scale={[0.28, 1.15, 0.3]} />
    <BoxProp position={[0, -0.72, 0.25]} scale={[0.65, 0.18, 0.42]} />
    <mesh position={[0, -0.985, -0.15]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[0.62, 40]} />
      <meshStandardMaterial
        color={ACCENT_COLOR}
        transparent
        opacity={0.12}
        depthWrite={false}
      />
    </mesh>
  </group>
);

const SpaceSetup3D = () => (
  <group>
    <mesh position={[0, -0.988, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[0.72, 40]} />
      <meshStandardMaterial
        color={ACCENT_COLOR}
        transparent
        opacity={0.1}
        depthWrite={false}
      />
    </mesh>
    <BoxProp position={[0, -0.72, 0.05]} scale={[0.85, 0.18, 0.48]} />
    <BoxProp position={[0, -0.53, 0.23]} scale={[0.85, 0.38, 0.12]} />
    <mesh position={[-0.68, -0.7, 0.55]}>
      <cylinderGeometry args={[0.12, 0.16, 0.55, 18]} />
      <meshStandardMaterial color={PROP_COLOR} transparent opacity={0.28} />
    </mesh>
    <mesh position={[0.7, -0.25, 0.48]}>
      <cylinderGeometry args={[0.025, 0.025, 1.45, 12]} />
      <meshStandardMaterial color={PROP_COLOR} transparent opacity={0.35} />
    </mesh>
    <mesh position={[0.7, 0.48, 0.48]}>
      <sphereGeometry args={[0.16, 20, 14]} />
      <meshStandardMaterial color={ACCENT_COLOR} transparent opacity={0.3} />
    </mesh>
  </group>
);

const OtherSetup3D = () => (
  <group>
    <BoxProp position={[0, -0.72, 0]} scale={[0.8, 0.16, 0.55]} />
    <BoxProp position={[0, -0.5, 0.22]} scale={[0.8, 0.4, 0.12]} />
  </group>
);
