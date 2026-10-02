import { useSortable } from "@dnd-kit/sortable";
import { CSS as DndCSS } from "@dnd-kit/utilities";
import { GripHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Wraps a section item (light/scene/accessory card) so the whole card body is a
 * drag handle for reordering while editing. With the card's own live controls
 * muted in edit mode, the only gestures left are a stationary tap (multiselect,
 * handled by the section's click-capture) and a deliberate drag (reorder) — the
 * shared `DndContext` separates them via its pointer activation distance. No
 * grip glyph is drawn: the whole card is the handle, so the chrome is omitted.
 */
export const SortableItem: React.FC<{
  id: string;
  editing: boolean;
  transitionDisabled?: boolean;
  /**
   * Fade in a small reorder grip at the top on hover, for lists where tiles
   * are always draggable and nothing else says so.
   */
  hoverHandle?: boolean;
  className?: string;
  children: React.ReactNode;
}> = ({
  id,
  editing,
  transitionDisabled = false,
  hoverHandle = false,
  className,
  children,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !editing });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: DndCSS.Transform.toString(transform),
        transition: transitionDisabled ? undefined : transition,
        opacity: isDragging ? 0.45 : undefined,
        zIndex: isDragging ? 10 : undefined,
      }}
      className={cn(
        editing && "relative cursor-grab touch-none active:cursor-grabbing",
        hoverHandle && "group/sortable",
        className,
      )}
      {...(editing ? { ...attributes, ...listeners } : {})}
    >
      {children}
      {editing && hoverHandle && !isDragging && (
        // The dotted grip is the app's reorder sign (sections use the vertical
        // one). It sits on its own frosted chip so it reads the same on a lit
        // tile's bright palette as on a plain one.
        <span
          aria-hidden
          className="pointer-events-none absolute top-0.5 left-1/2 flex h-3.5 -translate-x-1/2 items-center rounded-full bg-background/75 px-1.5 text-muted-foreground opacity-0 shadow-sm ring-1 ring-foreground/10 backdrop-blur-sm transition-opacity duration-150 group-hover/sortable:opacity-100"
        >
          <GripHorizontal className="size-3" />
        </span>
      )}
    </div>
  );
};
