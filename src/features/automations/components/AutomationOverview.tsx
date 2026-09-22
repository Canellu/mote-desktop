import { useEffect } from "react";
import { CalendarClock, Lock, Mic, Plus, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  CalendarSettings,
  CalendarStatus,
} from "@/features/automations/calendar";
import type { AutomationKind } from "@/features/automations/editor-model";
import type {
  AutomationSettings,
  AutomationStatus,
} from "@/features/automations/model";
import {
  calendarStatusText,
  isAwayConfigured,
  isOnAirConfigured,
  isPresenceConfigured,
  presenceStatusText,
  singletonStatus,
} from "@/features/automations/presentation";
import type {
  PresenceSettings,
  PresenceStatus,
} from "@/features/automations/presence";
import type { AutomationLightGroup } from "./AutomationLightPicker";
import type { AutomationSceneOption } from "./AutomationScenePicker";
import {
  awaySummary,
  calendarRuleSummary,
  onAirSummary,
  presenceSummary,
} from "@/features/automations/summaries";
import { AutomationCard } from "./AutomationCard";
import { AutomationPriority } from "./AutomationPriority";
import { SectionHeading } from "./SingletonAutomationFields";

const selectedTargets = (groups: AutomationLightGroup[]) =>
  new Set(groups.flatMap((group) => group.options.map((option) => option.id)));

