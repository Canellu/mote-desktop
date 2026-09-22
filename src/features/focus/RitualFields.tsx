import { useState } from "react";
import {
  Check,
  Eye,
  EyeOff,
  Lightbulb,
  Minus,
  Moon,
  Plus,
  Sofa,
  Sunrise,
  Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ColorWheel } from "@/features/space-screen/components/ColorWheel";
import { hueDisplayColorHex } from "@/features/space-screen/utils/color-state";
import {
  AutomationLightPicker,
  type AutomationLightGroup,
} from "@/features/automations/components/AutomationLightPicker";
import {
  FieldRow,
  SECTION_PANEL,
} from "@/features/automations/components/SingletonAutomationFields";
import { LevelSlider } from "@/features/settings-screen/components/LevelSlider";
import { SegmentedControl } from "@/features/settings-screen/components/SegmentedControl";
import { cn } from "@/lib/utils";
import {
  focusedMinutes,
  formatMinutes,
  onAnotherBridge,
  restMinutes,
  rhythmPresets,
  sessionBlocks,
  sessionMinutes,
  vibeInfo,
  type FocusLook,
  type FocusRitual,
  type FocusVibe,
  type Rhythm,
} from "./model";
import { VibePreview } from "./VibeSample";

const lookModes = [
  { value: "focus", label: "Focus", icon: Timer },
  { value: "warning", label: "Near the end", icon: Sunrise },
  { value: "break", label: "Break", icon: Moon },
] as const;
const lightViews = [
  { value: "rooms", label: "Rooms & Zones", icon: Sofa },
  { value: "lights", label: "Lights", icon: Lightbulb },
] as const;
const previewModes = [
  { value: "off", label: "Off", icon: EyeOff },
  { value: "on", label: "On", icon: Eye },
] as const;

const lookKey = {
  focus: "focusXy",
  warning: "warningXy",
  break: "breakXy",
} as const;

/**
 * What each movement does with the two focus colours. Mirrors `looks()` in
 * src-tauri/src/services/automations/focus.rs, where every vibe reads the
 * focus and warning colours and every break reads the break colour.
 */
const vibeColourNote: Record<FocusVibe, string> = {
  calm: "Calm holds the focus colour, then warms toward “near the end” over the last stretch.",
  journey:
    "Journey spreads a gradient between focus and “near the end” across your lights, sliding along each quarter.",
  race: "Light Race fills your lights one by one: the ones already done wear “near the end”, the rest stay on focus.",
  minimal:
    "Minimal holds the focus colour and switches to “near the end” for the final minute.",
};

type Update = (patch: Partial<FocusRitual>) => void;

