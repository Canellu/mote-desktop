export const HOME_MAP_SCHEMA_VERSION = 1;

/** Coordinates and lengths are meters, independent of zoom and display units. */
export interface MapPoint {
  x: number;
  y: number;
}

export interface MapVertex extends MapPoint {
  id: string;
}

/** Native v2 IDs are scoped by the document's bridgeId. */
export interface MapControlTarget {
  resourceType: "room" | "zone";
  resourceId: string;
}

export interface MapArea {
  id: string;
  name: string;
  /** Open ring: the first vertex is not repeated at the end. */
  vertexIds: string[];
  target: MapControlTarget | null;
}

export interface MapDimension {
  id: string;
  startVertexId: string;
  endVertexId: string;
  lengthMeters: number;
  locked: boolean;
  verified: boolean;
}

export interface MapLightPlacement extends MapPoint {
  lightId: string;
}

export interface MapFloor {
  id: string;
  name: string;
  /** Adjacent areas reference the same vertices along a shared wall. */
  vertices: MapVertex[];
  areas: MapArea[];
  dimensions: MapDimension[];
  lights: MapLightPlacement[];
}

/**
 * A product the map keeps together, or apart, against what it would work out
 * on its own. Its id is the fixture's id, so markers and placements are
 * unaffected by how the lights came to be grouped.
 */
export interface MapFixtureGroup {
  id: string;
  lightIds: string[];
}

export interface HomeMapDocument {
  schemaVersion: typeof HOME_MAP_SCHEMA_VERSION;
  id: string;
  bridgeId: string;
  name: string;
  drawingMode: "sketch" | "measured";
  units: "metric" | "imperial";
  floors: MapFloor[];
  /** Present only where a product was grouped or split by hand. */
  fixtures?: MapFixtureGroup[];
}

export interface MapValidationIssue {
  path: string;
  message: string;
}

export type MapResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };
