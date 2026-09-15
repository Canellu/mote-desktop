import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  useDndContext,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { CarouselDots } from "@/components/ui/carousel-dots";
import type { HueGalleryScenePreset } from "@/features/space-screen/data/hueSceneGallery";
import type { HueScene } from "@/types/hue";
import { SceneCard } from "./SceneCard";
import { SceneGalleryCard } from "./SceneGalleryCard";
import { SceneGalleryDialog } from "./SceneGalleryDialog";
import { SectionGrip } from "./SectionDragHandle";
import { SortableItem } from "./SortableItem";

// A scene tile is `w-32` (128px) and the rail uses `gap-3` (12px). A column
// occupies one card width plus the gap that follows it.
const SCENE_CARD_WIDTH = 128;
const SCENE_GAP = 12;
// The rail never grows past two rows — beyond that it pages, so the Scenes
// section can't push the Lights below it off-screen.
const MAX_ROWS = 2;
const GALLERY_TILE_ID = "scene-gallery";
const DRAG_SCROLL_EDGE = 48;
const DRAG_SCROLL_INTERVAL = 450;

const DragCarouselRemeasurer: React.FC<{
  api: CarouselApi | undefined;
  active: boolean;
  droppableIds: string[];
}> = ({ api, active, droppableIds }) => {
  const { measureDroppableContainers } = useDndContext();

  useEffect(() => {
    if (!api || !active) return;

    const measure = () => measureDroppableContainers(droppableIds);
    api.on("scroll", measure);
    api.on("settle", measure);
    return () => {
      api.off("scroll", measure);
      api.off("settle", measure);
    };
  }, [active, api, droppableIds, measureDroppableContainers]);

  return null;
};

/**
 * How many card columns fit across `ref`'s current width. Tracked with a
 * ResizeObserver so the layout re-derives as the window resizes — this is what
 * lets the rail pick "one row / two rows / carousel" from the actual space
 * available rather than hardcoded breakpoints.
 */
