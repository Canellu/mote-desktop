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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  Copy,
  LoaderCircle,
  MoveRight,
  Pencil,
  Radar,
  Trash2,
  ToggleLeft,
  X,
} from "lucide-react";
import { useBlocker } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { selectableVariants } from "@/lib/selection-styles";
import { cn } from "@/lib/utils";
import { useEntertainmentStore } from "@/stores/EntertainmentStore";
import { SPACE_ARCHETYPES } from "@/features/settings-screen/constants";
import { getRoomZoneIcon } from "@/features/home-screen/components/room-zone-icons";
import type {
  HueAccessoryService,
  HueLight,
  HueRoomZone,
  HueScene,
} from "@/types/hue";
import type { HueGalleryScenePreset } from "./data/hueSceneGallery";
import { AccessorySection } from "./components/AccessorySection";
import { GroupControls } from "./components/GroupControls";
import { LightsSection } from "./components/LightsSection";
import { ScenesSection } from "./components/ScenesSection";
import {
  SectionGrip,
  SectionGripProvider,
} from "./components/SectionDragHandle";
import {
  executeSpaceEditOperations,
  type LightFunction,
  type SpaceEditOperation,
} from "./spaceEditActions";
import { isSceneDynamicActive } from "./utils/scene-status";

type ControlCommitPhase = "live" | "final";
// Selectable (multiselect) sections. "group" is reorderable but not selectable.
type EditCategory = "scenes" | "lights" | "switches" | "sensors";
type SectionId = "group" | EditCategory;

const DEFAULT_SECTION_ORDER: SectionId[] = [
  "group",
  "scenes",
  "lights",
  "switches",
  "sensors",
];

const readSectionOrder = (key: string): SectionId[] => {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(stored) &&
      DEFAULT_SECTION_ORDER.every((id) => stored.includes(id))
      ? stored
      : DEFAULT_SECTION_ORDER;
  } catch {
    return DEFAULT_SECTION_ORDER;
  }
};

// Only the item sections carry a per-item order; "group" has no sub-items.
type ItemOrder = Record<EditCategory, string[]>;

const itemOrderKey = (roomId: string, section: EditCategory) =>
  `hue-space-item-order:${roomId}:${section}`;

const readItemOrder = (key: string): string[] => {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(stored)
      ? stored.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
};

const readAllItemOrders = (roomId: string): ItemOrder => ({
  scenes: readItemOrder(itemOrderKey(roomId, "scenes")),
  lights: readItemOrder(itemOrderKey(roomId, "lights")),
  switches: readItemOrder(itemOrderKey(roomId, "switches")),
  sensors: readItemOrder(itemOrderKey(roomId, "sensors")),
});

/**
 * Sorts `items` by the saved id order. Ids missing from `order` (newly added
 * since the last reorder) keep their original relative position at the end, so
 * a saved order never hides a new light/scene. A stable sort preserves that.
 */
