import { HomeMapScreen } from "./HomeMapScreen";
import { sampleHomeMap } from "./sampleMap";

export default function HomeMapPreview({
  floorId,
  areaId,
  onSelect,
}: {
  floorId?: string;
  areaId?: string;
  onSelect: (floorId: string, areaId: string | null) => void;
}) {
  return (
    <HomeMapScreen
      map={sampleHomeMap}
      selectedFloorId={floorId}
      selectedAreaId={areaId}
      onSelect={onSelect}
      roomZones={[]}
      preview
      onOpenSpace={() => {}}
    />
  );
}
