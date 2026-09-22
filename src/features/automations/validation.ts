import type { CalendarFeed, CalendarRule } from "./calendar";
import {
  automationTargets,
  type AwaySettings,
  type OnAirSettings,
} from "./model";
import type { PresenceSettings } from "./presence";

export interface AutomationValidationContext {
  bridgeId: string | null;
  targetIds?: ReadonlySet<string>;
  sceneIds?: ReadonlySet<string>;
  feeds?: CalendarFeed[];
}

export interface AutomationValidationIssue {
  field: string;
  message: string;
}

const bridgeIssues = (
  value: { bridgeId: string | null },
  context: AutomationValidationContext,
): AutomationValidationIssue[] => {
  if (!context.bridgeId)
    return [{ field: "bridge", message: "Connect a Hue Bridge first." }];
  if (value.bridgeId && value.bridgeId !== context.bridgeId)
    return [
      {
        field: "bridge",
        message: "Choose lights or a scene from the current bridge.",
      },
    ];
  return [];
};

const lookIssues = (
  value: {
    targets: { id: string }[];
    scene: { id: string } | null;
  },
  scene: boolean,
  context: AutomationValidationContext,
): AutomationValidationIssue[] => {
  if (scene) {
    if (!value.scene) return [{ field: "scene", message: "Choose a scene." }];
    if (context.sceneIds && !context.sceneIds.has(value.scene.id))
      return [{ field: "scene", message: "Choose an available scene." }];
    return [];
  }
  if (!value.targets.length)
    return [{ field: "targets", message: "Choose at least one light." }];
  if (
    context.targetIds &&
    value.targets.some((target) => !context.targetIds!.has(target.id))
  )
    return [
      { field: "targets", message: "Replace the unavailable light selection." },
    ];
  return [];
};

export function validateOnAir(
  value: OnAirSettings,
  context: AutomationValidationContext,
) {
  return [
    ...bridgeIssues(value, context),
    ...lookIssues(
      { ...value, targets: automationTargets(value) },
      value.mode === "scene",
      context,
    ),
  ];
}

export function validateAway(
  value: AwaySettings,
  context: AutomationValidationContext,
) {
  return [
    ...bridgeIssues(value, context),
    ...lookIssues(
      { ...value, targets: automationTargets(value) },
      value.action === "scene",
      context,
    ),
  ];
}

export function validatePresence(
  value: PresenceSettings,
  context: AutomationValidationContext,
) {
  const issues = bridgeIssues(value, context);
  if (!value.devices.some((device) => device.enabled))
    issues.push({ field: "devices", message: "Enable at least one phone." });
  if (!value.arrivalScene && !value.departureTargets.length)
    issues.push({
      field: "actions",
      message: "Choose at least one light action.",
    });
  if (
    value.arrivalScene &&
    context.sceneIds &&
    !context.sceneIds.has(value.arrivalScene.id)
  )
    issues.push({
      field: "arrivalScene",
      message: "Choose an available scene.",
    });
  if (
    context.targetIds &&
    value.departureTargets.some((target) => !context.targetIds!.has(target.id))
  )
    issues.push({
      field: "departureTargets",
      message: "Replace unavailable lights.",
    });
  return issues;
}

export function validateCalendar(
  value: CalendarRule,
  context: AutomationValidationContext,
) {
  const issues = bridgeIssues(value, context);
  if (!value.name.trim())
    issues.push({ field: "name", message: "Name this calendar rule." });
  const feedIds = new Set(context.feeds?.map((feed) => feed.id));
  if (value.feedIds.some((id) => !feedIds.has(id)))
    issues.push({ field: "feeds", message: "Choose available calendars." });
  issues.push(...lookIssues(value, value.look === "scene", context));
  return issues;
}
