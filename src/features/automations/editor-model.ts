import type { CalendarRule, CalendarSettings } from "./calendar";
import type { AutomationSettings, AwaySettings, OnAirSettings } from "./model";
import type { PresenceSettings } from "./presence";

export type AutomationKind = "onAir" | "away" | "presence" | "calendar";
export type AutomationEditorMode = "create" | "edit";

export type AutomationDraft =
  | { kind: "onAir"; value: OnAirSettings }
  | { kind: "away"; value: AwaySettings }
  | { kind: "presence"; value: PresenceSettings }
  | { kind: "calendar"; value: CalendarRule };

export type AutomationEditorStep =
  | "type"
  | "when"
  | "phones"
  | "events"
  | "lights"
  | "actions"
  | "review";

export interface AutomationEditorSession {
  mode: AutomationEditorMode;
  initial: AutomationDraft;
  draft: AutomationDraft;
  step: AutomationEditorStep;
  pending: boolean;
  error: string | null;
  conflict: boolean;
}

export function cloneDraft<T extends AutomationDraft>(draft: T): T {
  return structuredClone(draft);
}

export function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function draftChanged(initial: AutomationDraft, draft: AutomationDraft) {
  return initial.kind !== draft.kind || !sameValue(initial.value, draft.value);
}

export function currentEntity(
  draft: AutomationDraft,
  settings: {
    automations: AutomationSettings | null;
    presence: PresenceSettings | null;
    calendar: CalendarSettings | null;
  },
): AutomationDraft | null {
  switch (draft.kind) {
    case "onAir":
      return settings.automations
        ? { kind: "onAir", value: settings.automations.onAir }
        : null;
    case "away":
      return settings.automations
        ? { kind: "away", value: settings.automations.away }
        : null;
    case "presence":
      return settings.presence
        ? { kind: "presence", value: settings.presence }
        : null;
    case "calendar": {
      const value = settings.calendar?.rules.find(
        (rule) => rule.id === draft.value.id,
      );
      return value ? { kind: "calendar", value } : null;
    }
  }
}

export function hasEntityConflict(
  initial: AutomationDraft,
  current: AutomationDraft | null,
  mode: AutomationEditorMode,
): boolean {
  if (mode === "create") return false;
  return (
    !current || current.kind !== initial.kind || !sameValue(initial, current)
  );
}

export function mergeSingletonDraft(
  latest: AutomationSettings,
  draft: Extract<AutomationDraft, { kind: "onAir" | "away" }>,
): AutomationSettings {
  return draft.kind === "onAir"
    ? { ...latest, onAir: draft.value }
    : { ...latest, away: draft.value };
}

export function mergeCalendarDraft(
  latest: CalendarSettings,
  rule: CalendarRule,
  mode: AutomationEditorMode,
): CalendarSettings | null {
  const index = latest.rules.findIndex((item) => item.id === rule.id);
  if (mode === "edit" && index < 0) return null;
  if (index < 0) return { ...latest, rules: [...latest.rules, rule] };
  const rules = [...latest.rules];
  rules[index] = rule;
  return { ...latest, rules };
}