function applyItemOrder<T extends { id: string }>(
  items: T[],
  order: string[],
): T[] {
  if (order.length === 0) return items;
  const rank = new Map(order.map((id, index) => [id, index] as const));
  return items
    .map((item, index) => ({
      item,
      index,
      rank: rank.get(item.id) ?? Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.item);
}

const EmptyEditSection: React.FC<{ title: string }> = ({ title }) => (
  <div className="flex flex-col gap-3">
    <div className="flex h-7 items-center">
      <SectionGrip />
      <p className="text-sm font-medium text-muted-foreground">
        {title} <span className="text-muted-foreground">0</span>
      </p>
    </div>
    <div className="edit-dash-border flex min-h-32 items-center justify-center rounded-2xl bg-muted/20 text-sm text-muted-foreground">
      No {title.toLowerCase()} in this space
    </div>
  </div>
);

const SortableSection: React.FC<{
  id: SectionId;
  editing: boolean;
  disabled: boolean;
  children: React.ReactNode;
  onPointerDownCapture: React.PointerEventHandler<HTMLDivElement>;
  onPointerMoveCapture: React.PointerEventHandler<HTMLDivElement>;
  onPointerUpCapture: React.PointerEventHandler<HTMLDivElement>;
  onClickCapture?: React.MouseEventHandler<HTMLDivElement>;
}> = ({
  id,
  editing,
  disabled,
  children,
  onPointerDownCapture,
  onPointerMoveCapture,
  onPointerUpCapture,
  onClickCapture,
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
        // Translate only. `CSS.Transform.toString` also emits scaleX/scaleY,
        // which dnd-kit sets to fit the slot the active node is over — with no
        // DragOverlay here that visibly stretches/squishes a tall section (e.g.
        // Group controls) as it's dragged among differently-sized siblings.
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        transition,
        opacity: isDragging ? 0.45 : undefined,
      }}
      onPointerDownCapture={onPointerDownCapture}
      onPointerMoveCapture={onPointerMoveCapture}
      onPointerUpCapture={onPointerUpCapture}
      onClickCapture={onClickCapture}
      className={cn(
        // Padding + a transparent border are always reserved so toggling edit
        // mode only changes the surface (color + border + shadow) — never the
        // layout (no shift). In edit mode each section reads as a raised,
        // reorderable panel, matching the Home custom-layout sections.
        "flex flex-col rounded-2xl border border-transparent p-4 transition-[background-color,border-color,box-shadow]",
        editing && "edit-section-surface shadow-sm",
        disabled && "opacity-40",
      )}
    >
      <SectionGripProvider
        value={{ editing, label: `Reorder ${id}`, attributes, listeners }}
      >
        {children}
      </SectionGripProvider>
    </div>
  );
};

interface SpaceScreenProps {
  roomZone: HueRoomZone;
  roomZones: HueRoomZone[];
  allLights: HueLight[];
  allScenes: HueScene[];
  lights: HueLight[];
  scenes: HueScene[];
  /** Live accessory readings keyed by owning device id. */
  readingsByDevice: Map<string, HueAccessoryService[]>;
  activeSceneId: string | null;
  selectedLightId: string | null;
  error: string | null;
  hueEventRevision: number;
  onRoomZoneToggle: (roomZone: HueRoomZone, nextOn: boolean) => void;
  onRoomZoneBrightness: (
    roomZone: HueRoomZone,
    pct: number,
    phase: ControlCommitPhase,
  ) => void;
  onLightToggle: (light: HueLight, nextOn: boolean) => void;
  onLightBrightness: (
    light: HueLight,
    pct: number,
    phase: ControlCommitPhase,
  ) => void;
  /** Open the multi-light group pane for the whole room/zone. */
  onOpenGroup: (roomZone: HueRoomZone) => void;
  onSelectLight: (id: string) => void;
  /** Tapping a scene card: apply its stored colors to the room's lights. */
  onSceneApply: (scene: HueScene) => void;
  /** Open the side pane on a scene without applying it (the card's panel button). */
  onSceneInspect: (scene: HueScene) => void;
  /** The card's play/stop button: start or stop the dynamic palette. */
  onSceneTogglePlay: (scene: HueScene) => void;
  onGallerySceneCreate: (preset: HueGalleryScenePreset) => Promise<void>;
  /** Apply a gallery preset to the room's lights once, without saving a scene. */
  onGallerySceneApplyOnce: (preset: HueGalleryScenePreset) => void;
  /** Live-preview a gallery preset on the room's real lights (no save). */
  onGalleryScenePreview: (preset: HueGalleryScenePreset) => void;
  /** Revert the live preview when the gallery is dismissed without adding. */
  onGalleryScenePreviewEnd: () => void;
  onRefresh: () => Promise<void>;
}

