import { Fragment, useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Lightbulb,
  Lock,
  Mic,
  Moon,
  Palette,
  Power,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useEntitlements } from "@/context/EntitlementContext";
import { useHue } from "@/context/HueContext";
import {
  automationTargets,
  awayActions,
  captureAppName,
  onAirTriggers,
  onAirXy,
  type AutomationRule,
  type AutomationSettings,
  type AutomationStatus,
  type AwaySettings,
  type OnAirSettings,
} from "@/features/automations/model";
import {
  loadAutomations,
  saveAutomationSettings,
  useAutomationStore,
} from "@/features/automations/store";
import { useAutomationPreview } from "@/features/automations/useAutomationPreview";
import {
  automationNavVariants,
  automationRuleInfo,
  useOpenAutomation,
} from "@/features/automations/useOpenAutomation";
import { ColorWheel } from "@/features/space-screen/components/ColorWheel";
import { TemperatureWheel } from "@/features/space-screen/components/TemperatureWheel";
import {
  hueDisplayColorHex,
  lightColorHex,
  sceneBrightness,
  sceneBubbleCss,
  sceneHexes,
} from "@/features/space-screen/utils/color-state";
import { getLightIcon } from "@/features/space-screen/utils/light-icons";
import { getRoomZoneIcon } from "@/features/home-screen/components/room-zone-icons";
import { useProUpgrade } from "@/features/pro/proUpgrade";
import { describeCommandError } from "@/lib/entitlement-errors";
import { activeTileTheme } from "@/lib/tile-theme";
import { cn } from "@/lib/utils";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import type { HueLight } from "@/types/hue";
import {
  AutomationLightPicker,
  type AutomationLightGroup,
  type AutomationLightOption,
} from "../components/AutomationLightPicker";
import {
  AutomationScenePicker,
  type AutomationSceneOption,
} from "../components/AutomationScenePicker";
import { SegmentedControl } from "../components/SegmentedControl";
import { SettingsRow, SettingsStack } from "../components/SettingsList";
import {
  FLAT_CARD,
  SETTINGS_EXPANDABLE_CARD,
  SETTINGS_EXPANDABLE_TRIGGER,
} from "../constants";

type StatusText = { text: string; error?: boolean; live?: boolean };
const previewModes = [
  { value: "off", label: "Off", icon: EyeOff },
  { value: "on", label: "On", icon: Eye },
] as const;
const appearanceModes = [
  { value: "color", label: "Color", icon: Palette },
  { value: "white", label: "White", icon: Sun },
] as const;
const targetModes = [
  { value: "lights", label: "Lights", icon: Lightbulb },
  { value: "scene", label: "Scene", icon: Palette },
] as const;
/** Dimming keeps each light's own color, so the swatch only stands for warmth. */
const DIM_SWATCH = hueDisplayColorHex({ mirek: 366 }) ?? "#f4cf95";

