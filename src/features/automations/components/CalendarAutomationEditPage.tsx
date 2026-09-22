import { useRef, useState } from "react";
import { useBlocker, useNavigate } from "@tanstack/react-router";
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
import type {
  CalendarRule,
  CalendarSettings,
} from "@/features/automations/calendar";
import {
  calendarSectionId,
  saveCalendar,
  useCalendarStore,
} from "@/features/automations/calendar";
import {
  mergeCalendarDraft,
  sameValue,
} from "@/features/automations/editor-model";
import { validateCalendar } from "@/features/automations/validation";
import { calendarStatusText } from "@/features/automations/presentation";
import { calendarRuleSummary } from "@/features/automations/summaries";
import { AutomationEditorLayout } from "./AutomationEditorLayout";
import { CalendarRuleFields } from "./CalendarEditor";
import type { AutomationLightGroup } from "./AutomationLightPicker";
import type { AutomationSceneOption } from "./AutomationScenePicker";

export function CalendarAutomationEditPage({
  settings,
  rule,
  lightGroups,
  scenes,
  bridgeId,
  hasPro,
  onDone,
}: {
  settings: CalendarSettings;
  rule: CalendarRule;
  lightGroups: AutomationLightGroup[];
  scenes: AutomationSceneOption[];
  bridgeId: string | null;
  hasPro: boolean;
  onDone: () => void;
}) {
  const navigate = useNavigate();
  const calendarStatus = useCalendarStore((state) => state.status);
  const initial = useRef(structuredClone(rule));
  const [draft, setDraft] = useState(() => structuredClone(rule));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [overwriteConflict, setOverwriteConflict] = useState(false);
  const allowExit = useRef(false);
  const dirty = !sameValue(draft, initial.current);
  const blocker = useBlocker({
    shouldBlockFn: () => dirty && !allowExit.current,
    enableBeforeUnload: dirty,
    withResolver: true,
  });
  const issues = validateCalendar(draft, {
    bridgeId,
    targetIds: new Set(
      lightGroups.flatMap((group) => group.options.map((option) => option.id)),
    ),
    sceneIds: new Set(scenes.map((scene) => scene.id)),
    feeds: settings.feeds,
  });
  const save = async () => {
    if (pending) return;
    const latest = useCalendarStore.getState().settings;
    const current = latest?.rules.find((item) => item.id === rule.id);
    if (!latest || !current)
      return setError("This calendar rule was removed. Return to automations.");
    if (!sameValue(current, initial.current) && !overwriteConflict)
      return setConflict(true);
    if (draft.enabled && issues.length) return setError(issues[0].message);
    const merged = mergeCalendarDraft(latest, draft, "edit");
    if (!merged)
      return setError("This calendar rule was removed. Return to automations.");
    setPending(true);
    const saved = await saveCalendar(() => merged);
    setPending(false);
    if (!saved)
      return setError(
        "The calendar rule could not be saved. Your changes are still here.",
      );
    allowExit.current = true;
    toast.success("Calendar rule saved");
    onDone();
  };
  const summary = calendarRuleSummary(draft, settings.feeds);
  const blocked = draft.enabled && issues.length > 0;
  const deleteRule = () => {
    void saveCalendar((currentSettings) => ({
      ...currentSettings,
      rules: currentSettings.rules.filter((item) => item.id !== rule.id),
    })).then((saved) => {
      if (!saved) return;
      allowExit.current = true;
      onDone();
    });
  };
  return (
    <AutomationEditorLayout
      summary={summary.sentence}
      status={calendarStatusText(
        draft,
        issues.length === 0,
        hasPro,
        calendarStatus,
      )}
      enabled={{
        checked: draft.enabled,
        disabled: !draft.enabled && (!hasPro || issues.length > 0),
        label: "Turn this calendar rule on or off",
        onChange: (enabled) => setDraft({ ...draft, enabled }),
      }}
      sections={[
        {
          id: calendarSectionId(rule.id, "events"),
          title: "Which events",
          value: summary.sections.events,
        },
        {
          id: calendarSectionId(rule.id, "timing"),
          title: "When",
          value: summary.sections.timing,
        },
        {
          id: calendarSectionId(rule.id, "lights"),
          title: "Lights",
          value: summary.sections.lights,
        },
        { id: calendarSectionId(rule.id, "matches"), title: "This week" },
      ]}
      issues={issues.map((issue) => ({
        message: issue.message,
        section: calendarSectionId(
          rule.id,
          issue.field === "name" || issue.field === "feeds"
            ? "events"
            : "lights",
        ),
      }))}
      notice={
        <>
          {conflict && (
            <div
              className="grid gap-2 rounded-lg bg-(--warn-surface) p-3 text-(--warn-text)"
              role="alert"
            >
              <p className="text-sm font-medium">
                This automation changed while you were editing.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    const latest = useCalendarStore
                      .getState()
                      .settings?.rules.find((item) => item.id === rule.id);
                    if (latest) {
                      initial.current = structuredClone(latest);
                      setDraft(structuredClone(latest));
                    }
                    setConflict(false);
                    setOverwriteConflict(false);
                  }}
                >
                  Reload saved
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setOverwriteConflict(true);
                    setConflict(false);
                  }}
                >
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
        </>
      }
      dirty={dirty}
      pending={pending}
      canSave={dirty && !blocked}
      onSave={() => void save()}
      onCancel={onDone}
      secondaryAction={
        <Button
          variant="ghost"
          className="text-(--destructive-text)"
          disabled={pending}
          onClick={deleteRule}
        >
          Delete rule
        </Button>
      }
    >
      <CalendarRuleFields
        initial={rule}
        value={draft}
        onChange={setDraft}
        isNew={false}
        feeds={settings.feeds}
        lightGroups={lightGroups}
        scenes={scenes}
        bridgeId={bridgeId}
        hasPro={hasPro}
        onSave={async () => undefined}
        onCancel={onDone}
        onManageFeeds={() =>
          void navigate({ to: "/settings", search: { tab: "calendars" } })
        }
        showActions={false}
        boxed
      />
      <AlertDialog open={blocker.status === "blocked"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your calendar rule has unsaved changes.
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
                if (blocker.status === "blocked") blocker.proceed();
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AutomationEditorLayout>
  );
}
