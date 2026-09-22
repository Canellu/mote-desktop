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
import {
  mergeSingletonDraft,
  sameValue,
} from "@/features/automations/editor-model";
import type {
  AutomationSettings,
  AutomationStatus,
  AwaySettings,
  OnAirSettings,
} from "@/features/automations/model";
import {
  saveAutomationSettings,
  useAutomationStore,
} from "@/features/automations/store";
import { singletonStatus } from "@/features/automations/presentation";
import { awaySummary, onAirSummary } from "@/features/automations/summaries";
import { useAutomationPreview } from "@/features/automations/useAutomationPreview";
import { validateAway, validateOnAir } from "@/features/automations/validation";
import type { AutomationLightGroup } from "./AutomationLightPicker";
import type { AutomationSceneOption } from "./AutomationScenePicker";
import { AutomationEditorLayout } from "./AutomationEditorLayout";
import {
  FieldSection,
  OnAirLookFields,
  OnAirWhenFields,
  PcLockActionFields,
  PcLockReturnFields,
} from "./SingletonAutomationFields";

export function AutomationEditPage({
  kind,
  settings,
  status,
  lightGroups,
  scenes,
  bridgeId,
  hasPro,
  onDone,
}: {
  kind: "onAir" | "away";
  settings: AutomationSettings;
  status: AutomationStatus | null;
  lightGroups: AutomationLightGroup[];
  scenes: AutomationSceneOption[];
  bridgeId: string | null;
  hasPro: boolean;
  onDone: () => void;
}) {
  const initial = useRef(structuredClone(settings[kind]));
  const [onAir, setOnAir] = useState<OnAirSettings>(() =>
    structuredClone(settings.onAir),
  );
  const [away, setAway] = useState<AwaySettings>(() =>
    structuredClone(settings.away),
  );
  const [preview, setPreview] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [overwriteConflict, setOverwriteConflict] = useState(false);
  const allowExit = useRef(false);
  const draft = kind === "onAir" ? onAir : away;
  const dirty = !sameValue(draft, initial.current);
  const blocker = useBlocker({
    shouldBlockFn: () => dirty && !allowExit.current,
    enableBeforeUnload: dirty,
    withResolver: true,
  });
  const context = {
    bridgeId,
    targetIds: new Set(
      lightGroups.flatMap((group) => group.options.map((option) => option.id)),
    ),
    sceneIds: new Set(scenes.map((scene) => scene.id)),
  };
  const issues =
    kind === "onAir"
      ? validateOnAir(onAir, context)
      : validateAway(away, context);
  const previewSettings =
    kind === "onAir"
      ? mergeSingletonDraft(settings, { kind, value: onAir })
      : mergeSingletonDraft(settings, { kind, value: away });
  const { error: previewError } = useAutomationPreview(
    preview && hasPro && issues.length === 0 ? kind : null,
    previewSettings,
  );
  const save = async () => {
    if (pending || issues.length) return;
    const latest = useAutomationStore.getState().settings;
    if (!latest)
      return setError("Automation settings are not available. Try again.");
    if (!sameValue(latest[kind], initial.current) && !overwriteConflict) {
      setConflict(true);
      return;
    }
    setPending(true);
    setPreview(false);
    const saved = await saveAutomationSettings((current) =>
      kind === "onAir"
        ? mergeSingletonDraft(current, { kind, value: onAir })
        : mergeSingletonDraft(current, { kind, value: away }),
    );
    setPending(false);
    if (!saved)
      return setError(
        "The automation could not be saved. Your changes are still here.",
      );
    allowExit.current = true;
    toast.success("Automation changes saved");
    onDone();
  };
  const reload = () => {
    const latest = useAutomationStore.getState().settings?.[kind];
    if (!latest) return;
    initial.current = structuredClone(latest);
    if (kind === "onAir") setOnAir(structuredClone(latest as OnAirSettings));
    else setAway(structuredClone(latest as AwaySettings));
    setConflict(false);
    setOverwriteConflict(false);
  };

  const summary = kind === "onAir" ? onAirSummary(onAir) : awaySummary(away);
  const sectionId = (id: string) => `${kind}-${id}`;
  return (
    <AutomationEditorLayout
      summary={summary.sentence}
      status={singletonStatus(
        kind,
        draft.enabled,
        issues.length === 0,
        hasPro,
        status,
      )}
      enabled={{
        checked: draft.enabled,
        disabled: !draft.enabled && (!hasPro || issues.length > 0),
        label: `Turn ${kind === "onAir" ? "on-air light" : "PC lock automation"} on or off`,
        onChange: (enabled) =>
          kind === "onAir"
            ? setOnAir({ ...onAir, enabled })
            : setAway({ ...away, enabled }),
      }}
      sections={
        kind === "onAir"
          ? [
              {
                id: sectionId("when"),
                title: "When",
                value: summary.sections.when,
              },
              {
                id: sectionId("look"),
                title: "Lights & look",
                value: summary.sections.look,
              },
            ]
          : [
              {
                id: sectionId("action"),
                title: "Lights & action",
                value: summary.sections.action,
              },
              {
                id: sectionId("back"),
                title: "Coming back",
                value: summary.sections.back,
              },
            ]
      }
      preview={{
        checked: preview && hasPro,
        disabled: !hasPro || issues.length > 0,
        hint: !hasPro
          ? "Part of Mote Pro."
          : issues.length
            ? "Choose lights first."
            : preview
              ? "Showing now. Lights go back when you turn this off."
              : "Try it before you save.",
        error: previewError,
        onChange: setPreview,
      }}
      issues={issues.map((issue) => ({
        message: issue.message,
        section: sectionId(kind === "onAir" ? "look" : "action"),
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
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={reload}>
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
      canSave={dirty && issues.length === 0}
      onSave={() => void save()}
      onCancel={onDone}
    >
      {kind === "onAir" ? (
        <>
          <FieldSection
            id={sectionId("when")}
            title="When"
            description="What switches the light on."
          >
            <OnAirWhenFields
              value={onAir}
              status={status}
              onChange={setOnAir}
            />
          </FieldSection>
          <FieldSection
            id={sectionId("look")}
            title="Lights & look"
            description="The lights and appearance used while you are on air."
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
        </>
      ) : (
        <>
          <FieldSection
            id={sectionId("action")}
            title="Lights & action"
            description="What happens when this PC locks."
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
            id={sectionId("back")}
            title="Coming back"
            description="What happens after you unlock this PC."
          >
            <PcLockReturnFields value={away} onChange={setAway} />
          </FieldSection>
        </>
      )}
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
    </AutomationEditorLayout>
  );
}
