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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getRoomZoneIcon } from "@/features/home-screen/components/room-zone-icons";
import { sceneBubbleCss } from "@/features/space-screen/utils/color-state";
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
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  Palette,
  Plus,
  Search,
  ToggleRight,
  Trash2,
  X,
} from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
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
  type WidgetCornerMode,
  type WidgetSizeMode,
  type WidgetThemeMode,
} from "../types";
import {
  WIDGET_SIDE_PADDING,
  WIDGET_SIZE_METRICS,
  resolveWidgetTheme,
  widgetShellStyle,
} from "../widgetShell";
import { ControlCard } from "./ControlCard";
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
      name: light?.name ?? control.label ?? "Unavailable light",
      icon: <Lightbulb size={18} strokeWidth={2.5} />,
      available: light != null,
    };
  }

  const roomZone = roomZones.find(
    (candidate) => candidate.id === control.target.id,
  );
  const Icon = getRoomZoneIcon(roomZone?.class ?? "");
  return {
    name: roomZone?.name ?? control.label ?? "Unavailable space",
    icon: <Icon size={18} strokeWidth={2.5} />,
    available: roomZone != null,
  };
};

/** The one-line summary under a control's name in its edit sheet. */
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

/** One read-only chip in a control row's preview. */
const PreviewChip = ({
  bubble,
  icon,
  label,
}: {
  bubble?: string | null;
  icon?: ReactNode;
  label: string;
}) => (
  <span className="inline-flex max-w-40 items-center gap-1.5 rounded-full bg-muted py-1 pr-2.5 pl-1 text-xs font-medium">
    {bubble ? (
      <span
        className="size-4 shrink-0 rounded-full ring-1 ring-foreground/15"
        style={{ background: bubble }}
      />
    ) : (
      <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
        {icon}
      </span>
    )}
    <span className="truncate">{label}</span>
  </span>
);

/** What a control shows in the widget, as chips: its quick scenes, or its
 * toggle targets. Editing happens in the sheet. */
const ControlPreview = ({ control }: { control: WidgetControl }) => {
  const roomZones = useHueResourcesStore((state) => state.roomZones);
  const lights = useHueResourcesStore((state) => state.lights);
  const scenes = useHueResourcesStore((state) => state.scenes);

  if (isTogglesControl(control)) {
    const targets = control.targets ?? [];
    if (targets.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1.5">
        {targets.map((target) => {
          const scene =
            toggleAction(target) === "scene"
              ? scenes.find((candidate) => candidate.id === target.sceneId)
              : undefined;
          const name =
            target.kind === "light"
              ? lights.find((light) => light.id === target.id)?.name
              : roomZones.find((roomZone) => roomZone.id === target.id)?.name;
          return (
            <PreviewChip
              key={controlTargetKey(target)}
              bubble={scene ? sceneBubbleCss(scene) : null}
              icon={<ToggleRight size={14} />}
              label={
                scene
                  ? `${name ?? "Unavailable"} · ${scene.name}`
                  : (name ?? "Unavailable")
              }
            />
          );
        })}
      </div>
    );
  }

  const selected = control.sceneIds
    .map((id) => scenes.find((scene) => scene.id === id))
    .filter((scene): scene is HueScene => scene != null);
  if (selected.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {selected.map((scene) => (
        <PreviewChip
          key={scene.id}
          bubble={sceneBubbleCss(scene)}
          icon={<Palette size={14} />}
          label={scene.name}
        />
      ))}
    </div>
  );
};

const ControlRow = ({
  control,
  onEdit,
}: {
  control: WidgetControl;
  onEdit: () => void;
}) => {
  const display = useControlDisplay(control);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: control.id });

  // The whole row drags (after a few pixels) and a plain click opens the
  // editor, so there is no separate handle or Edit button.
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
      }}
      className="relative"
    >
      <button
        type="button"
        onClick={onEdit}
        {...attributes}
        {...listeners}
        aria-label={`Edit ${display.name}`}
        className={cn(
          "group/row grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-xl px-3 py-2.5 text-left outline-none ring-1 ring-foreground/6 transition-[background-color,box-shadow] hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring",
          isDragging &&
            "cursor-grabbing bg-(--settings-raised) shadow-lg ring-1 ring-foreground/10 hover:bg-(--settings-raised)",
        )}
      >
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-lg bg-foreground/6",
            display.available ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {display.icon}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">
            {display.name}
          </span>
        </span>
        <ChevronRight
          size={16}
          className="text-muted-foreground transition-transform group-hover/row:translate-x-0.5 group-hover/row:text-foreground"
        />
        <span className="col-start-2 col-end-4 empty:hidden">
          <ControlPreview control={control} />
        </span>
      </button>
    </div>
  );
};

