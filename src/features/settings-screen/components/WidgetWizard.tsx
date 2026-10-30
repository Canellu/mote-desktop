import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEntitlements } from "@/context/EntitlementContext";
import { getRoomZoneIcon } from "@/features/home-screen/components/room-zone-icons";
import { useProUpgrade } from "@/features/pro/proUpgrade";
import { ControlCard } from "@/features/widget-screen/components/ControlCard";
import {
  COLLAPSE_TRANSITION,
  CollapsedWidget,
} from "@/features/widget-screen/WidgetScreen";
import { motion, useReducedMotion } from "motion/react";
import { useControlEditor } from "@/features/widget-screen/components/ManageControls";
import {
  isTogglesControl,
  newControlId,
  type SingleWidgetControl,
  type WidgetControl,
  type WidgetBackgroundMode,
  type WidgetCollapseMode,
  type WidgetMascotStyle,
  type WidgetExpandHorizontal,
  type WidgetExpandVertical,
  type WidgetCornerMode,
  type WidgetSizeMode,
  type WidgetThemeMode,
} from "@/features/widget-screen/types";
import {
  AUTO_COLLAPSE_SECONDS,
  DEFAULT_TILE_OPACITY,
  WIDGET_SCALE,
} from "@/features/widget-screen/useWidgets";
import {
  WIDGET_SIDE_PADDING,
  WIDGET_SIZE_METRICS,
  resolveWidgetTheme,
  widgetCardGridColumns,
  widgetShellStyle,
} from "@/features/widget-screen/widgetShell";
import { useBlinkLights } from "@/hooks/useBlinkLights";
import { selectableVariants } from "@/lib/selection-styles";
import { cn } from "@/lib/utils";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import type { HueLight, HueRoomZone } from "@/types/hue";
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
  Info,
  Lightbulb,
  ChevronLeft,
  Minimize2,
  Search,
  Spotlight,
} from "lucide-react";
import { useBlocker } from "@tanstack/react-router";
import type React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AutoCollapseSetting } from "./AutoCollapseSetting";
import { OpenDirectionRing } from "./OpenDirectionRing";
import { ProTag } from "./ProTag";
import { WIDGET_CORNER_OPTIONS } from "./widgetCornerOptions";
import { SegmentedControl } from "./SegmentedControl";
import { MascotStylePicker } from "./MascotStylePicker";
import { SettingsReveal, SettingsRow, SettingsSection } from "./SettingsList";
import {
  WIDGET_BACKGROUND_OPTIONS,
  WIDGET_COLLAPSE_OPTIONS,
  WIDGET_THEME_OPTIONS,
} from "./widgetAppearanceOptions";
import {
  SettingsWizardLayout,
  SettingsWizardViewport,
} from "./SettingsWizardLayout";

const steps = ["Name", "Controls", "Configure", "Appearance"];

// Suggested widget names shown as the input placeholder. One is picked at random
// when the wizard mounts so the field reads as an editable example rather than a
// fixed label — keeping it a curated local list avoids pulling in a generator dep.
const SUGGESTED_NAMES = [
  "Focus Mode",
  "Evening Wind-Down",
  "Movie Night",
  "Morning Routine",
  "Reading Nook",
  "Studio Session",
  "Cozy Hideaway",
  "Late-Night Glow",
  "Weekend Vibes",
  "Sunset Lounge",
  "Golden Hour",
  "Game Night",
];

const randomSuggestedName = () =>
  SUGGESTED_NAMES[Math.floor(Math.random() * SUGGESTED_NAMES.length)];
// Dev-only placeholder targets so the Control screen has something to
// select when no bridge is connected (e.g. the VITE_DEV_VIEWS preview). Never
// surfaced in production builds — a real empty wizard shows no fake targets.
const makeDummyRoomZone = (
  id: string,
  name: string,
  klass: string,
  resourceType: "room" | "zone",
  lightCount: number,
): HueRoomZone =>
  ({
    id,
    name,
    class: klass,
    resourceType,
    anyOn: false,
    allOn: false,
    brightness: 60,
    lightCount,
    lightIds: [],
    deviceIds: [],
    groupedLightId: null,
    accessories: [],
  }) as HueRoomZone;

const makeDummyLight = (
  id: string,
  name: string,
  productName: string,
  reachable: boolean,
): HueLight => ({
  id,
  deviceId: null,
  deviceName: null,
  name,
  isOn: false,
  brightness: 70,
  reachable,
  colorMode: null,
  xy: null,
  ct: null,
  effect: null,
  effects: [],
  effectV2: null,
  effectsV2: [],
  supportsColor: true,
  supportsCt: true,
  ctMin: null,
  ctMax: null,
  gamut: null,
  modelId: null,
  productName,
  typeName: null,
  swVersion: null,
  uniqueId: null,
  function: "functional",
  powerup: null,
});

const DUMMY_ROOM_ZONES: HueRoomZone[] = [
  makeDummyRoomZone("dummy-living", "Living Room", "living_room", "room", 4),
  makeDummyRoomZone("dummy-bedroom", "Bedroom", "bedroom", "room", 2),
  makeDummyRoomZone("dummy-kitchen", "Kitchen", "kitchen", "room", 3),
  makeDummyRoomZone("dummy-ground", "Ground Floor", "downstairs", "zone", 9),
];