export function AutomationsTab() {
  const { hasPro } = useEntitlements();
  const { requestPro } = useProUpgrade();
  const { bridgeId } = useHue();
  const { automation: editing, setAutomation: setEditing } =
    useOpenAutomation();
  const lights = useHueResourcesStore((s) => s.lights);
  const spaces = useHueResourcesStore((s) => s.roomZones);
  const scenes = useHueResourcesStore((s) => s.scenes);
  const settings = useAutomationStore((s) => s.settings);
  const status = useAutomationStore((s) => s.status);
  const loadError = useAutomationStore((s) => s.loadError);
  const [previewRule, setPreviewRule] = useState<AutomationRule | null>(null);
  const { error: previewError } = useAutomationPreview(previewRule, settings);
  useEffect(() => {
    void loadAutomations();
  }, []);
  if (loadError || !settings)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {loadError ?? "Loading automations..."}
      </p>
    );
  const lightOption = (light: HueLight): AutomationLightOption => ({
    kind: "light",
    id: light.id,
    name: light.name,
    icon: getLightIcon(light.typeName),
    color: light.isOn ? lightColorHex(light) : null,
  });
  const rooms = spaces.filter((space) => space.resourceType === "room");
  const lightGroups: AutomationLightGroup[] = [
    ...rooms.map((room) => ({
      id: room.id,
      name: room.name,
      options: [
        ...(room.groupedLightId
          ? [
              {
                kind: "room" as const,
                id: room.groupedLightId,
                name: room.name,
                label: "Whole room",
                detail: `${room.lightCount} lights`,
                icon: getRoomZoneIcon(room.class),
                color: null,
              },
            ]
          : []),
        ...lights
          .filter((light) => room.lightIds.includes(light.id))
          .map(lightOption),
      ],
    })),
    {
      id: "zones",
      name: "Zones",
      options: spaces
        .filter((space) => space.resourceType === "zone")
        .flatMap((zone) =>
          zone.groupedLightId
            ? [
                {
                  kind: "zone" as const,
                  id: zone.groupedLightId,
                  name: zone.name,
                  detail: `${zone.lightCount} lights`,
                  icon: getRoomZoneIcon(zone.class),
                  color: null,
                },
              ]
            : [],
        ),
    },
    {
      id: "no-room",
      name: "Not in a room",
      options: lights
        .filter(
          (light) => !rooms.some((room) => room.lightIds.includes(light.id)),
        )
        .map(lightOption),
    },
  ].filter((group) => group.options.length > 0);
  const sceneOptions: AutomationSceneOption[] = scenes
    .filter((scene) => scene.resourceType === "scene")
    .map((scene) => ({
      id: scene.id,
      name: scene.name,
      groupId: scene.group ?? "other",
      groupName:
        spaces.find((space) => space.id === scene.group)?.name ?? "Other",
      bubble: sceneBubbleCss(scene),
      tint: sceneHexes(scene)[0] ?? null,
      brightness: sceneBrightness(scene),
    }));
  return (
    <SettingsStack>
      {!hasPro && (
        <div className="flex max-w-prose flex-wrap items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
          <p className="min-w-0 flex-1 text-sm leading-6">
            Automations are part of Mote Pro. You can set them up now. They
            start working as soon as Pro is unlocked.
          </p>
          <Button size="sm" onClick={() => requestPro("local_automation")}>
            Get Mote Pro
          </Button>
        </div>
      )}
      <AutomationSettingsEditor
        settings={settings}
        status={status}
        lightGroups={lightGroups}
        scenes={sceneOptions}
        bridgeId={bridgeId}
        hasPro={hasPro}
        previewError={previewError}
        editing={editing}
        onEditingChange={setEditing}
        onPreviewRuleChange={setPreviewRule}
        onChange={(change) => {
          void saveAutomationSettings(change);
        }}
      />
    </SettingsStack>
  );
}

/** What an automation does to the lights, drawn as a swatch and said in words. */
interface Outcome {
  /** CSS paint for the swatch, or null when the lights simply go out. */
  background: string | null;
  /** A solid color from that paint, for the glow behind the swatch. */
  tint: string | null;
  /** 1-100, how bright the result is; shades the swatch like a room tile. */
  brightness: number;
  /**
   * The predicate of the sentence with a plural verb, e.g. "dim to 30%". The
   * verb is always the first word, so a single light can inflect it.
   */
  action: string;
  icon: LucideIcon;
}

/** One numbered block of an automation's settings. */
interface AutomationStep {
  id: string;
  title: string;
  hint: string;
  content: ReactNode;
}

