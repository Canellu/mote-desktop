import { useMemo, useState } from "react";
import {
  cloneDraft,
  draftChanged,
  type AutomationDraft,
  type AutomationEditorMode,
  type AutomationEditorStep,
} from "./editor-model";

export function useAutomationDraft(
  initialDraft: AutomationDraft,
  mode: AutomationEditorMode,
  initialStep: AutomationEditorStep,
) {
  const [initial, setInitial] = useState(() => cloneDraft(initialDraft));
  const [draft, setDraft] = useState(() => cloneDraft(initialDraft));
  const [step, setStep] = useState(initialStep);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const dirty = useMemo(() => draftChanged(initial, draft), [draft, initial]);

  const reload = (next: AutomationDraft) => {
    const copy = cloneDraft(next);
    setInitial(copy);
    setDraft(cloneDraft(copy));
    setConflict(false);
    setError(null);
  };

  return {
    mode,
    initial,
    draft,
    setDraft,
    step,
    setStep,
    dirty,
    pending,
    setPending,
    error,
    setError,
    conflict,
    setConflict,
    reload,
  };
}