/** Name, starter rhythms, and the four numbers a session runs on. */
export function RhythmFields({
  ritual,
  isNew,
  onChange,
}: {
  ritual: FocusRitual;
  isNew: boolean;
  onChange: Update;
}) {
  const sameNumbers = (preset: (typeof rhythmPresets)[number]) =>
    preset.focusMinutes === ritual.focusMinutes &&
    preset.breakMinutes === ritual.breakMinutes &&
    preset.longBreakMinutes === ritual.longBreakMinutes &&
    preset.rounds === ritual.rounds;
  // Two presets can share a rhythm and differ only in their vibe, so the
  // chosen one is the whole preset; the badge speaks about the numbers alone.
  const presetId =
    rhythmPresets.find(
      (preset) => sameNumbers(preset) && preset.vibe === ritual.vibe,
    )?.id ?? null;
  const customRhythm = !rhythmPresets.some(sameNumbers);
  const gradient = sessionGradient(ritual);
  return (
    <div className="grid min-w-0 gap-5">
      <section
        className="grid min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-(--settings-surface) transition-[background-image] duration-500 dark:bg-card"
        style={{ backgroundImage: gradient }}
      >
        <div className="grid min-w-0 gap-2.5 p-4">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <span id="focus-rhythm-presets" className="text-sm font-medium">
              Start from a preset
            </span>
            {customRhythm && (
              <span className="text-xs text-muted-foreground">
                Custom rhythm
              </span>
            )}
          </div>
          <div
            role="radiogroup"
            aria-labelledby="focus-rhythm-presets"
            className="grid min-w-0 grid-cols-2 gap-1 rounded-xl bg-background/25 p-1 @xl:grid-cols-4 dark:bg-background/15"
          >
            {rhythmPresets.map((preset) => {
              const active = presetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() =>
                    onChange({
                      focusMinutes: preset.focusMinutes,
                      breakMinutes: preset.breakMinutes,
                      longBreakMinutes: preset.longBreakMinutes,
                      rounds: preset.rounds,
                      vibe: preset.vibe,
                      ...(isNew &&
                      rhythmPresets.some((p) => p.name === ritual.name)
                        ? { name: preset.name }
                        : {}),
                    })
                  }
                  className={cn(
                    "group grid min-w-0 gap-2.5 rounded-lg p-2.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-primary/10"
                      : "hover:bg-(--settings-surface-hover)",
                  )}
                >
                  <span className="flex min-w-0 items-start justify-between gap-2">
                    <span className="grid min-w-0 gap-0.5">
                      <span className="truncate text-sm font-medium">
                        {preset.name}
                      </span>
                      <span className="text-xs leading-5 text-muted-foreground">
                        <span className="tabular-nums">
                          {preset.focusMinutes} / {preset.breakMinutes} ·{" "}
                          {preset.rounds} rounds
                        </span>{" "}
                        · {vibeInfo[preset.vibe].name}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-full transition-colors",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "border border-border/80 group-hover:border-foreground/30",
                      )}
                    >
                      {active && <Check className="size-3" strokeWidth={3} />}
                    </span>
                  </span>
                  {/* Each preset wears its own shape, so the difference between
                      them is visible before one is chosen. */}
                  <SessionBars
                    rhythm={preset}
                    className="h-6"
                    barWidth="w-1"
                    dimmed={!active}
                  />
                </button>
              );
            })}
          </div>
        </div>
        <SessionShape ritual={ritual} embedded />
      </section>

      <div className={SECTION_PANEL}>
        <FieldRow label="Name">
          <Input
            aria-label="Name"
            className="w-56"
            value={ritual.name}
            maxLength={60}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </FieldRow>
        <FieldRow label="Focus" hint="One stretch of work.">
          <Stepper
            label="Focus"
            unit="min"
            value={ritual.focusMinutes}
            min={1}
            max={180}
            step={5}
            onChange={(focusMinutes) => onChange({ focusMinutes })}
          />
        </FieldRow>
        <FieldRow label="Break" hint="The short rest after each round.">
          <Stepper
            label="Break"
            unit="min"
            value={ritual.breakMinutes}
            min={1}
            max={60}
            step={1}
            onChange={(breakMinutes) => onChange({ breakMinutes })}
          />
        </FieldRow>
        <FieldRow label="Long break" hint="The rest once every round is done.">
          <Stepper
            label="Long break"
            unit="min"
            value={ritual.longBreakMinutes}
            min={1}
            max={90}
            step={5}
            onChange={(longBreakMinutes) => onChange({ longBreakMinutes })}
          />
        </FieldRow>
        <FieldRow label="Rounds" hint="Focus blocks before the long break.">
          <Stepper
            label="Rounds"
            value={ritual.rounds}
            min={1}
            max={12}
            step={1}
            onChange={(rounds) => onChange({ rounds })}
          />
        </FieldRow>
        <FieldRow
          label="Notify me between phases"
          hint="A Windows notification when focus or a break ends."
        >
          <Switch
            aria-label="Notify me between phases"
            checked={ritual.notify}
            onCheckedChange={(notify) => onChange({ notify })}
          />
        </FieldRow>
      </div>
    </div>
  );
}

/**
 * The session as a column per stretch, each one as tall as its minutes: the
 * focus blocks stand, the breaks between them barely rise, and the long break
 * closes in the middle. Focus carries the one strong fill and the rests stay
 * grey, so the working time is what the eye lands on.
 */
const blockFill = {
  focus: "bg-primary",
  break: "bg-foreground/30",
  long: "bg-foreground/45",
} as const;