const DUMMY_LIGHTS: HueLight[] = [
  makeDummyLight("dummy-desk", "Desk Lamp", "Hue Go", true),
  makeDummyLight("dummy-sofa", "Sofa Strip", "Hue Lightstrip Plus", true),
  makeDummyLight("dummy-hall", "Hallway Spot", "Hue White Ambiance", false),
  makeDummyLight("dummy-ceiling", "Ceiling Light", "Hue White Ambiance", true),
  makeDummyLight("dummy-floor", "Floor Lamp", "Hue Signe Floor", true),
  makeDummyLight("dummy-night", "Nightstand", "Hue Go", true),
  makeDummyLight("dummy-mirror", "Mirror Light", "Hue White Ambiance", true),
  makeDummyLight("dummy-tv", "TV Backlight", "Hue Play", true),
  makeDummyLight(
    "dummy-bookshelf",
    "Bookshelf Strip",
    "Hue Lightstrip Plus",
    true,
  ),
  makeDummyLight("dummy-entry", "Entryway Spot", "Hue White Ambiance", false),
  makeDummyLight("dummy-counter", "Counter Strip", "Hue Lightstrip Plus", true),
  makeDummyLight(
    "dummy-pendant",
    "Kitchen Pendant",
    "Hue White Ambiance",
    true,
  ),
  makeDummyLight("dummy-reading", "Reading Lamp", "Hue White Ambiance", true),
  makeDummyLight("dummy-corner", "Corner Lamp", "Hue Signe Table", true),
  makeDummyLight("dummy-bath", "Bathroom Light", "Hue White Ambiance", true),
  makeDummyLight("dummy-vanity", "Vanity Light", "Hue White Ambiance", false),
  makeDummyLight("dummy-closet", "Closet Light", "Hue White", true),
  makeDummyLight("dummy-stair", "Stairway Light", "Hue White Ambiance", true),
  makeDummyLight("dummy-porch", "Porch Light", "Hue White", false),
  makeDummyLight("dummy-garage", "Garage Light", "Hue White", true),
  makeDummyLight("dummy-patio", "Patio Strip", "Hue Lightstrip Outdoor", true),
  makeDummyLight("dummy-garden", "Garden Spot", "Hue Lily", true),
  makeDummyLight("dummy-office", "Office Lamp", "Hue Go", true),
  makeDummyLight("dummy-accent", "Accent Light", "Hue Iris", true),
  makeDummyLight("dummy-dining", "Dining Pendant", "Hue White Ambiance", true),
];

interface WidgetWizardProps {
  onCreate: (options: {
    title: string;
    controls: WidgetControl[];
    themeMode: WidgetThemeMode;
    sizeMode: WidgetSizeMode;
    cornerMode: WidgetCornerMode;
    backgroundMode: WidgetBackgroundMode;
    tileOpacity: number;
    scale: number;
    collapseMode: WidgetCollapseMode;
    mascotStyle: WidgetMascotStyle;
    expandVertical: WidgetExpandVertical;
    expandHorizontal: WidgetExpandHorizontal;
    autoCollapseSeconds: number;
  }) => void;
  /** Step to mount on. Dev-only: lets the dev toolbar preview a single screen. */
  initialStep?: number;
}

const targetKey = (kind: "room" | "zone" | "light", id: string) =>
  `${kind}:${id}`;

