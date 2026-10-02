import { useEffect, useState } from "react";
import { Gauge, Sparkles, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  gallerySceneBubbleCss,
  HUE_SCENE_GALLERY_SECTIONS,
  type HueGalleryScenePreset,
} from "@/features/space-screen/data/hueSceneGallery";
import { activeTileTheme } from "@/lib/tile-theme";
import { cn } from "@/lib/utils";
import {
  HUE_DYNAMIC_SPEED_MAX_STEP,
  hueDynamicSpeedValueToStep,
} from "@/lib/hue-speed";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { HueRoomZone } from "@/types/hue";
import { SceneTile } from "./SceneTile";

export const SceneGalleryDialog: React.FC<{
  open: boolean;
  roomZoneName: string;
  pendingSceneId: string | null;
  onOpenChange: (open: boolean) => void;
  onScenePreview: (preset: HueGalleryScenePreset) => void;
  onSceneApplyOnce: (preset: HueGalleryScenePreset) => void;
  onSceneCreate: (preset: HueGalleryScenePreset) => Promise<void>;
  /**
   * Lets the gallery choose where the scene goes, for callers outside a
   * space. Switching space re-runs the live preview there.
   */
  spacePicker?: {
    spaces: HueRoomZone[];
    value: string | null;
    onChange: (id: string) => void;
  };
}> = ({
  open,
  roomZoneName,
  pendingSceneId,
  onOpenChange,
  onScenePreview,
  onSceneApplyOnce,
  onSceneCreate,
  spacePicker,
}) => {
  const [previewedPreset, setPreviewedPreset] =
    useState<HueGalleryScenePreset | null>(null);

  // Forget the in-modal selection when the gallery closes; the parent's
  // onOpenChange is what reverts the lights themselves.
  useEffect(() => {
    if (!open) setPreviewedPreset(null);
  }, [open]);

  // A new space restores the old one's lights; preview the pick on the new one.
  const pickedSpaceId = spacePicker?.value ?? null;
  useEffect(() => {
    if (previewedPreset && pickedSpaceId) onScenePreview(previewedPreset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedSpaceId]);

  const noSpace = spacePicker != null && pickedSpaceId == null;
  const adding = pendingSceneId != null;
  const handlePreview = (preset: HueGalleryScenePreset) => {
    setPreviewedPreset(preset);
    onScenePreview(preset);
  };

  const handleSetOnce = () => {
    if (!previewedPreset) return;
    onSceneApplyOnce(previewedPreset);
    onOpenChange(false);
  };

  const handleSave = async () => {
    if (!previewedPreset || adding) return;
    try {
      await onSceneCreate(previewedPreset);
      onOpenChange(false);
    } catch {
      // The store surfaces the error in the space view; leave the modal open.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-4 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Hue scene gallery
          </DialogTitle>
        </DialogHeader>
        {/* Where it goes and what's previewing, read together before picking. */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {spacePicker && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              Add to
              <Select
                value={spacePicker.value ?? ""}
                onValueChange={(id) => id && spacePicker.onChange(id)}
              >
                <SelectTrigger
                  className="min-w-44"
                  aria-label="Room or zone to add the scene to"
                >
                  <SelectValue placeholder="Choose room or zone">
                    {
                      spacePicker.spaces.find(
                        (space) => space.id === spacePicker.value,
                      )?.name
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(["room", "zone"] as const).map((kind) => {
                    const items = spacePicker.spaces.filter(
                      (space) => space.resourceType === kind,
                    );
                    if (items.length === 0) return null;
                    return (
                      <SelectGroup key={kind}>
                        <SelectLabel>
                          {kind === "room" ? "Rooms" : "Zones"}
                        </SelectLabel>
                        {items.map((space) => (
                          <SelectItem key={space.id} value={space.id}>
                            {space.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}
          <div
            className={cn(
              "flex flex-col gap-0.5",
              // Right-aligned beside the picker; on its own it reads from the left.
              spacePicker && "items-end text-right",
            )}
          >
            <p className="text-sm text-muted-foreground">
              {previewedPreset
                ? `Previewing ${previewedPreset.name}`
                : "Tap a preset to preview it live."}
            </p>
            {/* A key for the numbers under each preset's name. */}
            <p className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Sun className="size-3" />
                Brightness
              </span>
              <span className="flex items-center gap-1">
                <Gauge className="size-3" />
                Animation speed (1–{HUE_DYNAMIC_SPEED_MAX_STEP})
              </span>
            </p>
          </div>
        </div>
        <ScrollArea
          fade
          // Fixed height that gives way first when the window is short.
          className="h-176 min-h-0 shrink"
          viewportClassName="pr-3"
        >
          <div className="space-y-12">
            {HUE_SCENE_GALLERY_SECTIONS.map((section) => (
              <section key={section.id} className="space-y-4">
                <div className="min-w-0 space-y-0.5">
                  <h3 className="truncate text-base font-semibold">
                    {section.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {section.description}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {[...section.scenes]
                    .sort((a, b) => a.brightness - b.brightness)
                    .map((preset) => (
                      <GalleryPresetCard
                        key={preset.id}
                        preset={preset}
                        previewed={preset.id === previewedPreset?.id}
                        onPreview={handlePreview}
                      />
                    ))}
                </div>
              </section>
            ))}
          </div>
        </ScrollArea>
        <DialogFooter className="sm:items-center sm:justify-end">
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!previewedPreset || adding || noSpace}
              onClick={handleSetOnce}
            >
              Set once
            </Button>
            <Button
              disabled={!previewedPreset || adding || noSpace}
              onClick={() => void handleSave()}
            >
              {spacePicker ? "Save" : `Save to ${roomZoneName}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const GalleryPresetCard: React.FC<{
  preset: HueGalleryScenePreset;
  previewed: boolean;
  onPreview: (preset: HueGalleryScenePreset) => void;
}> = ({ preset, previewed, onPreview }) => {
  const bubble = gallerySceneBubbleCss(preset);
  const activeBackground = previewed && bubble != null;

  return (
    <SceneTile
      name={preset.name}
      ariaPressed={previewed}
      activeBackground={activeBackground}
      // Under the name rather than in the corners, where they crowd the circle.
      // Icons say which number is which; the tooltips spell it out.
      meta={
        <>
          <span
            className="flex items-center gap-0.5"
            title={`Brightness ${Math.round(preset.brightness)}%`}
          >
            <Sun className="size-3" />
            {Math.round(preset.brightness)}%
          </span>
          {preset.dynamic && (
            <span
              className="flex items-center gap-0.5"
              title={`Animation speed ${hueDynamicSpeedValueToStep(preset.speed)} of ${HUE_DYNAMIC_SPEED_MAX_STEP}`}
            >
              <Gauge className="size-3" />
              {hueDynamicSpeedValueToStep(preset.speed)}
            </span>
          )}
        </>
      }
      className={cn(
        // Taller than a rail tile, to fit the line under a two-line name.
        "h-42",
        activeBackground
          ? "text-foreground"
          : // A hairline edge 0.04 lighter/darker than the `--tile` surface
            // (light 0.99 → 0.95, dark 0.26 → 0.30) so the card reads as a
            // distinct chip without a hard border.
            "border border-[oklch(0.95_0_0)] dark:border-[oklch(0.30_0_0)]",
      )}
      style={
        activeBackground && bubble
          ? activeTileTheme(bubble, preset.colors[0]?.hex ?? bubble)
          : undefined
      }
      onActivate={() => onPreview(preset)}
      visual={
        bubble ? (
          <span
            className="aspect-square size-14 shrink-0 rounded-full shadow-sm ring-1 ring-foreground/15"
            style={{ background: bubble }}
          />
        ) : (
          <span className="flex aspect-square size-14 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground ring-1 ring-foreground/10">
            <Sparkles className="size-6" />
          </span>
        )
      }
    />
  );
};
