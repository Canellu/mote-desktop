import { useRef, useState } from "react";
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
import { sameValue } from "@/features/automations/editor-model";
import {
  savePresence,
  usePresenceStore,
  type PresenceSettings,
  type PresenceStatus,
} from "@/features/automations/presence";
import { validatePresence } from "@/features/automations/validation";
import { presenceStatusText } from "@/features/automations/presentation";
import { presenceSummary } from "@/features/automations/summaries";
import { AutomationEditorLayout } from "./AutomationEditorLayout";
import { PresenceEditor } from "./PresenceEditor";
import type { AutomationLightGroup } from "./AutomationLightPicker";
import type { AutomationSceneOption } from "./AutomationScenePicker";

export function PresenceAutomationEditPage({
  settings,
  status,
  lightGroups,
  scenes,
  bridgeId,
  hasPro,
  onDone,
}: {
  settings: PresenceSettings;
  status: PresenceStatus | null;
  lightGroups: AutomationLightGroup[];
  scenes: AutomationSceneOption[];
  bridgeId: string | null;
  hasPro: boolean;
  onDone: () => void;
}) {
  const initial = useRef(structuredClone(settings));
  const [draft, setDraft] = useState(() => structuredClone(settings));
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
  const issues = validatePresence(draft, {
    bridgeId,
    targetIds: new Set(
      lightGroups.flatMap((group) => group.options.map((option) => option.id)),
    ),
    sceneIds: new Set(scenes.map((scene) => scene.id)),
  });
  const save = async () => {
    if (pending) return;
    const latest = usePresenceStore.getState().settings;
    if (!latest)
      return setError("Presence settings are not available. Try again.");
    if (!sameValue(latest, initial.current) && !overwriteConflict) {
      setConflict(true);
      return;
    }
    if (draft.enabled && issues.length) return setError(issues[0].message);
    setPending(true);
    const saved = await savePresence(() => draft);
    setPending(false);
    if (!saved)
      return setError(
        "Presence could not be saved. Your changes are still here.",
      );
    allowExit.current = true;
    toast.success("Presence changes saved");
    onDone();
  };
  const summary = presenceSummary(draft);
  const blocked = draft.enabled && issues.length > 0;
  return (
    <AutomationEditorLayout
      summary={summary.sentence}
      status={presenceStatusText(
        draft.enabled,
        issues.length === 0,
        hasPro,
        status,
      )}
      enabled={{
        checked: draft.enabled,
        disabled: !draft.enabled && (!hasPro || issues.length > 0),
        label: "Watch for phones",
        onChange: (enabled) => setDraft({ ...draft, enabled }),
      }}
      sections={[
        {
          id: "presence-phones",
          title: "Phones",
          value: summary.sections.phones,
        },
        {
          id: "presence-leaving",
          title: "When everyone leaves",
          value: summary.sections.leaving,
        },
        {
          id: "presence-arriving",
          title: "When someone comes home",
          value: summary.sections.arriving,
        },
      ]}
      issues={issues.map((issue) => ({
        message: issue.message,
        section:
          issue.field === "devices"
            ? "presence-phones"
            : issue.field === "arrivalScene"
              ? "presence-arriving"
              : "presence-leaving",
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
                    const latest = usePresenceStore.getState().settings;
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
    >
      <PresenceEditor
        settings={draft}
        status={status}
        lightGroups={lightGroups}
        scenes={scenes}
        bridgeId={bridgeId}
        hasPro={hasPro}
        showSwitch={false}
        onSettingsChange={setDraft}
      />
      <AlertDialog open={blocker.status === "blocked"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your presence automation has unsaved changes.
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
