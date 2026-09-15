import { PacedSlider } from "@/components/PacedSlider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  sceneBrightness,
  sceneBubbleCss,
  sceneHexes,
} from "@/features/space-screen/utils/color-state";
import { findGalleryPresetForScene } from "@/features/space-screen/utils/scene-status";
import {
  HUE_DYNAMIC_SPEED_MAX_STEP,
  HUE_DYNAMIC_SPEED_MIN_STEP,
  hueDynamicSpeedValueToStep,
} from "@/lib/hue-speed";
import { activeTileTheme } from "@/lib/tile-theme";
import { cn } from "@/lib/utils";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import type { HueScene } from "@/types/hue";
import { Loader2, Palette, Pencil, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { RemoveResourceSection } from "./RemoveResourceSection";
import { SidePane } from "./SidePane";

// The Hue bridge rejects resource names longer than 32 characters.
const MAX_NAME_LENGTH = 32;

interface ScenePaneProps {
  scene: HueScene;
  onClose: () => void;
}

export const ScenePane: React.FC<ScenePaneProps> = ({ scene, onClose }) => {
  const roomZones = useHueResourcesStore((state) => state.roomZones);

  const roomZone = scene.group
    ? roomZones.find((candidate) => candidate.id === scene.group)
    : undefined;
  const bubble = sceneBubbleCss(scene);
  const hexes = sceneHexes(scene);
  const brightness = Math.round(sceneBrightness(scene));
  const previewStyle =
    bubble != null
      ? activeTileTheme(bubble, hexes[0] ?? bubble, brightness)
      : undefined;

  const view = (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 pt-1">
        <span
          className={cn(
            "flex size-16 items-center justify-center rounded-2xl text-foreground",
            bubble ? "shadow-sm" : "bg-muted",
          )}
          style={previewStyle}
        >
          {scene.dynamic ? (
            <Sparkles size={30} strokeWidth={2.25} className="drop-shadow" />
          ) : (
            <Palette size={30} strokeWidth={2.25} />
          )}
        </span>
        <h2 className="max-w-full truncate text-center font-heading text-lg font-medium text-foreground">
          {scene.name}
        </h2>
      </div>

      <p className="text-sm font-medium text-muted-foreground">Presets</p>

      <div className="flex flex-col divide-y divide-border rounded-2xl border border-border">
        <PresetRow label="Brightness" value={`${brightness}%`} />
        {scene.dynamic && (
          <PresetRow
            label="Speed"
            value={`${hueDynamicSpeedValueToStep(scene.speed)} of ${HUE_DYNAMIC_SPEED_MAX_STEP}`}
          />
        )}
        {scene.dynamic && (
          <PresetRow
            label="Autoplay"
            value={scene.autoDynamic ? "On" : "Off"}
          />
        )}
      </div>

      {hexes.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-muted-foreground">Palette</p>
          <div className="flex flex-wrap gap-2">
            {hexes.map((hex, index) => (
              <span
                key={`${hex}-${index}`}
                className="size-8 rounded-full shadow-sm ring-1 ring-foreground/15"
                style={{ background: hex }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <SidePane
      eyebrow={
        scene.smart ? "Smart scene" : scene.dynamic ? "Dynamic scene" : "Scene"
      }
      editLabel={`Edit ${scene.name}`}
      resetKey={scene.id}
      onClose={onClose}
      view={view}
      renderEdit={({ active, exitEdit, guardRef }) => (
        <SceneEditPane
          scene={scene}
          active={active}
          roomZoneName={roomZone?.name ?? null}
          onClosePane={onClose}
          onExitEdit={exitEdit}
          guardRef={guardRef}
        />
      )}
    />
  );
};

const PresetRow: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <div className="flex items-center justify-between gap-4 px-4 py-3">
    <span className="text-sm text-muted-foreground">{label}</span>
    <span className="text-sm font-medium text-foreground tabular-nums">
      {value}
    </span>
  </div>
);

const SceneEditPane: React.FC<{
  scene: HueScene;
  active: boolean;
  roomZoneName: string | null;
  onClosePane: () => void;
  onExitEdit: () => void;
  guardRef: React.MutableRefObject<import("./SidePane").SidePaneEditGuard | null>;
}> = ({
  scene,
  active,
  roomZoneName,
  onClosePane,
  onExitEdit,
  guardRef,
}) => {
  const {
    renameScene,
    setSceneBrightness,
    setDynamicSpeedLive,
    setSceneAutoplay,
    deleteScene,
    loadScenes,
  } = useHueResourcesStore();
  const [name, setName] = useState(scene.name);
  const [brightness, setBrightness] = useState(() =>
    Math.round(sceneBrightness(scene)),
  );
  const [speed, setSpeed] = useState(() =>
    hueDynamicSpeedValueToStep(scene.speed),
  );
  // The stored speed when this edit session began. Live previews persist onto
  // the scene (the bridge has no transient speed), so Cancel restores this.
  const originalSpeed = useRef(hueDynamicSpeedValueToStep(scene.speed));
  const [autoDynamic, setAutoDynamic] = useState(scene.autoDynamic);
  const [renaming, setRenaming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bubble = sceneBubbleCss(scene);
  const hexes = sceneHexes(scene);
  const previewStyle =
    bubble != null
      ? activeTileTheme(
          bubble,
          hexes[0] ?? bubble,
          Math.round(sceneBrightness(scene)),
        )
      : undefined;

  // Reset the form only when entering edit for a scene — keyed on id/active, not
  // the scene object. Live speed previews replace the scene object mid-edit; if
  // this re-ran on every such change it would clobber unsaved name/brightness.
  useEffect(() => {
    if (!active) return;
    setName(scene.name);
    setBrightness(Math.round(sceneBrightness(scene)));
    setSpeed(hueDynamicSpeedValueToStep(scene.speed));
    setAutoDynamic(scene.autoDynamic);
    originalSpeed.current = hueDynamicSpeedValueToStep(scene.speed);
    setRenaming(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.id, active]);

  const save = async (): Promise<boolean> => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name cannot be empty.");
      return false;
    }
    if (trimmed.length > MAX_NAME_LENGTH) {
      setError(`Name cannot exceed ${MAX_NAME_LENGTH} characters.`);
      return false;
    }

    setIsSaving(true);
    setError(null);
    try {
      await renameScene(scene, trimmed);
      if (brightness !== Math.round(sceneBrightness(scene))) {
        setSceneBrightness(scene, brightness);
      }
      // Speed is already on the bridge: each slider release previewed it live,
      // which persists onto the scene. Saving just keeps it, so there's nothing
      // more to write here — only commit it as the new baseline.
      originalSpeed.current = speed;
      if (scene.dynamic && autoDynamic !== scene.autoDynamic) {
        await setSceneAutoplay(scene, autoDynamic);
      }
      await loadScenes();
      onExitEdit();
      return true;
    } catch (saveError) {
      setError(String(saveError) || "Unable to save scene changes.");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // Leaving edit without saving restores the speed that was playing before this
  // session, since each preview wrote live to the bridge.
  const cancel = () => {
    if (scene.dynamic && speed !== originalSpeed.current) {
      setDynamicSpeedLive(scene, originalSpeed.current);
    }
    onExitEdit();
  };

  guardRef.current = {
    dirty:
      name !== scene.name ||
      brightness !== Math.round(sceneBrightness(scene)) ||
      speed !== originalSpeed.current ||
      autoDynamic !== scene.autoDynamic,
    discard: () => {
      if (scene.dynamic && speed !== originalSpeed.current) {
        setDynamicSpeedLive(scene, originalSpeed.current);
      }
      setName(scene.name);
      setBrightness(Math.round(sceneBrightness(scene)));
      setSpeed(originalSpeed.current);
      setAutoDynamic(scene.autoDynamic);
    },
    save,
  };

  // A scene lives in exactly one space, so removing it deletes it. Gallery
  // scenes can be re-added from the gallery, so we frame those as a reversible
  // "Remove"; a custom scene is gone for good, so it's an explicit "Delete".
  const isGalleryScene = findGalleryPresetForScene(scene) !== null;
  const spaceLabel = roomZoneName ?? "this space";
  const removeScene = async () => {
    await deleteScene(scene);
    onClosePane();
  };

  return (
    <div className="flex h-full flex-col">
      <ScrollArea
        fade
        hideScrollbar
        className="min-h-0 flex-1"
        viewportClassName="px-6 pb-6"
        contentClassName="flex min-h-full flex-col"
      >
        <div className="flex flex-1 flex-col justify-between gap-6">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col items-center gap-3 pt-1">
              <span
                className={cn(
                  "flex size-16 items-center justify-center rounded-2xl text-foreground",
                  bubble ? "shadow-sm" : "bg-muted",
                )}
                style={previewStyle}
              >
                {scene.dynamic ? (
                  <Sparkles
                    size={30}
                    strokeWidth={2.25}
                    className="drop-shadow"
                  />
                ) : (
                  <Palette size={30} strokeWidth={2.25} />
                )}
              </span>
              {renaming ? (
                <div className="flex w-full flex-col items-center gap-1">
                  <Input
                    autoFocus
                    size="lg"
                    value={name}
                    maxLength={MAX_NAME_LENGTH}
                    disabled={isSaving}
                    aria-label={`Rename ${scene.name}`}
                    className="max-w-full text-center font-heading text-lg font-medium"
                    onChange={(event) => setName(event.target.value)}
                    onFocus={(event) => event.target.select()}
                    onBlur={() => setRenaming(false)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === "Escape") {
                        setRenaming(false);
                      }
                    }}
                  />
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {name.length}/{MAX_NAME_LENGTH}
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setRenaming(true)}
                  title="Rename"
                  className="flex max-w-full items-center gap-1.5 rounded-md px-2 py-0.5 text-center font-heading text-lg font-medium text-foreground hover:bg-muted disabled:opacity-50"
                >
                  <span className="truncate">{name || "Unnamed scene"}</span>
                  <Pencil className="size-4 shrink-0 text-muted-foreground" />
                </button>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">
                  Brightness
                </p>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {brightness}%
                </span>
              </div>
              <PacedSlider
                value={Math.max(1, brightness)}
                min={1}
                disabled={isSaving}
                ariaLabel={`${scene.name} brightness`}
                isGroup={false}
                onInput={(value) => setBrightness(Math.round(value))}
                onCommit={(value) => setBrightness(Math.round(value))}
              />
            </div>

            {scene.dynamic && (
              <>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-muted-foreground">
                      Scene speed
                    </p>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {speed}
                    </span>
                  </div>
                  <PacedSlider
                    value={speed}
                    min={HUE_DYNAMIC_SPEED_MIN_STEP}
                    max={HUE_DYNAMIC_SPEED_MAX_STEP}
                    step={1}
                    showTicks
                    tickLabels="ends"
                    disabled={isSaving}
                    ariaLabel={`${scene.name} scene speed`}
                    isGroup={false}
                    onInput={(value) => setSpeed(Math.round(value))}
                    onCommit={(value) => {
                      const next = Math.round(value);
                      setSpeed(next);
                      // Preview the cadence on the light without committing — the
                      // change persists only if the user saves.
                      setDynamicSpeedLive(scene, next);
                    }}
                  />
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      Autoplay
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Start the animation whenever this scene is applied.
                    </p>
                  </div>
                  <Switch
                    checked={autoDynamic}
                    disabled={isSaving}
                    aria-label="Toggle autoplay"
                    onCheckedChange={setAutoDynamic}
                  />
                </div>
              </>
            )}

            {error && <p className="text-sm text-(--destructive-text)">{error}</p>}
          </div>

          {isGalleryScene ? (
            <RemoveResourceSection
              title={`Remove scene`}
              description={`Removes ${scene.name} from ${spaceLabel}`}
              actionLabel="Remove"
              confirmTitle={`Remove "${scene.name}"?`}
              confirmBody={
                <div className="flex flex-col gap-2">
                  <span>
                    This takes {scene.name} out of {spaceLabel}. It's one of the
                    built-in scenes, so you can add it back anytime from the
                    scene gallery.
                  </span>
                </div>
              }
              confirmTone="neutral"
              disabled={isSaving}
              onConfirm={removeScene}
            />
          ) : (
            <RemoveResourceSection
              title={`Delete scene`}
              description={`Permanently deletes ${scene.name}`}
              actionLabel="Delete"
              confirmTitle={`Delete "${scene.name}" scene?`}
              confirmBody={`${scene.name} is a custom scene that only exists in ${spaceLabel}, so this deletes it for good — custom scenes does not exist in gallery so it can't be added back later.`}
              confirmTone="danger"
              disabled={isSaving}
              onConfirm={removeScene}
            />
          )}
        </div>
      </ScrollArea>

      <div className="flex gap-2 border-t border-border p-6 pt-4">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={isSaving}
          onClick={cancel}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={isSaving}
          onClick={() => void save()}
        >
          {isSaving ? <Loader2 className="animate-spin" /> : null}
          Save
        </Button>
      </div>
    </div>
  );
};