export function AutomationSettingsEditor({
  settings,
  status,
  lightGroups,
  scenes,
  bridgeId,
  hasPro,
  editing,
  onEditingChange,
  previewError,
  onPreviewRuleChange,
  onChange,
}: {
  settings: AutomationSettings;
  status: AutomationStatus | null;
  lightGroups: AutomationLightGroup[];
  scenes: AutomationSceneOption[];
  bridgeId: string | null;
  hasPro: boolean;
  /**
   * Which automation is open. The caller owns it because the name, the blurb and
   * the back button sit in the surrounding header: Settings keeps it in the URL
   * so mouse Back works, and the gallery keeps it in state.
   */
  editing: AutomationRule | null;
  onEditingChange: (rule: AutomationRule | null) => void;
  previewError?: string | null;
  onPreviewRuleChange: (rule: AutomationRule | null) => void;
  onChange: (
    change: (current: AutomationSettings) => AutomationSettings,
  ) => void;
}) {
  const edit = onEditingChange;
  // Off until asked for, and again whenever another automation opens, so lights
  // only change while somebody has knowingly turned preview on. Keyed on
  // `editing` so a Back that closes the automation also stops the preview.
  const [preview, setPreview] = useState(false);
  const [showApps, setShowApps] = useState(false);
  useEffect(() => {
    setPreview(false);
    setShowApps(false);
  }, [editing]);
  const reduceMotion = useReducedMotion();
  // Forward into an automation, backward out of it; 0 is a plain crossfade.
  const direction = reduceMotion ? 0 : editing ? 1 : -1;
  const { onAir, away } = settings;
  const lightOptions = lightGroups.flatMap((group) => group.options);
  const onAnotherBridge = (owner: string | null) =>
    !!owner && owner !== bridgeId;
  const isScene = (rule: AutomationRule) =>
    rule === "onAir" ? onAir.mode === "scene" : away.action === "scene";
  const ready = (rule: AutomationRule) => {
    const value = settings[rule];
    if (!bridgeId || onAnotherBridge(value.bridgeId)) return false;
    return isScene(rule)
      ? !!value.scene && scenes.some((scene) => scene.id === value.scene?.id)
      : automationTargets(value).some((selected) =>
          lightOptions.some(
            (option) =>
              option.kind === selected.kind && option.id === selected.id,
          ),
        );
  };
  const previewing =
    editing && preview && hasPro && ready(editing) ? editing : null;
  useEffect(() => {
    onPreviewRuleChange(previewing);
    return () => onPreviewRuleChange(null);
  }, [previewing, onPreviewRuleChange]);
  const updateOnAir = (patch: Partial<OnAirSettings>) =>
    onChange((current) => ({
      ...current,
      onAir: { ...current.onAir, ...patch },
    }));
  const updateAway = (patch: Partial<AwaySettings>) =>
    onChange((current) => ({
      ...current,
      away: { ...current.away, ...patch },
    }));
  const percent = (value: number) => `${Math.round(value)}%`;
  const outcomeFor = (rule: AutomationRule): Outcome => {
    if (isScene(rule)) {
      const chosen = scenes.find(
        (scene) => scene.id === settings[rule].scene?.id,
      );
      const name = settings[rule].scene?.name;
      return {
        background: chosen?.bubble ?? null,
        tint: chosen?.tint ?? null,
        brightness:
          rule === "onAir" ? onAir.brightness : (chosen?.brightness ?? 100),
        action: name ? `light up as ${name}` : "use a scene you choose",
        icon: Palette,
      };
    }
    if (rule === "onAir") {
      const hex =
        onAir.mode === "white"
          ? hueDisplayColorHex({ mirek: onAir.mirek })
          : hueDisplayColorHex({ xy: onAirXy(onAir) });
      return {
        background: hex,
        tint: hex,
        brightness: onAir.brightness,
        action:
          onAir.mode === "white"
            ? `turn ${Math.round(1e6 / onAir.mirek)} K white at ${percent(onAir.brightness)}`
            : `turn this color at ${percent(onAir.brightness)}`,
        // Palette is reserved for scenes, so a plain color reads as one light.
        icon: onAir.mode === "white" ? Sun : Lightbulb,
      };
    }
    if (away.action === "dim")
      return {
        background: DIM_SWATCH,
        tint: DIM_SWATCH,
        brightness: away.dimBrightness,
        action: `dim to ${percent(away.dimBrightness)}`,
        icon: Moon,
      };
    return {
      background: null,
      tint: null,
      brightness: 0,
      action: "turn off",
      icon: Power,
    };
  };
  /** The whole automation as one sentence, so nothing has to be pieced together. */
  const sentence = (rule: AutomationRule) => {
    const when =
      rule === "onAir"
        ? {
            microphone_or_camera: "While an app uses your microphone or camera",
            microphone: "While an app uses your microphone",
            camera: "While an app uses your camera",
          }[onAir.trigger]
        : away.includeSleep
          ? "When this PC locks or sleeps"
          : "When this PC locks";
    const chosen = automationTargets(settings[rule]);
    // One named light or room is the only singular subject; everything else,
    // including a scene's own lights, takes the plural verb as written.
    const one = !isScene(rule) && chosen.length === 1;
    const what = isScene(rule)
      ? "your lights"
      : chosen.length === 0
        ? "the lights you choose"
        : one
          ? chosen[0].name
          : chosen.length === 2
            ? `${chosen[0].name} and ${chosen[1].name}`
            : `${chosen.length} lights`;
    const action = outcomeFor(rule).action;
    return `${when}, ${what} ${one ? action.replace(/^\S+/, "$&s") : action}.`;
  };
  const summary = (rule: AutomationRule): StatusText => {
    const value = settings[rule];
    const live = status?.[rule];
    if (!bridgeId)
      return { text: "Connect a Hue Bridge to enable this automation." };
    if (value.enabled && live?.error)
      return { text: describeCommandError(live.error), error: true };
    if (onAnotherBridge(value.bridgeId))
      return { text: "Set up on another bridge" };
    if (!ready(rule))
      return {
        text: isScene(rule)
          ? "Choose a scene to enable this automation."
          : "Choose lights to enable this automation.",
      };
    if (!hasPro) return { text: "Ready to use with Mote Pro." };
    if (!value.enabled) return { text: "Ready to turn on" };
    return {
      live: !!live?.active,
      text: live?.active
        ? rule === "onAir"
          ? "On air now"
          : "Lights changed while this PC is locked"
        : rule === "onAir"
          ? "Listening for a call"
          : "Waiting for this PC to lock",
    };
  };
  /** The result, said in words and shown in color, with preview beside it. */
  const outcomeCard = (rule: AutomationRule) => {
    const live = previewing === rule;
    const pressed = preview && hasPro;
    return (
      <div className="grid min-w-0 gap-4 rounded-2xl bg-(--settings-surface) p-4 @lg:grid-cols-[auto_minmax(0,1fr)_auto] @lg:items-center @lg:gap-5">
        <OutcomeSwatch outcome={outcomeFor(rule)} />
        <div className="grid min-w-0 gap-1">
          <p className="text-sm leading-6 text-foreground">{sentence(rule)}</p>
          <p
            role="status"
            className="flex min-w-0 items-center gap-2 text-xs leading-5 text-muted-foreground"
          >
            {live && (
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary"
              />
            )}
            <span className={cn("min-w-0", live && "text-foreground")}>
              {!hasPro
                ? "Live preview is part of Mote Pro."
                : !pressed
                  ? "Try it on your lights while you set this up."
                  : live
                    ? "Showing now. Your lights go back when you turn this off."
                    : isScene(rule)
                      ? "Preview starts once you choose a scene."
                      : "Preview starts once you choose lights."}
            </span>
          </p>
          {previewError && live && (
            <p role="alert" className="text-xs text-(--destructive-text)">
              {previewError}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 @lg:justify-end">
          <span
            aria-hidden="true"
            className="text-xs font-medium text-muted-foreground"
          >
            Preview
          </span>
          <SegmentedControl
            value={pressed ? "on" : "off"}
            ariaLabel="Preview on your lights"
            layoutId={`${rule}-preview-pill`}
            options={previewModes}
            disabled={!hasPro}
            onValueChange={(mode) => setPreview(mode === "on")}
          />
        </div>
      </div>
    );
  };
  const targetField = (rule: AutomationRule) => {
    const update = rule === "onAir" ? updateOnAir : updateAway;
    const chosen = automationTargets(settings[rule]);
    return (
      <div className="grid min-w-0 gap-4">
        {rule === "onAir" && (
          <SegmentedControl
            value={isScene(rule) ? "scene" : "lights"}
            ariaLabel="Change lights or use a scene"
            layoutId="on-air-target-mode-pill"
            options={targetModes}
            onValueChange={(mode) =>
              updateOnAir(
                mode === "scene"
                  ? { mode: "scene", enabled: onAir.enabled && !!onAir.scene }
                  : {
                      mode: onAir.mode === "white" ? "white" : "color",
                      enabled:
                        onAir.enabled && automationTargets(onAir).length > 0,
                    },
              )
            }
          />
        )}
        {onAnotherBridge(settings[rule].bridgeId) && (
          <p className="text-sm text-muted-foreground">
            Choose lights on this bridge to replace the previous selection.
          </p>
        )}
        {isScene(rule) ? (
          <>
            <AutomationScenePicker
              scenes={scenes}
              labelledBy={`${rule}-step-lights`}
              selectedId={settings[rule].scene?.id ?? null}
              fallbackName={settings[rule].scene?.name}
              onSelect={(scene) =>
                update({
                  bridgeId,
                  scene: { id: scene.id, name: scene.name },
                })
              }
            />
            <p className="text-xs leading-5 text-muted-foreground">
              Uses the scene's lights and saved colors. Dynamic effects are not
              included.
            </p>
          </>
        ) : (
          <>
            <AutomationLightPicker
              groups={lightGroups}
              selected={chosen}
              labelledBy={`${rule}-step-lights`}
              onChange={(next) =>
                update({
                  bridgeId,
                  enabled: next.length > 0 && settings[rule].enabled,
                  target: null,
                  targets: next,
                })
              }
            />
            {chosen.length > 0 && (
              <div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="-ml-2"
                  onClick={() =>
                    update({
                      bridgeId,
                      enabled: false,
                      target: null,
                      targets: [],
                    })
                  }
                >
                  Clear {chosen.length} selected
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    );
  };
  const appearanceBlock = () => (
    <div className="grid min-w-0 gap-5">
      <SegmentedControl
        value={onAir.mode === "white" ? "white" : "color"}
        ariaLabel="On-air appearance"
        layoutId="on-air-appearance-pill"
        options={appearanceModes}
        onValueChange={(mode) => updateOnAir({ mode })}
      />
      {/* Wheel and brightness sit side by side and wrap together, so neither
          leaves a column of empty card beside it. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-8 gap-y-5">
        <div className="w-40 shrink-0">
          {onAir.mode === "white" ? (
            <TemperatureWheel
              value={onAir.mirek}
              min={153}
              max={500}
              onPick={(mirek) => updateOnAir({ mirek })}
            />
          ) : (
            <ColorWheel
              xy={onAirXy(onAir)}
              onPick={(xy) => updateOnAir({ xy })}
            />
          )}
        </div>
        <div className="grid min-w-56 flex-1 gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium">Brightness</p>
            {onAir.mode === "white" && (
              <p className="text-xs text-muted-foreground tabular-nums">
                {Math.round(1e6 / onAir.mirek)} K
              </p>
            )}
          </div>
          <LevelSlider
            label="On-air brightness"
            value={onAir.brightness}
            onCommit={(brightness) => updateOnAir({ brightness })}
          />
        </div>
      </div>
    </div>
  );
  const onAirWhenBlock = () => (
    <div className="grid min-w-0 gap-4">
      <div className="grid min-w-0 max-w-sm gap-2">
        <Select
          value={onAir.trigger}
          onValueChange={(trigger) => {
            if (trigger) updateOnAir({ trigger });
          }}
        >
          <SelectTrigger aria-label="Turns on for" className="w-full">
            <SelectValue>
              {
                onAirTriggers.find((option) => option.value === onAir.trigger)
                  ?.label
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {onAirTriggers.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs leading-5 text-muted-foreground">
          Lights return to their previous state when the call ends.
        </p>
      </div>
      <div className="grid min-w-0 gap-4">
        <Disclosure
          open={showApps}
          onToggle={() => setShowApps((current) => !current)}
          label={
            onAir.ignoredApps.length
              ? `App exceptions (${onAir.ignoredApps.length} ignored)`
              : "App exceptions"
          }
        />
        {showApps && (
          <CaptureApps
            status={status}
            ignored={onAir.ignoredApps}
            onToggle={(id) =>
              onChange((current) => ({
                ...current,
                onAir: {
                  ...current.onAir,
                  ignoredApps: current.onAir.ignoredApps.includes(id)
                    ? current.onAir.ignoredApps.filter((app) => app !== id)
                    : [...current.onAir.ignoredApps, id],
                },
              }))
            }
          />
        )}
      </div>
    </div>
  );
  const awayActionBlock = () => (
    <div className="grid min-w-0 gap-5">
      <div className="grid min-w-0 max-w-sm gap-3">
        <Select
          value={away.action}
          onValueChange={(action) => {
            if (action)
              updateAway({
                action,
                enabled:
                  away.enabled &&
                  (action === "scene"
                    ? !!away.scene
                    : automationTargets(away).length > 0),
              });
          }}
        >
          <SelectTrigger aria-label="What happens" className="w-full">
            <SelectValue>
              {
                awayActions.find((option) => option.value === away.action)
                  ?.label
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {awayActions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {away.action === "dim" && (
        <div className="grid min-w-0 max-w-sm gap-2">
          <p className="text-sm font-medium">Dim to</p>
          <LevelSlider
            label="Dim level"
            value={away.dimBrightness}
            onCommit={(dimBrightness) => updateAway({ dimBrightness })}
          />
          <p className="text-xs leading-5 text-muted-foreground">
            Lights already dimmer than this are left as they are.
          </p>
        </div>
      )}
    </div>
  );
  const awayReturnBlock = () => (
    <div className="grid min-w-0">
      <SettingsRow title="Also when this PC sleeps" keepControlInline>
        <Switch
          aria-label="Also when this PC sleeps"
          checked={away.includeSleep}
          onCheckedChange={(includeSleep) => updateAway({ includeSleep })}
        />
      </SettingsRow>
      <SettingsRow
        title="Put lights back when you return"
        description="A light someone changed while you were away is left as it is."
        keepControlInline
      >
        <Switch
          aria-label="Put lights back when you return"
          checked={away.restoreOnReturn}
          onCheckedChange={(restoreOnReturn) => updateAway({ restoreOnReturn })}
        />
      </SettingsRow>
    </div>
  );
  /**
   * Every setting on one page, in the order the sentence reads. Tabs used to
   * split these, which hid half the automation behind a second click and made
   * the panel jump between two very different heights.
   */
  const stepsFor = (rule: AutomationRule): AutomationStep[] =>
    rule === "onAir"
      ? [
          {
            id: "lights",
            title: isScene("onAir") ? "Scene" : "Lights",
            hint: isScene("onAir")
              ? "The scene to run while you are on a call."
              : "The lights that change while you are on a call.",
            content: targetField("onAir"),
          },
          isScene("onAir")
            ? {
                id: "look",
                title: "Brightness",
                hint: "How bright the scene runs.",
                content: (
                  <div className="grid min-w-0 max-w-sm gap-2">
                    <LevelSlider
                      label="On-air brightness"
                      value={onAir.brightness}
                      onCommit={(brightness) => updateOnAir({ brightness })}
                    />
                  </div>
                ),
              }
            : {
                id: "look",
                title: "Look",
                hint: "The color and brightness those lights take.",
                content: appearanceBlock(),
              },
          {
            id: "when",
            title: "When",
            hint: "What switches the light on.",
            content: onAirWhenBlock(),
          },
        ]
      : [
          {
            id: "lights",
            title: isScene("away") ? "Scene" : "Lights",
            hint: isScene("away")
              ? "The scene to run once you step away."
              : "The lights that change once you step away.",
            content: targetField("away"),
          },
          {
            id: "action",
            title: "What happens",
            hint: "What those lights do when this PC locks.",
            content: awayActionBlock(),
          },
          {
            id: "return",
            title: "Coming back",
            hint: "What happens once you unlock it again.",
            content: awayReturnBlock(),
          },
        ];
  const rules: {
    rule: AutomationRule;
    icon: LucideIcon;
    enabled: boolean;
    onToggle: (enabled: boolean) => void;
  }[] = [
    {
      rule: "onAir",
      icon: Mic,
      enabled: onAir.enabled,
      onToggle: (enabled) => updateOnAir({ enabled }),
    },
    {
      rule: "away",
      icon: Lock,
      enabled: away.enabled,
      onToggle: (enabled) => updateAway({ enabled }),
    },
  ];
  const open = rules.find((item) => item.rule === editing);
  const listView = (
    // The rows are cards, and a card on the settings card is the same paint.
    // They sit on the recessed section instead, like every other tab's rows,
    // so `--card` reads as a step above rather than as the page itself.
    <div className="grid min-w-0 gap-3 rounded-2xl bg-(--settings-surface) p-3 @3xl:p-4">
      {rules.map((item) => (
        <AutomationRow
          key={item.rule}
          title={automationRuleInfo[item.rule].title}
          icon={item.icon}
          outcome={outcomeFor(item.rule)}
          summary={summary(item.rule)}
          detail={sentence(item.rule)}
          enabled={item.enabled}
          canToggle={hasPro && ready(item.rule)}
          onOpen={() => edit(item.rule)}
          onToggle={item.onToggle}
        />
      ))}
    </div>
  );
  // The name, the blurb, and the back button live in the Settings header while
  // an automation is open, so the body starts at its state and its switch.
  const detailView = open && (
    <div className="@container grid min-w-0 gap-5">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl border",
            open.enabled
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-border/60 text-muted-foreground",
          )}
        >
          <open.icon aria-hidden="true" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <StatusLine status={summary(open.rule)} />
        </div>
        <StatusPill
          title={automationRuleInfo[open.rule].title}
          enabled={open.enabled}
          canToggle={hasPro && ready(open.rule)}
          onToggle={open.onToggle}
        />
      </div>
      {outcomeCard(open.rule)}
      <div className="grid min-w-0 gap-6">
        {stepsFor(open.rule).map((step, position) => (
          <Fragment key={step.id}>
            {position > 0 && <Separator />}
            <section className="grid min-w-0 gap-4">
              <div className="flex min-w-0 items-baseline gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground tabular-nums"
                >
                  {position + 1}
                </span>
                <div className="grid min-w-0 gap-0.5">
                  <h3
                    id={`${open.rule}-step-${step.id}`}
                    className="text-sm font-semibold"
                  >
                    {step.title}
                  </h3>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {step.hint}
                  </p>
                </div>
              </div>
              <div className="min-w-0 pl-9">{step.content}</div>
            </section>
          </Fragment>
        ))}
      </div>
    </div>
  );
  // A push/pop: the automation arrives from the right, and leaves back to the
  // right while the list returns from the left. `popLayout` takes the outgoing
  // view out of flow, so the page is already the incoming view's height and
  // never animates between two very different ones — and the incoming view
  // mounts straight away rather than waiting on the exit to finish.
  return (
    <div className="relative min-w-0">
      <AnimatePresence initial={false} mode="popLayout" custom={direction}>
        <motion.div
          key={open?.rule ?? "list"}
          className="min-w-0"
          custom={direction}
          variants={automationNavVariants}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          {detailView || listView}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

const swatchSizes = {
  sm: { box: "size-11", icon: "size-4.5" },
  lg: { box: "size-14", icon: "size-5" },
} as const;

/**
 * The automation's result as a lit bubble: the color, scene palette, or dark
 * circle the lights will actually land on, shaded by its brightness the same
 * way a room tile is.
 */
function OutcomeSwatch({
  outcome,
  size = "lg",
}: {
  outcome: Outcome;
  size?: keyof typeof swatchSizes;
}) {
  const { box, icon } = swatchSizes[size];
  const Icon = outcome.icon;
  if (!outcome.background)
    return (
      <span
        aria-hidden="true"
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted text-muted-foreground",
          box,
        )}
      >
        <Icon className={icon} />
      </span>
    );
  return (
    <span
      aria-hidden="true"
      className="relative flex shrink-0 items-center justify-center"
    >
      {/* A soft bloom in the same paint, so a lit automation reads as lit. */}
      <span
        className="absolute inset-0 rounded-full opacity-55 blur-lg"
        style={{ background: outcome.background }}
      />
      <span
        className={cn(
          "relative flex items-center justify-center rounded-full shadow-sm ring-1 ring-foreground/15",
          box,
        )}
        style={activeTileTheme(
          outcome.background,
          outcome.tint ?? outcome.background,
          outcome.brightness,
        )}
      >
        <Icon className={cn(icon, "text-foreground")} />
      </span>
    </span>
  );
}

/** What the automation is doing right now, with a pulse while it is running. */
function StatusLine({ status }: { status: StatusText }) {
  return (
    <span
      role="status"
      className={cn(
        "flex min-w-0 items-center gap-1.5 text-xs",
        status.error ? "text-(--destructive-text)" : "text-muted-foreground",
      )}
    >
      {status.live && (
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 animate-pulse rounded-full bg-success"
        />
      )}
      <span className="truncate">{status.text}</span>
    </span>
  );
}

/** One automation in the list: what it does now, and a way into its settings. */
function AutomationRow({
  title,
  icon: Icon,
  outcome,
  summary,
  detail,
  enabled,
  canToggle,
  onOpen,
  onToggle,
}: {
  title: string;
  icon: LucideIcon;
  outcome: Outcome;
  summary: StatusText;
  detail: string;
  enabled: boolean;
  canToggle: boolean;
  onOpen: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <Card
      className={cn(
        "gap-0 py-0",
        enabled ? SETTINGS_EXPANDABLE_CARD : FLAT_CARD,
      )}
    >
      <div className={cn("flex items-center", SETTINGS_EXPANDABLE_TRIGGER)}>
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-3.5 px-4 py-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <OutcomeSwatch outcome={outcome} size="sm" />
          <span className="grid min-w-0 flex-1 gap-1">
            <span className="flex min-w-0 items-center gap-2">
              <Icon
                aria-hidden="true"
                size={14}
                className="shrink-0 text-muted-foreground"
              />
              <span className="truncate text-sm font-medium">{title}</span>
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {detail}
            </span>
            <StatusLine status={summary} />
          </span>
        </button>
        <StatusPill
          title={title}
          enabled={enabled}
          canToggle={canToggle}
          onToggle={onToggle}
        />
        <button
          type="button"
          aria-label={`Open ${title}`}
          onClick={onOpen}
          className="mr-3 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </Card>
  );
}

/** Active/Inactive, and the switch itself when the automation can run. */
function StatusPill({
  title,
  enabled,
  canToggle,
  onToggle,
}: {
  title: string;
  enabled: boolean;
  canToggle: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={!canToggle && !enabled}
      aria-label={enabled ? `Turn off ${title}` : `Turn on ${title}`}
      className={cn(
        "mr-2 flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-75 disabled:opacity-60 disabled:hover:opacity-60",
        enabled
          ? "bg-(--success-surface) text-(--success-text)"
          : "bg-muted text-muted-foreground",
      )}
      onClick={() => onToggle(!enabled)}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          enabled ? "bg-success" : "bg-muted-foreground",
        )}
      />
      {enabled ? "Active" : "Inactive"}
    </button>
  );
}

/** A quiet show/hide header for a block most people never need to open. */
function Disclosure({
  label,
  open,
  onToggle,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-fit items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChevronDown
        aria-hidden="true"
        size={14}
        className={cn("transition-transform", open && "rotate-180")}
      />
      {label}
    </button>
  );
}

function LevelSlider({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(Math.round(value));
  useEffect(() => {
    setDraft(Math.round(value));
  }, [value]);
  const first = (v: number | readonly number[]) =>
    Array.isArray(v) ? v[0] : (v as number);
  return (
    <div className="flex w-full min-w-48 max-w-full items-center gap-3">
      <Slider
        aria-label={label}
        min={1}
        max={100}
        step={1}
        value={[draft]}
        onValueChange={(next) => setDraft(first(next))}
        onValueCommitted={(next) => onCommit(first(next))}
      />
      <span className="w-10 shrink-0 text-right text-sm text-muted-foreground tabular-nums">
        {draft}%
      </span>
    </div>
  );
}

function CaptureApps({
  status,
  ignored,
  onToggle,
}: {
  status: AutomationStatus | null;
  ignored: string[];
  onToggle: (id: string) => void;
}) {
  const active = status?.captureApps ?? [];
  const idle = ignored.filter((id) => !active.some((app) => app.id === id));

  return (
    <div className="grid min-w-0 gap-3">
      <p className="max-w-prose text-sm leading-5 text-muted-foreground">
        Ignore an app that keeps your microphone or camera open outside calls,
        such as a voice assistant or streaming software.
      </p>
      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing is using your microphone or camera right now.
        </p>
      ) : (
        <ul className="grid gap-2">
          {active.map((app) => (
            <AppRow
              key={app.id}
              name={app.name}
              detail={[
                app.microphone && "Microphone",
                app.camera && "Camera",
                ignored.includes(app.id) && "Ignored",
              ]
                .filter(Boolean)
                .join(" · ")}
              ignored={ignored.includes(app.id)}
              onToggle={() => onToggle(app.id)}
            />
          ))}
        </ul>
      )}
      {idle.length > 0 && (
        <div className="grid gap-2">
          <p className="text-xs font-medium text-muted-foreground">Ignored</p>
          <ul className="grid gap-2">
            {idle.map((id) => (
              <AppRow
                key={id}
                name={captureAppName(id)}
                ignored
                onToggle={() => onToggle(id)}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function AppRow({
  name,
  detail,
  ignored,
  onToggle,
}: {
  name: string;
  detail?: string;
  ignored: boolean;
  onToggle: () => void;
}) {
  const action = ignored ? "Stop ignoring" : "Ignore";
  return (
    <li className="flex min-w-0 items-center justify-between gap-3">
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate text-sm font-medium" title={name}>
          {name}
        </span>
        {detail && (
          <span className="text-xs text-muted-foreground">{detail}</span>
        )}
      </span>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`${action} ${name}`}
        onClick={onToggle}
      >
        {action}
      </Button>
    </li>
  );
}
