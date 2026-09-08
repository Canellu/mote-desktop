import type { MapFloor } from "../types";
import type { SnapSettings } from "../snapping";
import { MapEditorCanvas } from "./MapEditorCanvas";

const noop = () => {};

/**
 * The editor canvas without its editing surfaces: pan, zoom, grid and rulers
 * only. Used where a plan is being described rather than reshaped.
 */
export function MapPreviewCanvas({
  floor,
  units,
  snap,
  className,
}: {
  floor: MapFloor;
  units: "metric" | "imperial";
  snap: SnapSettings;
  className?: string;
}) {
  return (
    <MapEditorCanvas
      floor={floor}
      tool="view"
      units={units}
      snap={snap}
      selectedAreaId={null}
      selectedWallId={null}
      selectedVertexId={null}
      combineIds={[]}
      placingLightId={null}
      lightLabels={{}}
      onSelectArea={noop}
      onSelectWall={noop}
      onSelectVertex={noop}
      onToggleCombine={noop}
      onPlaceLight={noop}
      onDrawRoom={noop}
      onDivideRoom={noop}
      onMergeCorners={noop}
      onCommit={noop}
      onInsertCorner={() => null}
      onError={noop}
      className={className}
    />
  );
}
