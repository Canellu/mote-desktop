import { Palette } from "lucide-react";
import { SceneTile } from "@/features/space-screen/components/SceneTile";
import { activeTileTheme } from "@/lib/tile-theme";
import { cn } from "@/lib/utils";
import {
  PICKER_TILE_ROW,
  PICKER_TILE_SURFACE,
  PickerGroups,
} from "./AutomationPickerGroups";

/** A saved scene as the automation picker shows it. */
export interface AutomationSceneOption {
  id: string;
  name: string;
  /** The room or zone the scene belongs to. */
  groupId: string;
  groupName: string;
  /** CSS background for the scene's palette, or null when it has no colors. */
  bubble: string | null;
  /** The palette's first color, used to pick readable ink on a lit tile. */
  tint: string | null;
  /** 0-100. */
  brightness: number;
}

/**
 * Scenes under their room or zone, drawn like the room screen's scene cards:
 * the chosen one lights up in its own colors.
 */
export function AutomationScenePicker({
  scenes,
  selectedId,
  fallbackName,
  labelledBy,
  onSelect,
}: {
  scenes: AutomationSceneOption[];
  selectedId: string | null;
  /** Name of a chosen scene that is no longer on the bridge. */
  fallbackName?: string;
  labelledBy: string;
  onSelect: (scene: AutomationSceneOption) => void;
}) {
  const groups = scenes.reduce<
    { id: string; name: string; scenes: AutomationSceneOption[] }[]
  >((list, scene) => {
    const group = list.find((item) => item.id === scene.groupId);
    if (group) group.scenes.push(scene);
    else
      list.push({ id: scene.groupId, name: scene.groupName, scenes: [scene] });
    return list;
  }, []);
  const missing =
    selectedId != null && !scenes.some((scene) => scene.id === selectedId);

  if (scenes.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        No scenes are saved on this bridge yet.
      </p>
    );

  return (
    <div className="grid min-w-0 gap-3">
      {missing && (
        <p className="text-sm text-muted-foreground">
          {fallbackName
            ? `${fallbackName} is no longer on this bridge. Choose another scene.`
            : "The chosen scene is no longer on this bridge. Choose another."}
        </p>
      )}
      <PickerGroups
        labelledBy={labelledBy}
        groups={groups.map((group) => ({
          id: group.id,
          name: group.name,
          selected: group.scenes.some((scene) => scene.id === selectedId)
            ? 1
            : 0,
          children: (
            <div className={PICKER_TILE_ROW}>
              {group.scenes.map((scene) => (
                <SceneOptionTile
                  key={scene.id}
                  scene={scene}
                  selected={scene.id === selectedId}
                  onSelect={() => onSelect(scene)}
                />
              ))}
            </div>
          ),
        }))}
      />
    </div>
  );
}

function SceneOptionTile({
  scene,
  selected,
  onSelect,
}: {
  scene: AutomationSceneOption;
  selected: boolean;
  onSelect: () => void;
}) {
  const lit = selected && scene.bubble != null;
  return (
    <SceneTile
      size="sm"
      name={scene.name}
      ariaPressed={selected}
      activeBackground={lit}
      className={cn(
        lit ? "text-foreground" : selected ? "bg-accent" : PICKER_TILE_SURFACE,
      )}
      style={
        lit && scene.bubble
          ? activeTileTheme(
              scene.bubble,
              scene.tint ?? scene.bubble,
              scene.brightness,
            )
          : undefined
      }
      onActivate={onSelect}
      visual={
        scene.bubble ? (
          <span
            className="aspect-square size-10 shrink-0 rounded-full shadow-sm ring-1 ring-foreground/15"
            style={{ background: scene.bubble }}
          />
        ) : (
          <span className="flex aspect-square size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground ring-1 ring-foreground/10">
            <Palette className="size-5" />
          </span>
        )
      }
    />
  );
}
