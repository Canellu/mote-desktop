import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { AutomationSource } from "@/features/automations/model";
import { automationSourceInfo } from "@/features/automations/sources";
import { cn } from "@/lib/utils";

/**
 * The order that settles a light two automations want, dragged into place.
 * One list for every automation, Focus and PC Sync, so "does a call pause PC
 * Sync?" is answered by where the two sit rather than by a separate switch.
 * The page around it carries the heading.
 */
export function AutomationPriority({
  order,
  onChange,
}: {
  order: AutomationSource[];
  onChange: (next: AutomationSource[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = order.indexOf(active.id as AutomationSource);
    const to = order.indexOf(over.id as AutomationSource);
    if (from < 0 || to < 0) return;
    onChange(arrayMove(order, from, to));
  };
  const syncAt = order.indexOf("pcSync");
  const title = (id: string | number) =>
    automationSourceInfo[id as AutomationSource]?.title ?? String(id);
  const place = (id: string | number) =>
    order.indexOf(id as AutomationSource) + 1;
  const announcements = {
    onDragStart: ({ active }: { active: { id: string | number } }) =>
      `Picked up ${title(active.id)}, number ${place(active.id)}.`,
    onDragOver: ({ over }: { over: { id: string | number } | null }) =>
      over ? `Over number ${place(over.id)}.` : undefined,
    onDragEnd: ({
      active,
      over,
    }: {
      active: { id: string | number };
      over: { id: string | number } | null;
    }) =>
      over
        ? `${title(active.id)} is now number ${place(over.id)}.`
        : `${title(active.id)} stayed where it was.`,
    onDragCancel: ({ active }: { active: { id: string | number } }) =>
      `${title(active.id)} stayed where it was.`,
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{ announcements }}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <ol className="grid min-w-0 gap-2">
          {order.map((source, index) => (
            <PriorityRow
              key={source}
              source={source}
              position={index + 1}
              pausesSync={source !== "pcSync" && index < syncAt}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function PriorityRow({
  source,
  position,
  pausesSync,
}: {
  source: AutomationSource;
  position: number;
  pausesSync: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: source });
  const info = automationSourceInfo[source];
  const Icon = info.icon;
  const sync = source === "pcSync";

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
      }}
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-xl bg-card py-2 pr-3 pl-1.5 ring-1 ring-foreground/5",
        isDragging && "shadow-lg ring-primary/30",
      )}
    >
      <button
        type="button"
        className="flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing"
        aria-label={`Move ${info.title}, now number ${position}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} aria-hidden="true" />
      </button>
      <span
        aria-hidden="true"
        className="w-4 shrink-0 text-center text-xs font-semibold text-muted-foreground tabular-nums"
      >
        {position}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          sync
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground",
        )}
      >
        <Icon size={16} />
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="truncate text-sm font-medium">{info.title}</span>
        <span className="truncate text-xs text-muted-foreground">
          {info.when}
        </span>
      </span>
      {pausesSync && (
        <span className="hidden shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground @lg:inline">
          Pauses PC Sync
        </span>
      )}
    </li>
  );
}
