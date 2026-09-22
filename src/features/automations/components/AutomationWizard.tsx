import { useEffect, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { toast } from "sonner";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  newCalendarRule,
  saveCalendar,
  useCalendarStore,
  type CalendarRule,
  type CalendarSettings,
  type CalendarStatus,
} from "@/features/automations/calendar";
import type { AutomationKind } from "@/features/automations/editor-model";
import {
  mergeCalendarDraft,
  mergeSingletonDraft,
  sameValue,
} from "@/features/automations/editor-model";
import type {
  AutomationSettings,
  AwaySettings,
  OnAirSettings,
} from "@/features/automations/model";
import {
  defaultPresenceSettings,
  savePresence,
  usePresenceStore,
  type PresenceSettings,
  type PresenceStatus,
} from "@/features/automations/presence";
import {
  saveAutomationSettings,
  useAutomationStore,
} from "@/features/automations/store";
import { useAutomationPreview } from "@/features/automations/useAutomationPreview";
import {
  validateAway,
  validateCalendar,
  validateOnAir,
  validatePresence,
} from "@/features/automations/validation";
import type { AutomationLightGroup } from "./AutomationLightPicker";
import type { AutomationSceneOption } from "./AutomationScenePicker";
import { PresenceEditor } from "./PresenceEditor";
import { CalendarConnections, CalendarRuleFields } from "./CalendarEditor";
import {
  SettingsWizardContainedStep,
  SettingsWizardLayout,
  SettingsWizardViewport,
} from "@/features/settings-screen/components/SettingsWizardLayout";
import { AutomationTypePicker } from "./AutomationTypePicker";
import {
  FieldSection,
  OnAirLookFields,
  OnAirWhenFields,
  PcLockActionFields,
  PcLockReturnFields,
} from "./SingletonAutomationFields";

const steps = {
  onAir: ["When", "Lights & look", "Review"],
  away: ["Lights & action", "Review"],
  presence: ["Phones", "Leaving & returning", "Review"],
  calendar: ["Events", "Lights & timing", "Review"],
} as const;

