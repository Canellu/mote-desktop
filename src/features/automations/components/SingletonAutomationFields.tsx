import { Lightbulb, Palette, Sun, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/expandable-row";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  automationTargets,
  awayActions,
  captureAppName,
  onAirTriggers,
  onAirXy,
  type AutomationStatus,
  type AwaySettings,
  type OnAirSettings,
} from "@/features/automations/model";
import { ColorWheel } from "@/features/space-screen/components/ColorWheel";
import { TemperatureWheel } from "@/features/space-screen/components/TemperatureWheel";
import {
  AutomationLightPicker,
  type AutomationLightGroup,
} from "./AutomationLightPicker";
import { FoldAllButton } from "./AutomationPickerGroups";
import { usePickerFolding } from "@/features/automations/usePickerFolding";
import {
  AutomationScenePicker,
  type AutomationSceneOption,
} from "./AutomationScenePicker";
import { LevelSlider } from "@/features/settings-screen/components/LevelSlider";
import { SegmentedControl } from "@/features/settings-screen/components/SegmentedControl";

const targetModes = [
  { value: "lights", label: "Lights", icon: Lightbulb },
  { value: "scene", label: "Scene", icon: Palette },
] as const;
const appearanceModes = [
  { value: "color", label: "Color", icon: Palette },
  { value: "white", label: "White", icon: Sun },
] as const;

/**
 * The shell every automation editor section shares: a heading, then one
 * bordered panel whose parts are split by hairlines. Each direct child of the
 * panel is one of those parts, so fields hand back rows. In dark mode the
 * panel takes the card color, a step above the page.
 */
export const SECTION_PANEL =
  "grid min-w-0 divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-(--settings-surface) dark:bg-card *:px-4 *:py-4 @3xl:*:px-5";

export function FieldSection({
  id,
  title,
  description,
  error,
  children,
}: {
  /** Lets the editor's section list scroll here. */
  id?: string;
  title: string;
  description?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="grid min-w-0 scroll-mt-8 gap-3">
      <SectionHeading title={title} description={description} />
      <div className={SECTION_PANEL}>
        {/* Padding of its own: the panel's rows are padded by the panel, and a
            closed reveal must take up no space at all. */}
        <Reveal open={!!error} className="p-0!">
          <p
            role="alert"
            className="flex items-center gap-2 bg-(--warn-surface) px-4 py-4 text-sm text-(--warn-text) @3xl:px-5"
          >
            <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
            {error}
          </p>
        </Reveal>
        {children}
      </div>
    </section>
  );
}

