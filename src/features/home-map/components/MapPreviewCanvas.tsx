import type { MapFloor } from "../types";
import type { SnapSettings } from "../snapping";
import {
  DEFAULT_MEASUREMENT_DISPLAY,
  type MeasurementDisplaySettings,
} from "../measurementDisplay";
import { MapEditorCanvas, type MapViewportControls } from "./MapEditorCanvas";

const noop = () => {};

/**
 * The editor canvas without its editing surfaces: pan, zoom, grid and rulers
 * only. Used where a plan is being described rather than reshaped.
 */
export function MapPreviewCanvas({
  floor,
  units,
  snap,
  measurementDisplay = DEFAULT_MEASUREMENT_DISPLAY,
  className,
  insetRight,
  onViewportControls,
}: {
  floor: MapFloor;
  units: "metric" | "imperial";
  snap: SnapSettings;
  measurementDisplay?: MeasurementDisplaySettings;
  className?: string;
  insetRight?: number;
  onViewportControls?: (controls: MapViewportControls) => void;
}) {
  return (
    <MapEditorCanvas
      floor={floor}
      tool="view"
      units={units}
      snap={snap}
      measurementDisplay={measurementDisplay}
      selectedAreaId={null}
      selectedWallId={null}
      selectedVertexId={null}
      placingFixtureId={null}
      fixtureLabels={{}}
      fixtureOf={{}}
      onSelectArea={noop}
      onSelectWall={noop}
      onSelectVertex={noop}
      onCombineRooms={noop}
      onPlaceFixture={noop}
      onDrawRoom={noop}
      onDivideRoom={noop}
      onMergeCorners={noop}
      onCommit={noop}
      onInsertCorner={() => null}
      onError={noop}
      className={className}
      insetRight={insetRight}
      onViewportControls={onViewportControls}
    />
  );
}