export function AutomationWizard({
  settings,
  status,
  lightGroups,
  scenes,
  bridgeId,
  hasPro,
  configured,
  presenceSettings,
  presenceStatus,
  calendarSettings,
  calendarStatus,
  onExit,
  onEditExisting,
}: {
  settings: AutomationSettings;
  status: Parameters<typeof OnAirWhenFields>[0]["status"];
  lightGroups: AutomationLightGroup[];
  scenes: AutomationSceneOption[];
  bridgeId: string | null;
  hasPro: boolean;
  configured: ReadonlySet<AutomationKind>;
  presenceSettings: PresenceSettings | null;
  presenceStatus: PresenceStatus | null;
  calendarSettings: CalendarSettings | null;
  calendarStatus: CalendarStatus | null;
  onExit: () => void;
  onEditExisting: (kind: "onAir" | "away" | "presence") => void;
}) {
  const [kind, setKind] = useState<AutomationKind | null>(null);
  const [onAir, setOnAir] = useState<OnAirSettings | null>(null);
  const [away, setAway] = useState<AwaySettings | null>(null);
  const [presence, setPresence] = useState<PresenceSettings | null>(null);
  const [calendar, setCalendar] = useState<CalendarRule | null>(null);
  const initial = useRef<
    OnAirSettings | AwaySettings | PresenceSettings | CalendarRule | null
  >(null);
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const [preview, setPreview] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [overwriteConflict, setOverwriteConflict] = useState(false);
  const allowExit = useRef(false);
  const internalBack = useRef(false);
  const draft =
    kind === "onAir"
      ? onAir
      : kind === "away"
        ? away
        : kind === "presence"
          ? presence
          : kind === "calendar"
            ? calendar
            : null;
  const dirty =
    !!draft && !!initial.current && !sameValue(draft, initial.current);
  const blocker = useBlocker({
    shouldBlockFn: ({ action }) => {
      if (action === "BACK" && step > 0) {
        internalBack.current = true;
        setPreview(false);
        setStep((current) => Math.max(0, current - 1));
        return true;
      }
      return dirty && !allowExit.current;
    },
    enableBeforeUnload: dirty,
    withResolver: true,
  });
  useEffect(() => {
    if (blocker.status === "blocked" && internalBack.current) {
      internalBack.current = false;
      blocker.reset();
    }
  }, [blocker]);
  const targetIds = new Set(
    lightGroups.flatMap((group) => group.options.map((option) => option.id)),
  );
  const sceneIds = new Set(scenes.map((scene) => scene.id));
  const context = { bridgeId, targetIds, sceneIds };
  const issues =
    kind === "onAir" && onAir
      ? validateOnAir(onAir, context)
      : kind === "away" && away
        ? validateAway(away, context)
        : kind === "presence" && presence
          ? validatePresence(presence, context)
          : kind === "calendar" && calendar
            ? validateCalendar(calendar, {
                ...context,
                feeds: calendarSettings?.feeds ?? [],
              })
            : [];
  const previewSettings =
    kind === "onAir" && onAir
      ? mergeSingletonDraft(settings, { kind, value: onAir })
      : kind === "away" && away
        ? mergeSingletonDraft(settings, { kind, value: away })
        : settings;
  const previewRule = kind === "onAir" || kind === "away" ? kind : null;
  const { error: previewError } = useAutomationPreview(
    preview && hasPro && issues.length === 0 ? previewRule : null,
    previewSettings,
  );

  const choose = (next: AutomationKind) => {
    if (next !== "calendar" && configured.has(next)) {
      onEditExisting(next);
      return;
    }
    if (next === "calendar") {
      const value = newCalendarRule();
      initial.current = structuredClone(value);
      setCalendar(value);
    } else if (next === "presence") {
      const value = {
        ...structuredClone(presenceSettings ?? defaultPresenceSettings()),
        enabled: false,
      };
      initial.current = structuredClone(value);
      setPresence(value);
    } else if (next === "onAir") {
      const value = { ...structuredClone(settings.onAir), enabled: false };
      initial.current = structuredClone(value);
      setOnAir(value);
    } else {
      const value = { ...structuredClone(settings.away), enabled: false };
      initial.current = structuredClone(value);
      setAway(value);
    }
    setKind(next);
    setStep(0);
    setMaxStep(0);
  };
  const changeStep = (next: number) => {
    if (next < step) setPreview(false);
    setStep(next);
    setMaxStep((current) => Math.max(current, next));
  };
  const leave = () => {
    if (dirty) {
      window.history.back();
      return;
    }
    allowExit.current = true;
    onExit();
  };
  const save = async (enabled: boolean) => {
    if (!kind || !draft || pending || issues.length) return;
    const automationSettings = useAutomationStore.getState().settings;
    const latest =
      kind === "calendar"
        ? useCalendarStore.getState().settings
        : kind === "presence"
          ? usePresenceStore.getState().settings
          : automationSettings?.[kind];
    if (!latest) {
      setError("Automation settings are not available. Try again.");
      return;
    }
    if (
      kind !== "calendar" &&
      initial.current &&
      !sameValue(latest, initial.current) &&
      !overwriteConflict
    ) {
      setConflict(true);
      return;
    }
    setPending(true);
    setPreview(false);
    setError(null);
    const next = { ...draft, enabled };
    const saved =
      kind === "calendar"
        ? await saveCalendar(
            (current) =>
              mergeCalendarDraft(current, next as CalendarRule, "create") ??
              current,
          )
        : kind === "presence"
          ? await savePresence(() => next as PresenceSettings)
          : await saveAutomationSettings((current) =>
              kind === "onAir"
                ? mergeSingletonDraft(current, {
                    kind,
                    value: next as OnAirSettings,
                  })
                : mergeSingletonDraft(current, {
                    kind,
                    value: next as AwaySettings,
                  }),
            );
    setPending(false);
    if (!saved) {
      setError(
        "The automation could not be saved. Your changes are still here.",
      );
      return;
    }
    allowExit.current = true;
    sessionStorage.setItem(
      "mote-automation-focus",
      kind === "calendar" ? (next as CalendarRule).id : kind,
    );
    toast.success(
      `${kind === "onAir" ? "On-air light" : kind === "away" ? "PC lock" : kind === "presence" ? "Presence" : "Calendar rule"} saved`,
    );
    onExit();
  };

  if (!kind || !draft) {
    return (
      <div className="mx-auto h-full w-full max-w-4xl py-4">
        <AutomationTypePicker
          configured={configured}
          onChoose={choose}
          onCancel={onExit}
        />
      </div>
    );
  }

  const onAirStep =
    kind === "onAir" && onAir ? (
      step === 0 ? (
        <FieldSection
          title="When"
          description="Choose what switches the light on."
        >
          <OnAirWhenFields value={onAir} status={status} onChange={setOnAir} />
        </FieldSection>
      ) : step === 1 ? (
        <>
          <FieldSection
            title="Lights & look"
            description="Choose direct lights or one saved scene."
            error={issues[0]?.message}
          >
            <OnAirLookFields
              value={onAir}
              lightGroups={lightGroups}
              scenes={scenes}
              bridgeId={bridgeId}
              onChange={setOnAir}
            />
          </FieldSection>
          <PreviewControl
            hasPro={hasPro}
            preview={preview}
            onChange={setPreview}
            error={previewError}
          />
        </>
      ) : (
        <Review
          title="On-air light"
          lines={[
            `Trigger: ${onAir.trigger === "camera" ? "Camera" : onAir.trigger === "microphone" ? "Microphone" : "Microphone or camera"}`,
            onAir.mode === "scene"
              ? `Scene: ${onAir.scene?.name ?? "Not selected"}`
              : `${automationTargetCount(onAir)} selected`,
            `${onAir.ignoredApps.length} app ${onAir.ignoredApps.length === 1 ? "exception" : "exceptions"}`,
            "Lights return to their previous state when microphone or camera use ends.",
          ]}
          error={error}
          conflict={conflict}
          onReload={() => {
            const latest = useAutomationStore.getState().settings?.onAir;
            if (latest) {
              initial.current = structuredClone(latest);
              setOnAir(structuredClone(latest));
            }
            setConflict(false);
            setOverwriteConflict(false);
          }}
          onKeep={() => {
            setOverwriteConflict(true);
            setConflict(false);
          }}
          secondary={
            hasPro ? (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => void save(false)}
              >
                Save disabled
              </Button>
            ) : null
          }
        />
      )
    ) : null;
  const awayStep =
    kind === "away" && away ? (
      step === 0 ? (
        <div className="grid gap-6">
          <FieldSection
            title="Lights & action"
            description="Choose what happens when this PC locks."
            error={issues[0]?.message}
          >
            <PcLockActionFields
              value={away}
              lightGroups={lightGroups}
              scenes={scenes}
              bridgeId={bridgeId}
              onChange={setAway}
            />
          </FieldSection>
          <FieldSection
            title="Coming back"
            description="Choose what happens after you unlock this PC."
          >
            <PcLockReturnFields value={away} onChange={setAway} />
          </FieldSection>
          <PreviewControl
            hasPro={hasPro}
            preview={preview}
            onChange={setPreview}
            error={previewError}
          />
        </div>
      ) : (
        <Review
          title="When this PC locks"
          lines={[
            away.includeSleep
              ? "Runs when this PC locks or sleeps."
              : "Runs when this PC locks.",
            away.action === "scene"
              ? `Scene: ${away.scene?.name ?? "Not selected"}`
              : `${automationTargetCount(away)} selected · ${away.action === "off" ? "Turn off" : `Dim to ${away.dimBrightness}%`}`,
            away.restoreOnReturn
              ? "Lights return when you unlock the PC, unless someone changed them."
              : "Lights stay as the automation left them.",
          ]}
          error={error}
          conflict={conflict}
          onReload={() => {
            const latest = useAutomationStore.getState().settings?.away;
            if (latest) {
              initial.current = structuredClone(latest);
              setAway(structuredClone(latest));
            }
            setConflict(false);
            setOverwriteConflict(false);
          }}
          onKeep={() => {
            setOverwriteConflict(true);
            setConflict(false);
          }}
          secondary={
            hasPro ? (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => void save(false)}
              >
                Save disabled
              </Button>
            ) : null
          }
        />
      )
    ) : null;
  const presenceStep =
    kind === "presence" && presence ? (
      step === 0 ? (
        <PresenceEditor
          settings={presence}
          status={presenceStatus}
          lightGroups={lightGroups}
          scenes={scenes}
          bridgeId={bridgeId}
          hasPro={hasPro}
          onSettingsChange={setPresence}
          sections={["phones"]}
          showStatus={false}
        />
      ) : step === 1 ? (
        <div className="grid gap-5">
          <PresenceEditor
            settings={presence}
            status={presenceStatus}
            lightGroups={lightGroups}
            scenes={scenes}
            bridgeId={bridgeId}
            hasPro={hasPro}
            onSettingsChange={setPresence}
            sections={["leaving", "arriving"]}
            showStatus={false}
          />
          {issues.length > 0 && (
            <p role="alert" className="text-sm text-(--destructive-text)">
              {issues[0].message}
            </p>
          )}
        </div>
      ) : (
        <Review
          title="Presence"
          lines={[
            `${presence.devices.filter((device) => device.enabled).length} enabled ${presence.devices.filter((device) => device.enabled).length === 1 ? "phone" : "phones"}.`,
            presence.departureTargets.length
              ? `${presence.departureTargets.length} ${presence.departureTargets.length === 1 ? "light turns" : "lights turn"} off after everyone has been gone for ten minutes.`
              : "No leaving action selected.",
            presence.arrivalScene
              ? `${presence.arrivalScene.name} starts when someone returns.`
              : "No return scene selected.",
            "Mote must remain running, including in the tray.",
          ]}
          error={error}
          conflict={conflict}
          onReload={() => {
            const latest = usePresenceStore.getState().settings;
            if (latest) {
              initial.current = structuredClone(latest);
              setPresence(structuredClone(latest));
            }
            setConflict(false);
            setOverwriteConflict(false);
          }}
          onKeep={() => {
            setOverwriteConflict(true);
            setConflict(false);
          }}
          secondary={
            hasPro ? (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => void save(false)}
              >
                Save disabled
              </Button>
            ) : null
          }
        />
      )
    ) : null;
  const calendarStep =
    kind === "calendar" && calendar && calendarSettings ? (
      step === 0 ? (
        <div className="grid gap-6">
          {calendarSettings.feeds.length === 0 && (
            <div className="grid gap-3 rounded-2xl bg-(--settings-surface) p-4">
              <p className="text-sm font-medium">Connect a calendar first</p>
              <p className="text-xs leading-5 text-muted-foreground">
                This shared connection remains available if you cancel the rule.
              </p>
              <CalendarConnections
                settings={calendarSettings}
                status={calendarStatus}
                creationMode
              />
            </div>
          )}
          <CalendarRuleFields
            initial={calendar}
            value={calendar}
            onChange={setCalendar}
            isNew
            feeds={calendarSettings.feeds}
            lightGroups={lightGroups}
            scenes={scenes}
            bridgeId={bridgeId}
            hasPro={hasPro}
            onSave={async () => undefined}
            onCancel={leave}
            sections={["events", "matches"]}
            showActions={false}
          />
        </div>
      ) : step === 1 ? (
        <div className="grid gap-5">
          <CalendarRuleFields
            initial={calendar}
            value={calendar}
            onChange={setCalendar}
            isNew
            feeds={calendarSettings.feeds}
            lightGroups={lightGroups}
            scenes={scenes}
            bridgeId={bridgeId}
            hasPro={hasPro}
            onSave={async () => undefined}
            onCancel={leave}
            sections={["timing", "lights"]}
            showActions={false}
          />
          {issues.length > 0 && (
            <p role="alert" className="text-sm text-(--destructive-text)">
              {issues[0].message}
            </p>
          )}
        </div>
      ) : (
        <Review
          title={calendar.name || "Calendar rule"}
          lines={[
            calendar.feedIds.length
              ? `${calendar.feedIds.length} selected ${calendar.feedIds.length === 1 ? "calendar" : "calendars"}.`
              : "Matches events across every connected calendar.",
            calendar.titleIncludes.trim()
              ? `Event title includes: ${calendar.titleIncludes}.`
              : "Any event title can match.",
            calendar.look === "scene"
              ? `Scene: ${calendar.scene?.name ?? "Not selected"}.`
              : `${calendar.targets.length} selected ${calendar.targets.length === 1 ? "light" : "lights"}.`,
            `Starts ${calendar.leadMinutes ? `${calendar.leadMinutes} minutes before` : "with"} the event and ends ${calendar.trailMinutes ? `${calendar.trailMinutes} minutes after` : "with"} it.`,
            calendar.restore
              ? "Lights return afterwards unless someone changed them."
              : "Lights stay as the rule left them.",
          ]}
          error={error}
          conflict={false}
          onReload={() => undefined}
          onKeep={() => undefined}
          secondary={
            hasPro ? (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => void save(false)}
              >
                Save disabled
              </Button>
            ) : null
          }
        />
      )
    ) : null;

  return (
    <SettingsWizardLayout
      steps={steps[kind]}
      step={step}
      maxUnlockedStep={maxStep}
      onStepChange={changeStep}
      canContinue={step === 0 || issues.length === 0}
      onContinue={() => changeStep(step + 1)}
      onCancel={leave}
      finalAction={{
        label: pending
          ? "Saving…"
          : hasPro
            ? "Create & enable"
            : "Save automation",
        disabled: pending || issues.length > 0,
        onClick: () => void save(hasPro),
      }}
    >
      <SettingsWizardViewport stepKey={`${kind}-${step}`} contained>
        <SettingsWizardContainedStep>
          <ScrollArea fade className="min-h-0 flex-1" viewportClassName="pb-6">
            <div className="grid min-w-0 gap-6">
              {onAirStep || awayStep || presenceStep || calendarStep}
            </div>
          </ScrollArea>
        </SettingsWizardContainedStep>
      </SettingsWizardViewport>
      <AlertDialog open={blocker.status === "blocked"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your automation has unsaved changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => blocker.status === "blocked" && blocker.reset()}
            >
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                allowExit.current = true;
                setPreview(false);
                if (blocker.status === "blocked") blocker.proceed();
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsWizardLayout>
  );
}

