import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useEntitlements } from "@/context/EntitlementContext";
import { useHue } from "@/context/HueContext";
import {
  awayActions,
  captureAppName,
  onAirColors,
  onAirTriggers,
  type AutomationStatus,
  type AutomationTarget,
  type AwaySettings,
  type OnAirSettings,
} from "@/features/automations/model";
import {
  loadAutomations,
  saveAutomationSettings,
  useAutomationStore,
} from "@/features/automations/store";
import { useProUpgrade } from "@/features/pro/proUpgrade";
import { describeCommandError } from "@/lib/entitlement-errors";
import { cn } from "@/lib/utils";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import {
  SettingsRow,
  SettingsSection,
  SettingsStack,
} from "../components/SettingsList";
import {
  ShortcutTargetPicker,
  type ShortcutTarget,
} from "../components/ShortcutTargetPicker";

const targetKinds = ["light", "room", "zone"] as const;

type StatusText = { text: string | null; error?: boolean };

export function AutomationsTab() {
  const { hasPro } = useEntitlements();
  const { requestPro } = useProUpgrade();
  const { bridgeId } = useHue();
  const lights = useHueResourcesStore((s) => s.lights);
  const spaces = useHueResourcesStore((s) => s.roomZones);
  const settings = useAutomationStore((s) => s.settings);
  const status = useAutomationStore((s) => s.status);
  const loadError = useAutomationStore((s) => s.loadError);

  useEffect(() => {
    void loadAutomations();
  }, []);

  if (loadError || !settings) {
    return (
      <SettingsStack>
        <p role="status" className="text-sm text-muted-foreground">
          {loadError ?? "Loading automations…"}
        </p>
      </SettingsStack>
    );
  }

  const targets: ShortcutTarget[] = [
    ...lights.map((light) => ({
      id: light.id,
      kind: "light" as const,
      name: light.name,
      context:
        spaces.find(
          (space) =>
            space.resourceType === "room" && space.lightIds.includes(light.id),
        )?.name ?? "",
    })),
    ...spaces
      .filter((space) => space.groupedLightId)
      .map((space) => ({
        id: space.groupedLightId!,
        kind: space.resourceType,
        name: space.name,
        context: `${space.lightCount} ${space.lightCount === 1 ? "light" : "lights"}`,
      })),
  ];

  const { onAir, away } = settings;
  const onAnotherBridge = (owner: string | null) =>
    !!owner && !!bridgeId && owner !== bridgeId;
  const canTurnOn = (automation: OnAirSettings | AwaySettings) =>
    !!automation.target && !onAnotherBridge(automation.bridgeId);
  const chosen = (target: ShortcutTarget) => ({
    bridgeId,
    target: {
      kind: target.kind as AutomationTarget["kind"],
      id: target.id,
      name: target.name,
    },
  });
  const updateOnAir = (patch: Partial<OnAirSettings>) =>
    void saveAutomationSettings((current) => ({
      ...current,
      onAir: { ...current.onAir, ...patch },
    }));
  const updateAway = (patch: Partial<AwaySettings>) =>
    void saveAutomationSettings((current) => ({
      ...current,
      away: { ...current.away, ...patch },
    }));
  const toggleIgnored = (id: string) =>
    void saveAutomationSettings((current) => {
      const ignored = current.onAir.ignoredApps;
      return {
        ...current,
        onAir: {
          ...current.onAir,
          ignoredApps: ignored.includes(id)
            ? ignored.filter((app) => app !== id)
            : [...ignored, id],
        },
      };
    });

  return (
    <SettingsStack>
      {/* Starting an automation is refused in Rust without Pro. Saying so here
        stops somebody setting one up and wondering why nothing happens; the
        settings stay editable so it works the moment Pro is owned. */}
      {!hasPro && (
        <div className="flex max-w-prose flex-wrap items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
          <p className="min-w-0 flex-1 text-sm leading-6">
            Automations are part of Mote Pro. You can set them up now — they
            start working as soon as Pro is unlocked.
          </p>
          <Button size="sm" onClick={() => requestPro("local_automation")}>
            Get Mote Pro
          </Button>
        </div>
      )}

      <SettingsSection title="On-air light">
        <SettingsRow
          title="Show when you're on a call"
          description={
            <>
              A light changes color while an app uses your microphone or camera,
              and goes back to how it was when the call ends.
              <StatusLine {...onAirStatus(onAir, status)} />
            </>
          }
          keepControlInline
        >
          <Switch
            aria-label="On-air light"
            checked={onAir.enabled}
            disabled={!onAir.enabled && !canTurnOn(onAir)}
            onCheckedChange={(enabled) => updateOnAir({ enabled })}
          />
        </SettingsRow>
        <TargetField
          labelId="on-air-target-label"
          label="Light"
          targets={targets}
          target={onAir.target}
          onAnotherBridge={onAnotherBridge(onAir.bridgeId)}
          onChange={(target) => updateOnAir(chosen(target))}
        />
        <SettingsRow title="Turns on for">
          <Select
            value={onAir.trigger}
            onValueChange={(trigger) => {
              if (trigger)
                updateOnAir({ trigger: trigger as OnAirSettings["trigger"] });
            }}
          >
            <SelectTrigger aria-label="Turns on for" className="min-w-52">
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
        </SettingsRow>
        <SettingsRow
          title="Color"
          description="Lights that cannot show color turn on at the brightness below."
        >
          <div role="group" aria-label="On-air color" className="flex gap-2.5">
            {onAirColors.map((color) => (
              <button
                key={color.value}
                type="button"
                aria-label={color.label}
                aria-pressed={onAir.color === color.value}
                title={color.label}
                onClick={() => updateOnAir({ color: color.value })}
                className={cn(
                  "size-8 rounded-full ring-1 ring-foreground/15 ring-offset-2 ring-offset-(--settings-surface) outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  onAir.color === color.value && "ring-2 ring-foreground",
                )}
                style={{ background: color.swatch }}
              />
            ))}
          </div>
        </SettingsRow>
        <SettingsRow title="Brightness">
          <LevelSlider
            label="On-air brightness"
            value={onAir.brightness}
            onCommit={(brightness) => updateOnAir({ brightness })}
          />
        </SettingsRow>
        <CaptureApps
          status={status}
          ignored={onAir.ignoredApps}
          onToggle={toggleIgnored}
        />
      </SettingsSection>

      <SettingsSection title="When this PC locks">
        <SettingsRow
          title="Change lights when you step away"
          description={
            <>
              When you lock this PC, Mote turns lights off or dims them, and
              puts them back when you unlock it.
              <StatusLine {...awayStatus(away, status)} />
            </>
          }
          keepControlInline
        >
          <Switch
            aria-label="Change lights when this PC locks"
            checked={away.enabled}
            disabled={!away.enabled && !canTurnOn(away)}
            onCheckedChange={(enabled) => updateAway({ enabled })}
          />
        </SettingsRow>
        <TargetField
          labelId="away-target-label"
          label="Lights"
          targets={targets}
          target={away.target}
          onAnotherBridge={onAnotherBridge(away.bridgeId)}
          onChange={(target) => updateAway(chosen(target))}
        />
        <SettingsRow title="What happens">
          <Select
            value={away.action}
            onValueChange={(action) => {
              if (action)
                updateAway({ action: action as AwaySettings["action"] });
            }}
          >
            <SelectTrigger aria-label="What happens" className="min-w-40">
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
        </SettingsRow>
        {away.action === "dim" && (
          <SettingsRow
            title="Dim to"
            description="Lights already dimmer than this are left as they are."
          >
            <LevelSlider
              label="Dim level"
              value={away.dimBrightness}
              onCommit={(dimBrightness) => updateAway({ dimBrightness })}
            />
          </SettingsRow>
        )}
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
            onCheckedChange={(restoreOnReturn) =>
              updateAway({ restoreOnReturn })
            }
          />
        </SettingsRow>
      </SettingsSection>
    </SettingsStack>
  );
}

