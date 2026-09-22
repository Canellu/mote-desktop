import type { CalendarFeed, CalendarRule } from "./calendar";
import {
  automationTargets,
  onAirColors,
  onAirTriggers,
  type AutomationTarget,
  type AwaySettings,
  type OnAirSettings,
} from "./model";
import type { PresenceSettings } from "./presence";
import { hueDisplayColorHex } from "@/features/space-screen/utils/color-state";

/**
 * Plain-words summaries of an automation: one sentence for what it does, and a
 * short value for each of its editor's sections. The overview cards and the
 * editor's summary say the same thing, so both read from here.
 */

/** "Desk", "Desk and Lamp", or "Desk and 3 more". */
export function namesPhrase(names: string[], none: string): string {
  if (names.length === 0) return none;
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} and ${names.length - 1} more`;
}

/**
 * A plain name for a color picked on the wheel, e.g. "red" or "blue", from the
 * hue the wheel shows for it. Pale picks read as white.
 */
export function colorName(xy: [number, number]): string {
  const hex = hueDisplayColorHex({ xy });
  if (!hex) return "your color";
  const [r, g, b] = [1, 3, 5].map(
    (at) => parseInt(hex.slice(at, at + 2), 16) / 255,
  );
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0 || (max - min) / max < 0.2) return "white";
  const d = max - min;
  const hue =
    (max === r
      ? ((g - b) / d + 6) % 6
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4) * 60;
  // Bands fitted to how the wheel draws the on-air presets: its red sits at
  // 16°, its orange at 38°, its blue at 253°.
  const names: [number, string][] = [
    [25, "red"],
    [48, "orange"],
    [70, "yellow"],
    [160, "green"],
    [200, "cyan"],
    [262, "blue"],
    [295, "purple"],
    [340, "pink"],
    [360, "red"],
  ];
  return names.find(([upTo]) => hue < upTo)?.[1] ?? "red";
}

const targetNames = (targets: AutomationTarget[]) =>
  targets.map((target) => target.name);

/** A verb for the targets: one light turns, two lights turn. */
const verb = (targets: AutomationTarget[], singular: string, plural: string) =>
  targets.length === 1 ? singular : plural;

const percent = (value: number) => `${Math.round(value)}%`;

export interface AutomationSummary {
  sentence: string;
  /** Section id to its current value, e.g. `{ look: "Desk · Red 80%" }`. */
  sections: Record<string, string>;
}

export function onAirSummary(value: OnAirSettings): AutomationSummary {
  const targets = automationTargets(value);
  const trigger =
    value.trigger === "camera"
      ? "camera"
      : value.trigger === "microphone"
        ? "microphone"
        : "microphone or camera";
  const triggerLabel =
    onAirTriggers.find((item) => item.value === value.trigger)?.label ??
    "Microphone or camera";
  const ignored = value.ignoredApps.length;
  const appearance =
    value.mode === "white"
      ? "white"
      : value.xy
        ? colorName(value.xy)
        : (onAirColors
            .find((item) => item.value === value.color)
            ?.label.toLowerCase() ?? "your color");
  const scene = value.scene?.name;
  const lights = namesPhrase(targetNames(targets), "No lights yet");
  return {
    sentence:
      value.mode === "scene"
        ? `When your ${trigger} is in use, ${scene ? `the ${scene} scene` : "a scene you choose"} comes on.`
        : `When your ${trigger} is in use, ${namesPhrase(targetNames(targets), "the lights you choose")} ${verb(targets, "turns", "turn")} ${appearance} at ${percent(value.brightness)}.`,
    sections: {
      when: ignored
        ? `${triggerLabel} · ${ignored} ${ignored === 1 ? "app" : "apps"} ignored`
        : triggerLabel,
      look:
        value.mode === "scene"
          ? `Scene · ${scene ?? "None yet"}`
          : `${lights} · ${appearance[0].toUpperCase()}${appearance.slice(1)} ${percent(value.brightness)}`,
    },
  };
}

export function awaySummary(value: AwaySettings): AutomationSummary {
  const targets = automationTargets(value);
  const when = value.includeSleep ? "locks or sleeps" : "locks";
  const scene = value.scene?.name;
  const who = namesPhrase(targetNames(targets), "the lights you choose");
  const action =
    value.action === "scene"
      ? `${scene ? `the ${scene} scene` : "a scene you choose"} comes on`
      : value.action === "dim"
        ? `${who} ${verb(targets, "dims", "dim")} to ${percent(value.dimBrightness)}`
        : `${who} ${verb(targets, "turns", "turn")} off`;
  return {
    sentence: `When this PC ${when}, ${action}.${value.restoreOnReturn ? " They go back when you unlock it." : ""}`,
    sections: {
      action:
        value.action === "scene"
          ? `Scene · ${scene ?? "None yet"}`
          : `${namesPhrase(targetNames(targets), "No lights yet")} · ${value.action === "dim" ? `Dim to ${percent(value.dimBrightness)}` : "Off"}`,
      back: `${value.restoreOnReturn ? "Put back on unlock" : "Left as they are"}${value.includeSleep ? " · Sleep too" : ""}`,
    },
  };
}

export function presenceSummary(value: PresenceSettings): AutomationSummary {
  const phones = value.devices.filter((device) => device.enabled).length;
  const leaving = targetNames(value.departureTargets);
  const scene = value.arrivalScene?.name;
  const parts = [
    leaving.length
      ? `When every phone has been gone ten minutes, ${namesPhrase(leaving, "")} ${verb(value.departureTargets, "turns", "turn")} off.`
      : null,
    scene ? `When someone is back, ${scene} comes on.` : null,
  ].filter(Boolean);
  return {
    sentence: parts.length
      ? parts.join(" ")
      : "Choose what happens when everyone leaves or someone comes home.",
    sections: {
      phones: phones
        ? `${phones} ${phones === 1 ? "phone" : "phones"}`
        : "No phones yet",
      leaving: leaving.length
        ? `${namesPhrase(leaving, "")} off`
        : "Nothing happens",
      arriving: scene ?? "Nothing happens",
    },
  };
}

/** "turns off" for one light, "turn off" for several, "Turn off" as a label. */
const lookPhrase = (rule: CalendarRule, one = false) => {
  const [base, s] =
    rule.look === "off"
      ? ["turn", " off"]
      : rule.look === "dim"
        ? ["dim", ` to ${percent(rule.brightness)}`]
        : rule.look === "white"
          ? ["turn", ` white at ${percent(rule.brightness)}`]
          : ["turn", ` ${colorName(rule.xy)} at ${percent(rule.brightness)}`];
  return `${one ? `${base}s` : base}${s}`;
};

const minutes = (value: number) => `${value} min`;

export function calendarRuleSummary(
  rule: CalendarRule,
  feeds: CalendarFeed[],
): AutomationSummary {
  const events = rule.titleIncludes.trim()
    ? `events titled “${rule.titleIncludes.trim()}”`
    : "every event";
  const calendars =
    rule.feedIds.length === 0
      ? feeds.length === 1
        ? feeds[0].name
        : "Every calendar"
      : namesPhrase(
          rule.feedIds.map(
            (id) => feeds.find((feed) => feed.id === id)?.name ?? "Calendar",
          ),
          "",
        );
  const scene = rule.scene?.name;
  const lights = namesPhrase(
    targetNames(rule.targets),
    "the lights you choose",
  );
  const timing =
    rule.leadMinutes || rule.trailMinutes
      ? `${rule.leadMinutes ? `${minutes(rule.leadMinutes)} before` : "At the start"} – ${rule.trailMinutes ? `${minutes(rule.trailMinutes)} after` : "the end"}`
      : "Start to end";
  return {
    sentence:
      rule.look === "scene"
        ? `Around ${events}, ${scene ? `the ${scene} scene` : "a scene you choose"} comes on.`
        : `Around ${events}, ${lights} ${lookPhrase(rule, rule.targets.length === 1)}.`,
    sections: {
      events: `${rule.titleIncludes.trim() ? `“${rule.titleIncludes.trim()}”` : "Every event"} · ${calendars}`,
      timing: `${timing}${rule.restore ? " · Put back" : ""}`,
      lights:
        rule.look === "scene"
          ? `Scene · ${scene ?? "None yet"}`
          : `${namesPhrase(targetNames(rule.targets), "No lights yet")} · ${lookPhrase(rule)[0].toUpperCase()}${lookPhrase(rule).slice(1)}`,
    },
  };
}