export function AutomationOverview({
  settings,
  status,
  presence,
  presenceStatus,
  calendar,
  calendarStatus,
  presenceError,
  calendarError,
  lightGroups,
  scenes,
  bridgeId,
  hasPro,
  resourcesLoading,
  auxiliaryLoading,
  onAdd,
  onEdit,
  onToggleSingleton,
  onTogglePresence,
  onToggleCalendar,
  onReorder,
  onRetryPresence,
  onRetryCalendar,
}: {
  settings: AutomationSettings;
  status: AutomationStatus | null;
  presence: PresenceSettings | null;
  presenceStatus: PresenceStatus | null;
  calendar: CalendarSettings | null;
  calendarStatus: CalendarStatus | null;
  presenceError: string | null;
  calendarError: string | null;
  lightGroups: AutomationLightGroup[];
  scenes: AutomationSceneOption[];
  bridgeId: string | null;
  hasPro: boolean;
  resourcesLoading: boolean;
  auxiliaryLoading: boolean;
  onAdd: () => void;
  onEdit: (kind: AutomationKind, ruleId?: string) => void;
  onToggleSingleton: (kind: "onAir" | "away", enabled: boolean) => void;
  onTogglePresence: (enabled: boolean) => void;
  onToggleCalendar: (id: string, enabled: boolean) => void;
  /** Saves a new priority order, dragged in place. */
  onReorder: (order: AutomationSettings["priority"]) => void;
  onRetryPresence: () => void;
  onRetryCalendar: () => void;
}) {
  const focusKey = sessionStorage.getItem("mote-automation-focus");
  useEffect(() => {
    if (focusKey) sessionStorage.removeItem("mote-automation-focus");
  }, [focusKey]);
  const targetIds = selectedTargets(lightGroups);
  const sceneIds = new Set(scenes.map((scene) => scene.id));
  const currentBridge = (owner: string | null) => !owner || owner === bridgeId;
  const singletonValid = (kind: "onAir" | "away") => {
    const value = settings[kind];
    const sceneMode =
      kind === "onAir"
        ? settings.onAir.mode === "scene"
        : settings.away.action === "scene";
    return (
      !!bridgeId &&
      currentBridge(value.bridgeId) &&
      (sceneMode
        ? !!value.scene && sceneIds.has(value.scene.id)
        : (value.targets.length > 0 || !!value.target) &&
          [...value.targets, ...(value.target ? [value.target] : [])].some(
            (item) => targetIds.has(item.id),
          ))
    );
  };
  const presenceValid =
    !!presence &&
    !!bridgeId &&
    currentBridge(presence.bridgeId) &&
    presence.devices.some((device) => device.enabled) &&
    (!!presence.arrivalScene || presence.departureTargets.length > 0);
  const calendarValid = (
    rule: NonNullable<CalendarSettings>["rules"][number],
  ) =>
    !!bridgeId &&
    currentBridge(rule.bridgeId) &&
    (rule.look === "scene"
      ? !!rule.scene && sceneIds.has(rule.scene.id)
      : rule.targets.length > 0);
  const showOnAir = isOnAirConfigured(settings.onAir);
  const showAway = isAwayConfigured(settings.away);
  const showPresence = !!presence && isPresenceConfigured(presence);
  const rules = calendar?.rules ?? [];
  const empty = !showOnAir && !showAway && !showPresence && rules.length === 0;
  const checking = { text: "Checking lights", tone: "neutral" as const };
  const onAirLive = resourcesLoading
    ? checking
    : singletonStatus(
        "onAir",
        settings.onAir.enabled,
        singletonValid("onAir"),
        hasPro,
        status,
      );
  const awayLive = resourcesLoading
    ? checking
    : singletonStatus(
        "away",
        settings.away.enabled,
        singletonValid("away"),
        hasPro,
        status,
      );
  const presenceLive = resourcesLoading
    ? checking
    : presenceStatusText(
        presence?.enabled ?? false,
        presenceValid,
        hasPro,
        presenceStatus,
      );

  return (
    <div className="@container grid min-w-0 gap-8">
      {empty && auxiliaryLoading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading automations…
        </p>
      ) : empty ? (
        <section className="grid justify-items-start gap-3 rounded-2xl border border-border/60 bg-(--settings-surface) p-5 dark:bg-card">
          <div className="grid gap-1">
            <h3 className="text-base font-semibold">
              Make your lights respond automatically.
            </h3>
            <p className="max-w-prose text-sm leading-5 text-muted-foreground">
              Choose what happens during calls, when you lock your PC, when you
              leave home, or around calendar events.
            </p>
          </div>
          <Button onClick={onAdd}>
            <Plus aria-hidden />
            Add automation
          </Button>
        </section>
      ) : (
        <section className="grid min-w-0 gap-3">
          <SectionHeading
            title="Your automations"
            description="Each one runs on its own while Mote is open or in the tray."
          />
          {showOnAir && (
            <AutomationCard
              icon={Mic}
              title="On-air light"
              summary={onAirSummary(settings.onAir).sentence}
              status={onAirLive.text}
              statusTone={onAirLive.tone}
              enabled={settings.onAir.enabled}
              canEnable={hasPro && singletonValid("onAir")}
              onToggle={(enabled) => onToggleSingleton("onAir", enabled)}
              onEdit={() => onEdit("onAir")}
              focusRequested={focusKey === "onAir"}
            />
          )}
          {showAway && (
            <AutomationCard
              icon={Lock}
              title="When this PC locks"
              summary={awaySummary(settings.away).sentence}
              status={awayLive.text}
              statusTone={awayLive.tone}
              enabled={settings.away.enabled}
              canEnable={hasPro && singletonValid("away")}
              onToggle={(enabled) => onToggleSingleton("away", enabled)}
              onEdit={() => onEdit("away")}
              focusRequested={focusKey === "away"}
            />
          )}
          {showPresence && presence && (
            <AutomationCard
              icon={Radar}
              title="Presence"
              summary={presenceSummary(presence).sentence}
              status={presenceLive.text}
              statusTone={presenceLive.tone}
              enabled={presence.enabled}
              canEnable={hasPro && presenceValid}
              onToggle={onTogglePresence}
              onEdit={() => onEdit("presence")}
              focusRequested={focusKey === "presence"}
            />
          )}
          {rules.map((rule) => {
            const live = resourcesLoading
              ? checking
              : calendarStatusText(
                  rule,
                  calendarValid(rule),
                  hasPro,
                  calendarStatus,
                );
            return (
              <AutomationCard
                key={rule.id}
                icon={CalendarClock}
                title={rule.name || "Calendar rule"}
                summary={
                  calendarRuleSummary(rule, calendar?.feeds ?? []).sentence
                }
                status={live.text}
                statusTone={live.tone}
                enabled={rule.enabled}
                canEnable={hasPro && calendarValid(rule)}
                onToggle={(enabled) => onToggleCalendar(rule.id, enabled)}
                onEdit={() => onEdit("calendar", rule.id)}
                focusRequested={focusKey === rule.id}
              />
            );
          })}
        </section>
      )}

      {(presenceError || calendarError) && (
        <div className="grid gap-2" role="status">
          {presenceError && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-(--destructive-text)">
                Presence could not load: {presenceError}
              </p>
              <Button size="sm" variant="outline" onClick={onRetryPresence}>
                Retry
              </Button>
            </div>
          )}
          {calendarError && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-(--destructive-text)">
                Calendars could not load: {calendarError}
              </p>
              <Button size="sm" variant="outline" onClick={onRetryCalendar}>
                Retry
              </Button>
            </div>
          )}
        </div>
      )}

      {calendar && calendar.feeds.length > 0 && rules.length === 0 && (
        <button
          type="button"
          className="text-left text-sm text-muted-foreground hover:text-foreground"
          onClick={onAdd}
        >
          Calendar connected — add a rule
        </button>
      )}

      {/* Not an automation: it settles lights between all of them, Focus and
          PC Sync included, so it is kept apart from the list. */}
      <section className="grid min-w-0 gap-3 border-t border-border/60 pt-8">
        <SectionHeading
          title="Priority"
          description="One light can only do one thing. Drag these into the order you want: the one higher up keeps the light, and the next takes over when it lets go. Anything above PC Sync pauses it while it needs those lights; anything below leaves them alone."
        />
        <AutomationPriority order={settings.priority} onChange={onReorder} />
      </section>
    </div>
  );
}
