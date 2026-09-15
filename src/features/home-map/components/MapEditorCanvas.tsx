import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Combine, Maximize, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { convertLength } from "../measurements";
import {
  chooseDividerArea,
  chooseDividerAreaFromDirection,
  dividerAreasAtPoint,
} from "../dividerSelection";
import {
  appendOutlineCorner,
  constrainCorner,
  outlineCloseError,
} from "../outline";
import { distance, signedArea } from "../geometry";
import { groupFixtureMarkers } from "../fixtures";
import { snapWorldPoint, type SnapGuide, type SnapSettings } from "../snapping";
import { locatePoint } from "../geometry";
import type { MapFloor, MapPoint } from "../types";
import {
  DEFAULT_MEASUREMENT_DISPLAY,
  getCornerAngles,
  type MeasurementDisplaySettings,
} from "../measurementDisplay";
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
import {
  listWalls,
  moveCorner,
  moveWall,
  sharedWallPoint,
  translateWall,
  wallVertexIds,
  type MapWall,
} from "../walls";
import { MapRulers, RULER_SIZE } from "./MapRulers";

/** Reuses the viewport in place when a fit lands on the one already shown. */
function sameViewport(
  value: MapViewport | null,
  next: MapViewport,
): MapViewport {
  return value &&
    value.scale === next.scale &&
    value.offsetX === next.offsetX &&
    value.offsetY === next.offsetY
    ? value
    : next;
}

/** Screen pixels within which the pointer aligns to an existing corner. */
const SNAP_TOLERANCE_PX = 12;

/** Keeps a measurement clear of its wall at every angle. */
function segmentLabelPosition(start: MapPoint, end: MapPoint): MapPoint {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  let normal = { x: dy / length, y: -dx / length };
  const flip =
    Math.abs(normal.x) >= Math.abs(normal.y) ? normal.x < 0 : normal.y < 0;
  if (flip) normal = { x: -normal.x, y: -normal.y };
  return {
    x: (start.x + end.x) / 2 - normal.x * 14,
    y: (start.y + end.y) / 2 - normal.y * 14,
  };
}

const FULL_TURN = Math.PI * 2;

function normalizeRadians(value: number) {
  return ((value % FULL_TURN) + FULL_TURN) % FULL_TURN;
}

function anglePoint(center: MapPoint, radius: number, angle: number) {
  return {
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius,
  };
}

function angleArcSegment(
  center: MapPoint,
  radius: number,
  startAngle: number,
  sweep: 0 | 1,
  angle: number,
) {
  const end = anglePoint(
    center,
    radius,
    startAngle + angle * (sweep === 1 ? 1 : -1),
  );
  return `A ${radius} ${radius} 0 ${angle > Math.PI ? 1 : 0} ${sweep} ${end.x} ${end.y}`;
}

/** The arc on its own, for a mark that must not paint over the plan. */
function angleArcPath(
  center: MapPoint,
  radius: number,
  startAngle: number,
  sweep: 0 | 1,
  angle: number,
) {
  const start = anglePoint(center, radius, startAngle);
  return `M ${start.x} ${start.y} ${angleArcSegment(center, radius, startAngle, sweep, angle)}`;
}

function angleSectorPath(
  center: MapPoint,
  radius: number,
  startAngle: number,
  sweep: 0 | 1,
  angle: number,
) {
  const start = anglePoint(center, radius, startAngle);
  return `M ${center.x} ${center.y} L ${start.x} ${start.y} ${angleArcSegment(center, radius, startAngle, sweep, angle)} Z`;
}

/** The square drafting draws in place of an arc on a square corner. */
function rightAnglePath(
  center: MapPoint,
  size: number,
  startAngle: number,
  sweep: 0 | 1,
  closed: boolean,
) {
  const first = anglePoint(center, size, startAngle);
  const second = anglePoint(
    center,
    size,
    startAngle + (Math.PI / 2) * (sweep === 1 ? 1 : -1),
  );
  const far = {
    x: first.x + second.x - center.x,
    y: first.y + second.y - center.y,
  };
  const open = `M ${first.x} ${first.y} L ${far.x} ${far.y} L ${second.x} ${second.y}`;
  return closed ? `${open} L ${center.x} ${center.y} Z` : open;
}

/**
 * Corner marks are sized for reading on screen, then held back so they never
 * outgrow the shorter of the two walls that meet at the corner.
 */
function angleMarkRadius(span: number) {
  return Math.max(9, Math.min(24, span * 0.24));
}

/**
 * A reading sits just past its own arc, and slides further along the bisector
 * when the wedge is too narrow to hold the text that close in.
 */
function angleLabelDistance(radius: number, angle: number, label: string) {
  const near = radius + 11;
  if (angle >= 170) return near;
  const halfWidth = (label.length * 5.8 + 4) / 2;
  const clear = halfWidth / Math.tan((angle * Math.PI) / 360) + 6;
  return Math.min(64, Math.max(near, clear));
}

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
      kind: "fixture";
      fixtureId: string;
      grabOffset: MapPoint;
      moved: boolean;
    }
  | {
      kind: "combine";
      /** The room being dragged, which merges into the one it is dropped on. */
      sourceId: string;
      /** The room under the pointer, or null while the drag is over nothing. */
      targetId: string | null;
      /** Screen position of the press, so a still pointer stays a click. */
      start: MapPoint;
      moved: boolean;
    }
  | {
      kind: "wall";
      wallId: string;
      orientation: MapWall["orientation"];
      base: MapFloor;
      startWorld: MapPoint;
      moved: boolean;
      /** True once a drag welded corners, so a stale wall stays unselected. */
      welded: boolean;
    };

export type EditorTool =
  | "view"
  | "move"
  | "draw"
  | "divide"
  | "combine"
  | "lights";