function automationTargetCount(value: OnAirSettings | AwaySettings) {
  const count = value.targets.length || (value.target ? 1 : 0);
  return `${count} ${count === 1 ? "light" : "lights"}`;
}

function PreviewControl({
  hasPro,
  preview,
  onChange,
  error,
}: {
  hasPro: boolean;
  preview: boolean;
  onChange: (next: boolean) => void;
  error: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-(--settings-surface) p-4">
      <div className="grid gap-0.5">
        <p className="text-sm font-medium">Preview on your lights</p>
        <p className="text-xs text-muted-foreground">
          Off until you explicitly start it. Lights return when preview stops.
        </p>
        {error && (
          <p role="alert" className="text-xs text-(--destructive-text)">
            {error}
          </p>
        )}
      </div>
      <Switch
        aria-label="Preview on your lights"
        checked={preview && hasPro}
        disabled={!hasPro}
        onCheckedChange={onChange}
      />
    </div>
  );
}

function Review({
  title,
  lines,
  error,
  conflict,
  onReload,
  onKeep,
  secondary,
}: {
  title: string;
  lines: string[];
  error: string | null;
  conflict: boolean;
  onReload: () => void;
  onKeep: () => void;
  secondary: React.ReactNode;
}) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold">Review {title}</h2>
        <p className="text-sm text-muted-foreground">
          Confirm the trigger and light behavior before saving.
        </p>
      </div>
      <ul className="grid gap-2 rounded-2xl bg-(--settings-surface) p-4 text-sm leading-6">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {conflict && (
        <div
          className="grid gap-3 rounded-xl bg-(--settings-surface) p-4"
          role="alert"
        >
          <p className="text-sm font-medium">
            This automation changed while you were editing.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onReload}>
              Reload saved
            </Button>
            <Button variant="ghost" onClick={onKeep}>
              Keep editing
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-(--destructive-text)">
          {error}
        </p>
      )}
      {secondary}
    </div>
  );
}
