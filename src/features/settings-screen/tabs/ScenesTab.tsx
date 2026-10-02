import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SheetTitle } from "@/components/ui/sheet";
import { SceneCard } from "@/features/space-screen/components/SceneCard";
import { SelectableTileFrame } from "@/features/space-screen/components/SelectableTileFrame";
import { SceneGalleryDialog } from "@/features/space-screen/components/SceneGalleryDialog";
import { ScenePane } from "@/features/space-screen/components/ScenePane";
import { SortableItem } from "@/features/space-screen/components/SortableItem";
import type { HueGalleryScenePreset } from "@/features/space-screen/data/hueSceneGallery";
import { executeSpaceEditOperations } from "@/features/space-screen/spaceEditActions";
import { requestInspectorTransition } from "@/features/space-screen/utils/inspector-transition";
import {
  itemOrderKey,
  readItemOrder,
  SCENE_GALLERY_TILE_ID,
} from "@/features/space-screen/utils/item-order";
import { isSceneActive } from "@/features/space-screen/utils/scene-status";
import { cn } from "@/lib/utils";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import type { HueRoomZone, HueScene } from "@/types/hue";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
} from "@dnd-kit/sortable";
import {
  Check,
  Copy,
  GripHorizontal,
  LoaderCircle,
  MousePointerClick,
  Plus,
  Sparkles,
  SquareCheck,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { DetailsSheet } from "../components/DetailsSheet";
import { EmptyText } from "../components/EmptyText";
import { Panel } from "../components/Panel";

interface SpaceScenes {
  key: string;
  title: string;
  roomZone: HueRoomZone | null;
  /** The space's saved tile order, gallery sentinel included. */
  tileIds: string[];
  scenes: HueScene[];
}

/**
 * The saved scene order of a space, as its Scenes rail reads it: stored ids
 * that still exist, then scenes added since, with the gallery tile kept where
 * the user put it so reordering here never moves it in the space.
 */
const spaceTileIds = (roomZoneId: string, scenes: HueScene[]): string[] => {
  const stored = readItemOrder(itemOrderKey(roomZoneId, "scenes"));
  const valid = new Set([
    ...scenes.map((scene) => scene.id),
    SCENE_GALLERY_TILE_ID,
  ]);
  const ids = stored.filter(
    (id, index) => valid.has(id) && stored.indexOf(id) === index,
  );
  for (const scene of scenes) if (!ids.includes(scene.id)) ids.push(scene.id);
  if (!ids.includes(SCENE_GALLERY_TILE_ID)) ids.push(SCENE_GALLERY_TILE_ID);
  return ids;
};

/**
 * Scenes grouped by the room or zone they belong to, laid out as the same tiles
 * a space shows. Dragging a tile reorders it within its space; clicking one
 * opens it straight in the editor.
 */
export const ScenesTab = ({
  roomZones,
  scenes,
  onCreate,
}: {
  roomZones: HueRoomZone[];
  scenes: HueScene[];
  onCreate: () => void;
}) => {
  const {
    activateScene,
    createGalleryScene,
    setGallerySceneOnce,
    previewGalleryScene,
    endGalleryPreview,
    lights,
    loadScenes,
  } = useHueResourcesStore(
    useShallow((state) => ({
      activateScene: state.activateScene,
      createGalleryScene: state.createGalleryScene,
      setGallerySceneOnce: state.setGallerySceneOnce,
      previewGalleryScene: state.previewGalleryScene,
      endGalleryPreview: state.endGalleryPreview,
      lights: state.lights,
      loadScenes: state.loadScenes,
    })),
  );

  // Rooms first, then zones, matching the Spaces tab. A space without scenes
  // still shows, so it reads as empty rather than missing.
  const spaces = useMemo(
    () =>
      roomZones
        .filter((roomZone) => roomZone.lightIds.length > 0)
        .sort(
          (a, b) =>
            Number(a.resourceType === "zone") -
            Number(b.resourceType === "zone"),
        ),
    [roomZones],
  );

  // Bumped after a reorder is written, since the order lives in localStorage.
  const [orderRevision, setOrderRevision] = useState(0);
  const groups = useMemo<SpaceScenes[]>(() => {
    const spaceIds = new Set(spaces.map((roomZone) => roomZone.id));
    const grouped = spaces.map((roomZone) => {
      const own = scenes
        .filter((scene) => scene.group === roomZone.id)
        .sort((a, b) => a.name.localeCompare(b.name));
      const tileIds = spaceTileIds(roomZone.id, own);
      const byId = new Map(own.map((scene) => [scene.id, scene]));
      return {
        key: roomZone.id,
        title: roomZone.name,
        roomZone,
        tileIds,
        scenes: tileIds.flatMap((id) => byId.get(id) ?? []),
      };
    });
    const orphaned = scenes
      .filter((scene) => !scene.group || !spaceIds.has(scene.group))
      .sort((a, b) => a.name.localeCompare(b.name));
    return orphaned.length > 0
      ? [
          ...grouped,
          {
            key: "other",
            title: "Other",
            roomZone: null,
            tileIds: orphaned.map((scene) => scene.id),
            scenes: orphaned,
          },
        ]
      : grouped;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaces, scenes, orderRevision]);

  // A press only becomes a drag once it moves, so a still click opens the scene.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const reorder = (group: SpaceScenes, { active, over }: DragEndEvent) => {
    if (!group.roomZone || !over || active.id === over.id) return;
    const from = group.tileIds.indexOf(active.id as string);
    const to = group.tileIds.indexOf(over.id as string);
    if (from < 0 || to < 0) return;
    localStorage.setItem(
      itemOrderKey(group.roomZone.id, "scenes"),
      JSON.stringify(arrayMove(group.tileIds, from, to)),
    );
    setOrderRevision((revision) => revision + 1);
  };

  // --- Scene editor ----------------------------------------------------------
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = scenes.find((scene) => scene.id === openId);
  // Keep the last scene in the sheet while it slides away.
  const lastOpened = useRef<HueScene | null>(null);
  if (opened) lastOpened.current = opened;
  const shown = opened ?? lastOpened.current;
  // The sheet isn't a route, so the pane's navigation guard never sees it
  // close: ask the pane first, which offers Save/Discard over unsaved edits.
  const closeScene = () => requestInspectorTransition(() => setOpenId(null));

  // --- Gallery ---------------------------------------------------------------
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryRoomZone, setGalleryRoomZone] = useState<HueRoomZone | null>(
    null,
  );
  const openGallery = () => {
    // Start on the first room; the gallery's own picker changes it.
    setGalleryRoomZone((current) => current ?? spaces[0] ?? null);
    setGalleryOpen(true);
  };
  const [pendingPresetId, setPendingPresetId] = useState<string | null>(null);
  const addFromGallery = async (preset: HueGalleryScenePreset) => {
    if (!galleryRoomZone || pendingPresetId != null) return;
    setPendingPresetId(preset.id);
    try {
      await createGalleryScene(galleryRoomZone, preset);
    } finally {
      setPendingPresetId(null);
    }
  };

  // --- Select several ----------------------------------------------------------
  // "Select" starts picking: tiles show checkboxes and a click ticks one instead
  // of opening it. Copy and delete live in the bar that replaces the button,
  // so they only appear once it's clear they act on the ticked scenes.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<"copy" | "delete" | null>(null);
  const [copyTarget, setCopyTarget] = useState("");
  const [applying, setApplying] = useState(false);
  const stopPicking = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const toggleSelected = (ids: string[]) =>
    setSelected((current) => {
      const next = new Set(current);
      const all = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (all) next.delete(id);
        else next.add(id);
      }
      return next;
    });

  // Drop selections whose scene has gone (deleted here or elsewhere).
  useEffect(() => {
    setSelected((current) => {
      const live = new Set(scenes.map((scene) => scene.id));
      const next = new Set([...current].filter((id) => live.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [scenes]);

  // Escape stops picking, unless a dialog or the sheet owns it.
  useEffect(() => {
    if (!selecting || dialog != null || openId != null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      stopPicking();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selecting, dialog, openId]);

  const applySelection = async (
    operation:
      | { type: "copy-scenes"; sceneIds: string[]; targetSpaceId: string }
      | { type: "delete-scenes"; sceneIds: string[] },
  ) => {
    const anySpace = roomZones[0];
    if (!anySpace) return;
    setApplying(true);
    try {
      // Copy and delete don't depend on the active space; any one will do.
      await executeSpaceEditOperations([operation], {
        activeSpace: anySpace,
        roomZones,
        lights,
        scenes,
      });
      await loadScenes();
      stopPicking();
      setDialog(null);
      setCopyTarget("");
      toast.success(
        operation.type === "copy-scenes" ? "Scenes copied" : "Scenes deleted",
      );
    } catch (error) {
      toast.error(String(error) || "Unable to apply this change.");
    } finally {
      setApplying(false);
    }
  };

  const countLabel = `${selected.size} ${selected.size === 1 ? "scene" : "scenes"}`;

  // Ticked tiles get the shared selection ring, marked by id the way a space
  // marks its selected tiles.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    rootRef.current
      ?.querySelectorAll<HTMLElement>("[data-edit-id]")
      .forEach((element) =>
        selected.has(element.dataset.editId ?? "")
          ? element.setAttribute("data-edit-selected", "")
          : element.removeAttribute("data-edit-selected"),
      );
  }, [selected, groups]);

  return (
    <div ref={rootRef} className="space-y-5">
      <Panel title="Add Scenes">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-md text-sm text-muted-foreground">
            Arrange a room or zone's lights and save the result as a scene, or
            pick a ready-made one from the scene gallery.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={spaces.length === 0}
              onClick={openGallery}
              // Mote's brand glow (the app icon's violet → rose → orange), with the
              // Pro badge's inset ring and top sheen. The oversized gradient
              // slides on hover so the colors drift rather than just brighten.
              className={cn(
                "relative overflow-hidden border-0 text-white [text-shadow:0_1px_2px_oklch(0_0_0/0.35)]",
                "bg-[linear-gradient(110deg,var(--brand-violet),var(--brand-rose)_40%,var(--brand-orange)_75%,var(--brand-amber))] bg-size-[180%_100%] bg-left",
                "ring-1 ring-white/30 ring-inset shadow-sm transition-[background-position,filter] duration-500 ease-out hover:bg-right hover:brightness-110",
                "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-1/2 before:bg-[linear-gradient(to_bottom,oklch(1_0_0/0.28),oklch(1_0_0/0))]",
              )}
            >
              <Sparkles />
              Add from gallery
            </Button>
            <Button type="button" onClick={onCreate}>
              <Plus />
              Create scene
            </Button>
          </div>
        </div>
      </Panel>

      {groups.some((group) => group.scenes.length > 0) && (
        // One row in both states, with the same height and the Select/Done
        // button in the same spot, so starting a selection shifts nothing.
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {selecting ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={selected.size === 0}
                onClick={() => {
                  setCopyTarget("");
                  setDialog("copy");
                }}
              >
                <Copy />
                {selected.size > 0 ? `Copy ${countLabel} to…` : "Copy to…"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="text-(--destructive-text)"
                disabled={selected.size === 0}
                onClick={() => setDialog("delete")}
              >
                <Trash2 />
                {selected.size > 0 ? `Delete ${countLabel}` : "Delete"}
              </Button>
            </div>
          ) : (
            // Spelled out for anyone who doesn't read the hover grip as a handle.
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <MousePointerClick className="size-4" />
                Click a scene to edit it
              </span>
              <span className="flex items-center gap-1.5">
                <GripHorizontal className="size-4" />
                Drag to reorder
              </span>
            </p>
          )}
          <Button
            type="button"
            variant={selecting ? "default" : "outline"}
            // Same width either way, so the label swap doesn't nudge the row.
            className="min-w-24"
            onClick={() => (selecting ? stopPicking() : setSelecting(true))}
          >
            {selecting ? <Check /> : <SquareCheck />}
            {selecting ? "Done" : "Select"}
          </Button>
        </div>
      )}

      {groups.length === 0 && (
        <Panel title="Scenes">
          <EmptyText>No scenes loaded.</EmptyText>
        </Panel>
      )}

      {groups.map((group) => {
        const activeId =
          group.scenes.find((scene) => isSceneActive(scene))?.id ?? null;
        const ids = group.scenes.map((scene) => scene.id);
        return (
          <Panel
            key={group.key}
            title={group.title}
            action={
              // A fixed-height slot: the count and the taller Select all button
              // swap in place without nudging the panel (and every panel below).
              <div className="flex h-6 items-center">
                {selecting && ids.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="-my-1"
                    onClick={() => toggleSelected(ids)}
                  >
                    {ids.every((id) => selected.has(id))
                      ? "Deselect all"
                      : "Select all"}
                  </Button>
                ) : (
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {ids.length} {ids.length === 1 ? "scene" : "scenes"}
                  </span>
                )}
              </div>
            }
          >
            {group.scenes.length === 0 ? (
              <EmptyText>No scenes in this space yet.</EmptyText>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(event) => reorder(group, event)}
              >
                <SortableContext items={ids} strategy={rectSortingStrategy}>
                  <div className="flex flex-wrap gap-3">
                    {group.scenes.map((scene, index) => (
                      <SortableItem
                        key={scene.id}
                        id={scene.id}
                        // No reordering while picking, and scenes outside any
                        // space have no order to keep.
                        editing={!selecting && group.roomZone != null}
                        hoverHandle={!selecting}
                        className="relative"
                      >
                        <SelectableTileFrame
                          selecting={selecting}
                          selected={selected.has(scene.id)}
                          index={index}
                          label={scene.name}
                          onToggle={() => toggleSelected([scene.id])}
                        >
                          <SceneCard
                            scene={scene}
                            active={scene.id === activeId}
                            showInspect={false}
                            onApply={(next) =>
                              selecting
                                ? toggleSelected([next.id])
                                : setOpenId(next.id)
                            }
                            onInspect={(next) => setOpenId(next.id)}
                            onTogglePlay={(next) =>
                              void activateScene(next, "dynamic")
                            }
                          />
                        </SelectableTileFrame>
                      </SortableItem>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </Panel>
        );
      })}

      <DetailsSheet open={Boolean(opened)} onClose={closeScene}>
        {shown && (
          <>
            <SheetTitle className="sr-only">{shown.name}</SheetTitle>
            <div className="min-h-0 flex-1">
              <ScenePane scene={shown} onClose={closeScene} editOnly />
            </div>
          </>
        )}
      </DetailsSheet>

      <SceneGalleryDialog
        open={galleryOpen}
        roomZoneName={galleryRoomZone?.name ?? ""}
        pendingSceneId={pendingPresetId}
        onOpenChange={(open) => {
          if (open) return;
          // Closing without adding reverts the live preview.
          endGalleryPreview();
          setGalleryOpen(false);
        }}
        onScenePreview={(preset) =>
          galleryRoomZone && previewGalleryScene(galleryRoomZone, preset)
        }
        onSceneApplyOnce={(preset) =>
          galleryRoomZone && setGallerySceneOnce(galleryRoomZone, preset)
        }
        onSceneCreate={addFromGallery}
        spacePicker={{
          spaces,
          value: galleryRoomZone?.id ?? null,
          onChange: (id) => {
            // Put the old space's lights back before previewing on the new one.
            endGalleryPreview();
            setGalleryRoomZone(spaces.find((space) => space.id === id) ?? null);
          },
        }}
      />

      <Dialog
        open={dialog === "copy"}
        onOpenChange={(open) => !open && !applying && setDialog(null)}
      >
        <DialogContent inert={applying} aria-busy={applying}>
          <DialogHeader>
            <DialogTitle>Copy {countLabel}</DialogTitle>
            <DialogDescription>
              Each copy is saved to the room or zone you choose, across its
              lights.
            </DialogDescription>
          </DialogHeader>
          <Select
            value={copyTarget}
            onValueChange={(value) => setCopyTarget(value ?? "")}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose room or zone">
                {spaces.find((space) => space.id === copyTarget)?.name}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {spaces.map((space) => (
                <SelectItem key={space.id} value={space.id}>
                  {space.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter className="flex-row justify-end">
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              disabled={applying || !copyTarget}
              onClick={() =>
                void applySelection({
                  type: "copy-scenes",
                  sceneIds: [...selected],
                  targetSpaceId: copyTarget,
                })
              }
            >
              {applying && <LoaderCircle className="animate-spin" />}
              {applying ? "Copying…" : "Copy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={dialog === "delete"}
        onOpenChange={(open) => !open && !applying && setDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {countLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              They are removed from the Hue Bridge. Scenes from the gallery can
              be added again; your own scenes are gone for good.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applying}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={applying}
              onClick={() =>
                void applySelection({
                  type: "delete-scenes",
                  sceneIds: [...selected],
                })
              }
            >
              {applying && <LoaderCircle className="animate-spin" />}
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