export interface MapEditorCanvasProps {
  floor: MapFloor;
  renderAreaControl?: (areaId: string) => ReactNode;
  renderFixtureControl?: (fixtureId: string) => ReactNode;
  showLights?: boolean;
  tool: EditorTool;
  /** Receives a closed, orthogonal outline in world meters. */
  onDrawRoom: (ring: MapPoint[]) => void;
  /** Receives a divider and the room inferred from the pointer side. */
  onDivideRoom: (areaId: string, divider: MapPoint[]) => void;
  /** Merges rooms; the first ID keeps the combined room's name and Hue link. */
  onCombineRooms: (areaIds: string[]) => void;
  /** The fixture waiting for a position, chosen in the tray. */
  placingFixtureId: string | null;
  /** The fixture being dragged out of the tray, followed until it is dropped. */
  liftedFixtureId?: string | null;
  /** Ends that drag, whether it landed on the map or beside it. */
  onLiftEnd?: () => void;
  /** Releasing a fixture inside this element takes it off the map instead. */
  removeZoneRef?: React.RefObject<HTMLElement | null>;
  /** Takes the whole product off the map, every head with it. */
  onRemoveFixture?: (fixtureId: string) => void;
  /** Reports the fixture under the pointer, so the remove zone can show. */
  onFixtureDragChange?: (
    drag: { fixtureId: string; overRemoveZone: boolean } | null,
  ) => void;
  fixtureLabels: Record<string, string>;
  /** Light id to the fixture it is a head of, so one product draws once. */
  fixtureOf: Record<string, string>;
  onPlaceFixture: (fixtureId: string, point: MapPoint) => void;
  units: "metric" | "imperial";
  snap: SnapSettings;
  measurementDisplay?: MeasurementDisplaySettings;
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
  /** Moves the zoom group clear of that panel, when it is shown here. */
  overlayInsetClassName?: string;
  /** The default canvas navigation hint can move into a surrounding shell. */
  showNavigationHint?: boolean;
  /**
   * Publishes the zoom readout and its actions, so a shared toolbar can own
   * them. The canvas keeps its own group when this is not given.
   */
  onViewportControls?: (controls: MapViewportControls) => void;
  /** Reports a part-drawn outline or divider, so leaving can warn about it. */
  onDraftingChange?: (drafting: boolean) => void;
}

export interface MapViewportControls {
  percent: number;
  zoomIn: () => void;
  zoomOut: () => void;
  /** Sets an exact zoom, keeping the middle of the workspace in place. */
  zoomTo: (percent: number) => void;
  fit: () => void;
}

export function MapEditorCanvas(props: MapEditorCanvasProps) {
  return <EditorSurface key={props.floor.id} {...props} />;
}