export const WidgetWizard = ({
  onCreate,
  initialStep = 0,
}: WidgetWizardProps) => {
  const roomZones = useHueResourcesStore((state) => state.roomZones);
  const lights = useHueResourcesStore((state) => state.lights);
  // Free builds one widget with one room, zone, or light, at the system theme.
  // Choosing past that offers Pro; `open-widget-window` enforces the same.
  const { hasPro } = useEntitlements();
  const { requestPro } = useProUpgrade();
  const upgrade = () => requestPro("advanced_widgets");
  const [step, setStep] = useState(initialStep);
  const [title, setTitle] = useState("");
  const [namePlaceholder] = useState(randomSuggestedName);
  const [selected, setSelected] = useState<string[]>([]);
  // Picks shown as a chip on the shared toggles card rather than as a card of
  // their own. Always a subset of `selected`.
  const [chipKeys, setChipKeys] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [spacesOpen, setSpacesOpen] = useState(true);
  const [lightsOpen, setLightsOpen] = useState(true);
  const [themeMode, setThemeMode] = useState<WidgetThemeMode>("system");
  const [cornerMode, setCornerMode] = useState<WidgetCornerMode>("rounded");
  // The card metrics stay at their standard size; the scale draws the whole
  // widget larger or smaller.
  const sizeMode: WidgetSizeMode = "default";
  const [widgetScale, setWidgetScale] = useState<number>(WIDGET_SCALE.default);
  const [backgroundMode, setBackgroundMode] =
    useState<WidgetBackgroundMode>("solid");
  const [tileOpacity, setTileOpacity] = useState(DEFAULT_TILE_OPACITY);
  const [collapseMode, setCollapseMode] =
    useState<WidgetCollapseMode>("mascot");
  const [mascotStyle, setMascotStyle] =
    useState<WidgetMascotStyle>("celShaded");
  const [expandVertical, setExpandVertical] =
    useState<WidgetExpandVertical>("up");
  const [expandHorizontal, setExpandHorizontal] =
    useState<WidgetExpandHorizontal>("right");
  const [autoCollapseSeconds, setAutoCollapseSeconds] = useState<number>(
    AUTO_COLLAPSE_SECONDS.off,
  );
  const [maxUnlockedStep, setMaxUnlockedStep] = useState(initialStep);
  // Editable list of controls, seeded from the Controls step. Held as state
  // (not derived) so it can be reordered and configured per-control. Each pick
  // is either its own card or a chip on the one toggles card.
  const [controls, setControls] = useState<WidgetControl[]>([]);
  const { blinkingKeys: blinkingTargets, blink } = useBlinkLights();

  // Fall back to placeholder targets in dev when the store is empty (no bridge),
  // so the selection UI is never blank to design against. Production keeps the
  // real lists, even when empty.
  const roomZoneOptions =
    roomZones.length === 0 && import.meta.env.DEV
      ? DUMMY_ROOM_ZONES
      : roomZones;
  const lightOptions =
    lights.length === 0 && import.meta.env.DEV ? DUMMY_LIGHTS : lights;

  const normalizedQuery = query.trim().toLowerCase();
  const matchesQuery = (...fields: Array<string | null>) =>
    normalizedQuery.length === 0 ||
    fields.some((field) => field?.toLowerCase().includes(normalizedQuery));

  const filteredRoomZones = roomZoneOptions.filter((target) =>
    matchesQuery(target.name),
  );
  const filteredLights = lightOptions.filter((light) =>
    matchesQuery(light.name, light.productName),
  );

  const roomZoneKeys = filteredRoomZones.map((target) =>
    targetKey(target.resourceType, target.id),
  );
  const lightKeys = filteredLights.map((light) => targetKey("light", light.id));
  const roomZonesAllSelected =
    roomZoneKeys.length > 0 &&
    roomZoneKeys.every((key) => selected.includes(key));
  const lightsAllSelected =
    lightKeys.length > 0 && lightKeys.every((key) => selected.includes(key));

  const setKeysSelected = (keys: string[], select: boolean) =>
    setSelected((current) =>
      select
        ? Array.from(new Set([...current, ...keys]))
        : current.filter((key) => !keys.includes(key)),
    );

  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const previewTheme = resolveWidgetTheme(themeMode, systemDark);

  // Reconcile the editable list with the Controls step: a card for each pick
  // shown as a card, and one toggles card holding every pick shown as a chip.
  // Kept cards and chips keep their order and configuration, so going Back to
  // tweak the selection never wipes what was set up.
  useEffect(() => {
    setControls((current) => {
      const chipSet = new Set(chipKeys);
      const cardKeys = new Set(selected.filter((key) => !chipSet.has(key)));
      const chips = selected.filter((key) => chipSet.has(key));

      const kept = current.filter((control) =>
        isTogglesControl(control)
          ? chips.length > 0
          : cardKeys.has(targetKey(control.target.kind, control.target.id)),
      );
      const keptKeys = new Set(
        kept
          .filter(
            (control): control is SingleWidgetControl =>
              !isTogglesControl(control),
          )
          .map((control) => targetKey(control.target.kind, control.target.id)),
      );

      const additions: WidgetControl[] = [];
      for (const target of roomZoneOptions) {
        const key = targetKey(target.resourceType, target.id);
        if (!cardKeys.has(key) || keptKeys.has(key)) continue;
        additions.push({
          id: newControlId(),
          target: { kind: target.resourceType, id: target.id },
          label: null,
          showBrightness: target.groupedLightId != null,
          sceneIds: [],
          compact: false,
          hotkey: null,
        });
      }
      for (const target of lightOptions) {
        const key = targetKey("light", target.id);
        if (!cardKeys.has(key) || keptKeys.has(key)) continue;
        additions.push({
          id: newControlId(),
          target: { kind: "light", id: target.id },
          label: null,
          showBrightness: target.brightness != null,
          sceneIds: [],
          compact: false,
          hotkey: null,
        });
      }

      // The toggles card's chips follow the selection order; a chip already
      // on it keeps its action and scene.
      const toggles = kept.find(isTogglesControl);
      let next = kept;
      if (chips.length > 0) {
        const existing = new Map(
          (toggles?.targets ?? []).map(
            (target) => [targetKey(target.kind, target.id), target] as const,
          ),
        );
        const targets = chips.map((key) => {
          const [kind, id] = key.split(":") as [
            "room" | "zone" | "light",
            string,
          ];
          return existing.get(key) ?? { kind, id };
        });
        const same =
          toggles != null &&
          toggles.targets.length === targets.length &&
          toggles.targets.every((target, index) => target === targets[index]);
        if (toggles == null) {
          additions.push({
            id: newControlId(),
            type: "toggles",
            targets,
            label: null,
            hotkey: null,
          });
        } else if (!same) {
          next = kept.map((control) =>
            control === toggles ? { ...toggles, targets } : control,
          );
        }
      }

      // Nothing added, removed or changed: same reference (no churn).
      if (
        additions.length === 0 &&
        next === kept &&
        kept.length === current.length
      ) {
        return current;
      }
      return [...next, ...additions];
    });
  }, [selected, chipKeys, roomZoneOptions, lightOptions]);

  // Shows a pick as a chip on the toggles card, or back as its own card.
  // Toggles are Pro.
  const setPickAsChip = (key: string, chip: boolean) => {
    if (chip && !hasPro) {
      upgrade();
      return;
    }
    setChipKeys((current) =>
      chip
        ? Array.from(new Set([...current, key]))
        : current.filter((value) => value !== key),
    );
  };

  const reorderControls = (from: number, to: number) =>
    setControls((current) => arrayMove(current, from, to));

  // Controls added or removed while configuring update the step 2 selection,
  // so going back shows them and the selection sync keeps them.
  const changeControls = (next: WidgetControl[]) => {
    setControls(next);
    const chips = next
      .filter(isTogglesControl)
      .flatMap((control) => control.targets)
      .map((target) => targetKey(target.kind, target.id));
    const cards = next
      .filter(
        (control): control is SingleWidgetControl => !isTogglesControl(control),
      )
      .map((control) => targetKey(control.target.kind, control.target.id));
    setChipKeys(chips);
    setSelected(Array.from(new Set([...cards, ...chips])));
  };
  const controlEditor = useControlEditor({
    controls,
    onChange: changeControls,
    appearance: { themeMode, sizeMode, cornerMode },
  });

  const canContinue =
    (step === 0 && title.trim().length > 0) ||
    (step === 1 && selected.length > 0) ||
    step >= 2;

  // On Free, choosing a target replaces the one already chosen.
  const toggleTarget = (key: string) =>
    setSelected((current) =>
      current.includes(key)
        ? current.filter((value) => value !== key)
        : hasPro
          ? [...current, key]
          : [key],
    );

  // Placeholder dev targets aren't in the store; the hook drops unknown ids,
  // so blinking them is a safe no-op.
  const flashRoomZone = (roomZone: HueRoomZone) =>
    void blink(
      targetKey(roomZone.resourceType, roomZone.id),
      roomZone.lightIds,
    );

  const flashLight = (light: HueLight) =>
    void blink(targetKey("light", light.id), [light.id]);

  // Back (mouse button, Alt+Left, the header arrow) steps back through the
  // wizard first; leaving with anything entered asks before throwing it away.
  const dirty = title.trim().length > 0 || selected.length > 0;
  const allowExit = useRef(false);
  const internalBack = useRef(false);
  const leaveBlocker = useBlocker({
    shouldBlockFn: ({ action }) => {
      if (allowExit.current) return false;
      if (action === "BACK" && step > 0) {
        internalBack.current = true;
        setStep((current) => Math.max(0, current - 1));
        return true;
      }
      // Forward is handled by the listener below; a history forward that
      // slips through mustn't leave the wizard.
      if (action === "FORWARD") {
        internalBack.current = true;
        return true;
      }
      return dirty;
    },
    enableBeforeUnload: dirty,
    withResolver: true,
  });
  useEffect(() => {
    if (leaveBlocker.status === "blocked" && internalBack.current) {
      internalBack.current = false;
      leaveBlocker.reset();
    }
  }, [leaveBlocker]);

  // Back steps are blocked rather than taken, so history has no forward entry
  // to return to. Forward (mouse button, Alt+Right) is caught here instead and
  // retraces steps already visited.
  useEffect(() => {
    const forward = () =>
      setStep((current) => Math.min(current + 1, maxUnlockedStep));
    const onMouseUp = (event: MouseEvent) => {
      if (event.button !== 4) return;
      event.preventDefault();
      forward();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "BrowserForward" ||
        (event.altKey && event.key === "ArrowRight")
      ) {
        event.preventDefault();
        forward();
      }
    };
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [maxUnlockedStep]);

  const create = () => {
    allowExit.current = true;
    onCreate({
      title: title.trim(),
      controls,
      themeMode,
      sizeMode,
      cornerMode,
      backgroundMode,
      tileOpacity,
      scale: widgetScale,
      collapseMode,
      mascotStyle,
      expandVertical,
      expandHorizontal,
      autoCollapseSeconds,
    });
  };

  const nextStep = () => {
    if (!canContinue) return;
    setStep((current) => {
      const next = Math.min(steps.length - 1, current + 1);
      setMaxUnlockedStep((unlocked) => Math.max(unlocked, next));
      return next;
    });
  };

  return (
    // Full bleed, so the step scroll areas reach the window edge; the page
    // gutter moves onto the content instead.
    <SettingsWizardLayout
      className="max-w-none py-(--page-gutter-y) [&>footer]:px-(--page-gutter-x) [&>header]:px-(--page-gutter-x)"
      steps={steps}
      step={step}
      maxUnlockedStep={maxUnlockedStep}
      onStepChange={setStep}
      canContinue={canContinue}
      onContinue={nextStep}
      finalAction={{
        label: "Create Widget",
        disabled: !title.trim() || controls.length === 0,
        onClick: create,
      }}
    >
      <SettingsWizardViewport
        stepKey={step}
        contained={step !== 0}
        centerPage={false}
      >
        {step === 0 ? (
          <section className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-(--page-gutter-x) py-4">
            <div className="space-y-3">
              <h1 className="font-heading text-3xl font-semibold">
                Name your widget
              </h1>
              <p className="text-base text-pretty text-muted-foreground">
                Give this widget a unique name so you can easily identify and
                manage it in the application.
              </p>
            </div>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canContinue) nextStep();
              }}
              placeholder={namePlaceholder}
              autoFocus
              size="xl"
              className="rounded-2xl border-foreground/15 bg-input/50 text-left text-lg"
            />
          </section>
        ) : null}

        {step === 1 ? (
          // One scroll for the whole step: the intro scrolls away, the search
          // sticks at the top, and each section header sticks just below it.
          <ScrollArea fade="bottom" className="min-h-0 flex-1 overflow-hidden">
            <div className="mx-auto max-w-2xl px-(--page-gutter-x) pb-1">
              <div className="space-y-3 pt-4 pb-6">
                <h1 className="font-heading text-3xl font-semibold">
                  Select Controls
                </h1>
                <p className="text-base text-pretty text-muted-foreground">
                  {hasPro
                    ? "Choose the rooms, zones, or lights for this widget, and whether each shows as a card or a toggle."
                    : "Choose the room, zone, or light this widget controls."}
                </p>
                {hasPro ? null : (
                  <p className="text-sm text-muted-foreground">
                    Free widgets hold one.{" "}
                    <button
                      type="button"
                      onClick={upgrade}
                      className="font-medium text-primary transition-opacity hover:opacity-70"
                    >
                      Mote Pro
                    </button>{" "}
                    combines several.
                  </p>
                )}
                <ShowAsGuide pro={hasPro} />
              </div>

              <div className="sticky top-0 z-20 bg-background pt-2 pb-4">
                <div className="relative">
                  <Search
                    size={18}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search rooms, zones, or lights"
                    size="xl"
                    className="rounded-2xl border-foreground/15 bg-input/50 pl-12 text-left"
                  />
                </div>
              </div>

              {roomZoneOptions.length === 0 && lightOptions.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  No rooms or lights are available yet.
                </p>
              ) : (
                <div className="space-y-6">
                  {roomZoneOptions.length > 0 ? (
                    <TargetSection
                      title="Rooms & Zones"
                      count={filteredRoomZones.length}
                      open={spacesOpen}
                      onToggleOpen={() => setSpacesOpen((open) => !open)}
                      allSelected={roomZonesAllSelected}
                      onSelectAll={
                        hasPro
                          ? () =>
                              setKeysSelected(
                                roomZoneKeys,
                                !roomZonesAllSelected,
                              )
                          : undefined
                      }
                    >
                      {filteredRoomZones.length > 0 ? (
                        filteredRoomZones.map((target) => (
                          <TargetRow
                            key={target.id}
                            asChip={chipKeys.includes(
                              targetKey(target.resourceType, target.id),
                            )}
                            onAsChipChange={(chip) =>
                              setPickAsChip(
                                targetKey(target.resourceType, target.id),
                                chip,
                              )
                            }
                            checked={selected.includes(
                              targetKey(target.resourceType, target.id),
                            )}
                            blinking={blinkingTargets.has(
                              targetKey(target.resourceType, target.id),
                            )}
                            icon={(() => {
                              const Icon = getRoomZoneIcon(target.class);
                              return <Icon size={18} />;
                            })()}
                            title={target.name}
                            meta={`${target.resourceType} · ${target.lightCount} light${target.lightCount === 1 ? "" : "s"}`}
                            onToggle={() => {
                              const key = targetKey(
                                target.resourceType,
                                target.id,
                              );
                              // Blink what was just selected so the user can
                              // confirm it's the right space in the room.
                              if (!selected.includes(key)) {
                                flashRoomZone(target);
                              }
                              toggleTarget(key);
                            }}
                            onFlash={() => flashRoomZone(target)}
                          />
                        ))
                      ) : (
                        <EmptyRow />
                      )}
                    </TargetSection>
                  ) : null}

                  {lightOptions.length > 0 ? (
                    <TargetSection
                      title="Individual Lights"
                      count={filteredLights.length}
                      open={lightsOpen}
                      onToggleOpen={() => setLightsOpen((open) => !open)}
                      allSelected={lightsAllSelected}
                      onSelectAll={
                        hasPro
                          ? () => setKeysSelected(lightKeys, !lightsAllSelected)
                          : undefined
                      }
                    >
                      {filteredLights.length > 0 ? (
                        filteredLights.map((light) => (
                          <TargetRow
                            key={light.id}
                            asChip={chipKeys.includes(
                              targetKey("light", light.id),
                            )}
                            onAsChipChange={(chip) =>
                              setPickAsChip(targetKey("light", light.id), chip)
                            }
                            checked={selected.includes(
                              targetKey("light", light.id),
                            )}
                            blinking={blinkingTargets.has(
                              targetKey("light", light.id),
                            )}
                            icon={<Lightbulb size={18} />}
                            title={light.name}
                            meta={[
                              light.productName,
                              light.reachable ? "Reachable" : "Offline",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                            onToggle={() => {
                              const key = targetKey("light", light.id);
                              if (!selected.includes(key)) flashLight(light);
                              toggleTarget(key);
                            }}
                            onFlash={() => flashLight(light)}
                          />
                        ))
                      ) : (
                        <EmptyRow />
                      )}
                    </TargetSection>
                  ) : null}
                </div>
              )}
            </div>
          </ScrollArea>
        ) : null}

        {step === 2 ? (
          <ScrollArea fade className="min-h-0 flex-1 overflow-hidden">
            <section className="mx-auto max-w-2xl space-y-6 px-(--page-gutter-x) py-4 pb-6">
              <div className="space-y-2">
                <h1 className="font-heading text-3xl font-semibold">
                  Configure
                </h1>
                <p className="text-base text-pretty text-muted-foreground">
                  Click a card in the preview to choose its scenes or what each
                  toggle does, or drag it to change the order.
                </p>
              </div>

              {/* The preview is the list: clicking a card opens its editor. */}
              <div className="grid gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-foreground">
                    Preview
                  </h2>
                  {/* Picking happens on the Controls step; this step only
                      shapes what was picked. */}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="ml-auto"
                    onClick={() => setStep(1)}
                  >
                    <ChevronLeft size={16} />
                    Change controls
                  </Button>
                </div>
                <WidgetPreview
                  theme={previewTheme}
                  sizeMode={sizeMode}
                  cornerMode={cornerMode}
                  controls={controls}
                  onReorder={reorderControls}
                  onEdit={controlEditor.edit}
                />
              </div>

              <p className="flex items-center justify-center gap-1.5 pt-2 text-xs text-(--info-text)">
                <Info size={14} />
                All settings can be changed after the widget is created.
              </p>
            </section>
          </ScrollArea>
        ) : null}

        {step === 3 ? (
          <ScrollArea fade="bottom" className="min-h-0 flex-1 overflow-hidden">
            <section className="mx-auto max-w-2xl space-y-6 px-(--page-gutter-x) py-4 pb-6">
              <div className="space-y-2">
                <h1 className="font-heading text-3xl font-semibold">
                  Appearance
                </h1>
                <p className="text-base text-pretty text-muted-foreground">
                  Choose how the widget looks on your desktop.
                </p>
              </div>

              {/* Kept short and pinned, so the options scroll under it while
                  the preview follows each change. */}
              <div className="sticky top-0 z-20 grid gap-3 bg-background pt-2 pb-4 after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-6 after:bg-linear-to-b after:from-background after:to-transparent">
                <h2 className="text-base font-semibold text-foreground">
                  Preview
                </h2>
                <WidgetPreview
                  theme={previewTheme}
                  sizeMode={sizeMode}
                  cornerMode={cornerMode}
                  controls={controls}
                  onReorder={reorderControls}
                  maxHeight={280}
                  widgetScale={widgetScale}
                  backgroundMode={backgroundMode}
                  tileOpacity={tileOpacity}
                  fold={{
                    title: title.trim() || "Lights",
                    collapseMode,
                    mascotStyle,
                  }}
                />
              </div>

              <SettingsSection title="Style">
                <SettingsRow
                  title={<ProLabel>Theme</ProLabel>}
                  description="Light or dark, or follow Windows."
                >
                  <SegmentedControl
                    value={themeMode}
                    onValueChange={(value) =>
                      value !== "system" && !hasPro
                        ? upgrade()
                        : setThemeMode(value)
                    }
                    ariaLabel="Widget theme"
                    options={WIDGET_THEME_OPTIONS}
                    layoutId="wizard-theme-pill"
                  />
                </SettingsRow>
                <div className="grid gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        <ProLabel>Widget size</ProLabel>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        How large the whole widget is drawn on your desktop.
                      </p>
                    </div>
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {widgetScale}%
                    </span>
                  </div>
                  <Slider
                    aria-label="Widget size"
                    min={WIDGET_SCALE.min}
                    max={WIDGET_SCALE.max}
                    step={WIDGET_SCALE.step}
                    value={[widgetScale]}
                    onValueChange={(next) =>
                      setWidgetScale(Array.isArray(next) ? next[0] : next)
                    }
                    onValueCommitted={(next) => {
                      const value = Array.isArray(next) ? next[0] : next;
                      // Free stays at 100%; offer Pro and put it back.
                      if (value !== WIDGET_SCALE.default && !hasPro) {
                        setWidgetScale(WIDGET_SCALE.default);
                        upgrade();
                      }
                    }}
                  />
                </div>
                <SettingsRow
                  title={<ProLabel>Corners</ProLabel>}
                  description="Round the widget and its cards more or less."
                >
                  <SegmentedControl
                    value={cornerMode}
                    onValueChange={(value) =>
                      value !== "rounded" && !hasPro
                        ? upgrade()
                        : setCornerMode(value)
                    }
                    ariaLabel="Widget corners"
                    options={WIDGET_CORNER_OPTIONS}
                    layoutId="wizard-corner-pill"
                  />
                </SettingsRow>
                <div className="grid min-w-0">
                  <SettingsRow
                    title={<ProLabel>Tile background</ProLabel>}
                    description="Let the desktop show through the tiles."
                  >
                    <SegmentedControl
                      value={backgroundMode}
                      onValueChange={(value) =>
                        value !== "solid" && !hasPro
                          ? upgrade()
                          : setBackgroundMode(value)
                      }
                      ariaLabel="Widget tile background"
                      options={WIDGET_BACKGROUND_OPTIONS}
                      layoutId="wizard-background-pill"
                    />
                  </SettingsRow>
                  <SettingsReveal open={backgroundMode === "translucent"}>
                    <div className="grid gap-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">Tile opacity</p>
                        <span className="text-sm tabular-nums text-muted-foreground">
                          {tileOpacity}%
                        </span>
                      </div>
                      <Slider
                        aria-label="Tile opacity"
                        min={10}
                        max={90}
                        step={5}
                        value={[tileOpacity]}
                        onValueChange={(next) =>
                          setTileOpacity(Array.isArray(next) ? next[0] : next)
                        }
                      />
                    </div>
                  </SettingsReveal>
                </div>
                <div className="grid min-w-0">
                  <SettingsRow
                    title="Collapsed look"
                    description="What the widget folds into when you collapse it."
                  >
                    <SegmentedControl
                      value={collapseMode}
                      onValueChange={setCollapseMode}
                      ariaLabel="Collapsed widget look"
                      options={WIDGET_COLLAPSE_OPTIONS}
                      layoutId="wizard-collapse-pill"
                    />
                  </SettingsRow>
                  <SettingsReveal open={collapseMode === "mascot"}>
                    <SettingsRow
                      title="Mascot style"
                      description="How the moth is drawn while the widget is collapsed."
                    >
                      <MascotStylePicker
                        value={mascotStyle}
                        onValueChange={setMascotStyle}
                      />
                    </SettingsRow>
                  </SettingsReveal>
                </div>
                <SettingsRow
                  title="Expand direction"
                  description="The corner the widget prefers to expand toward. If there isn't room that way, it expands the other way."
                >
                  <OpenDirectionRing
                    vertical={expandVertical}
                    horizontal={expandHorizontal}
                    onChange={(vertical, horizontal) => {
                      setExpandVertical(vertical);
                      setExpandHorizontal(horizontal);
                    }}
                  />
                </SettingsRow>
                <AutoCollapseSetting
                  seconds={autoCollapseSeconds}
                  onChange={setAutoCollapseSeconds}
                />
              </SettingsSection>

              <p className="flex items-center justify-center gap-1.5 pt-2 text-xs text-(--info-text)">
                <Info size={14} />
                All settings can be changed after the widget is created.
              </p>
            </section>
          </ScrollArea>
        ) : null}
      </SettingsWizardViewport>
      {controlEditor.sheets}
      <AlertDialog
        open={leaveBlocker.status === "blocked" && !internalBack.current}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this widget?</AlertDialogTitle>
            <AlertDialogDescription>
              The widget hasn't been created yet, so its name and controls will
              be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() =>
                leaveBlocker.status === "blocked" && leaveBlocker.reset()
              }
            >
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                allowExit.current = true;
                if (leaveBlocker.status === "blocked") leaveBlocker.proceed();
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsWizardLayout>
  );
};

