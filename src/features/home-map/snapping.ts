import type { MapPoint, MapVertex } from "./types";

export const SNAP_INCREMENTS = [0.05, 0.1, 0.25, 0.5, 1] as const;
export type SnapIncrement = (typeof SNAP_INCREMENTS)[number];

export const ANGLE_SNAPS = [0, 15, 45, 90] as const;
export type AngleSnap = (typeof ANGLE_SNAPS)[number];

export interface SnapSettings {
  /** Off means the pointer position is used exactly as it lands. */
  enabled: boolean;
  incrementMeters: SnapIncrement;
  showGrid: boolean;
  /** Align to existing corners as well as to the grid. */
  snapToCorners: boolean;
  /** Degrees a drawn wall's direction snaps to; 0 draws at any angle. */
  angleDegrees: AngleSnap;
}

export const DEFAULT_SNAP_SETTINGS: SnapSettings = {
  enabled: true,
  incrementMeters: 0.1,
  showGrid: true,
  snapToCorners: true,
  angleDegrees: 90,
};

/** A line the pointer aligned to, drawn while dragging like Figma's guides. */
export interface SnapGuide {
  axis: "x" | "y";
  value: number;
  /** The corner the guide came from, so the canvas can draw a short line. */
  through: MapPoint;
}

export interface SnapResult {
  point: MapPoint;
  guides: SnapGuide[];
}

const roundTo = (value: number, step: number) =>
  step > 0 ? Math.round(Math.round(value / step) * step * 1e6) / 1e6 : value;

/**
 * Snapping order matches direct-manipulation editors: an existing corner wins
 * over the grid, per axis, so a wall can line up with a wall it must meet.
 */
export function snapWorldPoint(
  point: MapPoint,
  options: {
    settings: SnapSettings;
    corners?: readonly (MapVertex | MapPoint)[];
    /** Screen tolerance converted to meters by the caller. */
    toleranceMeters?: number;
  },
): SnapResult {
  const { settings, corners = [], toleranceMeters = 0 } = options;
  if (!settings.enabled) return { point, guides: [] };

  const guides: SnapGuide[] = [];
  let x = point.x;
  let y = point.y;

  if (settings.snapToCorners && toleranceMeters > 0) {
    let bestX: { corner: MapPoint; distance: number } | null = null;
    let bestY: { corner: MapPoint; distance: number } | null = null;
    for (const corner of corners) {
      const dx = Math.abs(corner.x - point.x);
      const dy = Math.abs(corner.y - point.y);
      if (dx <= toleranceMeters && (!bestX || dx < bestX.distance))
        bestX = { corner, distance: dx };
      if (dy <= toleranceMeters && (!bestY || dy < bestY.distance))
        bestY = { corner, distance: dy };
    }
    if (bestX) {
      x = bestX.corner.x;
      guides.push({ axis: "x", value: x, through: bestX.corner });
    }
    if (bestY) {
      y = bestY.corner.y;
      guides.push({ axis: "y", value: y, through: bestY.corner });
    }
  }

  const snappedX = guides.some((guide) => guide.axis === "x");
  const snappedY = guides.some((guide) => guide.axis === "y");
  return {
    point: {
      x: snappedX ? x : roundTo(x, settings.incrementMeters),
      y: snappedY ? y : roundTo(y, settings.incrementMeters),
    },
    guides,
  };
}

function isIncrement(value: unknown): value is SnapIncrement {
  return SNAP_INCREMENTS.some((increment) => increment === value);
}

export function parseSnapSettings(value: unknown): SnapSettings {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { ...DEFAULT_SNAP_SETTINGS };
  const record = value as Record<string, unknown>;
  return {
    enabled:
      typeof record.enabled === "boolean"
        ? record.enabled
        : DEFAULT_SNAP_SETTINGS.enabled,
    incrementMeters: isIncrement(record.incrementMeters)
      ? record.incrementMeters
      : DEFAULT_SNAP_SETTINGS.incrementMeters,
    showGrid:
      typeof record.showGrid === "boolean"
        ? record.showGrid
        : DEFAULT_SNAP_SETTINGS.showGrid,
    snapToCorners:
      typeof record.snapToCorners === "boolean"
        ? record.snapToCorners
        : DEFAULT_SNAP_SETTINGS.snapToCorners,
    angleDegrees: ANGLE_SNAPS.some((angle) => angle === record.angleDegrees)
      ? (record.angleDegrees as AngleSnap)
      : DEFAULT_SNAP_SETTINGS.angleDegrees,
  };
}

const storageKey = "mote-map-snapping";

export function readSnapSettings(): SnapSettings {
  try {
    return parseSnapSettings(
      JSON.parse(localStorage.getItem(storageKey) ?? "null"),
    );
  } catch {
    return { ...DEFAULT_SNAP_SETTINGS };
  }
}

export function writeSnapSettings(settings: SnapSettings): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(settings));
  } catch {
    // Editing still works for this session when storage is unavailable.
  }
}
