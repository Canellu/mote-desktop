import { useEffect, useReducer, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
} from "@dnd-kit/sortable";

import type { HueLight } from "@/types/hue";
import { LightCard } from "./LightCard";
import { SectionGrip } from "./SectionDragHandle";
import { SortableItem } from "./SortableItem";

type ControlCommitPhase = "live" | "final";

/**
 * Forces a re-render whenever `ref`'s element changes size. Layout animations
 * only fire across React renders, but the grid's width changes from CSS-driven
 * events (the inspector pane animating its width, window resizing) that never
 * trigger a render on their own. Observing the element and re-rendering on each
 * size tick lets `motion`'s `layout` re-measure and animate the reflow instead
 * of snapping. The observer is frame-rate bounded and idle unless resizing.
 */
function useAnimateOnResize(ref: React.RefObject<HTMLElement | null>) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => rerender());
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
}

interface LightsSectionProps {
  lights: HueLight[];
  selectedLightId: string | null;
  hueEventRevision: number;
  /** Reorder mode: cards become drag handles and live controls are muted. */
  editing: boolean;
  /** Enables drag-and-drop ordering. False while selecting in Manage mode. */
  reordering: boolean;
  /** Optional header control (e.g. the Manage-mode "Select all" toggle). */
  headerAction?: React.ReactNode;
  /** Persist the new light order (full list of ids) after a reorder drag. */
  onReorder: (orderedIds: string[]) => void;
  onSelectLight: (id: string) => void;
  onLightToggle: (light: HueLight, nextOn: boolean) => void;
  onLightBrightness: (
    light: HueLight,
    pct: number,
    phase: ControlCommitPhase,
  ) => void;
}

export const LightsSection: React.FC<LightsSectionProps> = ({
  lights,
  selectedLightId,
  hueEventRevision,
  editing,
  reordering,
  headerAction,
  onReorder,
  onSelectLight,
  onLightToggle,
  onLightBrightness,
}) => {
  const lightsGridRef = useRef<HTMLDivElement>(null);
  useAnimateOnResize(lightsGridRef);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = lights.map((light) => light.id);
    const from = ids.indexOf(active.id as string);
    const to = ids.indexOf(over.id as string);
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to));
  };

  const renderCard = (light: HueLight) => (
    <LightCard
      light={light}
      selected={light.id === selectedLightId}
      hueEventRevision={hueEventRevision}
      editing={editing}
      onSelect={onSelectLight}
      onToggle={onLightToggle}
      onBrightness={onLightBrightness}
    />
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-7 items-center justify-between gap-3">
        <div className="flex items-center">
          <SectionGrip />
          <p className="text-sm font-medium text-muted-foreground">
            Lights{" "}
            <span className="text-muted-foreground">{lights.length}</span>
          </p>
        </div>
        {headerAction}
      </div>
      {lights.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This room or zone has no individual lights.
        </p>
      ) : reordering ? (
        // While editing, drop the layout animation (it fights dnd-kit's drag
        // transforms) and make each card sortable within the same grid.
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={lights.map((light) => light.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
              {lights.map((light) => (
                <SortableItem key={light.id} id={light.id} editing>
                  {renderCard(light)}
                </SortableItem>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div
          ref={lightsGridRef}
          className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {lights.map((light) => (
              <motion.div
                key={light.id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                {renderCard(light)}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};