function onAirStatus(
  settings: OnAirSettings,
  status: AutomationStatus | null,
): StatusText {
  if (!settings.enabled) return { text: null };
  const current = status?.onAir;
  if (current?.error)
    return { text: describeCommandError(current.error), error: true };
  if (current?.active)
    return {
      text: current.apps.length
        ? `On air now · ${current.apps.join(", ")}`
        : "On air now",
    };
  return { text: "On. Waiting for a call." };
}

function awayStatus(
  settings: AwaySettings,
  status: AutomationStatus | null,
): StatusText {
  if (!settings.enabled) return { text: null };
  const current = status?.away;
  if (current?.error)
    return { text: describeCommandError(current.error), error: true };
  if (current?.active)
    return { text: "Lights are changed until you unlock this PC." };
  return { text: "On. Lock this PC with Windows+L to try it." };
}

function StatusLine({ text, error }: StatusText) {
  if (!text) return null;
  return (
    <span
      role="status"
      className={cn(
        "mt-1.5 block",
        error ? "text-(--destructive-text)" : "text-foreground",
      )}
    >
      {text}
    </span>
  );
}

function TargetField({
  labelId,
  label,
  targets,
  target,
  onAnotherBridge,
  onChange,
}: {
  labelId: string;
  label: string;
  targets: ShortcutTarget[];
  target: AutomationTarget | null;
  onAnotherBridge: boolean;
  onChange: (target: ShortcutTarget) => void;
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <p id={labelId} className="text-sm font-medium">
        {label}
      </p>
      {onAnotherBridge && (
        <p className="max-w-prose text-sm text-muted-foreground">
          Set up on another bridge. Switch to that bridge, or choose lights on
          this one.
        </p>
      )}
      <ShortcutTargetPicker
        targets={targets}
        kinds={targetKinds}
        labelledBy={labelId}
        value={target ? `${target.kind}:${target.id}` : ""}
        fallbackName={target?.name ?? ""}
        onChange={onChange}
      />
    </div>
  );
}

const first = (v: number | readonly number[]): number =>
  Array.isArray(v) ? v[0] : (v as number);

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

  return (
    <div className="flex w-60 max-w-full items-center gap-3">
      <Slider
        aria-label={label}
        min={1}
        max={100}
        step={1}
        value={[draft]}
        onValueChange={(next) => setDraft(first(next))}
        onValueCommitted={(next) => onCommit(first(next))}
      />
      <span className="w-10 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
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
      <div className="grid gap-1">
        <p className="text-sm font-medium">
          Apps using your microphone or camera
        </p>
        <p className="max-w-prose text-sm leading-5 text-muted-foreground">
          Ignore an app that keeps them open outside calls, such as a voice
          assistant or streaming software.
        </p>
      </div>
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