export function SectionHeading({
  title,
  description,
  titleId,
  action,
}: {
  title: string;
  description?: string;
  titleId?: string;
  /** Sits at the end of the title's line, e.g. a fold-all button. */
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="grid min-w-0 gap-1">
        <h3 id={titleId} className="text-base font-semibold">
          {title}
        </h3>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/**
 * One part of a section: a label, and its control either beside it (a switch
 * or a menu) or under it (a picker or a wheel).
 */
export function FieldRow({
  label,
  hint,
  labelId,
  action,
  below = false,
  children,
}: {
  label: string;
  hint?: string;
  labelId?: string;
  /** Sits at the end of the label's line, e.g. a fold-all button. */
  action?: React.ReactNode;
  /** The control needs the full width, so it sits under the label. */
  below?: boolean;
  children?: React.ReactNode;
}) {
  const heading = (
    <div className="grid min-w-0 gap-0.5">
      <span id={labelId} className="text-sm font-medium">
        {label}
      </span>
      {hint && (
        <span className="text-xs leading-5 text-muted-foreground">{hint}</span>
      )}
    </div>
  );
  if (below || !children)
    return (
      <div className="grid min-w-0 gap-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          {heading}
          {action}
        </div>
        {children}
      </div>
    );
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-3">
      {heading}
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function OnAirWhenFields({
  value,
  status,
  onChange,
}: {
  value: OnAirSettings;
  status: AutomationStatus | null;
  onChange: (next: OnAirSettings) => void;
}) {
  const update = (patch: Partial<OnAirSettings>) =>
    onChange({ ...value, ...patch });
  return (
    <>
      <FieldRow label="Turns on for">
        <Select
          value={value.trigger}
          onValueChange={(trigger) => trigger && update({ trigger })}
        >
          <SelectTrigger aria-label="Turns on for" className="w-56">
            <SelectValue>
              {
                onAirTriggers.find((option) => option.value === value.trigger)
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
      </FieldRow>
      <FieldRow
        label="Ignored apps"
        hint={
          status?.captureApps.length
            ? "For apps that keep the microphone or camera open outside calls."
            : "Apps show up here once one uses your microphone or camera."
        }
        below
      >
        {status?.captureApps.length ? (
          <ul className="grid gap-1">
            {status.captureApps.map((app) => (
              <li
                key={app.id}
                className="flex min-w-0 items-center justify-between gap-4 py-1"
              >
                <span className="truncate text-sm">
                  {captureAppName(app.id)}
                </span>
                <Switch
                  aria-label={`Ignore ${captureAppName(app.id)}`}
                  checked={value.ignoredApps.includes(app.id)}
                  onCheckedChange={(ignored) =>
                    update({
                      ignoredApps: ignored
                        ? [...value.ignoredApps, app.id]
                        : value.ignoredApps.filter((id) => id !== app.id),
                    })
                  }
                />
              </li>
            ))}
          </ul>
        ) : undefined}
      </FieldRow>
    </>
  );
}

export function OnAirLookFields({
  value,
  lightGroups,
  scenes,
  bridgeId,
  onChange,
}: {
  value: OnAirSettings;
  lightGroups: AutomationLightGroup[];
  scenes: AutomationSceneOption[];
  bridgeId: string | null;
  onChange: (next: OnAirSettings) => void;
}) {
  const update = (patch: Partial<OnAirSettings>) =>
    onChange({ ...value, ...patch });
  const sceneMode = value.mode === "scene";
  const folding = usePickerFolding();
  return (
    <>
      <FieldRow label="Change">
        <SegmentedControl
          value={sceneMode ? "scene" : "lights"}
          ariaLabel="Change lights or use a scene"
          layoutId="automation-draft-target-mode"
          options={targetModes}
          onValueChange={(mode) =>
            update({
              mode:
                mode === "scene"
                  ? "scene"
                  : value.mode === "white"
                    ? "white"
                    : "color",
            })
          }
        />
      </FieldRow>
      <FieldRow
        label={sceneMode ? "Scene" : "Lights"}
        labelId="automation-lights-look"
        action={<FoldAllButton state={folding} />}
        below
      >
        {sceneMode ? (
          <AutomationScenePicker
            scenes={scenes}
            labelledBy="automation-lights-look"
            folding={folding.folding}
            selectedId={value.scene?.id ?? null}
            fallbackName={value.scene?.name}
            onSelect={(scene) =>
              update({ bridgeId, scene: { id: scene.id, name: scene.name } })
            }
          />
        ) : (
          <AutomationLightPicker
            groups={lightGroups}
            selected={automationTargets(value)}
            labelledBy="automation-lights-look"
            folding={folding.folding}
            onChange={(targets) => update({ bridgeId, target: null, targets })}
          />
        )}
      </FieldRow>
      {sceneMode ? (
        <FieldRow label="Brightness" below>
          <div className="max-w-sm">
            <LevelSlider
              label="On-air brightness"
              value={value.brightness}
              onCommit={(brightness) => update({ brightness })}
            />
          </div>
        </FieldRow>
      ) : (
        <FieldRow label="Look" below>
          <SegmentedControl
            value={value.mode === "white" ? "white" : "color"}
            ariaLabel="On-air appearance"
            layoutId="automation-draft-appearance"
            options={appearanceModes}
            onValueChange={(mode) => update({ mode })}
          />
          <div className="flex min-w-0 flex-wrap items-center gap-6">
            <div className="w-40 shrink-0">
              {value.mode === "white" ? (
                <TemperatureWheel
                  value={value.mirek}
                  min={153}
                  max={500}
                  onPick={(mirek) => update({ mirek })}
                />
              ) : (
                <ColorWheel
                  xy={onAirXy(value)}
                  onPick={(xy) => update({ xy })}
                />
              )}
            </div>
            <div className="min-w-56 flex-1">
              <LevelSlider
                label="On-air brightness"
                value={value.brightness}
                onCommit={(brightness) => update({ brightness })}
              />
            </div>
          </div>
        </FieldRow>
      )}
    </>
  );
}

export function PcLockActionFields({
  value,
  lightGroups,
  scenes,
  bridgeId,
  onChange,
}: {
  value: AwaySettings;
  lightGroups: AutomationLightGroup[];
  scenes: AutomationSceneOption[];
  bridgeId: string | null;
  onChange: (next: AwaySettings) => void;
}) {
  const update = (patch: Partial<AwaySettings>) =>
    onChange({ ...value, ...patch });
  const folding = usePickerFolding();
  return (
    <>
      <FieldRow label="What happens">
        <Select
          value={value.action}
          onValueChange={(action) => action && update({ action })}
        >
          <SelectTrigger aria-label="What happens" className="w-56">
            <SelectValue>
              {
                awayActions.find((option) => option.value === value.action)
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
      </FieldRow>
      <FieldRow
        label={value.action === "scene" ? "Scene" : "Lights"}
        labelId="pc-lock-lights-action"
        action={<FoldAllButton state={folding} />}
        below
      >
        {value.action === "scene" ? (
          <AutomationScenePicker
            scenes={scenes}
            labelledBy="pc-lock-lights-action"
            folding={folding.folding}
            selectedId={value.scene?.id ?? null}
            fallbackName={value.scene?.name}
            onSelect={(scene) =>
              update({ bridgeId, scene: { id: scene.id, name: scene.name } })
            }
          />
        ) : (
          <AutomationLightPicker
            groups={lightGroups}
            selected={automationTargets(value)}
            labelledBy="pc-lock-lights-action"
            folding={folding.folding}
            onChange={(targets) => update({ bridgeId, target: null, targets })}
          />
        )}
      </FieldRow>
      {value.action === "dim" && (
        <FieldRow
          label="Dim to"
          hint="Lights already dimmer than this are left as they are."
          below
        >
          <div className="max-w-sm">
            <LevelSlider
              label="Dim level"
              value={value.dimBrightness}
              onCommit={(dimBrightness) => update({ dimBrightness })}
            />
          </div>
        </FieldRow>
      )}
    </>
  );
}

export function PcLockReturnFields({
  value,
  onChange,
}: {
  value: AwaySettings;
  onChange: (next: AwaySettings) => void;
}) {
  const update = (patch: Partial<AwaySettings>) =>
    onChange({ ...value, ...patch });
  return (
    <>
      <FieldRow label="Also when this PC sleeps">
        <Switch
          aria-label="Also when this PC sleeps"
          checked={value.includeSleep}
          onCheckedChange={(includeSleep) => update({ includeSleep })}
        />
      </FieldRow>
      <FieldRow
        label="Put lights back when you return"
        hint="A light someone changed while you were away is left as it is."
      >
        <Switch
          aria-label="Put lights back when you return"
          checked={value.restoreOnReturn}
          onCheckedChange={(restoreOnReturn) => update({ restoreOnReturn })}
        />
      </FieldRow>
    </>
  );
}

export function ClearTargetsButton({
  count,
  onClear,
}: {
  count: number;
  onClear: () => void;
}) {
  return count ? (
    <Button
      size="sm"
      variant="ghost"
      className="justify-self-start"
      onClick={onClear}
    >
      Clear {count} selected
    </Button>
  ) : null;
}