function SessionBars({
  rhythm,
  className,
  barWidth = "w-2",
  dimmed = false,
  numbered = false,
}: {
  rhythm: Rhythm;
  className?: string;
  barWidth?: string;
  /** An unchosen preset's shape reads as a hint, not as a second chart. */
  dimmed?: boolean;
  /** Numbers the rounds under their column. */
  numbered?: boolean;
}) {
  const blocks = sessionBlocks(rhythm);
  const longest = Math.max(...blocks.map((block) => block.minutes));
  // Past eight rounds the columns are narrower than their own label.
  const labelled = numbered && rhythm.rounds <= 8;
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex min-w-0 items-stretch gap-1 transition-opacity",
        dimmed && "opacity-50 group-hover:opacity-80",
        className,
      )}
    >
      {blocks.map((block, index) => (
        <div
          key={index}
          className="flex min-w-0 max-w-8 flex-1 flex-col items-center gap-1.5"
        >
          <div className="flex w-full min-h-0 flex-1 items-end justify-center">
            <span
              style={{
                // A minute is never nothing: the shortest break still shows.
                height: `${Math.max(9, (block.minutes / longest) * 100)}%`,
                // Each column follows the one before it, so a new rhythm
                // arrives as a ripple rather than a jump.
                transitionDelay: `${Math.min(index, 12) * 25}ms`,
              }}
              className={cn(
                "rounded-full transition-[height] duration-300 ease-out",
                barWidth,
                blockFill[block.kind],
              )}
            />
          </div>
          {labelled && (
            <span className="text-[10px] leading-none text-muted-foreground tabular-nums">
              {block.round ?? ""}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function sessionGradient(ritual: FocusRitual) {
  const focusHex = hueDisplayColorHex({ xy: ritual.focusXy });
  const breakHex = hueDisplayColorHex({ xy: ritual.breakXy });
  return [
    focusHex &&
      `radial-gradient(120% 140% at 0% 0%, ${focusHex}2b, transparent 58%)`,
    breakHex &&
      `radial-gradient(90% 120% at 100% 100%, ${breakHex}1c, transparent 60%)`,
  ]
    .filter(Boolean)
    .join(", ");
}

export function SessionShape({
  ritual,
  embedded = false,
}: {
  ritual: FocusRitual;
  embedded?: boolean;
}) {
  const rounds = `${ritual.rounds} ${ritual.rounds === 1 ? "round" : "rounds"}`;
  // The ritual's own light colours wash the card, so the rhythm is already
  // wearing the look the lights will take.
  return (
    <figure
      className={cn(
        "grid min-w-0 gap-3.5 p-4",
        embedded
          ? "border-t border-border/50"
          : "rounded-2xl border border-border/60 bg-(--settings-surface) transition-[background-image] duration-500 dark:bg-card",
      )}
      style={
        embedded ? undefined : { backgroundImage: sessionGradient(ritual) }
      }
    >
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <SessionBars
          rhythm={ritual}
          className="h-14 min-w-40 flex-1"
          numbered
        />
        {/* The numbers the columns cannot show: what the whole thing costs,
            how much of it is work, and how much of it is rest. */}
        <div className="grid shrink-0 gap-1">
          <Total value={formatMinutes(sessionMinutes(ritual))} label="in all" />
          <Total
            value={formatMinutes(focusedMinutes(ritual))}
            label="of focus"
          />
          <Total value={formatMinutes(restMinutes(ritual))} label="of breaks" />
        </div>
      </div>
      <figcaption className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/60 pt-3">
        <span className="sr-only">
          {rounds} of {ritual.focusMinutes} minutes, {ritual.breakMinutes}{" "}
          minutes of break between them, and a {ritual.longBreakMinutes}-minute
          long break at the end.
        </span>
        <Key fill={blockFill.focus} label="Focus">
          {ritual.focusMinutes} min
        </Key>
        <Key fill={blockFill.break} label="Break">
          {ritual.breakMinutes} min
        </Key>
        <Key fill={blockFill.long} label="Long break">
          {ritual.longBreakMinutes} min
        </Key>
      </figcaption>
    </figure>
  );
}

/** One entry of the shape's key: its fill, what it is, and how long it runs. */
function Key({
  fill,
  label,
  children,
}: {
  fill: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs">
      <span className={cn("size-2 shrink-0 rounded-[2px]", fill)} />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{children}</span>
    </span>
  );
}

function Total({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex min-w-0 items-baseline justify-end gap-1.5">
      <span className="text-base font-semibold tabular-nums">{value}</span>
      <span className="w-14 text-xs text-muted-foreground">{label}</span>
    </span>
  );
}

/** The lights that keep time. */
export function LightsFields({
  ritual,
  bridgeId,
  lightGroups,
  labelledBy,
  onChange,
}: {
  ritual: FocusRitual;
  bridgeId: string | null;
  lightGroups: AutomationLightGroup[];
  labelledBy: string;
  onChange: Update;
}) {
  const elsewhere = onAnotherBridge(ritual, bridgeId);
  const selected = elsewhere ? [] : ritual.targets;
  // A ritual made of whole rooms opens on rooms; anything else on lights.
  const [view, setView] = useState<"rooms" | "lights">(() =>
    selected.length && selected.every((target) => target.kind !== "light")
      ? "rooms"
      : "lights",
  );
  return (
    <div className="grid min-w-0 gap-3">
      {elsewhere && (
        <p className="text-sm text-muted-foreground">
          These lights are on another bridge. Choose lights on this bridge to
          replace them.
        </p>
      )}
      <div className="flex min-w-0 justify-start">
        <SegmentedControl
          value={view}
          ariaLabel="Choose rooms and zones or individual lights"
          layoutId="focus-lights-view-pill"
          options={lightViews}
          onValueChange={setView}
        />
      </div>
      <AutomationLightPicker
        groups={lightGroups}
        selected={selected}
        labelledBy={labelledBy}
        view={view}
        onChange={(targets) => onChange({ bridgeId, targets })}
      />
    </div>
  );
}

/** How the lights show the time passing. */
export function VibeFields({
  ritual,
  onChange,
}: {
  ritual: FocusRitual;
  onChange: Update;
}) {
  return (
    <div className="grid min-w-0 gap-2.5">
      <div className="grid gap-0.5">
        <span id="focus-vibe-label" className="text-sm font-medium">
          How the lights move
        </span>
        <span className="text-xs leading-5 text-muted-foreground">
          Every one of these travels between the colours below; they differ in
          how they get there. The one you pick plays a whole round beside them.
        </span>
      </div>
      {/* Choose on the left, watch it on the right. */}
      <div className="grid min-w-0 gap-3 @xl:grid-cols-2">
        <div
          role="radiogroup"
          aria-labelledby="focus-vibe-label"
          className="grid min-w-0 content-start gap-2"
        >
          {(Object.keys(vibeInfo) as FocusVibe[]).map((vibe) => {
            const active = ritual.vibe === vibe;
            return (
              <button
                key={vibe}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChange({ vibe })}
                className={cn(
                  "flex min-w-0 items-start gap-2.5 rounded-xl border p-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "border-primary/50 bg-primary/8"
                    : "border-border/60 hover:border-border hover:bg-(--settings-surface-hover)",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                    active ? "border-primary bg-primary" : "border-border/80",
                  )}
                >
                  {active && (
                    <span className="size-1.5 rounded-full bg-primary-foreground" />
                  )}
                </span>
                <span className="grid min-w-0 gap-0.5">
                  <span className="text-sm font-medium">
                    {vibeInfo[vibe].name}
                  </span>
                  <span className="text-xs leading-5 text-muted-foreground">
                    {vibeInfo[vibe].blurb}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <VibePreview ritual={ritual} className="min-h-44" />
      </div>
    </div>
  );
}

/** The color and brightness behind one of the three looks. */
export function LookFields({
  ritual,
  look,
  layoutId,
  onLookChange,
  onChange,
}: {
  ritual: FocusRitual;
  look: FocusLook;
  layoutId: string;
  onLookChange: (look: FocusLook) => void;
  onChange: Update;
}) {
  const brightness =
    look === "break" ? ritual.breakBrightness : ritual.focusBrightness;
  return (
    <div className="grid min-w-0 gap-4">
      <div className="grid gap-0.5">
        <span className="text-sm font-medium">
          The colours it moves between
        </span>
        <span className="text-xs leading-5 text-muted-foreground">
          {vibeColourNote[ritual.vibe]} A break always shows the break colour,
          whichever movement you picked.
        </span>
      </div>
      <SegmentedControl
        value={look}
        ariaLabel="Which look to change"
        layoutId={layoutId}
        options={lookModes.map((option) => ({
          ...option,
          swatch:
            hueDisplayColorHex({ xy: ritual[lookKey[option.value]] }) ??
            undefined,
          detail: `${Math.round(option.value === "break" ? ritual.breakBrightness : ritual.focusBrightness)}%`,
        }))}
        onValueChange={onLookChange}
      />
      <div className="flex min-w-0 flex-wrap items-center gap-x-8 gap-y-5">
        <div className="w-40 shrink-0">
          <ColorWheel
            xy={ritual[lookKey[look]]}
            onPick={(xy) =>
              onChange(
                look === "focus"
                  ? { focusXy: xy }
                  : look === "warning"
                    ? { warningXy: xy }
                    : { breakXy: xy },
              )
            }
          />
        </div>
        <div className="grid min-w-56 flex-1 gap-2">
          <p className="text-sm font-medium">
            {look === "break" ? "Break brightness" : "Focus brightness"}
          </p>
          <LevelSlider
            label={look === "break" ? "Break brightness" : "Focus brightness"}
            value={brightness}
            onCommit={(value) =>
              onChange(
                look === "break"
                  ? { breakBrightness: value }
                  : { focusBrightness: value },
              )
            }
          />
          <p className="text-xs leading-5 text-muted-foreground">
            White-only lights take the nearest white, and plain dimmers just the
            brightness.
          </p>
        </div>
      </div>
    </div>
  );
}

/** The switch that puts the look being edited on the real lights. */
export function PreviewRow({
  hasPro,
  canPreview,
  preview,
  look,
  error,
  layoutId,
  onChange,
}: {
  hasPro: boolean;
  canPreview: boolean;
  preview: boolean;
  look: FocusLook;
  error: string | null;
  layoutId: string;
  onChange: (preview: boolean) => void;
}) {
  const lookLabel = lookModes
    .find((mode) => mode.value === look)
    ?.label.toLowerCase();
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/5">
      <span className="grid min-w-0 gap-0.5">
        <span className="text-sm font-medium">Preview on your lights</span>
        <span
          role="status"
          className={cn(
            "text-xs",
            error ? "text-(--destructive-text)" : "text-muted-foreground",
          )}
        >
          {error ??
            (!hasPro
              ? "Live preview is part of Mote Pro."
              : !canPreview
                ? "Preview starts once you choose lights."
                : preview
                  ? `Showing the ${lookLabel} look. Your lights go back when you turn this off.`
                  : "See the look you are editing on the real lights.")}
        </span>
      </span>
      <SegmentedControl
        value={preview && canPreview ? "on" : "off"}
        ariaLabel="Preview on your lights"
        layoutId={layoutId}
        options={previewModes}
        disabled={!canPreview}
        onValueChange={(mode) => onChange(mode === "on")}
      />
    </div>
  );
}

function Stepper({
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  unit?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const set = (next: number) => onChange(Math.min(max, Math.max(min, next)));
  // A step of five from 1 lands on 5, 10, 15 rather than 6, 11, 16.
  const up = () =>
    set(value < step ? step : Math.floor(value / step) * step + step);
  const down = () =>
    set(value % step === 0 ? value - step : Math.floor(value / step) * step);
  return (
    // One control rather than three loose pieces: the value reads between the
    // two buttons that change it.
    <div
      role="group"
      aria-label={label}
      className="flex items-center gap-0.5 rounded-full border border-border/60 bg-background/40 p-1"
    >
      <Button
        size="icon-sm"
        variant="ghost"
        className="rounded-full"
        aria-label={`Less ${label.toLowerCase()}`}
        disabled={value <= min}
        onClick={down}
      >
        <Minus />
      </Button>
      <span
        className="min-w-16 text-center text-sm font-semibold tabular-nums"
        aria-live="polite"
      >
        {value}
        {unit && (
          <span className="ml-0.5 text-xs font-normal text-muted-foreground">
            {unit}
          </span>
        )}
      </span>
      <Button
        size="icon-sm"
        variant="ghost"
        className="rounded-full"
        aria-label={`More ${label.toLowerCase()}`}
        disabled={value >= max}
        onClick={up}
      >
        <Plus />
      </Button>
    </div>
  );
}