function useColumnCount(ref: React.RefObject<HTMLDivElement | null>): number {
  const [columns, setColumns] = useState(1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const width = el.clientWidth;
      const fit = Math.floor(
        (width + SCENE_GAP) / (SCENE_CARD_WIDTH + SCENE_GAP),
      );
      setColumns(Math.max(1, fit));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return columns;
}

interface ScenesSectionProps {
  roomZoneName: string;
  scenes: HueScene[];
  syncedLightCount: number;
  totalLightCount: number;
  activeSceneId: string | null;
  /** Reorder mode: scene tiles become sortable within the carousel. */
  editing: boolean;
  /** Enables drag-and-drop ordering. False while selecting in Manage mode. */
  reordering: boolean;
  /** Optional header control (e.g. the Manage-mode "Select all" toggle). */
  headerAction?: React.ReactNode;
  /** Saved order including the gallery tile sentinel. */
  orderedIds: string[];
  /** Persist the new scene and gallery tile order after a reorder drag. */
  onReorder: (orderedIds: string[]) => void;
  onSceneApply: (scene: HueScene) => void;
  onSceneInspect: (scene: HueScene) => void;
  onSceneTogglePlay: (scene: HueScene) => void;
  onGallerySceneCreate: (preset: HueGalleryScenePreset) => Promise<void>;
  onGallerySceneApplyOnce: (preset: HueGalleryScenePreset) => void;
  onGalleryScenePreview: (preset: HueGalleryScenePreset) => void;
  onGalleryScenePreviewEnd: () => void;
}

export const ScenesSection: React.FC<ScenesSectionProps> = ({
  roomZoneName,
  scenes,
  syncedLightCount,
  totalLightCount,
  activeSceneId,
  editing,
  reordering,
  headerAction,
  orderedIds,
  onReorder,
  onSceneApply,
  onSceneInspect,
  onSceneTogglePlay,
  onGallerySceneCreate,
  onGallerySceneApplyOnce,
  onGalleryScenePreview,
  onGalleryScenePreviewEnd,
}) => {
  const [sceneGalleryOpen, setSceneGalleryOpen] = useState(false);
  const [pendingGallerySceneId, setPendingGallerySceneId] = useState<
    string | null
  >(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [carouselMoving, setCarouselMoving] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragScrollDirectionRef = useRef<-1 | 0 | 1>(0);
  const dragScrollTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const columnsThatFit = useColumnCount(containerRef);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const fullSync = syncedLightCount > 0 && syncedLightCount === totalLightCount;
  const partialSync = syncedLightCount > 0 && !fullSync;

  useEffect(() => {
    if (!fullSync || !sceneGalleryOpen) return;
    onGalleryScenePreviewEnd();
    setSceneGalleryOpen(false);
  }, [fullSync, onGalleryScenePreviewEnd, sceneGalleryOpen]);

  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
  const validIds = new Set([...sceneById.keys(), GALLERY_TILE_ID]);
  const tileIds = [
    ...orderedIds.filter(
      (id, index) => validIds.has(id) && orderedIds.indexOf(id) === index,
    ),
    ...scenes.map((scene) => scene.id).filter((id) => !orderedIds.includes(id)),
  ];
  if (!tileIds.includes(GALLERY_TILE_ID)) tileIds.push(GALLERY_TILE_ID);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    stopDragScroll();
    setActiveDragId(null);
    if (!over || active.id === over.id) return;
    const from = tileIds.indexOf(active.id as string);
    const to = tileIds.indexOf(over.id as string);
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(tileIds, from, to));
  };

  const stopDragScroll = () => {
    dragScrollDirectionRef.current = 0;
    if (dragScrollTimerRef.current != null) {
      clearInterval(dragScrollTimerRef.current);
      dragScrollTimerRef.current = null;
    }
  };

  const handleDragCancel = () => {
    stopDragScroll();
    setActiveDragId(null);
  };

  const scrollForDrag = (direction: -1 | 1) => {
    if (direction < 0) api?.scrollPrev();
    else api?.scrollNext();
  };

  const startDragScroll = (direction: -1 | 1) => {
    if (dragScrollDirectionRef.current === direction) return;
    stopDragScroll();
    dragScrollDirectionRef.current = direction;
    scrollForDrag(direction);
    dragScrollTimerRef.current = setInterval(
      () => scrollForDrag(direction),
      DRAG_SCROLL_INTERVAL,
    );
  };

  const handleDragMove = ({ active }: DragMoveEvent) => {
    const viewport = containerRef.current?.querySelector(
      '[data-slot="carousel-content"]',
    );
    const draggedRect = active.rect.current.translated;
    if (!viewport || !draggedRect) return;

    const viewportRect = viewport.getBoundingClientRect();
    if (
      draggedRect.left <= viewportRect.left + DRAG_SCROLL_EDGE &&
      api?.canScrollPrev()
    ) {
      startDragScroll(-1);
    } else if (
      draggedRect.right >= viewportRect.right - DRAG_SCROLL_EDGE &&
      api?.canScrollNext()
    ) {
      startDragScroll(1);
    } else {
      stopDragScroll();
    }
  };

  // Build the saved scene/gallery order, then decide the layout from how many
  // fit. One row while everything fits on one line; two rows once it spills;
  // only then does the carousel page.
  const tiles = tileIds.map((id) => ({ id, scene: sceneById.get(id) }));

  const rows = tiles.length <= columnsThatFit ? 1 : MAX_ROWS;

  // Column-major chunking: each carousel slide is a vertical stack of `rows`
  // tiles, matching the original top-to-bottom-then-rightward reading order.
  const columns: (typeof tiles)[] = [];
  for (let i = 0; i < tiles.length; i += rows) {
    columns.push(tiles.slice(i, i + rows));
  }

  // Show the nav only when the carousel can actually move. When the whole rail
  // fits (one or two rows, nothing to page) it reads as a plain grid with no
  // carousel chrome — which is the nicer UX the slider would otherwise clutter.
  const [api, setApi] = useState<CarouselApi>();
  const [canScroll, setCanScroll] = useState(false);

  useEffect(() => {
    if (!api) return;
    const update = () =>
      setCanScroll(api.canScrollPrev() || api.canScrollNext());
    const handleScroll = () => setCarouselMoving(true);
    const handleSettle = () => setCarouselMoving(false);
    update();
    api.on("select", update);
    api.on("reInit", update);
    api.on("scroll", handleScroll);
    api.on("settle", handleSettle);
    return () => {
      api.off("select", update);
      api.off("reInit", update);
      api.off("scroll", handleScroll);
      api.off("settle", handleSettle);
    };
  }, [api]);

  useEffect(
    () => () => {
      if (dragScrollTimerRef.current != null) {
        clearInterval(dragScrollTimerRef.current);
      }
    },
    [],
  );

  const handleGallerySceneCreate = async (preset: HueGalleryScenePreset) => {
    if (pendingGallerySceneId != null) return;
    setPendingGallerySceneId(preset.id);
    try {
      await onGallerySceneCreate(preset);
    } finally {
      setPendingGallerySceneId(null);
    }
  };
  // Closing the gallery without adding reverts the live preview to whatever the
  // room looked like before. (After a successful add the store has already
  // dropped its snapshot, so this revert is a no-op.)
  const handleGalleryOpenChange = (open: boolean) => {
    if (!open) onGalleryScenePreviewEnd();
    setSceneGalleryOpen(open);
  };

  return (
    <div ref={containerRef} className="flex min-w-0 flex-col gap-3">
      {/* Remount the carousel when the row count flips so Embla re-measures the
          new slide structure (1-tile vs 2-tile columns) from scratch. */}
      <Carousel
        key={rows}
        setApi={setApi}
        opts={{
          align: "start",
          slidesToScroll: "auto",
          containScroll: "trimSnaps",
          watchDrag: !editing,
        }}
        className="min-w-0"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex h-7 items-center">
            <SectionGrip />
            <p className="text-sm font-medium text-muted-foreground">
              Scenes{" "}
              <span className="text-muted-foreground">{scenes.length}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {headerAction}
            {canScroll && (
              <div data-edit-interactive className="flex items-center gap-2">
                <CarouselPrevious className="static translate-y-0" />
                <CarouselNext className="static translate-y-0" />
              </div>
            )}
          </div>
        </div>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          measuring={{
            droppable: {
              strategy: MeasuringStrategy.Always,
            },
          }}
          onDragStart={({ active }) => setActiveDragId(active.id as string)}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <DragCarouselRemeasurer
            api={api}
            active={activeDragId != null}
            droppableIds={tileIds}
          />
          <SortableContext items={tileIds} strategy={rectSortingStrategy}>
            {/* Reserve room on every side so the selected-tile ring and card
                shadows aren't clipped by the carousel viewport's overflow. The
                padding is unconditional, so toggling edit mode never shifts the
                rail. `-ml-3` still pairs with each item's `pl-3` for the gap;
                the `px-1.5` then insets the first/last tile off the edges. */}
            <CarouselContent fade className="-ml-3 px-1.5 py-3">
              {columns.map((column) => (
                <CarouselItem
                  key={column.map((tile) => tile.id).join("|")}
                  className="basis-auto pl-3"
                >
                  <div className="flex flex-col gap-3">
                    {column.map((tile) => (
                      <SortableItem
                        key={tile.id}
                        id={tile.id}
                        editing={reordering}
                        transitionDisabled={carouselMoving}
                      >
                        {tile.id === GALLERY_TILE_ID ? (
                          <SceneGalleryCard
                            editing={editing}
                            disabled={fullSync}
                            onOpen={() => setSceneGalleryOpen(true)}
                          />
                        ) : (
                          <SceneCard
                            scene={tile.scene!}
                            active={tile.id === activeSceneId}
                            editing={editing}
                            disabled={
                              fullSync || (partialSync && tile.scene!.smart)
                            }
                            playDisabled={syncedLightCount > 0}
                            onApply={onSceneApply}
                            onInspect={onSceneInspect}
                            onTogglePlay={onSceneTogglePlay}
                          />
                        )}
                      </SortableItem>
                    ))}
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselDots api={api} />
          </SortableContext>
          <DragOverlay dropAnimation={null}>
            {activeDragId === GALLERY_TILE_ID ? (
              <SceneGalleryCard editing />
            ) : activeDragId ? (
              <SceneCard
                scene={sceneById.get(activeDragId)!}
                active={activeDragId === activeSceneId}
                editing
                disabled={fullSync}
                playDisabled={syncedLightCount > 0}
                onApply={onSceneApply}
                onInspect={onSceneInspect}
                onTogglePlay={onSceneTogglePlay}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      </Carousel>
      <SceneGalleryDialog
        open={sceneGalleryOpen}
        roomZoneName={roomZoneName}
        pendingSceneId={pendingGallerySceneId}
        onOpenChange={handleGalleryOpenChange}
        onScenePreview={onGalleryScenePreview}
        onSceneApplyOnce={onGallerySceneApplyOnce}
        onSceneCreate={handleGallerySceneCreate}
      />
    </div>
  );
};