const TargetSection = ({
  title,
  count,
  open,
  onToggleOpen,
  allSelected,
  onSelectAll,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggleOpen: () => void;
  allSelected: boolean;
  /** Absent on Free, where a widget holds one target. */
  onSelectAll?: () => void;
  children: React.ReactNode;
}) => (
  <div>
    <div className="sticky top-18 z-10 flex items-center justify-between bg-background px-1 pb-2.5">
      <button
        type="button"
        onClick={onToggleOpen}
        className="group flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronDown
          size={16}
          className={cn(
            "transition-transform duration-200",
            !open && "-rotate-90",
          )}
        />
        <span>{title}</span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {count}
        </span>
      </button>
      {onSelectAll ? (
        <button
          type="button"
          onClick={onSelectAll}
          className="text-xs font-medium text-primary transition-opacity hover:opacity-70"
        >
          {allSelected ? "Clear all" : "Select all"}
        </button>
      ) : null}
    </div>
    {open ? (
      <div className="divide-y divide-foreground/10 overflow-hidden rounded-2xl border border-foreground/12 bg-input/40">
        {children}
      </div>
    ) : null}
  </div>
);

const EmptyRow = () => (
  <p className="px-4 py-6 text-center text-xs text-muted-foreground">
    No matches
  </p>
);