function EditorSurface({
  floor,
  renderAreaControl,
  renderFixtureControl,
  showLights = true,
  tool,
  onDrawRoom,
  onDivideRoom,
  onCombineRooms,
  placingFixtureId,
  liftedFixtureId = null,
  onLiftEnd,
  removeZoneRef,
  onRemoveFixture,
  onFixtureDragChange,
  fixtureLabels,
  fixtureOf,
  onPlaceFixture,
  units,
  snap,
  measurementDisplay = DEFAULT_MEASUREMENT_DISPLAY,
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
  showNavigationHint = true,
  onViewportControls,
  onDraftingChange,
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
  const drafting = outline.length > 0;
  useEffect(() => {
    onDraftingChange?.(drafting);
  }, [drafting, onDraftingChange]);
  const [outlineHover, setOutlineHover] = useState<MapPoint | null>(null);
  const [wallSnapActive, setWallSnapActive] = useState(false);
  const [dividerAreaId, setDividerAreaId] = useState<string | null>(null);
  const [dividerStartAreaIds, setDividerStartAreaIds] = useState<string[]>([]);
  const [dividerHoverAreaId, setDividerHoverAreaId] = useState<string | null>(
    null,
  );
  // Combining runs entirely on the map: two rooms are picked, then the dot on
  // the wall between them (or a drop) asks for one confirmation.
  const [combinePicks, setCombinePicks] = useState<string[]>([]);
  const [combineConfirm, setCombineConfirm] = useState<{
    keepId: string;
    mergeId: string;
    point: MapPoint;
  } | null>(null);
  // Framing follows the container until the view is moved by hand.
  const viewTouched = useRef(false);
  // A wall drag can land both of its ends on corners, so this is a list.
  const [mergeTargetIds, setMergeTargetIds] = useState<string[]>([]);
  const [lightPreview, setLightPreview] = useState<{
    fixtureId: string;
    point: MapPoint;
  } | null>(null);
  const [overRemoveZone, setOverRemoveZone] = useState(false);
  const [peekMeasurements, setPeekMeasurements] = useState(false);

  /** True while the pointer is over whatever the host offered as the bin. */
  function inRemoveZone(event: { clientX: number; clientY: number }) {
    const rect = removeZoneRef?.current?.getBoundingClientRect();
    return Boolean(
      rect &&
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom,
    );
  }

  useEffect(() => {
    // Windows reads a lone Alt as a menu shortcut, and releasing it drops the
    // window into menu mode, which swallows the press after it. Claiming both
    // halves of the tap keeps every peek arriving the moment Alt goes down.
    const sync = (event: KeyboardEvent) => {
      if (event.key === "Alt") event.preventDefault();
      setPeekMeasurements(event.altKey);
    };
    // A release that lands while another window has focus never delivers its
    // keyup, so the next pointer move settles the peek either way.
    const point = (event: PointerEvent) => setPeekMeasurements(event.altKey);
    const clear = () => setPeekMeasurements(false);
    window.addEventListener("keydown", sync);
    window.addEventListener("keyup", sync);
    window.addEventListener("pointermove", point);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", sync);
      window.removeEventListener("keyup", sync);
      window.removeEventListener("pointermove", point);
      window.removeEventListener("blur", clear);
    };
  }, []);

  /** Capture is best-effort: a browser may reject it mid-gesture. */
  function capture(event: React.PointerEvent, release = false) {
    try {
      // The add-corner dot disappears as soon as its corner is created. Keep
      // capture on the stable surface so that same press can become a drag.
      const target = surfaceRef.current ?? (event.target as Element);
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
  const markers = useMemo(
    () => groupFixtureMarkers(shown.lights, fixtureOf),
    [shown.lights, fixtureOf],
  );
  const bounds = useMemo(() => getMapBounds(shown.vertices), [shown.vertices]);
  const walls = useMemo(() => listWalls(shown), [shown]);
  const vertices = useMemo(
    () => new Map(shown.vertices.map((vertex) => [vertex.id, vertex])),
    [shown],
  );
  const areaRings = useMemo(
    () =>
      shown.areas.map((area) => ({
        id: area.id,
        ring: area.vertexIds.flatMap((id) => {
          const vertex = vertices.get(id);
          return vertex ? [vertex] : [];
        }),
      })),
    [shown.areas, vertices],
  );
  /** The room a world point falls in, so a drag knows what it is over. */
  const areaAtPoint = useCallback(
    (point: MapPoint) =>
      areaRings.find((entry) => locatePoint(point, entry.ring) === "inside")
        ?.id ?? null,
    [areaRings],
  );
  // The dot on the wall the two picked rooms share, which is also the only
  // proof on screen that they can be combined at all.
  const combinePoint = useMemo(
    () =>
      tool === "combine" && combinePicks.length === 2
        ? sharedWallPoint(shown, combinePicks[0], combinePicks[1])
        : null,
    [tool, combinePicks, shown],
  );
  useEffect(() => {
    // Leaving the tool drops the picks; entering it counts the selected room
    // as the first of the two, since that is what the button was pressed on.
    if (tool !== "combine") {
      setCombinePicks([]);
      setCombineConfirm(null);
      return;
    }
    setCombinePicks(selectedAreaId ? [selectedAreaId] : []);
    setCombineConfirm(null);
  }, [tool, selectedAreaId]);
  const showAllLengths =
    peekMeasurements || measurementDisplay.wallLengths === "all";
  const angleMode = peekMeasurements ? "both" : measurementDisplay.cornerAngles;
  const angleLabels = useMemo(() => {
    if (angleMode === "off") return [];
    const labels = shown.areas.flatMap((area) => {
      const ring = area.vertexIds.flatMap((id) => {
        const vertex = vertices.get(id);
        return vertex ? [vertex] : [];
      });
      if (ring.length < 3) return [];
      const winding = Math.sign(signedArea(ring)) || 1;
      return ring.flatMap((vertex, index) => {
        const previous = ring[(index - 1 + ring.length) % ring.length];
        const next = ring[(index + 1) % ring.length];
        const angles = getCornerAngles(previous, vertex, next, winding);
        return angles
          ? [{ areaId: area.id, vertex, previous, next, ...angles }]
          : [];
      });
    });
    // Straight-through nodes are wall joins, not visible corners. Shared rooms
    // often reference the same geometric corner, so show an equal angle once.
    const seen = new Set<string>();
    return labels.filter(({ vertex, inner }) => {
      if (Math.abs(inner - 180) < 0.1) return false;
      const key = `${vertex.id}:${inner.toFixed(1)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [angleMode, shown.areas, vertices]);

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
    // Keeping the same viewport object ends the fit; a new one every time
    // would re-run this effect through its own `view` dependency.
    setView((value) =>
      sameViewport(
        value,
        floor.vertices.length === 0
          ? emptyViewport(framed)
          : fitViewport(getMapBounds(floor.vertices), framed, 48 + RULER_SIZE),
      ),
    );
    // framed is derived from size and insetRight, which are both listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, size, insetRight, floor.vertices]);

  useEffect(() => {
    if (tool !== "draw" && tool !== "divide") {
      setOutline([]);
      setOutlineHover(null);
    }
    if (tool !== "divide") {
      setDividerAreaId(null);
      setDividerStartAreaIds([]);
      setDividerHoverAreaId(null);
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
    if (tool !== "view" || renderAreaControl || size.width < 2) return;
    setView((value) =>
      sameViewport(
        value,
        floor.vertices.length === 0
          ? emptyViewport(framed)
          : fitViewport(getMapBounds(floor.vertices), framed, 48 + RULER_SIZE),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, previewKey, size.width, size.height, insetRight]);

  const current: MapViewport = view ?? { scale: 40, offsetX: 40, offsetY: 40 };
  const liveRef = useRef({ view: current, size, bounds, floor });
  liveRef.current = { view: current, size, bounds, floor };

  const zoomBy = useCallback((factor: number) => {
    const { view: value, size: box } = liveRef.current;
    viewTouched.current = true;
    setView(
      zoomViewportAt(value, { x: box.width / 2, y: box.height / 2 }, factor),
    );
  }, []);
  const fitFloor = useCallback(() => {
    const { size: box, bounds: extent, floor: shape } = liveRef.current;
    viewTouched.current = false;
    const framedBox = {
      width: Math.max(1, box.width - insetRight),
      height: box.height,
    };
    setView(
      shape.vertices.length === 0
        ? emptyViewport(framedBox)
        : fitViewport(extent, framedBox, 48 + RULER_SIZE),
    );
  }, [insetRight]);

  const percent = Math.round((current.scale / 40) * 100);
  const zoomTo = useCallback(
    (target: number) => {
      const { view: value } = liveRef.current;
      zoomBy(((target / 100) * 40) / value.scale);
    },
    [zoomBy],
  );
  useEffect(() => {
    onViewportControls?.({
      percent,
      zoomIn: () => zoomBy(1.25),
      zoomOut: () => zoomBy(1 / 1.25),
      zoomTo,
      fit: fitFloor,
    });
  }, [percent, zoomBy, zoomTo, fitFloor, onViewportControls]);
  const project = (point: MapPoint) => toScreen(point, current);

  const angleDiagrams = (() => {
    const diagrams: {
      key: string;
      sectors: {
        kind: "inner" | "outer";
        angle: number;
        fill: string;
        arc: string;
        label: string;
        labelPoint: MapPoint;
      }[];
    }[] = [];
    for (const {
      areaId,
      vertex,
      previous,
      next,
      inner,
      outer,
    } of angleLabels) {
      const corner = project(vertex);
      const previousPoint = project(previous);
      const nextPoint = project(next);
      const span = Math.min(
        Math.hypot(previousPoint.x - corner.x, previousPoint.y - corner.y),
        Math.hypot(nextPoint.x - corner.x, nextPoint.y - corner.y),
      );
      // Any smaller and the mark would cover the corner it describes, so the
      // plan reads better without one until it is zoomed in.
      if (span < 40) continue;
      const startAngle = Math.atan2(
        previousPoint.y - corner.y,
        previousPoint.x - corner.x,
      );
      const endAngle = Math.atan2(
        nextPoint.y - corner.y,
        nextPoint.x - corner.x,
      );
      const clockwiseAngle = normalizeRadians(endAngle - startAngle);
      const innerRadians = (inner * Math.PI) / 180;
      const innerSweep: 0 | 1 =
        Math.abs(clockwiseAngle - innerRadians) <=
        Math.abs(FULL_TURN - clockwiseAngle - innerRadians)
          ? 1
          : 0;
      const radius = angleMarkRadius(span);
      const squareCorner = Math.abs(inner - 90) < 0.5;
      const values = [
        ...(angleMode === "inner" || angleMode === "both"
          ? [
              {
                kind: "inner" as const,
                angle: inner,
                sweep: innerSweep,
                radius,
                square: squareCorner,
              },
            ]
          : []),
        ...(angleMode === "outer" || angleMode === "both"
          ? [
              {
                kind: "outer" as const,
                angle: outer,
                sweep: (innerSweep === 1 ? 0 : 1) as 0 | 1,
                // The outer arc rides wider than the inner one, so the two
                // never meet into a single disc over the corner.
                radius: radius + 7,
                square: false,
              },
            ]
          : []),
      ];
      diagrams.push({
        key: `${areaId}:${vertex.id}`,
        sectors: values.map((value) => {
          const label = `${Math.round(value.angle * 10) / 10}°`;
          const radians = (value.angle * Math.PI) / 180;
          const midAngle =
            startAngle + (radians / 2) * (value.sweep === 1 ? 1 : -1);
          const reach = angleLabelDistance(value.radius, value.angle, label);
          return {
            kind: value.kind,
            angle: value.angle,
            fill: value.square
              ? rightAnglePath(
                  corner,
                  value.radius,
                  startAngle,
                  value.sweep,
                  true,
                )
              : angleSectorPath(
                  corner,
                  value.radius,
                  startAngle,
                  value.sweep,
                  radians,
                ),
            arc: value.square
              ? rightAnglePath(
                  corner,
                  value.radius,
                  startAngle,
                  value.sweep,
                  false,
                )
              : angleArcPath(
                  corner,
                  value.radius,
                  startAngle,
                  value.sweep,
                  radians,
                ),
            label,
            labelPoint: {
              x: corner.x + Math.cos(midAngle) * reach,
              y: corner.y + Math.sin(midAngle) * reach,
            },
          };
        }),
      });
    }
    return diagrams;
  })();

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
  function draftCorner(event: { clientX: number; clientY: number }): {
    point: MapPoint;
    guides: SnapGuide[];
    snappedToSegment?: boolean;
    areaId?: string | null;
  } {
    const world = pointerWorld(event);
    const previous = outline[outline.length - 1] ?? null;
    const startAreas = dividerStartAreaIds.length
      ? areaRings.filter(({ id }) => dividerStartAreaIds.includes(id))
      : [];
    const intentAreaId = previous
      ? chooseDividerAreaFromDirection(
          startAreas,
          outline[0],
          world,
          dividerAreaId,
        )
      : null;
    const dividerRing = intentAreaId
      ? (areaRings.find(({ id }) => id === intentAreaId)?.ring ?? null)
      : null;
    const snapRings = dividerRing
      ? [dividerRing]
      : areaRings.map(({ ring }) => ring);
    if (tool === "divide" && snapRings.length > 0 && snap.enabled) {
      const wallResult = snapWorldPoint(world, {
        settings: snap,
        corners: [...snapRings.flat(), ...outline],
        segments: snapRings.flatMap((ring) =>
          ring.map((start, index) => ({
            start,
            end: ring[(index + 1) % ring.length],
          })),
        ),
        toleranceMeters: SNAP_TOLERANCE_PX / current.scale,
      });
      if (wallResult.snappedToSegment) {
        const areaId = dividerRing
          ? intentAreaId
          : chooseDividerArea(
              areaRings,
              wallResult.point,
              world,
              selectedAreaId,
            );
        return { ...wallResult, areaId };
      }
    }
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
    return {
      point,
      guides: result.guides,
      areaId: tool === "divide" ? intentAreaId : undefined,
    };
  }

  function placeDividerCorner(event: React.PointerEvent) {
    const draft = draftCorner(event);
    const { point } = draft;
    if (outline.length === 0) {
      const areaId = "areaId" in draft ? draft.areaId : null;
      const ring = areaRings.find(({ id }) => id === areaId)?.ring;
      if (!areaId || !ring || locatePoint(point, ring) !== "boundary") {
        onError("Start the divider on any room wall.");
        return;
      }
      onError(null);
      onSelectArea(areaId);
      onSelectWall(null);
      setDividerStartAreaIds(
        dividerAreasAtPoint(areaRings, point).map(({ id }) => id),
      );
      setDividerAreaId(areaId);
      setDividerHoverAreaId(areaId);
      setOutline([point]);
      return;
    }
    const areaId = draft.areaId ?? dividerAreaId;
    const ring = areaRings.find(({ id }) => id === areaId)?.ring;
    if (!areaId || !ring) return;
    const where = locatePoint(point, ring);
    // A divider ends as soon as it reaches another wall of the same room.
    if (where === "boundary") {
      onError(null);
      onDivideRoom(areaId, [...outline, point]);
      setOutline([]);
      setOutlineHover(null);
      setDividerAreaId(null);
      setDividerStartAreaIds([]);
      setDividerHoverAreaId(null);
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

  const noSharedWall = "Only rooms joined by a shared wall can be combined.";

  /** Keeps the newest two rooms picked, and clicking a picked room drops it. */
  function pickCombineRoom(areaId: string) {
    const next = combinePicks.includes(areaId)
      ? combinePicks.filter((id) => id !== areaId)
      : combinePicks.length >= 2
        ? [areaId]
        : [...combinePicks, areaId];
    setCombineConfirm(null);
    setCombinePicks(next);
    onError(
      next.length === 2 && !sharedWallPoint(shown, next[0], next[1])
        ? noSharedWall
        : null,
    );
  }

  /** Both routes into a combine end here: nothing merges without this step. */
  function askToCombine(keepId: string, mergeId: string) {
    const point = sharedWallPoint(shown, keepId, mergeId);
    if (!point) {
      setCombinePicks([keepId, mergeId]);
      onError(noSharedWall);
      return;
    }
    onError(null);
    setCombinePicks([keepId, mergeId]);
    setCombineConfirm({ keepId, mergeId, point });
  }

  function clearCombine() {
    setCombinePicks([]);
    setCombineConfirm(null);
    onError(null);
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
        setWallSnapActive(
          "snappedToSegment" in draft && Boolean(draft.snappedToSegment),
        );
        if (tool === "divide") {
          const nextAreaId = draft.areaId ?? null;
          setDividerHoverAreaId(nextAreaId);
          if (
            outline.length > 0 &&
            nextAreaId &&
            nextAreaId !== dividerAreaId
          ) {
            setDividerAreaId(nextAreaId);
            onSelectArea(nextAreaId);
          }
        }
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
    if (drag.kind === "fixture") {
      const result = snapped(
        { x: world.x + drag.grabOffset.x, y: world.y + drag.grabOffset.y },
        [],
      );
      setGuides([]);
      dragRef.current = { ...drag, moved: true };
      const removing = inRemoveZone(event);
      setOverRemoveZone(removing);
      // Over the bin the marker stops following, so the plan does not twitch
      // under a drag that is about to take the fixture off it.
      setLightPreview(
        removing ? null : { fixtureId: drag.fixtureId, point: result.point },
      );
      return;
    }
    if (drag.kind === "combine") {
      const moved =
        drag.moved ||
        Math.hypot(event.clientX - drag.start.x, event.clientY - drag.start.y) >
          4;
      const over = areaAtPoint(world);
      const targetId = over && over !== drag.sourceId ? over : null;
      if (moved === drag.moved && targetId === drag.targetId) return;
      // Once the pointer travels, the drag decides the pair: earlier picks
      // would otherwise stay lit beside the two rooms actually in play.
      if (moved && !drag.moved && combinePicks.length > 0) clearCombine();
      setDrag({ ...drag, moved, targetId });
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
      setMergeTargetIds(onto ? [onto.id] : []);
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
    const carried = wallVertexIds(drag.base, wall);
    const anchor = drag.base.vertices.find(
      (vertex) => vertex.id === wall.startVertexId,
    )!;
    // A wall follows the pointer in both directions; Shift keeps it square.
    const straight = (offset: MapPoint) => {
      const along = offset.x * wall.normal.x + offset.y * wall.normal.y;
      return { x: wall.normal.x * along, y: wall.normal.y * along };
    };
    const dragged = {
      x: world.x - drag.startWorld.x,
      y: world.y - drag.startWorld.y,
    };
    const wanted = event.shiftKey ? straight(dragged) : dragged;
    const result = snapped(
      { x: anchor.x + wanted.x, y: anchor.y + wanted.y },
      carried,
    );
    let delta = {
      x: result.point.x - anchor.x,
      y: result.point.y - anchor.y,
    };
    if (event.shiftKey) delta = straight(delta);
    setGuides(
      !event.shiftKey || wall.orientation === "angled"
        ? result.guides
        : result.guides.filter((guide) =>
            wall.orientation === "vertical"
              ? guide.axis === "x"
              : guide.axis === "y",
          ),
    );
    // A corner within reach pulls the wall onto it, so releasing there welds
    // the two rather than stopping the drag against a point.
    const tolerance = SNAP_TOLERANCE_PX / current.scale;
    let closest: { gap: number; delta: MapPoint } | null = null;
    for (const id of carried) {
      const from = drag.base.vertices.find((vertex) => vertex.id === id);
      if (!from) continue;
      const landing = { x: from.x + delta.x, y: from.y + delta.y };
      for (const other of drag.base.vertices) {
        if (carried.includes(other.id)) continue;
        const gap = distance(landing, other);
        if (gap > tolerance || (closest && gap >= closest.gap)) continue;
        closest = {
          gap,
          delta: {
            x: delta.x + other.x - landing.x,
            y: delta.y + other.y - landing.y,
          },
        };
      }
    }
    if (closest) delta = closest.delta;
    const welding = carried.flatMap((id) => {
      const from = drag.base.vertices.find((vertex) => vertex.id === id);
      if (!from) return [];
      const landing = { x: from.x + delta.x, y: from.y + delta.y };
      return drag.base.vertices
        .filter(
          (other) =>
            !carried.includes(other.id) && distance(landing, other) <= 1e-6,
        )
        .map((other) => other.id);
    });
    setMergeTargetIds(welding);
    dragRef.current = { ...drag, moved: true, welded: welding.length > 0 };
    const moved = translateWall(drag.base, drag.wallId, delta);
    applyPreview(moved.ok ? moved.value : null, moved.ok ? null : moved.error);
  }

  function endDrag(event: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    capture(event, true);
    const committed = previewRef.current;
    if (drag.kind === "fixture") {
      const moved = lightPreview;
      const removing = inRemoveZone(event);
      setLightPreview(null);
      setOverRemoveZone(false);
      setDrag(null);
      setGuides([]);
      if (removing) onRemoveFixture?.(drag.fixtureId);
      else if (drag.moved && moved)
        onPlaceFixture(moved.fixtureId, moved.point);
      return;
    }
    if (drag.kind === "combine") {
      setDrag(null);
      // A press that stayed put is a pick; one that travelled is a drop, and
      // the room underneath keeps its name.
      if (!drag.moved) pickCombineRoom(drag.sourceId);
      else if (drag.targetId) askToCombine(drag.targetId, drag.sourceId);
      return;
    }
    if (drag.kind === "corner" && drag.moved && mergeTargetIds[0]) {
      const onto = mergeTargetIds[0];
      setDrag(null);
      setPreview(null);
      setGuides([]);
      setMergeTargetIds([]);
      onMergeCorners(drag.vertexId, onto);
      return;
    }
    if (drag.kind !== "pan" && committed && drag.moved) onCommit(committed);
    // Welding renames the run's end corners, so its old key selects nothing.
    if (drag.kind === "wall" && drag.moved && drag.welded) onSelectWall(null);
    if (drag.kind === "pan" && !drag.moved) {
      if (tool === "draw") placeCorner(event);
      else if (tool === "lights") {
        if (placingFixtureId) {
          const { point } = draftCorner(event);
          onPlaceFixture(placingFixtureId, point);
        } else onSelectArea(null);
      } else if (tool === "divide") placeDividerCorner(event);
      else if (tool === "combine") clearCombine();
      else {
        onSelectArea(null);
        onSelectWall(null);
        onSelectVertex(null);
      }
    }
    setDrag(null);
    setPreview(null);
    setGuides([]);
    setWallSnapActive(false);
    setMergeTargetIds([]);
  }

  // A tray row hands its fixture over on press and the map takes the pointer
  // from there, so dragging one in never depends on HTML5 drag and drop, which
  // the desktop shell's own drop handler swallows on Windows.
  const liftRef = useRef({
    draftCorner,
    onPlaceFixture,
    onLiftEnd,
    onRemoveFixture,
    inRemoveZone,
  });
  liftRef.current = {
    draftCorner,
    onPlaceFixture,
    onLiftEnd,
    onRemoveFixture,
    inRemoveZone,
  };

  useEffect(() => {
    if (!liftedFixtureId) return;
    const over = (event: PointerEvent) => {
      const rect = surfaceRef.current?.getBoundingClientRect();
      return Boolean(
        rect &&
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom,
      );
    };
    const move = (event: PointerEvent) => {
      const removing = liftRef.current.inRemoveZone(event);
      setOverRemoveZone(removing);
      if (removing || !over(event)) {
        setLightPreview(null);
        return;
      }
      const { point } = liftRef.current.draftCorner(event);
      setLightPreview({ fixtureId: liftedFixtureId, point });
    };
    const drop = (event: PointerEvent) => {
      if (liftRef.current.inRemoveZone(event))
        liftRef.current.onRemoveFixture?.(liftedFixtureId);
      else if (over(event)) {
        const { point } = liftRef.current.draftCorner(event);
        liftRef.current.onPlaceFixture(liftedFixtureId, point);
      }
      setLightPreview(null);
      setOverRemoveZone(false);
      liftRef.current.onLiftEnd?.();
    };
    const cancel = () => {
      setLightPreview(null);
      setOverRemoveZone(false);
      liftRef.current.onLiftEnd?.();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", drop);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", drop);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [liftedFixtureId]);

  // One report for both ways a fixture travels — out of the tray and off its
  // own marker — so the host shows one remove zone for either.
  const draggingFixtureId =
    liftedFixtureId ?? (drag?.kind === "fixture" ? drag.fixtureId : null);
  const dragChangeRef = useRef(onFixtureDragChange);
  dragChangeRef.current = onFixtureDragChange;
  useEffect(() => {
    dragChangeRef.current?.(
      draggingFixtureId
        ? { fixtureId: draggingFixtureId, overRemoveZone }
        : null,
    );
  }, [draggingFixtureId, overRemoveZone]);

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

  const areaName = (id: string) =>
    shown.areas.find((area) => area.id === id)?.name ?? "this room";
  const confirmAnchor = combineConfirm ? project(combineConfirm.point) : null;
  // The card sits above its dot, unless that would push it off the top.
  const confirmBelow = confirmAnchor !== null && confirmAnchor.y < 150;

  return (
    <div
      ref={surfaceRef}
      className={cn(
        "relative min-h-80 min-w-0 flex-1 touch-none overflow-hidden rounded-3xl border border-border/60 bg-muted/20 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        tool === "draw" || tool === "divide" || placingFixtureId
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
            setWallSnapActive(false);
            setDividerAreaId(null);
            setDividerStartAreaIds([]);
            setDividerHoverAreaId(null);
            onError(null);
            return;
          }
        }
        if (event.key === "Escape") {
          if (tool === "combine") {
            clearCombine();
            return;
          }
          if (tool === "divide") {
            setOutline([]);
            setOutlineHover(null);
            setWallSnapActive(false);
            setDividerAreaId(null);
            setDividerStartAreaIds([]);
            setDividerHoverAreaId(null);
            onError(null);
          }
          onSelectWall(null);
          onSelectArea(null);
          onSelectVertex(null);
          return;
        }
        if (tool !== "move" || !selectedWallId) return;
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
              : tool === "combine"
                ? `${floor.name} editor. Drag one room onto another, or click two rooms that share a wall and then the dot on that wall.`
                : tool === "lights"
                  ? `${floor.name} editor. Drag fixture markers, or click to place the chosen fixture.`
                  : tool === "view"
                    ? `${floor.name} preview. Drag to pan, scroll to zoom.`
                    : `${floor.name} editor. Drag walls and corners, add a corner from the dot on a hovered wall, or drop one corner on another to merge.`
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
          const combineActive =
            tool === "combine" &&
            (combinePicks.includes(area.id) ||
              (drag?.kind === "combine" &&
                (drag.sourceId === area.id || drag.targetId === area.id)));
          return (
            <g key={area.id}>
              <polygon
                points={ring.map((point) => `${point.x},${point.y}`).join(" ")}
                className={cn(
                  "cursor-pointer transition-colors motion-reduce:transition-none",
                  combineActive
                    ? "fill-primary/25 stroke-foreground/60"
                    : dividerHoverAreaId === area.id
                      ? "fill-primary/20 stroke-primary/70"
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
                        if (tool === "combine") {
                          capture(event);
                          setDrag({
                            kind: "combine",
                            sourceId: area.id,
                            targetId: null,
                            start: { x: event.clientX, y: event.clientY },
                            moved: false,
                          });
                          return;
                        }
                        onSelectArea(area.id);
                        onSelectWall(null);
                        onSelectVertex(null);
                      }
                }
                pointerEvents={
                  tool === "move" || tool === "combine" ? undefined : "none"
                }
              />
              {labelPoint &&
                renderAreaControl &&
                (tool === "view" || tool === "move") && (
                  <foreignObject
                    x={project(labelPoint).x - 100}
                    y={project(labelPoint).y - 18}
                    width={200}
                    height={42}
                    className="overflow-visible"
                    onPointerDown={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <div className="flex justify-center">
                      {renderAreaControl(area.id)}
                    </div>
                  </foreignObject>
                )}
              {labelPoint &&
                !(renderAreaControl && (tool === "view" || tool === "move")) &&
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
          const labelPosition = segmentLabelPosition(start, end);
          const label = lengthLabel(wall.lengthMeters);
          // A reading wider than its own wall would sit on the corners either
          // side of it, so on a crowded plan only the picked wall keeps one.
          const labelFits =
            Math.hypot(end.x - start.x, end.y - start.y) >
            label.length * 6.2 + 8;
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
                  "cursor-move",
                  active
                    ? "stroke-primary/40"
                    : hoverWallId === wall.id
                      ? "stroke-foreground/15"
                      : "stroke-transparent",
                )}
                pointerEvents={tool === "move" ? undefined : "none"}
                onPointerEnter={() => setHoverWallId(wall.id)}
                onPointerLeave={() =>
                  setHoverWallId((value) => (value === wall.id ? null : value))
                }
                onPointerDown={(event) => {
                  event.stopPropagation();
                  capture(event);
                  onError(null);
                  onSelectWall(wall.id);
                  onSelectArea(null);
                  onSelectVertex(null);
                  setDrag({
                    kind: "wall",
                    wallId: wall.id,
                    orientation: wall.orientation,
                    base: shown,
                    startWorld: pointerWorld(event),
                    moved: false,
                    welded: false,
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
              {((active && measurementDisplay.wallLengths !== "off") ||
                (showAllLengths && labelFits)) && (
                <text
                  x={labelPosition.x}
                  y={labelPosition.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  paintOrder="stroke"
                  strokeWidth={5}
                  strokeLinejoin="round"
                  className={cn(
                    "pointer-events-none stroke-background text-[12px] font-medium tabular-nums",
                    active ? "fill-foreground" : "fill-foreground/75",
                  )}
                >
                  {label}
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
            className="pointer-events-none stroke-destructive"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        ))}

        {angleDiagrams.map((diagram) => (
          <g key={diagram.key} className="pointer-events-none">
            {diagram.sectors.map((sector) => (
              <g key={sector.kind}>
                <title>
                  {`${sector.kind === "inner" ? "Inner" : "Outer"} angle ${Math.round(sector.angle * 10) / 10} degrees`}
                </title>
                {/* The wedge is tinted inside the room and left open outside
                    it, so which side is being measured needs no legend. */}
                {sector.kind === "inner" && (
                  <path
                    d={sector.fill}
                    stroke="none"
                    className="fill-primary/15"
                  />
                )}
                <path
                  d={sector.arc}
                  fill="none"
                  strokeWidth={sector.kind === "inner" ? 1.25 : 1}
                  strokeDasharray={sector.kind === "outer" ? "3 3" : undefined}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={
                    sector.kind === "inner"
                      ? "stroke-foreground/55"
                      : "stroke-foreground/35"
                  }
                />
                <text
                  x={sector.labelPoint.x}
                  y={sector.labelPoint.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  paintOrder="stroke"
                  strokeWidth={3}
                  strokeLinejoin="round"
                  className={cn(
                    "stroke-background/90 text-[10px] tabular-nums",
                    sector.kind === "inner"
                      ? "fill-foreground font-semibold"
                      : "fill-foreground/70 font-medium",
                  )}
                >
                  {sector.label}
                </text>
              </g>
            ))}
          </g>
        ))}

        {showLights &&
          markers.map((marker) => {
            const dragging = lightPreview?.fixtureId === marker.id;
            const live = dragging ? lightPreview.point : marker.point;
            const position = project(live);
            const label = fixtureLabels[marker.id] ?? "Light";
            return (
              <g key={marker.id}>
                {tool === "view" && renderFixtureControl ? (
                  <foreignObject
                    x={position.x - 16}
                    y={position.y - 16}
                    width={32}
                    height={32}
                    className="overflow-visible"
                    onPointerDown={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    {renderFixtureControl(marker.id)}
                  </foreignObject>
                ) : (
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
                    aria-label={
                      marker.heads > 1
                        ? `${label}, ${marker.heads} bulbs`
                        : label
                    }
                    onPointerDown={
                      tool === "lights"
                        ? (event) => {
                            event.stopPropagation();
                            capture(event);
                            onError(null);
                            const world = pointerWorld(event);
                            setDrag({
                              kind: "fixture",
                              fixtureId: marker.id,
                              grabOffset: {
                                x: marker.point.x - world.x,
                                y: marker.point.y - world.y,
                              },
                              moved: false,
                            });
                          }
                        : undefined
                    }
                  />
                )}
                {/* A second bulb inside the ring says one fixture, many heads. */}
                {marker.heads > 1 && tool !== "view" && (
                  <circle
                    cx={position.x}
                    cy={position.y}
                    r={2.5}
                    className={cn(
                      "pointer-events-none",
                      dragging ? "fill-background" : "fill-foreground/70",
                    )}
                  />
                )}
              </g>
            );
          })}

        {lightPreview &&
          !markers.some((marker) => marker.id === lightPreview.fixtureId) && (
            <circle
              cx={project(lightPreview.point).x}
              cy={project(lightPreview.point).y}
              r={8}
              strokeWidth={2}
              className="pointer-events-none fill-primary stroke-background"
              aria-label={fixtureLabels[lightPreview.fixtureId] ?? "Light"}
            />
          )}

        {tool === "divide" && outlineHover && wallSnapActive && (
          <circle
            cx={project(outlineHover).x}
            cy={project(outlineHover).y}
            r={6}
            strokeWidth={2}
            className="pointer-events-none fill-background stroke-primary"
          />
        )}

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

        {outline.length > 0 && (
          <g className="pointer-events-none">
            {outline.slice(1).map((point, index) => {
              const from = outline[index];
              const position = segmentLabelPosition(
                project(from),
                project(point),
              );
              return (
                <text
                  key={`outline-length-${index}`}
                  x={position.x}
                  y={position.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  paintOrder="stroke"
                  strokeWidth={5}
                  strokeLinejoin="round"
                  className="fill-foreground stroke-background text-[12px] font-medium tabular-nums"
                >
                  {lengthLabel(distance(from, point))}
                </text>
              );
            })}
            {outlineHover &&
              (() => {
                const from = outline[outline.length - 1];
                const length = distance(from, outlineHover);
                if (length < 0.01) return null;
                const position = segmentLabelPosition(
                  project(from),
                  project(outlineHover),
                );
                return (
                  <text
                    x={position.x}
                    y={position.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    paintOrder="stroke"
                    strokeWidth={5}
                    strokeLinejoin="round"
                    className="fill-foreground stroke-background text-[12px] font-medium tabular-nums"
                  >
                    {lengthLabel(length)}
                  </text>
                );
              })()}
          </g>
        )}

        {tool === "move" &&
          !drag &&
          walls
            .filter((wall) => wall.id === hoverWallId)
            .flatMap((wall) =>
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
                    // The dot sits inside the wall's own hit area.
                    onPointerEnter={() => setHoverWallId(wall.id)}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      onError(null);
                      // The midpoint is already exactly on this segment.
                      // Grid-snapping it first can move diagonal walls off
                      // their line and make a valid click fail validation.
                      const result = onInsertCorner(middle);
                      if (!result) return;
                      capture(event);
                      // Selecting it puts Remove and Merge one click away.
                      onSelectWall(null);
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

        {tool === "move" &&
          shown.vertices.map((vertex) => {
            const position = project(vertex);
            const merging = mergeTargetIds.includes(vertex.id);
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

      {tool === "combine" && combinePoint && !combineConfirm && (
        <button
          type="button"
          title="Combine these two rooms"
          aria-label={`Combine ${areaName(combinePicks[1])} into ${areaName(combinePicks[0])}`}
          className="absolute z-10 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-background bg-primary shadow-lg outline-none hover:scale-110 focus-visible:ring-4 focus-visible:ring-primary/40 motion-safe:transition-transform"
          style={{
            left: project(combinePoint).x,
            top: project(combinePoint).y,
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => askToCombine(combinePicks[0], combinePicks[1])}
        >
          <Combine className="size-3.5 text-primary-foreground" />
        </button>
      )}

      {combineConfirm && confirmAnchor && (
        <div
          role="dialog"
          aria-label="Combine rooms"
          className={cn(
            "absolute z-10 w-64 -translate-x-1/2 rounded-2xl border border-border bg-background/95 p-3 shadow-xl backdrop-blur",
            confirmBelow ? "" : "-translate-y-full",
          )}
          style={{
            left: Math.min(
              Math.max(confirmAnchor.x, 140),
              Math.max(size.width - 140, 140),
            ),
            top: confirmAnchor.y + (confirmBelow ? 18 : -18),
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            clearCombine();
            surfaceRef.current?.focus();
          }}
        >
          <p className="text-sm">
            Combine{" "}
            <span className="font-medium">
              {areaName(combineConfirm.mergeId)}
            </span>{" "}
            into{" "}
            <span className="font-medium">
              {areaName(combineConfirm.keepId)}
            </span>
            ?
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            The wall between them goes. The combined room keeps the name and Hue
            link of {areaName(combineConfirm.keepId)}.
          </p>
          <div className="mt-3 flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={clearCombine}>
              Cancel
            </Button>
            <Button
              size="sm"
              autoFocus
              onClick={() => {
                onCombineRooms([combineConfirm.keepId, combineConfirm.mergeId]);
                clearCombine();
              }}
            >
              Combine
            </Button>
          </div>
        </div>
      )}

      <div
        className="pointer-events-none absolute top-8 left-0 flex justify-center"
        style={{ right: insetRight }}
      >
        {tool === "lights" && (
          <p
            role="status"
            className="rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm"
          >
            {placingFixtureId
              ? "Click where this fixture is in the room."
              : "Drag a marker to move it, or drag a fixture in from the list."}
          </p>
        )}
        {tool === "move" && (
          <p
            role="status"
            className="rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm"
          >
            {shown.vertices.some((vertex) => vertex.id === selectedVertexId)
              ? "Drag the point · Drop it on another to merge them · Esc clears"
              : selectedWallId
                ? "Drag the wall any way · Shift keeps it square · Arrow keys nudge · Esc clears"
                : "Drag a wall or a corner · Hover a wall and click its dot to add a corner"}
          </p>
        )}
        {tool === "combine" && (
          <p
            role="status"
            className="rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm"
          >
            {combineConfirm
              ? "Confirm the combine, or Esc to keep both rooms"
              : combinePicks.length === 2 && !combinePoint
                ? "These rooms share no wall · Pick two rooms next to each other"
                : combinePoint
                  ? "Click the dot on the wall between them · Esc cancels"
                  : combinePicks.length === 1
                    ? "Click the room next to it, or drag one onto the other · Esc cancels"
                    : "Drag one room onto another, or click two rooms that touch · Esc cancels"}
          </p>
        )}
        {tool === "divide" && (
          <p
            role="status"
            className="rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm"
          >
            {outline.length === 0
              ? "Click any wall—the room under the pointer is selected automatically · Esc cancels"
              : "Move into the intended room, then click any of its walls to finish · Esc cancels"}
          </p>
        )}
        {tool === "draw" && (
          <p
            role="status"
            className="rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm"
          >
            {outline.length === 0
              ? "Click to place the first corner of a room · Esc cancels"
              : outline.length < 3
                ? "Keep clicking corners · Backspace removes the last · Esc cancels"
                : "Click the first corner or press Enter to finish · Backspace removes the last"}
          </p>
        )}
      </div>

      {showNavigationHint && (
        <p
          aria-hidden
          className="pointer-events-none absolute bottom-6 text-[10px] tracking-wide text-muted-foreground uppercase"
          style={{ right: insetRight + 16 }}
        >
          Drag to pan · Scroll to zoom · Hold Alt for measurements
        </p>
      )}

      <MapRulers view={current} size={size} units={units} />

      {!onViewportControls && (
        <div
          className={cn(
            "absolute right-3 bottom-6 flex items-center gap-0.5 rounded-2xl border border-border bg-background/95 p-1.5 shadow-lg backdrop-blur",
            overlayInsetClassName,
          )}
          role="group"
          aria-label="Map zoom"
        >
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom out"
            onClick={() => zoomBy(1 / 1.25)}
          >
            <Minus />
          </Button>
          <span className="w-12 text-center text-xs text-muted-foreground tabular-nums">
            {percent}%
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom in"
            onClick={() => zoomBy(1.25)}
          >
            <Plus />
          </Button>
          <div className="mx-1 h-4 w-px bg-border" />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Fit floor"
            onClick={fitFloor}
          >
            <Maximize />
          </Button>
        </div>
      )}
    </div>
  );
}
