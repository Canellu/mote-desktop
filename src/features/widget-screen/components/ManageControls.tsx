import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getRoomZoneIcon } from "@/features/home-screen/components/room-zone-icons";
import { ProTag } from "@/features/settings-screen/components/ProTag";
import { selectableVariants } from "@/lib/selection-styles";
import { cn } from "@/lib/utils";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import type { HueScene } from "@/types/hue";
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
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronLeft,
  GripVertical,
  Lightbulb,
  Plus,
  Search,
  ToggleRight,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState, type ReactNode } from "react";
import { ControlPicker } from "../onboarding/ControlPicker";
import {
  controlTargetKey,
  isTogglesControl,
  newControlId,
  toggleAction,
  type ControlTarget,
  type SingleWidgetControl,
  type ToggleAction,
  type ToggleTarget,
  type TogglesWidgetControl,
  type WidgetControl,
} from "../types";
import {
  SceneCardRail,
  SceneRailItem,
  SelectableSceneCard,
} from "./SceneCardRail";

const IconTooltip = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger
        render={<span className="inline-flex">{children}</span>}
      />
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

const useControlDisplay = (control: WidgetControl) => {
  const roomZones = useHueResourcesStore((state) => state.roomZones);
  const lights = useHueResourcesStore((state) => state.lights);

  if (isTogglesControl(control)) {
    return {
      name: control.label ?? "Toggles",
      icon: <ToggleRight size={18} strokeWidth={2.5} />,
      available: true,
    };
  }

  if (control.target.kind === "light") {
    const light = lights.find(
      (candidate) => candidate.id === control.target.id,
    );
    return {
      name: control.label ?? light?.name ?? "Unavailable light",
      icon: <Lightbulb size={18} strokeWidth={2.5} />,
      available: light != null,
    };
  }

  const roomZone = roomZones.find(
    (candidate) => candidate.id === control.target.id,
  );
  const Icon = getRoomZoneIcon(roomZone?.class ?? "");
  return {
    name: control.label ?? roomZone?.name ?? "Unavailable space",
    icon: <Icon size={18} strokeWidth={2.5} />,
    available: roomZone != null,
  };
};