export const SpaceScreen: React.FC<SpaceScreenProps> = ({
  roomZone,
  roomZones,
  allLights,
  allScenes,
  lights,
  scenes,
  readingsByDevice,
  activeSceneId,
  selectedLightId,
  error,
  hueEventRevision,
  onRoomZoneToggle,
  onRoomZoneBrightness,
  onLightToggle,
  onLightBrightness,
  onOpenGroup,
  onSelectLight,
  onSceneApply,
  onSceneInspect,
  onSceneTogglePlay,
  onGallerySceneCreate,
  onGallerySceneApplyOnce,
  onGalleryScenePreview,
  onGalleryScenePreviewEnd,
  onRefresh,
}) => {
  const reduceMotion = useReducedMotion();
  const syncedLightIds = useEntertainmentStore((store) => store.syncedLightIds);
  const syncedIds = new Set(syncedLightIds);
  const syncedLightCount = lights.filter((light) =>
    syncedIds.has(light.id),
  ).length;
  const [editing, setEditing] = useState(false);
  const [managing, setManaging] = useState(false);
  const [selection, setSelection] = useState<{
    category: EditCategory;
    ids: Set<string>;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionDialog, setActionDialog] = useState<
    | "copy-scenes"
    | "move-lights"
    | "light-function"
    | "move-accessories"
    | "delete-scenes"
    | "remove-lights"
    | "unassign-accessories"
    | "space-icon"
    | null
  >(null);
  const [actionValue, setActionValue] = useState("");
  const [detailsName, setDetailsName] = useState(roomZone.name);
  const [detailsArchetype, setDetailsArchetype] = useState(roomZone.class);
  const sensorsForSections = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const pointerGesture = useRef({
    x: 0,
    y: 0,
    trackingTile: false,
    moved: false,
  });
  const storageKey = `hue-space-section-order:${roomZone.id}`;
  const [sectionOrder, setSectionOrder] = useState<SectionId[]>(() =>
    readSectionOrder(storageKey),
  );
  const [itemOrder, setItemOrder] = useState<ItemOrder>(() =>
    readAllItemOrders(roomZone.id),
  );

  // Item order is per-space; reload it when the user navigates to another space
  // (this screen instance is reused across rooms/zones).
  useEffect(() => {
    setItemOrder(readAllItemOrders(roomZone.id));
  }, [roomZone.id]);

  const persistItemOrder =
    (section: EditCategory) => (orderedIds: string[]) => {
      localStorage.setItem(
        itemOrderKey(roomZone.id, section),
        JSON.stringify(orderedIds),
      );
      setItemOrder((current) => ({ ...current, [section]: orderedIds }));
    };

  useEffect(() => {
    const startEditing = () => {
      setSectionOrder(readSectionOrder(storageKey));
      setEditing(true);
      setManaging(false);
      setSaving(false);
      setSelection(null);
      window.dispatchEvent(
        new CustomEvent("hue-space-edit-state", { detail: "customize" }),
      );
    };
    const startManaging = () => {
      setEditing(false);
      setManaging(true);
      setSaving(false);
      setSelection(null);
      window.dispatchEvent(
        new CustomEvent("hue-space-edit-state", { detail: "manage" }),
      );
    };
    const finishEditing = () => {
      setEditing(false);
      setManaging(false);
      setSaving(false);
      setSelection(null);
      window.dispatchEvent(
        new CustomEvent("hue-space-edit-state", { detail: null }),
      );
    };
    const editIcon = () => {
      setDetailsName(roomZone.name);
      setDetailsArchetype(roomZone.class);
      setActionDialog("space-icon");
    };
    window.addEventListener("hue-space-edit-request", startEditing);
    window.addEventListener("hue-space-manage-request", startManaging);
    window.addEventListener("hue-space-edit-save", finishEditing);
    window.addEventListener("hue-space-edit-cancel", finishEditing);
    window.addEventListener("hue-space-edit-icon", editIcon);
    return () => {
      window.removeEventListener("hue-space-edit-request", startEditing);
      window.removeEventListener("hue-space-manage-request", startManaging);
      window.removeEventListener("hue-space-edit-save", finishEditing);
      window.removeEventListener("hue-space-edit-cancel", finishEditing);
      window.removeEventListener("hue-space-edit-icon", editIcon);
    };
  }, [roomZone.class, roomZone.name, storageKey]);

  useEffect(() => {
    if ((!editing && !managing) || actionDialog != null) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      window.dispatchEvent(new CustomEvent("hue-space-edit-save"));
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [actionDialog, editing, managing]);

  // Customize/manage are modal sub-states of the space, so a mouse Back should
  // exit the mode before it leaves the screen — the same one-level unwind as
  // Escape. Reorders persist on drop, so leaving is a clean save, not a discard.
  const spaceEditBlocker = useBlocker({
    shouldBlockFn: ({ action }) =>
      (editing || managing) && (action === "BACK" || action === "GO"),
    withResolver: true,
  });
  useEffect(() => {
    if (spaceEditBlocker.status !== "blocked") return;
    window.dispatchEvent(new CustomEvent("hue-space-edit-save"));
    spaceEditBlocker.reset();
  }, [spaceEditBlocker]);

  useEffect(() => {
    document
      .querySelectorAll<HTMLElement>("[data-edit-selected]")
      .forEach((element) => element.removeAttribute("data-edit-selected"));
    for (const id of selection?.ids ?? []) {
      document
        .querySelectorAll<HTMLElement>(`[data-edit-id="${CSS.escape(id)}"]`)
        .forEach((element) => element.setAttribute("data-edit-selected", ""));
    }
  }, [selection]);

  const switches = roomZone.accessories.filter((a) => a.kind === "switch");
  const sensors = roomZone.accessories.filter((a) => a.kind === "sensor");

  // Apply the user's saved per-section order before rendering. The order
  // persists in view mode too — editing is only when it can be changed.
  const orderedScenes = applyItemOrder(scenes, itemOrder.scenes);
  const orderedLights = applyItemOrder(lights, itemOrder.lights);
  const orderedSwitches = applyItemOrder(switches, itemOrder.switches);
  const orderedSensors = applyItemOrder(sensors, itemOrder.sensors);

  const showScenes = scenes.length > 0 || lights.length > 0;
  const playingScene = scenes.find(isSceneDynamicActive) ?? null;

  const selectFrom =
    (category: EditCategory) => (event: React.MouseEvent<HTMLDivElement>) => {
      if (!managing) return;
      if (
        (event.target as HTMLElement).closest("[data-edit-interactive]") != null
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (pointerGesture.current.moved) {
        pointerGesture.current.moved = false;
        pointerGesture.current.trackingTile = false;
        return;
      }
      pointerGesture.current.trackingTile = false;
      if (selection && selection.category !== category) return;
      const tile = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-edit-id]",
      );
      const id = tile?.dataset.editId;
      if (!id) return;
      setSelection((current) => {
        const ids = new Set(current?.ids ?? []);
        if (ids.has(id)) ids.delete(id);
        else ids.add(id);
        return ids.size > 0 ? { category, ids } : null;
      });
    };

  const handleSectionDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setSectionOrder((current) => {
      const from = current.indexOf(active.id as SectionId);
      const to = current.indexOf(over.id as SectionId);
      if (from < 0 || to < 0) return current;
      const next = arrayMove(current, from, to);
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  };

  const runOperation = async (operation: SpaceEditOperation) => {
    setSaving(true);
    try {
      await executeSpaceEditOperations([operation], {
        activeSpace: roomZone,
        roomZones,
        lights: allLights,
        scenes: allScenes,
      });
      await onRefresh();
      setSelection(null);
      setActionDialog(null);
      setActionValue("");
      toast.success("Change saved");
    } catch (operationError) {
      toast.error(String(operationError) || "Unable to apply this change.");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const rename = (event: Event) => {
      const name = (event as CustomEvent<string>).detail.trim();
      if (!name || name === roomZone.name) return;
      void runOperation({
        type: "update-space-metadata",
        name,
        archetype: roomZone.class,
      });
    };
    window.addEventListener("hue-space-rename", rename);
    return () => window.removeEventListener("hue-space-rename", rename);
  });

  // Manage-mode "Select all / Deselect all" shown in each selectable section's
  // header. Selecting makes the whole section the active multi-select category;
  // deselecting clears it. Disabled while another section owns the selection,
  // since only one category can be selected at a time.
  const selectAllControl = (category: EditCategory, ids: string[]) => {
    if (!managing || ids.length === 0) return null;
    const otherCategorySelected =
      selection != null && selection.category !== category;
    const allSelected =
      selection?.category === category &&
      ids.every((id) => selection.ids.has(id));
    return (
      <Button
        variant="ghost"
        size="sm"
        data-edit-interactive
        disabled={otherCategorySelected}
        className="h-7 px-2 text-xs text-muted-foreground"
        onClick={() =>
          setSelection(allSelected ? null : { category, ids: new Set(ids) })
        }
      >
        {allSelected ? "Deselect all" : "Select all"}
      </Button>
    );
  };

  const sectionContent: Record<SectionId, React.ReactNode> = {
    // Keyed on the space so the expanded/collapsed state resets when entering or
    // leaving a room/zone (this screen instance is reused across spaces).
    group: managing ? null : (
      <GroupControls
        key={roomZone.id}
        roomZone={roomZone}
        lights={lights}
        syncedLightIds={syncedLightIds}
        playingScene={playingScene}
        hueEventRevision={hueEventRevision}
        editing={editing || managing}
        onToggle={onRoomZoneToggle}
        onBrightness={onRoomZoneBrightness}
        onOpen={onOpenGroup}
      />
    ),
    scenes: showScenes ? (
      <ScenesSection
        roomZoneName={roomZone.name}
        scenes={orderedScenes}
        syncedLightCount={syncedLightCount}
        totalLightCount={lights.length}
        activeSceneId={activeSceneId}
        editing={editing || managing}
        reordering={editing}
        orderedIds={itemOrder.scenes}
        headerAction={selectAllControl(
          "scenes",
          orderedScenes.map((scene) => scene.id),
        )}
        onReorder={persistItemOrder("scenes")}
        onSceneApply={onSceneApply}
        onSceneInspect={onSceneInspect}
        onSceneTogglePlay={onSceneTogglePlay}
        onGallerySceneCreate={onGallerySceneCreate}
        onGallerySceneApplyOnce={onGallerySceneApplyOnce}
        onGalleryScenePreview={onGalleryScenePreview}
        onGalleryScenePreviewEnd={onGalleryScenePreviewEnd}
      />
    ) : editing ? (
      <EmptyEditSection title="Scenes" />
    ) : null,
    lights:
      lights.length > 0 || !editing ? (
        <LightsSection
          lights={orderedLights}
          selectedLightId={selectedLightId}
          hueEventRevision={hueEventRevision}
          editing={editing || managing}
          reordering={editing}
          headerAction={selectAllControl(
            "lights",
            orderedLights.map((light) => light.id),
          )}
          onReorder={persistItemOrder("lights")}
          onSelectLight={onSelectLight}
          onLightToggle={onLightToggle}
          onLightBrightness={onLightBrightness}
        />
      ) : (
        <EmptyEditSection title="Lights" />
      ),
    switches:
      switches.length > 0 ? (
        <AccessorySection
          title="Switches"
          icon={ToggleLeft}
          accessories={orderedSwitches}
          readingsByDevice={readingsByDevice}
          reordering={editing}
          headerAction={selectAllControl(
            "switches",
            orderedSwitches.map((accessory) => accessory.id),
          )}
          onReorder={persistItemOrder("switches")}
        />
      ) : editing ? (
        <EmptyEditSection title="Switches" />
      ) : null,
    sensors:
      sensors.length > 0 ? (
        <AccessorySection
          title="Sensors"
          icon={Radar}
          accessories={orderedSensors}
          readingsByDevice={readingsByDevice}
          reordering={editing}
          headerAction={selectAllControl(
            "sensors",
            orderedSensors.map((accessory) => accessory.id),
          )}
          onReorder={persistItemOrder("sensors")}
        />
      ) : editing ? (
        <EmptyEditSection title="Sensors" />
      ) : null,
  };
  const destructiveDialog =
    actionDialog === "delete-scenes" ||
    actionDialog === "remove-lights" ||
    actionDialog === "unassign-accessories";

  return (
    <section
      inert={saving}
      aria-busy={saving}
      className={cn(
        "mx-auto flex w-full min-w-0 flex-col gap-6 transition-opacity",
        saving && "cursor-wait opacity-60",
      )}
    >
      {error && <p className="text-sm text-(--destructive-text)">{error}</p>}
      <DndContext
        sensors={sensorsForSections}
        collisionDetection={closestCenter}
        onDragEnd={handleSectionDragEnd}
      >
        <SortableContext
          items={sectionOrder}
          strategy={verticalListSortingStrategy}
          disabled={!editing}
        >
          <AnimatePresence initial={false}>
            {sectionOrder.map((sectionId) => {
              const content = sectionContent[sectionId];
              if (!content) return null;
              return (
                <motion.div
                  key={sectionId}
                  layout={!reduceMotion}
                  initial={{ opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{
                    duration: reduceMotion ? 0 : 0.2,
                    ease: "easeOut",
                  }}
                >
                  <SortableSection
                    id={sectionId}
                    editing={editing}
                    disabled={
                      managing &&
                      selection != null &&
                      selection.category !== sectionId
                    }
                    onPointerDownCapture={(event) => {
                      if (!managing) return;
                      pointerGesture.current = {
                        x: event.clientX,
                        y: event.clientY,
                        trackingTile:
                          (event.target as HTMLElement).closest(
                            "[data-edit-id]",
                          ) != null,
                        moved: false,
                      };
                    }}
                    onPointerMoveCapture={(event) => {
                      const gesture = pointerGesture.current;
                      if (!managing || !gesture.trackingTile || gesture.moved)
                        return;
                      if (
                        Math.hypot(
                          event.clientX - gesture.x,
                          event.clientY - gesture.y,
                        ) >= 5
                      )
                        gesture.moved = true;
                    }}
                    onPointerUpCapture={() => {
                      window.setTimeout(() => {
                        pointerGesture.current.moved = false;
                        pointerGesture.current.trackingTile = false;
                      }, 0);
                    }}
                    onClickCapture={
                      sectionId === "group" ? undefined : selectFrom(sectionId)
                    }
                  >
                    {content}
                  </SortableSection>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </SortableContext>
      </DndContext>
      {createPortal(
        <AnimatePresence>
          {managing && selection && (
            <motion.div
              initial={
                reduceMotion
                  ? { opacity: 0, x: "-50%" }
                  : { opacity: 0, x: "-50%", y: -16, scale: 0.98 }
              }
              animate={{ opacity: 1, x: "-50%", y: 0, scale: 1 }}
              exit={
                reduceMotion
                  ? { opacity: 0, x: "-50%" }
                  : { opacity: 0, x: "-50%", y: -16, scale: 0.98 }
              }
              transition={{
                duration: reduceMotion ? 0 : 0.18,
                ease: "easeOut",
              }}
              className="fixed top-24 left-1/2 z-50 flex items-center gap-2 rounded-2xl border border-border bg-popover p-2 text-popover-foreground shadow-xl"
            >
              <span className="px-2 text-sm font-medium">
                {selection.ids.size} selected
              </span>
              {selection.category === "scenes" ? (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setActionValue("");
                      setActionDialog("copy-scenes");
                    }}
                  >
                    <Copy /> Copy to…
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-(--destructive-text)"
                    onClick={() => setActionDialog("delete-scenes")}
                  >
                    <Trash2 /> Remove
                  </Button>
                </>
              ) : selection.category === "lights" ? (
                <>
                  {roomZone.resourceType === "room" && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setActionValue("");
                        setActionDialog("move-lights");
                      }}
                    >
                      <MoveRight /> Move to…
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setActionValue("");
                      setActionDialog("light-function");
                    }}
                  >
                    <Pencil /> Edit function
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-(--destructive-text)"
                    onClick={() => setActionDialog("remove-lights")}
                  >
                    <Trash2 /> Remove
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setActionValue("");
                      setActionDialog("move-accessories");
                    }}
                  >
                    <MoveRight /> Move to room…
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-(--destructive-text)"
                    onClick={() => setActionDialog("unassign-accessories")}
                  >
                    <Trash2 /> Unassign
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="icon"
                aria-label="Clear selection"
                onClick={() => setSelection(null)}
              >
                <X />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
      <Dialog
        open={actionDialog != null}
        onOpenChange={(open) => {
          if (!open) {
            setActionDialog(null);
            setActionValue("");
          }
        }}
      >
        <DialogContent
          inert={saving}
          aria-busy={saving}
          className={cn(actionDialog === "space-icon" && "sm:max-w-lg")}
        >
          <DialogHeader>
            <DialogTitle>
              {actionDialog === "copy-scenes"
                ? "Copy scenes"
                : actionDialog === "move-lights"
                  ? "Move lights"
                  : actionDialog === "move-accessories"
                    ? "Move accessories"
                    : actionDialog === "delete-scenes"
                      ? "Delete selected scenes?"
                      : actionDialog === "remove-lights"
                        ? `Remove selected lights from ${roomZone.name}?`
                        : actionDialog === "unassign-accessories"
                          ? "Unassign selected accessories?"
                          : actionDialog === "space-icon"
                            ? `Change ${roomZone.resourceType} icon`
                            : "Edit light function"}
            </DialogTitle>
            <DialogDescription>
              {actionDialog === "space-icon"
                ? "This change is saved immediately to the Hue Bridge."
                : destructiveDialog
                  ? "This change is applied immediately and cannot be undone from this screen."
                  : "This change will be applied immediately to the Hue Bridge."}
            </DialogDescription>
          </DialogHeader>
          {actionDialog === "space-icon" ? (
            <ScrollArea
              fade
              hideScrollbar
              className="h-80"
              viewportClassName="pr-1"
            >
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {SPACE_ARCHETYPES.map((option) => {
                  const Icon = getRoomZoneIcon(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setDetailsArchetype(option.value)}
                      data-selected={
                        option.value === detailsArchetype ? "" : undefined
                      }
                      className={cn(
                        "flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl p-3 text-center text-xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        selectableVariants(),
                        option.value === detailsArchetype && "text-foreground",
                      )}
                    >
                      <Icon size={26} className="text-foreground" />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          ) : (
            !destructiveDialog && (
              <Select
                value={actionValue}
                onValueChange={(value) => setActionValue(value ?? "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={
                      actionDialog === "light-function"
                        ? "Choose function"
                        : "Choose destination"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {actionDialog === "light-function" ? (
                    <>
                      <SelectItem value="functional">Task</SelectItem>
                      <SelectItem value="decorative">Decoration</SelectItem>
                      <SelectItem value="mixed">Mixed</SelectItem>
                    </>
                  ) : (
                    roomZones
                      .filter((space) => {
                        if (space.id === roomZone.id) return false;
                        if (actionDialog === "move-accessories")
                          return space.resourceType === "room";
                        if (actionDialog === "move-lights")
                          return space.resourceType === roomZone.resourceType;
                        return true;
                      })
                      .map((space) => (
                        <SelectItem key={space.id} value={space.id}>
                          {space.name}
                        </SelectItem>
                      ))
                  )}
                </SelectContent>
              </Select>
            )
          )}
          <DialogFooter className="flex-row justify-end">
            <DialogClose render={<Button variant="outline" />}>
              Close
            </DialogClose>
            <Button
              variant={destructiveDialog ? "destructive" : "default"}
              disabled={
                saving ||
                (actionDialog === "space-icon"
                  ? !detailsArchetype
                  : (!destructiveDialog && !actionValue) || !selection)
              }
              onClick={async () => {
                if (actionDialog === "space-icon") {
                  await runOperation({
                    type: "update-space-metadata",
                    name: detailsName,
                    archetype: detailsArchetype,
                  });
                } else if (!selection || (!destructiveDialog && !actionValue)) {
                  return;
                } else if (actionDialog === "copy-scenes") {
                  await runOperation({
                    type: "copy-scenes",
                    sceneIds: [...selection.ids],
                    targetSpaceId: actionValue,
                  });
                } else if (actionDialog === "move-lights") {
                  await runOperation({
                    type: "place-lights",
                    lightIds: [...selection.ids],
                    targetSpaceId: actionValue,
                  });
                } else if (actionDialog === "move-accessories") {
                  await runOperation({
                    type: "place-accessories",
                    deviceIds: [...selection.ids],
                    targetRoomId: actionValue,
                  });
                } else if (actionDialog === "light-function") {
                  await runOperation({
                    type: "set-light-function",
                    lightIds: [...selection.ids],
                    value: actionValue as LightFunction,
                  });
                } else if (actionDialog === "delete-scenes") {
                  await runOperation({
                    type: "delete-scenes",
                    sceneIds: [...selection.ids],
                  });
                } else if (actionDialog === "remove-lights") {
                  await runOperation({
                    type: "place-lights",
                    lightIds: [...selection.ids],
                    targetSpaceId: null,
                  });
                } else if (actionDialog === "unassign-accessories") {
                  await runOperation({
                    type: "place-accessories",
                    deviceIds: [...selection.ids],
                    targetRoomId: null,
                  });
                }
              }}
            >
              {saving && <LoaderCircle className="animate-spin" />}
              {saving ? "Applying…" : destructiveDialog ? "Confirm" : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};
