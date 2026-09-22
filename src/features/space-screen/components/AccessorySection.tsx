import { useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";
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

import {
  SensorBatteryGauge,
  SensorReadingPill,
} from "@/components/SensorReadingPill";
import { Card } from "@/components/ui/card";
import {
  INSPECTOR_TRANSITION,
  useInspectorSettle,
  useInspectorSettleWidth,
} from "@/features/space-screen/utils/inspector-layout";
import type { HueAccessory, HueAccessoryService } from "@/types/hue";
import { SectionGrip } from "./SectionDragHandle";
import { SortableItem } from "./SortableItem";

export const AccessorySection: React.FC<{
  title: string;
  icon: LucideIcon;
  accessories: HueAccessory[];
  readingsByDevice: Map<string, HueAccessoryService[]>;
  /** Enables drag-and-drop ordering. False while selecting in Manage mode. */
  reordering?: boolean;
  /** Optional header control (e.g. the Manage-mode "Select all" toggle). */
  headerAction?: React.ReactNode;
  /** Persist the new accessory order (full list of ids) after a reorder drag. */
  onReorder?: (orderedIds: string[]) => void;
}> = ({
  title,
  icon: Icon,
  accessories,
  readingsByDevice,
  reordering = false,
  headerAction,
  onReorder,
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  // While the inspector pane moves, lay the grid out at the width it will end
  // at, so it re-columns once as the move starts and glides with the pane.
  const sectionRef = useRef<HTMLDivElement>(null);
  const settle = useInspectorSettle();
  const settleWidth = useInspectorSettleWidth(sectionRef);

  if (accessories.length === 0) return null;

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = accessories.map((accessory) => accessory.id);
    const from = ids.indexOf(active.id as string);
    const to = ids.indexOf(over.id as string);
    if (from < 0 || to < 0) return;
    onReorder?.(arrayMove(ids, from, to));
  };

  const renderCard = (accessory: HueAccessory) => {
    const readings = readingsByDevice.get(accessory.id) ?? [];
    // Light level in lux isn't something people act on, so hide it. Battery
    // sits in the card's top-right corner rather than in a reading row.
    const primaryReadings = readings.filter(
      (service) =>
        service.resourceType !== "light_level" &&
        service.resourceType !== "device_power",
    );
    primaryReadings.sort((a, b) => {
      if (a.resourceType === "button" && b.resourceType !== "button") return -1;
      if (a.resourceType !== "button" && b.resourceType === "button") return 1;
      if (a.resourceType !== "button") return 0;
      return (
        (a.controlId ?? Number.MAX_SAFE_INTEGER) -
        (b.controlId ?? Number.MAX_SAFE_INTEGER)
      );
    });
    const battery = readings.find(
      (service) => service.resourceType === "device_power",
    );
    const deviceType =
      accessory.productName ??
      (accessory.kind === "switch" ? "Switch" : "Sensor");
    return (
      <Card data-edit-id={accessory.id} className="gap-3 bg-tile px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Icon size={18} />
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {!accessory.reachable && (
              <span className="text-xs font-medium text-(--destructive-text)">
                Offline
              </span>
            )}
            {battery && <SensorBatteryGauge service={battery} />}
          </span>
        </div>
        <div className="min-w-0">
          <p className="line-clamp-2 font-medium">{accessory.name}</p>
          <p className="truncate text-sm text-muted-foreground">{deviceType}</p>
        </div>
        {primaryReadings.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {primaryReadings.map((service) => (
              <SensorReadingPill key={service.id} service={service} />
            ))}
          </div>
        )}
      </Card>
    );
  };

  const grid = (
    <div
      className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3"
      style={settleWidth != null ? { width: settleWidth } : undefined}
    >
      {accessories.map((accessory) =>
        reordering ? (
          <SortableItem key={accessory.id} id={accessory.id} editing>
            {renderCard(accessory)}
          </SortableItem>
        ) : (
          // A one-cell grid so the card still stretches to its row's height.
          <motion.div
            key={accessory.id}
            layout="position"
            transition={
              settle ? INSPECTOR_TRANSITION : { duration: 0.2, ease: "easeOut" }
            }
            className="grid"
          >
            {renderCard(accessory)}
          </motion.div>
        ),
      )}
    </div>
  );

  return (
    <div ref={sectionRef} className="flex flex-col gap-3">
      <div className="flex h-7 items-center justify-between gap-3">
        <div className="flex items-center">
          <SectionGrip />
          <p className="text-sm font-medium text-muted-foreground">
            {title}{" "}
            <span className="text-muted-foreground">{accessories.length}</span>
          </p>
        </div>
        {headerAction}
      </div>
      {reordering ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={accessories.map((accessory) => accessory.id)}
            strategy={rectSortingStrategy}
          >
            {grid}
          </SortableContext>
        </DndContext>
      ) : (
        grid
      )}
    </div>
  );
};
