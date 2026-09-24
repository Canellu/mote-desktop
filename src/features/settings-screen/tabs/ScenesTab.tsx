import { Button } from "@/components/ui/button";
import { hueDynamicSpeedValueToStep } from "@/lib/hue-speed";
import type { HueRoomZone, HueScene } from "@/types/hue";
import { Plus } from "lucide-react";
import { useMemo } from "react";
import { EditableResourceRow } from "../components/EditableResourceRow";
import { EmptyText } from "../components/EmptyText";
import { Panel } from "../components/Panel";
import type { DeleteResource, RenameResource } from "../types";

export const ScenesTab = ({
  roomZones,
  scenes,
  onRename,
  onDelete,
  onCreate,
}: {
  roomZones: HueRoomZone[];
  scenes: HueScene[];
  onRename: RenameResource;
  onDelete: DeleteResource;
  onCreate: () => void;
}) => {
  const spacesById = useMemo(
    () => new Map(roomZones.map((roomZone) => [roomZone.id, roomZone])),
    [roomZones],
  );

  return (
    <div className="space-y-5">
      <Panel title="Create Scene">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-md text-sm text-muted-foreground">
            Arrange a room or zone's lights and save the result as a scene.
          </p>
          <Button type="button" onClick={onCreate}>
            <Plus />
            Create scene
          </Button>
        </div>
      </Panel>
      <Panel title="Scenes">
        <div className="grid gap-3">
          {scenes.map((scene) => (
            <EditableSceneRow
              key={scene.id}
              scene={scene}
              space={scene.group ? spacesById.get(scene.group) : undefined}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
          {scenes.length === 0 && <EmptyText>No scenes loaded.</EmptyText>}
        </div>
      </Panel>
    </div>
  );
};

const EditableSceneRow = ({
  scene,
  space,
  onRename,
  onDelete,
}: {
  scene: HueScene;
  space?: HueRoomZone;
  onRename: RenameResource;
  onDelete: DeleteResource;
}) => (
  <EditableResourceRow
    id={scene.id}
    resourceType={scene.resourceType}
    name={scene.name}
    eyebrow={`${scene.smart ? "Smart scene" : "Scene"} · ${space?.name ?? "No space"}`}
    meta={[
      scene.status,
      scene.dynamic
        ? scene.speed != null
          ? `Scene speed ${hueDynamicSpeedValueToStep(scene.speed)}`
          : "Dynamic"
        : null,
      `${scene.colors.length} ${scene.colors.length === 1 ? "color" : "colors"}`,
    ]}
    onRename={onRename}
    onDelete={onDelete}
    deleteDescription={`Remove scene "${scene.name}" from room/zone.`}
  />
);
