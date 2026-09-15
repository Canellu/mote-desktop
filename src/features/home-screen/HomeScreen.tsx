import { GripVertical, House } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useEntertainmentStore } from "@/stores/EntertainmentStore";
import type { HomeLayout } from "@/types/app-layout";
import type { HueLight, HueRoomZone } from "@/types/hue";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  closestCorners,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutSection } from "./components/LayoutSection";
import { SpaceTile } from "./components/SpaceTile";

type ControlCommitPhase = "live" | "final";

interface HomeScreenProps {
  roomZones: HueRoomZone[];
  lights: HueLight[];
  isLoading: boolean;
  error: string | null;
  /** Layout to render — the live draft while editing, else the committed one. */
  layout: HomeLayout;
  editing: boolean;
  hueEventRevision: number;
  onLayoutChange: (next: HomeLayout) => void;
  onOpenSpace: (id: string) => void;
  onAllLightsToggle: (nextOn: boolean) => void;
  onRoomZoneToggle: (roomZone: HueRoomZone, nextOn: boolean) => void;
  onRoomZoneBrightness: (
    roomZone: HueRoomZone,
    pct: number,
    phase: ControlCommitPhase,
  ) => void;
  /** Create-section dialog state, lifted so the header can trigger it. */
  isCreatingSection: boolean;
  onCreateSection: (name: string) => void;
  onCloseCreateSection: () => void;
  onRenameSection: (sectionId: string, name: string) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  roomZones,
  lights,
  isLoading,
  error,
  layout,
  editing,
  hueEventRevision,
  onLayoutChange,
  onOpenSpace,
  onAllLightsToggle,
  onRoomZoneToggle,
  onRoomZoneBrightness,
  isCreatingSection,
  onCreateSection,
  onCloseCreateSection,
  onRenameSection,
}) => {
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const syncedLightIds = useEntertainmentStore((state) => state.syncedLightIds);

  // Hysteresis for cross-container dragging: remember the last resolved target
  // and freeze re-evaluation for one frame right after a move. Without this the
  // pointer sitting on a section boundary makes the tile oscillate between sections.
  const lastOverId = useRef<string | null>(null);
  const recentlyMovedToNewContainer = useRef(false);

  const spaceById = useMemo(() => {
    const map = new Map<string, HueRoomZone>();
    for (const roomZone of roomZones) map.set(roomZone.id, roomZone);
    return map;
  }, [roomZones]);

  const membersOf = useMemo(() => {
    return (roomZone: HueRoomZone): HueLight[] => {
      const ids = new Set(roomZone.lightIds);
      return lights.filter((light) => ids.has(light.id));
    };
  }, [lights]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  /** Resolves which layout section an id belongs to (section id or space id). */
  const findContainer = useCallback(
    (id: string): string | undefined => {
      if (layout.some((section) => section.id === id)) return id;
      return layout.find((section) => section.spaceIds.includes(id))?.id;
    },
    [layout],
  );

  // Reset the "just moved" guard one frame after the layout settles.
  useEffect(() => {
    requestAnimationFrame(() => {
      recentlyMovedToNewContainer.current = false;
    });
  }, [layout]);

  // Stable multi-container detection (adapted from dnd-kit's example): pointer
  // first, narrowed to the closest tile inside the hovered group, with the
  // hysteresis guard so a tile won't ping-pong across a section boundary.
  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      // Whole-section reordering only collides with other layout sections.
      if (activeSectionId) {
        return closestCorners({
          ...args,
          droppableContainers: args.droppableContainers.filter((c) =>
            layout.some((section) => section.id === c.id),
          ),
        });
      }

      const pointer = pointerWithin(args);
      const intersections =
        pointer.length > 0 ? pointer : rectIntersection(args);
      let overId = getFirstCollision(intersections, "id");

      if (overId != null) {
        const container = layout.find((section) => section.id === overId);
        // Over a container: resolve to the nearest tile inside it for a stable
        // insertion point instead of the section edge.
        if (container && container.spaceIds.length > 0) {
          const inner = closestCenter({
            ...args,
            droppableContainers: args.droppableContainers.filter(
              (c) =>
                c.id !== overId && container.spaceIds.includes(String(c.id)),
            ),
          });
          if (inner.length > 0) overId = inner[0].id;
        }
        lastOverId.current = String(overId);
        return [{ id: overId }];
      }

      if (recentlyMovedToNewContainer.current) {
        lastOverId.current = activeSpaceId;
      }
      return lastOverId.current ? [{ id: lastOverId.current }] : [];
    },
    [activeSectionId, activeSpaceId, layout],
  );

  const handleDragStart = (event: DragStartEvent) => {
    const type = event.active.data.current?.type;
    if (type === "space") setActiveSpaceId(String(event.active.id));
    if (type === "section") setActiveSectionId(String(event.active.id));
    lastOverId.current = String(event.active.id);
  };

  const clearActive = () => {
    setActiveSpaceId(null);
    setActiveSectionId(null);
    lastOverId.current = null;
    recentlyMovedToNewContainer.current = false;
  };

  // Moves a tile between sections live as it is dragged over a new container.
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.data.current?.type !== "space") return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const from = findContainer(activeId);
    const to = findContainer(overId);
    if (!from || !to || from === to) return;

    // Freeze detection for the next frame so the post-move layout shift can't
    // immediately bounce the tile back to where it came from.
    recentlyMovedToNewContainer.current = true;

    onLayoutChange(
      layout.map((section) => {
        if (section.id === from) {
          return {
            ...section,
            spaceIds: section.spaceIds.filter((id) => id !== activeId),
          };
        }
        if (section.id === to) {
          // Insert at the hovered tile's position, or append for empty/header.
          const overIndex = section.spaceIds.indexOf(overId);
          const next = [...section.spaceIds];
          const insertAt = overIndex >= 0 ? overIndex : next.length;
          next.splice(insertAt, 0, activeId);
          return { ...section, spaceIds: next };
        }
        return section;
      }),
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    clearActive();
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    // Whole-section reordering.
    if (active.data.current?.type === "section") {
      const oldIndex = layout.findIndex((g) => g.id === activeId);
      const newIndex = layout.findIndex((g) => g.id === overId);
      if (oldIndex >= 0 && newIndex >= 0) {
        onLayoutChange(arrayMove(layout, oldIndex, newIndex));
      }
      return;
    }

    // Intra-section sorting (cross-section moves already handled in dragOver).
    const container = findContainer(activeId);
    if (!container || container !== findContainer(overId)) return;
    onLayoutChange(
      layout.map((section) => {
        if (section.id !== container) return section;
        const oldIndex = section.spaceIds.indexOf(activeId);
        const newIndex = section.spaceIds.indexOf(overId);
        if (oldIndex < 0 || newIndex < 0) return section;
        return {
          ...section,
          spaceIds: arrayMove(section.spaceIds, oldIndex, newIndex),
        };
      }),
    );
  };

  const submitNewSection = () => {
    const name = newName.trim();
    if (!name) return;
    onCreateSection(name);
    setNewName("");
  };

  const closeCreate = () => {
    setNewName("");
    onCloseCreateSection();
  };

  // A section can only be removed once it holds no spaces, so no room/zone is orphaned.
  const handleDeleteSection = (sectionId: string) => {
    onLayoutChange(layout.filter((section) => section.id !== sectionId));
  };

  // Resolve each section's live, ordered room/zone data once for rendering.
  const sections = layout.map((section) => ({
    section,
    roomZones: section.spaceIds
      .map((id) => spaceById.get(id))
      .filter((r): r is HueRoomZone => r !== undefined),
  }));

  const activeSpace = activeSpaceId ? spaceById.get(activeSpaceId) : null;
  const activeSection = activeSectionId
    ? sections.find(({ section }) => section.id === activeSectionId)
    : null;

  const activeSectionCountText =
    activeSection && String(activeSection.roomZones.length);
  const lightsOn = lights.filter((light) => light.isOn).length;
  const anyLightOn = lightsOn > 0;
  const syncActive = syncedLightIds.length > 0;

  const content = (
    <div className="flex flex-col gap-8">
      {sections.map(({ section, roomZones }) => (
        <LayoutSection
          key={section.id}
          section={section}
          roomZones={roomZones}
          lights={lights}
          editing={editing}
          onOpenSpace={onOpenSpace}
          onRoomZoneToggle={onRoomZoneToggle}
          onRoomZoneBrightness={onRoomZoneBrightness}
          hueEventRevision={hueEventRevision}
          onDeleteSection={handleDeleteSection}
          onRenameSection={onRenameSection}
        />
      ))}
    </div>
  );

  return (
    <div className="mx-auto flex w-full flex-col gap-6">
      {error && <p className="text-sm text-(--destructive-text)">{error}</p>}

      {lights.length > 0 && (
        <Card size="sm" className="border border-tile-border bg-card py-5">
          <div className="flex items-center gap-4 px-(--card-spacing)">
            <span className="flex size-12 shrink-0 items-center justify-center text-muted-foreground">
              <House size={27} strokeWidth={2.25} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-base font-medium">All lights</p>
              <p className="text-sm text-muted-foreground">
                {syncActive
                  ? "Unavailable while light sync is active"
                  : `${lightsOn} of ${lights.length} on`}
              </p>
            </div>
            <Switch
              size="xl"
              checked={anyLightOn}
              disabled={editing || isLoading || syncActive}
              aria-label="Toggle all lights"
              onCheckedChange={onAllLightsToggle}
            />
          </div>
        </Card>
      )}

      {roomZones.length === 0 && !isLoading ? (
        <p className="text-sm text-muted-foreground">
          No rooms or zones found.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={clearActive}
        >
          <SortableContext
            items={layout.map((section) => section.id)}
            strategy={verticalListSortingStrategy}
            disabled={!editing}
          >
            {content}
          </SortableContext>
          <DragOverlay>
            {editing && activeSpace ? (
              <div>
                <SpaceTile
                  roomZone={activeSpace}
                  members={membersOf(activeSpace)}
                  editing
                  onOpenSpace={onOpenSpace}
                  onRoomZoneToggle={onRoomZoneToggle}
                  onRoomZoneBrightness={onRoomZoneBrightness}
                  hueEventRevision={hueEventRevision}
                />
              </div>
            ) : editing && activeSection ? (
              // A lightweight, non-sortable clone so dropping a section doesn't
              // flash: the overlay carries the visual while the real section
              // stays put and reorders without a drop-animation jump.
              <div className="edit-section-surface flex flex-col gap-3 rounded-2xl border p-4 shadow-xl">
                <header className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground">
                    <GripVertical size={18} />
                  </span>
                  <h2 className="font-heading px-2 text-lg font-medium">
                    {activeSection.section.name}
                  </h2>
                  <span className="text-sm text-muted-foreground">
                    {activeSectionCountText}
                  </span>
                </header>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
                  {activeSection.roomZones.length === 0 ? (
                    // Mirror LayoutSection's empty placeholder so a dragged empty
                    // section looks identical to its resting state.
                    <div className="edit-dash-border col-span-full flex min-h-36 items-center justify-center rounded-2xl bg-muted/20 text-sm text-muted-foreground">
                      Drag spaces here
                    </div>
                  ) : (
                    activeSection.roomZones.map((roomZone) => (
                      <SpaceTile
                        key={roomZone.id}
                        roomZone={roomZone}
                        members={membersOf(roomZone)}
                        editing
                        onOpenSpace={onOpenSpace}
                        onRoomZoneToggle={onRoomZoneToggle}
                        onRoomZoneBrightness={onRoomZoneBrightness}
                        hueEventRevision={hueEventRevision}
                      />
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <Dialog
        open={isCreatingSection}
        onOpenChange={(open) => {
          if (!open) closeCreate();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Section</DialogTitle>
            <DialogDescription>
              Sections organize your Home screen. Name a new section, then drag
              rooms and zones into it from the layout editor.
            </DialogDescription>
          </DialogHeader>

          <form
            id="create-section-form"
            onSubmit={(e) => {
              e.preventDefault();
              submitNewSection();
            }}
            className="flex flex-col gap-2"
          >
            <Label htmlFor="new-section-name" size="lg">
              Section name
            </Label>
            <Input
              id="new-section-name"
              type="text"
              size="xl"
              autoFocus
              placeholder="e.g. Upstairs, Outdoor, Favorites"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </form>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="xl" />}>
              Cancel
            </DialogClose>
            <Button
              type="submit"
              form="create-section-form"
              size="xl"
              disabled={!newName.trim()}
            >
              Create section
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
