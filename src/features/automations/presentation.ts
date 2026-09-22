import type { CalendarRule, CalendarStatus } from "./calendar";
import {
  automationTargets,
  type AutomationStatus,
  type AwaySettings,
  type OnAirSettings,
} from "./model";
import type { PresenceSettings, PresenceStatus } from "./presence";
import { describeCommandError } from "@/lib/entitlement-errors";

export type AutomationTone = "neutral" | "active" | "warning";
export interface AutomationPresentationStatus {
  text: string;
  tone: AutomationTone;
}

export const isOnAirConfigured = (value: OnAirSettings) =>
  value.enabled ||
  !!value.bridgeId ||
  automationTargets(value).length > 0 ||
  !!value.scene;

export const isAwayConfigured = (value: AwaySettings) =>
  value.enabled ||
  !!value.bridgeId ||
  automationTargets(value).length > 0 ||
  !!value.scene;

export const isPresenceConfigured = (value: PresenceSettings) =>
  value.enabled ||
  !!value.bridgeId ||
  value.devices.length > 0 ||
  !!value.arrivalScene ||
  value.departureTargets.length > 0;

export function singletonStatus(
  kind: "onAir" | "away",
  enabled: boolean,
  valid: boolean,
  hasPro: boolean,
  status: AutomationStatus | null,
): AutomationPresentationStatus {
  if (!valid) return { text: "Needs setup", tone: "warning" };
  if (!enabled) return { text: "Off", tone: "neutral" };
  if (!hasPro) return { text: "Requires Mote Pro", tone: "warning" };
  const live = status?.[kind];
  if (!live) return { text: "Status unavailable", tone: "warning" };
  if (live.error)
    return { text: describeCommandError(live.error), tone: "warning" };
  if (live.active)
    return {
      text: kind === "onAir" ? "On air now" : "PC is away",
      tone: "active",
    };
  return {
    text:
      kind === "onAir"
        ? "Waiting for microphone or camera use"
        : "Waiting for this PC to lock",
    tone: "neutral",
  };
}

export function presenceStatusText(
  enabled: boolean,
  valid: boolean,
  hasPro: boolean,
  status: PresenceStatus | null,
): AutomationPresentationStatus {
  if (!valid) return { text: "Needs setup", tone: "warning" };
  if (!enabled) return { text: "Off", tone: "neutral" };
  if (!hasPro) return { text: "Requires Mote Pro", tone: "warning" };
  if (!status) return { text: "Status unavailable", tone: "warning" };
  if (!status.network)
    return { text: "Waiting for the home network", tone: "warning" };
  return {
    text:
      status.occupancy === "home"
        ? "Someone is home"
        : status.occupancy === "away"
          ? "Nobody is home"
          : "Checking who is home",
    tone: "neutral",
  };
}

export function calendarStatusText(
  rule: CalendarRule,
  valid: boolean,
  hasPro: boolean,
  status: CalendarStatus | null,
): AutomationPresentationStatus {
  if (!valid) return { text: "Needs attention", tone: "warning" };
  if (!rule.enabled) return { text: "Off", tone: "neutral" };
  if (!hasPro) return { text: "Requires Mote Pro", tone: "warning" };
  const live = status?.rules.find((item) => item.id === rule.id);
  if (!live) return { text: "Status unavailable", tone: "warning" };
  if (live.error)
    return { text: describeCommandError(live.error), tone: "warning" };
  if (live.active) return { text: "Rule active", tone: "active" };
  return { text: "Waiting for a matching event", tone: "neutral" };
}
