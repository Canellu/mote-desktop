import { almostEqual, distance } from "./geometry";
import { floorFromRing } from "./outline";
import {
  HOME_MAP_SCHEMA_VERSION,
  type HomeMapDocument,
  type MapDimension,
  type MapFloor,
  type MapPoint,
  type MapResult,
  type MapVertex,
} from "./types";
import { hasBoundarySpan, validateHomeMap } from "./validation";

/** Practical drawing limits; storage additionally caps coordinates. */
export const MIN_FLOOR_SIDE_METERS = 0.5;
export const MAX_FLOOR_SIDE_METERS = 200;

export type NotchCorner =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type FloorShape =
  | { kind: "rectangle"; widthMeters: number; depthMeters: number }
  | {
      kind: "l-shape";
      widthMeters: number;
      depthMeters: number;
      notchWidthMeters: number;
      notchDepthMeters: number;
      corner: NotchCorner;
    };

export interface CreateHomeMapInput {
  bridgeId: string;
  name: string;
  drawingMode: HomeMapDocument["drawingMode"];
  units: HomeMapDocument["units"];
  floorName: string;
  roomName: string;
  shape: FloorShape;
  /** Injected so tests and previews can produce stable IDs. */
  createId?: () => string;
}

const side = (value: number, label: string): string | null => {
  if (!Number.isFinite(value)) return `Enter a ${label} in numbers.`;
  if (value < MIN_FLOOR_SIDE_METERS)
    return `${label} must be at least ${MIN_FLOOR_SIDE_METERS} m.`;
  if (value > MAX_FLOOR_SIDE_METERS)
    return `${label} must be at most ${MAX_FLOOR_SIDE_METERS} m.`;
  return null;
};

/** Corners of the outline, before vertex identity is assigned. */
export function buildFloorRing(shape: FloorShape): MapResult<MapPoint[]> {
  const width = shape.widthMeters;
  const depth = shape.depthMeters;
  const error =
    side(width, "Width") ?? side(depth, "Depth") ?? (null as string | null);
  if (error) return { ok: false, error };
  if (shape.kind === "rectangle")
    return {
      ok: true,
      value: [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: depth },
        { x: 0, y: depth },
      ],
    };

  const notchWidth = shape.notchWidthMeters;
  const notchDepth = shape.notchDepthMeters;
  const notchError =
    side(notchWidth, "Cut-out width") ?? side(notchDepth, "Cut-out depth");
  if (notchError) return { ok: false, error: notchError };
  if (notchWidth > width - MIN_FLOOR_SIDE_METERS)
    return {
      ok: false,
      error: `The cut-out must leave at least ${MIN_FLOOR_SIDE_METERS} m of width.`,
    };
  if (notchDepth > depth - MIN_FLOOR_SIDE_METERS)
    return {
      ok: false,
      error: `The cut-out must leave at least ${MIN_FLOOR_SIDE_METERS} m of depth.`,
    };

  // Built with the cut-out at the top right, then mirrored onto the chosen corner.
  const ring: MapPoint[] = [
    { x: 0, y: 0 },
    { x: width - notchWidth, y: 0 },
    { x: width - notchWidth, y: notchDepth },
    { x: width, y: notchDepth },
    { x: width, y: depth },
    { x: 0, y: depth },
  ];
  const flipX = shape.corner === "top-left" || shape.corner === "bottom-left";
  const flipY =
    shape.corner === "bottom-left" || shape.corner === "bottom-right";
  return {
    ok: true,
    value: ring.map((point) => ({
      x: flipX ? width - point.x : point.x,
      y: flipY ? depth - point.y : point.y,
    })),
  };
}

/** Dimensions may only span a wall that exists end to end on this floor. */
function spanningDimension(
  floor: MapFloor,
  id: string,
  candidates: [MapVertex | undefined, MapVertex | undefined][],
): MapDimension | null {
  for (const [start, end] of candidates) {
    if (!start || !end || !hasBoundarySpan(floor, start, end)) continue;
    return {
      id,
      startVertexId: start.id,
      endVertexId: end.id,
      lengthMeters: distance(start, end),
      locked: false,
      verified: false,
    };
  }
  return null;
}

export function createHomeMapDocument({
  bridgeId,
  name,
  drawingMode,
  units,
  floorName,
  roomName,
  shape,
  createId = () => crypto.randomUUID(),
}: CreateHomeMapInput): MapResult<HomeMapDocument> {
  if (!bridgeId.trim()) return { ok: false, error: "A bridge ID is required." };
  const names = { name, floorName, roomName };
  for (const [key, value] of Object.entries(names)) {
    if (!value.trim())
      return {
        ok: false,
        error:
          key === "name"
            ? "Name your map."
            : key === "floorName"
              ? "Name this floor."
              : "Name this room.",
      };
  }
  const ring = buildFloorRing(shape);
  if (!ring.ok) return ring;

  const built = floorFromRing(
    ring.value,
    {
      floorId: createId(),
      floorName,
      areaId: createId(),
      areaName: roomName,
    },
    createId,
  );
  if (!built.ok) return built;
  const floor = built.value;

  const corner = (x: number, y: number) =>
    floor.vertices.find(
      (vertex) => almostEqual(vertex.x, x) && almostEqual(vertex.y, y),
    );
  const width = shape.widthMeters;
  const depth = shape.depthMeters;
  // The notched side has no full-length wall; use the opposite one.
  const dimensions = [
    spanningDimension(floor, createId(), [
      [corner(0, 0), corner(width, 0)],
      [corner(0, depth), corner(width, depth)],
    ]),
    spanningDimension(floor, createId(), [
      [corner(0, 0), corner(0, depth)],
      [corner(width, 0), corner(width, depth)],
    ]),
  ].filter((dimension): dimension is MapDimension => dimension !== null);
  // Typed lengths are the user's own measurements, not derived estimates.
  floor.dimensions = dimensions.map((dimension) => ({
    ...dimension,
    locked: drawingMode === "measured",
    verified: drawingMode === "measured",
  }));

  const document: HomeMapDocument = {
    schemaVersion: HOME_MAP_SCHEMA_VERSION,
    id: createId(),
    bridgeId,
    name: name.trim(),
    drawingMode,
    units,
    floors: [floor],
  };
  const issue = validateHomeMap(document)[0];
  return issue
    ? { ok: false, error: `${issue.path}: ${issue.message}` }
    : { ok: true, value: document };
}