/** The one-line summary under a control's name in the manage list. */
const controlMeta = (control: WidgetControl): string => {
  if (isTogglesControl(control)) {
    const targets = control.targets ?? [];
    const scenes = targets.filter((t) => toggleAction(t) === "scene").length;
    return [
      `toggles · ${targets.length} target${targets.length === 1 ? "" : "s"}`,
      scenes > 0 ? `${scenes} scene${scenes === 1 ? "" : "s"}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  const compact = control.compact ?? false;
  const sceneCount = control.sceneIds.length;
  return [
    control.target.kind,
    control.showBrightness ? "dimmer" : null,
    compact ? "compact" : "full",
    sceneCount > 0 ? `${sceneCount} scene${sceneCount > 1 ? "s" : ""}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
};

const ControlRow = ({
  control,
  groupScenes,
  defaultOpen = false,
  onDelete,
  onChange,
}: {
  control: WidgetControl;
  groupScenes: HueScene[];
  /** Start expanded — used for a freshly added toggles card so its target
   * picker is immediately visible. */
  defaultOpen?: boolean;
  onDelete: () => void;
  onChange: (control: WidgetControl) => void;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const prefersReducedMotion = useReducedMotion();
  const display = useControlDisplay(control);
  const meta = controlMeta(control);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: control.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        // Keep expanded and collapsed rows at their own size while reordering.
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.65 : 1,
        zIndex: isDragging ? 10 : undefined,
      }}
      className="rounded-lg border border-border/60 bg-card"
    >
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 transition-colors hover:bg-[oklch(0.95_0_0)] dark:hover:bg-[oklch(0.30_0_0)]",
          open && "bg-[oklch(0.97_0_0)] dark:bg-[oklch(0.28_0_0)]",
        )}
      >
        <IconTooltip label="Drag to reorder">
          <button
            type="button"
            className="flex size-8 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
            aria-label="Drag control"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={16} />
          </button>
        </IconTooltip>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center",
              display.available ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {display.icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{display.name}</p>
            <p className="truncate text-xs text-muted-foreground capitalize">
              {meta}
            </p>
          </div>
        </button>
        {open ? (
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="shrink-0 text-(--destructive-text) hover:text-(--destructive-text)"
                />
              }
            >
              <Trash2 size={15} />
              Remove
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove control?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes “{display.name}” from this widget. The room,
                  zone, or light itself isn't affected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel size="xl">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  size="xl"
                  className="gap-2"
                  onClick={onDelete}
                >
                  <Trash2 size={15} />
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? "Collapse control" : "Expand control"}
          aria-expanded={open}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground"
        >
          <ChevronDown
            size={16}
            className={cn(
              "shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="control-configuration"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              duration: prefersReducedMotion ? 0 : 0.2,
              ease: [0.4, 0, 0.2, 1],
            }}
            className="overflow-hidden"
          >
            <div className="grid gap-3 border-t border-border/50 px-3 py-3">
              {control.type === "toggles" ? (
                <TogglesControlBody control={control} onChange={onChange} />
              ) : (
                <SingleControlBody
                  control={control}
                  groupScenes={groupScenes}
                  onChange={onChange}
                />
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

/** Expanded config for a single-target control: the Compact toggle and, for
 * room/zone targets, the quick-scene multi-select. */
const SingleControlBody = ({
  control,
  groupScenes,
  onChange,
}: {
  control: SingleWidgetControl;
  groupScenes: HueScene[];
  onChange: (control: WidgetControl) => void;
}) => {
  const compact = control.compact ?? false;

  const toggleScene = (sceneId: string) => {
    const selected = control.sceneIds.includes(sceneId);
    onChange(
      selected
        ? {
            ...control,
            sceneIds: control.sceneIds.filter((id) => id !== sceneId),
          }
        : { ...control, sceneIds: [...control.sceneIds, sceneId] },
    );
  };

  return (
    <>
      <label className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-sm font-medium">Compact mode</span>
          <span className="block truncate text-xs text-muted-foreground">
            Hide the brightness slider — keep just the toggle and scenes.
          </span>
        </span>
        <Switch
          checked={compact}
          onCheckedChange={(checked) =>
            onChange({ ...control, compact: checked })
          }
          aria-label="Compact mode"
        />
      </label>

      {control.target.kind !== "light" ? (
        <div className="grid gap-2">
          <p className="text-xs text-muted-foreground">
            {groupScenes.length === 0
              ? "No scenes saved for this space yet."
              : "Tap scenes to add them as quick buttons."}
          </p>
          {groupScenes.length > 0 ? (
            <SceneCardRail>
              {groupScenes.map((scene) => {
                const selected = control.sceneIds.includes(scene.id);
                return (
                  <SceneRailItem key={scene.id}>
                    <SelectableSceneCard
                      scene={scene}
                      selected={selected}
                      disabled={false}
                      onToggle={() => toggleScene(scene.id)}
                    />
                  </SceneRailItem>
                );
              })}
            </SceneCardRail>
          ) : null}
        </div>
      ) : null}
    </>
  );
};

const TargetGroupLabel = ({ children }: { children: ReactNode }) => (
  <p className="px-1 pt-2 pb-0.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
    {children}
  </p>
);

/** A checkable row for one candidate target in the toggles picker. */
const ToggleTargetRow = ({
  icon,
  name,
  selected,
  onToggle,
}: {
  icon: ReactNode;
  name: string;
  selected: boolean;
  onToggle: () => void;
}) => (
  <label
    data-selected={selected ? "" : undefined}
    className={cn(
      "flex w-full cursor-pointer items-center gap-3 rounded-lg bg-card px-3 py-2 text-left",
      selectableVariants(),
    )}
  >
    <Checkbox checked={selected} onCheckedChange={onToggle} />
    <span className="flex size-7 shrink-0 items-center justify-center text-muted-foreground">
      {icon}
    </span>
    <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
  </label>
);

/** A small two-way segmented toggle for a chip's action. The Scene option is
 * disabled (with a hint) when the target has no scenes to launch. */
const ActionSegmented = ({
  value,
  canScene,
  onChange,
}: {
  value: ToggleAction;
  canScene: boolean;
  onChange: (value: ToggleAction) => void;
}) => (
  <div className="flex shrink-0 items-center rounded-full bg-muted p-1">
    {(
      [
        { value: "power", label: "On / off", disabled: false },
        {
          value: "scene",
          label: "Scene",
          disabled: !canScene,
        },
      ] as const
    ).map((option) => (
      <button
        key={option.value}
        type="button"
        disabled={option.disabled}
        onClick={() => onChange(option.value)}
        aria-pressed={value === option.value}
        title={
          option.disabled ? "No scenes saved for this space yet" : undefined
        }
        className={cn(
          "rounded-full border border-transparent px-2.5 py-1 text-xs font-medium transition-colors",
          value === option.value
            ? "border-foreground/12 bg-background text-foreground shadow-sm dark:border-foreground/8 dark:bg-input/30 dark:shadow-none"
            : "text-muted-foreground hover:text-foreground",
          option.disabled &&
            "cursor-not-allowed opacity-40 hover:text-muted-foreground",
        )}
      >
        {option.label}
      </button>
    ))}
  </div>
);

/** One configured chip in a toggles card: shows what it targets, lets you choose
 * whether a tap powers the target on/off or launches a scene, and (for a scene
 * chip) which scene. The X removes the chip from the card. */
const ConfiguredToggleRow = ({
  item,
  onUpdate,
  onRemove,
}: {
  item: ToggleTarget;
  onUpdate: (patch: Partial<ToggleTarget>) => void;
  onRemove: () => void;
}) => {
  const roomZones = useHueResourcesStore((state) => state.roomZones);
  const lights = useHueResourcesStore((state) => state.lights);
  const scenes = useHueResourcesStore((state) => state.scenes);

  const isLight = item.kind === "light";
  const roomZone = isLight
    ? undefined
    : roomZones.find((candidate) => candidate.id === item.id);
  const light = isLight
    ? lights.find((candidate) => candidate.id === item.id)
    : undefined;
  const Icon = getRoomZoneIcon(roomZone?.class ?? "");
  const name = isLight
    ? (light?.name ?? "Unavailable light")
    : (roomZone?.name ?? "Unavailable space");
  const icon = isLight ? (
    <Lightbulb size={16} strokeWidth={2.5} />
  ) : (
    <Icon size={16} strokeWidth={2.5} />
  );

  const groupScenes = isLight
    ? []
    : scenes.filter((scene) => scene.group === item.id);
  const action = toggleAction(item);
  const canScene = !isLight && groupScenes.length > 0;

  const setAction = (next: ToggleAction) => {
    if (next === "scene") {
      // Default to the first scene so the chip is immediately functional; keep
      // the prior choice if it still exists.
      const sceneId =
        item.sceneId && groupScenes.some((scene) => scene.id === item.sceneId)
          ? item.sceneId
          : (groupScenes[0]?.id ?? null);
      onUpdate({ action: "scene", sceneId });
    } else {
      onUpdate({ action: "power", sceneId: null });
    }
  };

  return (
    <div className="grid gap-2 rounded-lg border border-border/60 bg-card p-2.5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center text-muted-foreground">
          {icon}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {name}
        </span>
        {isLight ? (
          <span className="shrink-0 text-xs text-muted-foreground">
            On / off
          </span>
        ) : (
          <ActionSegmented
            value={action}
            canScene={canScene}
            onChange={setAction}
          />
        )}
        <IconTooltip label="Remove">
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${name}`}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X size={15} />
          </button>
        </IconTooltip>
      </div>

      {action === "scene" && !isLight ? (
        groupScenes.length > 0 ? (
          <SceneCardRail>
            {groupScenes.map((scene) => (
              <SceneRailItem key={scene.id}>
                <SelectableSceneCard
                  scene={scene}
                  selected={item.sceneId === scene.id}
                  disabled={false}
                  onToggle={() => onUpdate({ sceneId: scene.id })}
                />
              </SceneRailItem>
            ))}
          </SceneCardRail>
        ) : (
          <p className="px-1 text-xs text-muted-foreground">
            No scenes saved for this space yet.
          </p>
        )
      ) : null}
    </div>
  );
};

/** Expanded config for a toggles card: the configured chips (each with an
 * on/off-or-scene action), plus a searchable list to add rooms, zones, or
 * lights. Tapping in the list adds or removes a chip. Exported so the widget
 * wizard can offer the same toggles editor on its Configure step. */
export const TogglesControlBody = ({
  control,
  onChange,
}: {
  control: TogglesWidgetControl;
  onChange: (control: WidgetControl) => void;
}) => {
  const roomZones = useHueResourcesStore((state) => state.roomZones);
  const lights = useHueResourcesStore((state) => state.lights);
  const [query, setQuery] = useState("");

  const targets = control.targets ?? [];
  const selectedKeys = new Set(targets.map(controlTargetKey));
  const toggleTarget = (target: ControlTarget) => {
    const key = controlTargetKey(target);
    onChange(
      selectedKeys.has(key)
        ? {
            ...control,
            targets: targets.filter(
              (candidate) => controlTargetKey(candidate) !== key,
            ),
          }
        : { ...control, targets: [...targets, { ...target }] },
    );
  };

  const updateTarget = (key: string, patch: Partial<ToggleTarget>) =>
    onChange({
      ...control,
      targets: targets.map((candidate) =>
        controlTargetKey(candidate) === key
          ? { ...candidate, ...patch }
          : candidate,
      ),
    });

  const removeTarget = (key: string) =>
    onChange({
      ...control,
      targets: targets.filter(
        (candidate) => controlTargetKey(candidate) !== key,
      ),
    });

  const term = query.trim().toLowerCase();
  const match = (name: string) => name.toLowerCase().includes(term);
  const matchedRooms = roomZones.filter(
    (rz) => rz.resourceType === "room" && match(rz.name),
  );
  const matchedZones = roomZones.filter(
    (rz) => rz.resourceType === "zone" && match(rz.name),
  );
  const matchedLights = lights.filter((light) => match(light.name));
  const empty =
    matchedRooms.length === 0 &&
    matchedZones.length === 0 &&
    matchedLights.length === 0;

  return (
    <div className="grid gap-3">
      {targets.length > 0 ? (
        <div className="grid gap-2">
          <TargetGroupLabel>On this card</TargetGroupLabel>
          {targets.map((item) => {
            const key = controlTargetKey(item);
            return (
              <ConfiguredToggleRow
                key={key}
                item={item}
                onUpdate={(patch) => updateTarget(key, patch)}
                onRemove={() => removeTarget(key)}
              />
            );
          })}
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Tap a room, zone, or light to add it as a chip. Each chip can power its
        target on/off or launch a scene.
      </p>
      <div className="relative">
        <Search
          size={15}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search rooms, zones, lights…"
          className="pl-9"
        />
      </div>

      <ScrollArea fade className="max-h-72" viewportClassName="pr-2">
        {empty ? (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            {term ? `Nothing matches “${query.trim()}”.` : "No devices yet."}
          </p>
        ) : (
          <div className="grid gap-1">
            {matchedRooms.length > 0 && (
              <TargetGroupLabel>Rooms</TargetGroupLabel>
            )}
            {matchedRooms.map((rz) => {
              const Icon = getRoomZoneIcon(rz.class);
              const target: ControlTarget = { kind: "room", id: rz.id };
              return (
                <ToggleTargetRow
                  key={rz.id}
                  icon={<Icon size={16} strokeWidth={2.5} />}
                  name={rz.name}
                  selected={selectedKeys.has(controlTargetKey(target))}
                  onToggle={() => toggleTarget(target)}
                />
              );
            })}

            {matchedZones.length > 0 && (
              <TargetGroupLabel>Zones</TargetGroupLabel>
            )}
            {matchedZones.map((rz) => {
              const Icon = getRoomZoneIcon(rz.class);
              const target: ControlTarget = { kind: "zone", id: rz.id };
              return (
                <ToggleTargetRow
                  key={rz.id}
                  icon={<Icon size={16} strokeWidth={2.5} />}
                  name={rz.name}
                  selected={selectedKeys.has(controlTargetKey(target))}
                  onToggle={() => toggleTarget(target)}
                />
              );
            })}

            {matchedLights.length > 0 && (
              <TargetGroupLabel>Lights</TargetGroupLabel>
            )}
            {matchedLights.map((light) => {
              const target: ControlTarget = { kind: "light", id: light.id };
              return (
                <ToggleTargetRow
                  key={light.id}
                  icon={<Lightbulb size={16} strokeWidth={2.5} />}
                  name={light.name}
                  selected={selectedKeys.has(controlTargetKey(target))}
                  onToggle={() => toggleTarget(target)}
                />
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};

/**
 * A placeholder row shown while adding a control. It starts collapsed with a
 * "nothing selected" hint; expanding reveals the picker, and choosing a target
 * promotes it into a real control.
 */
const PendingControlRow = ({
  onSelect,
  onCancel,
}: {
  onSelect: (control: WidgetControl) => void;
  onCancel: () => void;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-dashed border-border/70 bg-card">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="flex size-8 shrink-0 items-center justify-center text-muted-foreground">
            <Plus size={18} strokeWidth={2.5} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">Nothing selected</p>
            <p className="truncate text-xs text-muted-foreground">
              Expand to choose a room, zone, or light.
            </p>
          </div>
          <ChevronDown
            size={16}
            className={cn(
              "shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
        <IconTooltip label="Cancel">
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel adding control"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X size={16} />
          </button>
        </IconTooltip>
      </div>

      {open ? (
        <div className="border-t border-border/50 px-3 py-3">
          <ControlPicker onSelect={onSelect} />
        </div>
      ) : null}
    </div>
  );
};

export const ManageControls = ({
  controls,
  onClose,
  onChange,
  onProRequired,
}: {
  controls: WidgetControl[];
  onClose?: () => void;
  onChange: (next: WidgetControl[]) => void;
  /**
   * Set on Free, which holds one single-target control. Adding a second card, or
   * a toggles card at all, calls this instead.
   */
  onProRequired?: () => void;
}) => {
  const scenes = useHueResourcesStore((state) => state.scenes);
  const [adding, setAdding] = useState(false);
  // The id of a just-added card to auto-expand — used so a new toggles card
  // opens straight to its target picker instead of an empty collapsed row.
  const [openId, setOpenId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const addControl = (control: WidgetControl) => {
    onChange([control, ...controls]);
    setAdding(false);
  };

  const addTogglesCard = () => {
    const control: TogglesWidgetControl = {
      id: newControlId(),
      type: "toggles",
      targets: [],
      label: null,
      hotkey: null,
    };
    setAdding(false);
    setOpenId(control.id);
    onChange([control, ...controls]);
  };

  // Compact only hides the brightness slider; scenes still render as the rail in
  // both modes, so sceneIds are always preserved across a compact toggle.
  const updateControl = (next: WidgetControl) =>
    onChange(
      controls.map((control) => (control.id === next.id ? next : control)),
    );

  const remove = (id: string) =>
    onChange(controls.filter((control) => control.id !== id));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = controls.findIndex((control) => control.id === active.id);
    const to = controls.findIndex((control) => control.id === over.id);
    if (from === -1 || to === -1) return;
    onChange(arrayMove(controls, from, to));
  };

  const togglesNeedPro = onProRequired !== undefined;
  const controlNeedsPro = onProRequired !== undefined && controls.length > 0;

  return (
    <div className="grid gap-4 pt-8">
      <div className="flex items-center gap-2">
        {onClose ? (
          <IconTooltip label="Back">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Back"
              onClick={onClose}
            >
              <ChevronLeft size={18} />
            </Button>
          </IconTooltip>
        ) : null}
        <p className="text-base font-semibold">Controls</p>
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={togglesNeedPro ? onProRequired : addTogglesCard}
          >
            <ToggleRight size={16} />
            Add toggles
            {togglesNeedPro ? <ProTag /> : null}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={controlNeedsPro ? onProRequired : () => setAdding(true)}
            disabled={adding}
          >
            <Plus size={16} />
            Add control
            {controlNeedsPro ? <ProTag /> : null}
          </Button>
        </div>
      </div>

      {adding ? (
        <PendingControlRow
          onSelect={addControl}
          onCancel={() => setAdding(false)}
        />
      ) : null}

      {controls.length === 0 ? (
        !adding ? (
          <p className="px-1 text-sm text-muted-foreground">
            No cards yet. Add a control or a toggles card to start controlling
            your lights.
          </p>
        ) : null
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={controls.map((control) => control.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="grid gap-1.5">
              {controls.map((control) => (
                <ControlRow
                  key={control.id}
                  control={control}
                  defaultOpen={control.id === openId}
                  groupScenes={
                    control.type === "toggles" ||
                    control.target.kind === "light"
                      ? []
                      : scenes.filter(
                          (scene) => scene.group === control.target.id,
                        )
                  }
                  onDelete={() => remove(control.id)}
                  onChange={updateControl}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
};