const TargetRow = ({
  checked,
  asChip,
  blinking,
  icon,
  title,
  meta,
  onToggle,
  onAsChipChange,
  onFlash,
}: {
  checked: boolean;
  /** Shown as a chip on the toggles card instead of its own card. */
  asChip: boolean;
  blinking: boolean;
  icon: React.ReactNode;
  title: string;
  meta: string;
  onToggle: () => void;
  onAsChipChange: (chip: boolean) => void;
  onFlash: () => void;
}) => (
  <div
    data-selected={checked ? "" : undefined}
    className={cn(
      "group flex items-center gap-2 px-4 py-2",
      selectableVariants({ treatment: "row" }),
    )}
  >
    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left">
      <Checkbox checked={checked} onCheckedChange={onToggle} />
      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-foreground/5 text-muted-foreground">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {meta}
        </span>
      </span>
    </label>
    {checked ? (
      <ShowAsSwitch
        title={title}
        asChip={asChip}
        onAsChipChange={onAsChipChange}
      />
    ) : null}
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Blink ${title}`}
              disabled={blinking}
              className={cn(
                "opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
                blinking && "opacity-100 disabled:opacity-100",
              )}
              onClick={onFlash}
            >
              <Spotlight
                size={15}
                className={cn(blinking && "animate-pulse")}
              />
            </Button>
          }
        />
        <TooltipContent side="bottom">
          {blinking ? `Blinking ${title}…` : `Blink ${title}`}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </div>
);

/** A sketch of a card: name, power switch, and brightness slider. */
const CardSketch = () => (
  <div className="grid w-24 gap-1.5 rounded-lg bg-current/10 p-2">
    <div className="flex items-center gap-1.5">
      <span className="size-3 rounded-sm bg-current/50" />
      <span className="h-1.5 w-8 rounded-full bg-current/50" />
      <span className="ml-auto flex h-3 w-5 items-center justify-end rounded-full bg-current/30 px-0.5">
        <span className="size-2 rounded-full bg-current" />
      </span>
    </div>
    <span className="relative h-1.5 rounded-full bg-current/25">
      <span className="absolute inset-y-0 left-0 w-2/3 rounded-full bg-current/60" />
    </span>
    <div className="flex gap-1">
      <span className="size-3 rounded-full bg-current/40" />
      <span className="size-3 rounded-full bg-current/40" />
    </div>
  </div>
);

/** A sketch of the toggles card: a row of chips, each one tap. */
const ChipsSketch = () => (
  <div className="flex w-24 gap-1 rounded-lg bg-current/10 p-1.5">
    {[0, 1, 2].map((index) => (
      <span
        key={index}
        className="grid flex-1 justify-items-center gap-1 rounded-md bg-current/15 py-2"
      >
        <span
          className={cn(
            "size-3 rounded-full",
            index === 1 ? "bg-current" : "bg-current/40",
          )}
        />
        <span className="h-1 w-3.5 rounded-full bg-current/40" />
      </span>
    ))}
  </div>
);

const SHOW_AS_OPTIONS = [
  {
    chip: false,
    label: "Card",
    hint: "Its own card with a power switch, brightness, and scenes.",
    sketch: <CardSketch />,
  },
  {
    chip: true,
    label: "Toggle",
    hint: "A chip on one shared card. One tap: on/off or a scene.",
    sketch: <ChipsSketch />,
  },
];

const ProLabel = ({ children }: { children: React.ReactNode }) => (
  <>
    {children}
    <ProTag />
  </>
);

/** Whether a pick gets its own card or a chip on the shared toggles card. */
const ShowAsSwitch = ({
  title,
  asChip,
  onAsChipChange,
}: {
  title: string;
  asChip: boolean;
  onAsChipChange: (chip: boolean) => void;
}) => (
  <div
    role="radiogroup"
    aria-label={`Show ${title} as`}
    className="flex shrink-0 items-center rounded-full bg-foreground/6 p-0.5"
  >
    {SHOW_AS_OPTIONS.map((option) => {
      const active = option.chip === asChip;
      return (
        <button
          key={option.label}
          type="button"
          role="radio"
          aria-checked={active}
          onClick={() => onAsChipChange(option.chip)}
          className={cn(
            "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
            active
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

/** Shows what Card and Toggle each become, before anything is picked. */
const ShowAsGuide = ({ pro }: { pro: boolean }) => (
  <div className="grid grid-cols-2 gap-3 rounded-2xl bg-(--settings-surface) p-3">
    {SHOW_AS_OPTIONS.map((option) => (
      <div key={option.label} className="flex min-w-0 items-start gap-3">
        <span className="shrink-0 text-muted-foreground">{option.sketch}</span>
        <span className="grid min-w-0 gap-0.5">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            {option.label}
            {option.chip && !pro ? <ProTag /> : null}
          </span>
          <span className="text-xs text-pretty text-muted-foreground">
            {option.hint}
          </span>
        </span>
      </div>
    ))}
  </div>
);

/** The tallest the preview's widget is drawn before it scales down. */
const PREVIEW_MAX_HEIGHT = 480;

const WidgetPreview = ({
  theme,
  sizeMode,
  cornerMode,
  controls,
  onReorder,
  onEdit,
  maxHeight = PREVIEW_MAX_HEIGHT,
  backgroundMode = "solid",
  tileOpacity = DEFAULT_TILE_OPACITY,
  widgetScale,
  fold,
}: {
  theme: ReturnType<typeof resolveWidgetTheme>;
  sizeMode: WidgetSizeMode;
  cornerMode: WidgetCornerMode;
  controls: WidgetControl[];
  onReorder: (from: number, to: number) => void;
  /** Makes each card a button that opens that control's editor. */
  onEdit?: (id: string) => void;
  /** The tallest the widget is drawn before it scales down. */
  maxHeight?: number;
  backgroundMode?: WidgetBackgroundMode;
  tileOpacity?: number;
  /** The widget's size setting, in percent. When given, the preview draws it
   * to scale against the largest step, so the setting reads as a size. */
  widgetScale?: number;
  /** Lets the preview fold into its collapsed look and open again the way
   * the real widget does. */
  fold?: {
    title: string;
    collapseMode: WidgetCollapseMode;
    mascotStyle: WidgetMascotStyle;
  };
}) => {
  const sizeMetrics = WIDGET_SIZE_METRICS[sizeMode];
  const [folded, setFolded] = useState(false);
  // Hidden only once the fold has played out. Hiding at once cut the shell
  // short, and controls that transition `visibility` lingered behind it.
  const [shellHidden, setShellHidden] = useState(false);
  const reduceMotion = useReducedMotion();
  const foldMotion = reduceMotion ? { duration: 0 } : COLLAPSE_TRANSITION;
  // Changing the collapsed look shows it folded, so the change is visible
  // straight away.
  const foldKey = fold ? `${fold.collapseMode}:${fold.mascotStyle}` : "";
  const firstFoldKeyRef = useRef(foldKey);
  useEffect(() => {
    if (foldKey === firstFoldKeyRef.current) return;
    firstFoldKeyRef.current = foldKey;
    setFolded(true);
  }, [foldKey]);

  const expandFromPill = () => {
    setShellHidden(false);
    setFolded(false);
  };

  // The widget has a fixed pixel width (320 / 652) and grows with the number of
  // controls, so it can outsize the preview frame. Rather than scroll, we scale
  // the whole shell down to fit. CSS transforms don't affect layout flow, so we
  // measure the natural size and the available stage, then pick a contain scale.
  const stageRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  // The scaled shell's height; the stage takes it so the frame hugs the widget.
  const [stageHeight, setStageHeight] = useState<number>();
  // Drops a widget smaller than Large to the middle of the frame.
  const [offsetY, setOffsetY] = useState(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = controls.findIndex((control) => control.id === active.id);
    const to = controls.findIndex((control) => control.id === over.id);
    if (from === -1 || to === -1) return;
    onReorder(from, to);
  };

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const shell = shellRef.current;
    if (!stage || !shell) return;
    const fit = () => {
      const shellW = shell.offsetWidth;
      const shellH = shell.offsetHeight;
      if (!shellW || !shellH) return;
      // Fit as if this were the largest step, and draw the chosen one at that
      // same factor, so smaller steps look smaller. Fitting each on its own
      // scaled them all to the same box and hid the setting.
      const chosen = (widgetScale ?? WIDGET_SCALE.default) / 100;
      const largest = widgetScale == null ? chosen : WIDGET_SCALE.max / 100;
      const largeW = shellW * largest;
      const largeH = shellH * largest;
      // Fit the width, and stop growing at the max height so a long list
      // shrinks rather than pushing the frame off screen.
      const fitted = Math.min(
        1,
        stage.clientWidth / largeW,
        maxHeight / largeH,
      );
      setScale(fitted * chosen);
      // The frame keeps the largest step's height, so changing the size
      // changes the widget, not the frame around it; a smaller one sits
      // centred in it.
      setStageHeight(largeH * fitted);
      setOffsetY(((largest - chosen) * shellH * fitted) / 2);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    observer.observe(shell);
    return () => observer.disconnect();
  }, [maxHeight, widgetScale]);

  const grid =
    controls.length > 0 ? (
      <div
        className="grid w-full content-start"
        style={{
          gap: sizeMetrics.gridGap,
          gridTemplateColumns: widgetCardGridColumns(sizeMode),
        }}
      >
        {controls.map((control) => (
          <SortablePreviewCard
            key={control.id}
            id={control.id}
            scale={scale}
            onEdit={onEdit ? () => onEdit(control.id) : undefined}
          >
            <ControlCard control={control} sizeMode={sizeMode} />
          </SortablePreviewCard>
        ))}
      </div>
    ) : (
      <p className="px-6 py-10 text-center text-sm text-muted-foreground">
        Select at least one control to preview the widget.
      </p>
    );

  const shellStyle = {
    ...widgetShellStyle(theme, sizeMode, cornerMode),
    // Read by the translucent tile rules in App.css.
    "--tile-opacity": `${tileOpacity}%`,
  } as React.CSSProperties;
  // Keeps dark variants inside the preview from following the app's theme.
  const themeClass = theme === "dark" ? "dark" : "theme-light";

  return (
    <div className="relative overflow-hidden rounded-xl border border-border/70 bg-[linear-gradient(135deg,#627d98,#d9c8a9_52%,#52616b)] p-6">
      {fold ? (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 text-xs font-medium text-white/90 drop-shadow">
          {folded ? (
            <span className="px-2 py-1">Click to expand</span>
          ) : (
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-md bg-black/25 px-2 py-1 backdrop-blur-sm transition-colors hover:bg-black/40"
              onClick={() => setFolded(true)}
            >
              <Minimize2 size={12} />
              Collapse
            </button>
          )}
        </div>
      ) : null}
      <div
        ref={stageRef}
        className="relative flex w-full items-start justify-center"
        style={{ height: stageHeight }}
      >
        {fold && folded ? (
          // Over the shell's spot; the hidden shell keeps the frame's height.
          <motion.div
            className={cn("absolute inset-x-0 flex justify-center", themeClass)}
            // Where the shell's top edge sits, so the pill replaces it in place.
            style={{ top: offsetY }}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={foldMotion}
          >
            <CollapsedWidget
              mode={fold.collapseMode}
              mascotStyle={fold.mascotStyle}
              title={fold.title}
              // Pinned, so a press never drags the settings window.
              pinned
              style={{ ...shellStyle, backdropFilter: "blur(24px)" }}
              onExpand={expandFromPill}
            />
          </motion.div>
        ) : null}
        {/* Folds the shell as one piece, toward the pill at its top. Kept
            apart from the shell, whose own transform scales it to fit. */}
        <motion.div
          className={cn(
            "shrink-0",
            folded && "pointer-events-none",
            shellHidden && "invisible",
          )}
          style={{ transformOrigin: "top center" }}
          initial={false}
          // No `filter` here: on an ancestor it would cut the shell's own
          // backdrop blur off from the background, even at rest.
          animate={
            folded ? { opacity: 0, scale: 0.6 } : { opacity: 1, scale: 1 }
          }
          transition={{
            ...foldMotion,
            opacity: { duration: reduceMotion ? 0 : 0.18 },
          }}
          onAnimationComplete={() => {
            if (folded) setShellHidden(true);
          }}
        >
          <div
            ref={shellRef}
            className={cn(
              "shrink-0 border border-border/40 text-foreground shadow-2xl backdrop-blur-xl",
              themeClass,
            )}
            data-tile-background={backgroundMode}
            style={{
              ...shellStyle,
              width: sizeMetrics.cardBasis + WIDGET_SIDE_PADDING * 2,
              paddingTop: sizeMetrics.edgePadding,
              paddingRight: WIDGET_SIDE_PADDING,
              paddingBottom: WIDGET_SIDE_PADDING,
              paddingLeft: WIDGET_SIDE_PADDING,
              transform: `translateY(${offsetY}px) scale(${scale})`,
              transformOrigin: "top center",
            }}
          >
            {controls.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={controls.map((control) => control.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {grid}
                </SortableContext>
              </DndContext>
            ) : (
              grid
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

/**
 * Makes a preview card draggable for reordering. The preview shell is rendered
 * at `transform: scale(scale)`, so dnd-kit's pointer-delta and sibling-shift
 * transforms (measured in screen px) over-move by `scale` inside the scaled
 * container — divide them back out so dragging tracks the pointer. The inner
 * card is pointer-events-none so its sample controls never swallow the drag.
 */
const SortablePreviewCard = ({
  id,
  scale,
  onEdit,
  children,
}: {
  id: string;
  scale: number;
  /** A plain click (no drag) opens the editor. */
  onEdit?: () => void;
  children: React.ReactNode;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const adjusted = transform
    ? {
        ...transform,
        x: transform.x / scale,
        y: transform.y / scale,
        scaleX: 1,
        scaleY: 1,
      }
    : null;

  return (
    <div
      ref={setNodeRef}
      // No handle: the whole card lifts on hover and picks up on drag; with
      // onEdit, a click opens its editor.
      onClick={onEdit}
      className={cn(
        "relative min-w-0 transition-[translate,scale,filter] duration-150 ease-out hover:-translate-y-0.5 hover:drop-shadow-[0_6px_12px_rgb(0_0_0/0.25)]",
        onEdit ? "cursor-pointer" : "cursor-grab",
        isDragging &&
          "cursor-grabbing scale-[1.03] drop-shadow-[0_12px_24px_rgb(0_0_0/0.35)]",
      )}
      style={{
        transform: CSS.Transform.toString(adjusted),
        transition,
        zIndex: isDragging ? 10 : undefined,
        touchAction: "none",
      }}
      {...attributes}
      {...listeners}
    >
      <div className="pointer-events-none">{children}</div>
    </div>
  );
};