/** The editor for one control, opened from its row. */
/** How the widget looks, so the edit pane can preview a control as it will
 * appear. */
export interface ControlPreviewAppearance {
  themeMode: WidgetThemeMode;
  sizeMode: WidgetSizeMode;
  cornerMode: WidgetCornerMode;
}

/** The largest the preview grows to, relative to life size. */
const SPOTLIGHT_MAX_SCALE = 1.25;

/** The control in the widget's shell, scaled to fit its stage. */
const SpotlightFrame = ({
  control,
  appearance,
}: {
  control: WidgetControl;
  appearance: ControlPreviewAppearance;
}) => {
  const { themeMode, sizeMode, cornerMode } = appearance;
  const theme = resolveWidgetTheme(
    themeMode,
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const metrics = WIDGET_SIZE_METRICS[sizeMode];
  const stageRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Transforms don't affect layout, so measure the natural shell against the
  // stage and pick a contain scale, capped a little above life size.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const shell = shellRef.current;
    if (!stage || !shell) return;
    const fit = () => {
      const { offsetWidth: w, offsetHeight: h } = shell;
      if (!w || !h) return;
      setScale(
        Math.min(
          SPOTLIGHT_MAX_SCALE,
          stage.clientWidth / w,
          stage.clientHeight / h,
        ),
      );
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={stageRef}
      className="flex min-h-0 w-full flex-1 items-center justify-center"
    >
      <div
        ref={shellRef}
        // The one live spot in the preview: a chip rail can be dragged to see
        // past the first few, and clicks here don't fall through and close the
        // pane. Anything outside a rail is swallowed, so a click can't flip a
        // light or move a slider from the preview.
        onPointerDownCapture={(event) => {
          if (!(event.target as Element).closest('[data-slot="carousel"]')) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onClickCapture={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        className={cn(
          "pointer-events-auto shrink-0 text-foreground shadow-2xl",
          theme === "dark" ? "dark" : "theme-light",
        )}
        style={{
          ...widgetShellStyle(theme, sizeMode, cornerMode),
          width: metrics.cardBasis + WIDGET_SIDE_PADDING * 2,
          padding: WIDGET_SIDE_PADDING,
          transform: `scale(${scale})`,
          transformOrigin: "center",
        }}
      >
        <ControlCard control={control} sizeMode={sizeMode} />
      </div>
    </div>
  );
};

/**
 * The control being edited, in the dimmed area right of the edit pane, where
 * the step's own preview sits. It slides in from the right while the pane
 * comes in from the left, on the same easing.
 * Portaled beside the sheet so the sheet's slide transform doesn't move it; it
 * ignores the pointer, so a click there still reaches the backdrop and closes
 * the pane.
 */
const ControlSpotlight = ({
  control,
  appearance,
}: {
  control: WidgetControl | null;
  appearance: ControlPreviewAppearance;
}) => {
  const reduceMotion = useReducedMotion();
  // SheetContent's slide: 300ms on cubic-bezier(0.16, 1, 0.3, 1).
  const transition = {
    duration: reduceMotion ? 0 : 0.3,
    ease: [0.16, 1, 0.3, 1] as const,
  };

  return createPortal(
    <AnimatePresence>
      {control ? (
        <motion.div
          key="control-spotlight"
          // Only orchestrates: the label and the widget each animate their own
          // way through the shared "shown"/"hidden" variants.
          initial="hidden"
          animate="shown"
          exit="hidden"
          // Matches SheetContent's left-side width: w-3/4, capped at max-w-md.
          style={{ left: "min(75vw, 28rem)" }}
          className="pointer-events-none fixed top-(--title-bar-height) right-0 bottom-0 z-51 hidden flex-col items-center gap-4 p-10 sm:flex"
        >
          {/* Drops in from above and lifts back out. */}
          <motion.p
            variants={{
              hidden: { opacity: 0, y: reduceMotion ? 0 : -12 },
              shown: { opacity: 1, y: 0 },
            }}
            transition={transition}
            className="text-xs font-medium tracking-wide text-white/60 uppercase"
          >
            Preview
          </motion.p>
          {/* Follows the pane's slide, from the right. */}
          <motion.div
            variants={{
              hidden: { opacity: 0, x: reduceMotion ? 0 : 48, scale: 0.96 },
              shown: { opacity: 1, x: 0, scale: 1 },
            }}
            transition={transition}
            className="flex min-h-0 w-full flex-1"
          >
            <SpotlightFrame control={control} appearance={appearance} />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
};

const ControlSheet = ({
  control,
  groupScenes,
  appearance,
  onOpenChange,
  onDelete,
  onChange,
}: {
  control: WidgetControl | null;
  groupScenes: HueScene[];
  appearance?: ControlPreviewAppearance;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
  onChange: (control: WidgetControl) => void;
}) => (
  <Sheet open={control != null} onOpenChange={onOpenChange}>
    <SheetContent side="left" className="gap-0 data-[side=left]:sm:max-w-md">
      {control ? (
        <ControlSheetBody
          control={control}
          groupScenes={groupScenes}
          onDelete={onDelete}
          onChange={onChange}
        />
      ) : null}
    </SheetContent>
    {appearance ? (
      <ControlSpotlight control={control} appearance={appearance} />
    ) : null}
  </Sheet>
);

const ControlSheetBody = ({
  control,
  groupScenes,
  onDelete,
  onChange,
}: {
  control: WidgetControl;
  groupScenes: HueScene[];
  onDelete: () => void;
  onChange: (control: WidgetControl) => void;
}) => {
  const display = useControlDisplay(control);

  return (
    <>
      <SheetHeader className="flex-row items-center gap-3 border-b border-border pr-14">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
          {display.icon}
        </span>
        <div className="min-w-0">
          <SheetTitle className="truncate">{display.name}</SheetTitle>
          <SheetDescription className="truncate text-xs capitalize">
            {controlMeta(control)}
          </SheetDescription>
        </div>
      </SheetHeader>
      {control.type === "toggles" ? (
        // Fills the pane itself: its picker and chip list each scroll.
        <div className="flex min-h-0 flex-1 flex-col p-6">
          <TogglesControlBody control={control} onChange={onChange} />
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="grid grid-cols-1 gap-4 p-6">
            <SingleControlBody
              control={control}
              groupScenes={groupScenes}
              onChange={onChange}
            />
          </div>
        </ScrollArea>
      )}
      <SheetFooter className="mt-0 border-t border-border">
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                className="text-(--destructive-text) hover:text-(--destructive-text)"
              />
            }
          >
            <Trash2 size={15} />
            Remove control
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove control?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes “{display.name}” from this widget. The room, zone,
                or light itself isn't affected.
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
      </SheetFooter>
    </>
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
        <div className="grid grid-cols-1 gap-3">
          <span className="min-w-0">
            <span className="block text-sm font-medium">Scenes</span>
            <span className="block text-xs text-muted-foreground">
              {groupScenes.length === 0
                ? "No scenes saved for this space yet."
                : "Tap scenes to add them as quick buttons."}
            </span>
          </span>
          {groupScenes.length > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-2">
              {groupScenes.map((scene) => (
                <SelectableSceneCard
                  key={scene.id}
                  scene={scene}
                  selected={control.sceneIds.includes(scene.id)}
                  disabled={false}
                  fullWidth
                  onToggle={() => toggleScene(scene.id)}
                />
              ))}
            </div>
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
    <div className="grid grid-cols-1 gap-2 rounded-lg border border-border/60 bg-card p-2.5">
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

  // The picker takes the room it needs at the top; the chips already on the
  // card sit below it, so adding one never pushes the list down.
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <p className="shrink-0 text-xs text-muted-foreground">
        Tap a room, zone, or light to add it as a chip. Each chip can power its
        target on/off or launch a scene.
      </p>
      <div className="relative shrink-0">
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

      {/* The picker and the chips share what's left below the search: the
          chips take their own height up to half, the picker the rest. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <ScrollArea
          fade
          className="min-h-0 flex-1 basis-0"
          viewportClassName="pr-2"
        >
          {empty ? (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">
              {term ? `Nothing matches “${query.trim()}”.` : "No devices yet."}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-1">
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

        <div className="flex max-h-1/2 min-h-0 shrink-0 flex-col gap-2 border-t border-border pt-4">
          <TargetGroupLabel>
            On this card
            {targets.length > 0 ? (
              <span className="ml-1.5 font-normal tabular-nums">
                {targets.length}
              </span>
            ) : null}
          </TargetGroupLabel>
          {targets.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-3 py-5 text-center text-xs text-muted-foreground">
              Nothing yet. Pick rooms, zones, or lights above to add them here.
            </p>
          ) : (
            <ScrollArea
              fade
              className="min-h-0 flex-initial"
              viewportClassName="pr-2"
            >
              <div className="grid grid-cols-1 gap-2">
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
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
};

/** The room, zone, or light picker for a new control, in a side pane. */
const AddControlSheet = ({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (control: WidgetControl) => void;
}) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="left" className="gap-0 data-[side=left]:sm:max-w-md">
      <SheetHeader className="border-b border-border pr-14">
        <SheetTitle>Add control</SheetTitle>
        <SheetDescription className="text-xs">
          Choose a room, zone, or light for this widget.
        </SheetDescription>
      </SheetHeader>
      <div className="flex min-h-0 flex-1 flex-col p-6">
        <ControlPicker onSelect={onSelect} />
      </div>
    </SheetContent>
  </Sheet>
);

/**
 * The add and edit panes for a widget's controls, and the state that opens
 * them. Shared by the controls list and the wizard's clickable preview.
 */
export const useControlEditor = ({
  controls,
  onChange,
  appearance,
}: {
  controls: WidgetControl[];
  onChange: (next: WidgetControl[]) => void;
  appearance?: ControlPreviewAppearance;
}) => {
  const scenes = useHueResourcesStore((state) => state.scenes);
  const [adding, setAdding] = useState(false);
  // The control open in the edit sheet. A new toggles card opens straight into
  // it so its target picker is visible.
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = controls.find((control) => control.id === editingId) ?? null;

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
    setEditingId(control.id);
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

  const sheets = (
    <>
      <AddControlSheet
        open={adding}
        onOpenChange={setAdding}
        onSelect={addControl}
      />
      <ControlSheet
        control={editing}
        appearance={appearance}
        groupScenes={
          editing == null ||
          editing.type === "toggles" ||
          editing.target.kind === "light"
            ? []
            : scenes.filter((scene) => scene.group === editing.target.id)
        }
        onOpenChange={(open) => {
          if (!open) setEditingId(null);
        }}
        onDelete={() => {
          if (editing) remove(editing.id);
          setEditingId(null);
        }}
        onChange={updateControl}
      />
    </>
  );

  return {
    editingId,
    startAdding: () => setAdding(true),
    addTogglesCard,
    edit: setEditingId,
    sheets,
  };
};

export const ManageControls = ({
  controls,
  onClose,
  onChange,
  onProRequired,
  appearance,
}: {
  controls: WidgetControl[];
  /** The widget's look, for the preview beside the edit pane. */
  appearance?: ControlPreviewAppearance;
  onClose?: () => void;
  onChange: (next: WidgetControl[]) => void;
  /**
   * Set on Free, which holds one single-target control. Adding a second card, or
   * a toggles card at all, calls this instead.
   */
  onProRequired?: () => void;
}) => {
  const editor = useControlEditor({ controls, onChange, appearance });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

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
    <section className="grid grid-cols-1 gap-4">
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
        <h2 className="text-base font-semibold text-foreground">Controls</h2>
        {controls.length > 0 ? (
          <span className="text-sm text-muted-foreground tabular-nums">
            {controls.length}
          </span>
        ) : null}
        {controls.length > 1 ? (
          <span className="ml-auto text-xs text-muted-foreground">
            Drag to reorder
          </span>
        ) : null}
      </div>

      {/* One panel: its add actions along the top right, then the list. */}
      <div className="grid grid-cols-1 rounded-2xl bg-(--settings-surface)">
        <div className="flex flex-wrap items-center justify-end gap-1 border-b border-border px-2 py-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={controlNeedsPro ? onProRequired : editor.startAdding}
          >
            <Plus size={16} />
            Add control
            {controls.length > 0 ? <ProTag /> : null}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={togglesNeedPro ? onProRequired : editor.addTogglesCard}
          >
            <ToggleRight size={16} />
            Add toggles
            <ProTag />
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-1.5 p-2">
          {controls.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No controls yet. Add a room, zone, or light, or a toggles card.
            </p>
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
                {controls.map((control) => (
                  <ControlRow
                    key={control.id}
                    control={control}
                    onEdit={() => editor.edit(control.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      {editor.sheets}
    </section>
  );
};
