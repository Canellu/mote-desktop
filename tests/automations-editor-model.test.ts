import { expect, test } from "bun:test";
import {
  draftChanged,
  hasEntityConflict,
  mergeCalendarDraft,
  mergeSingletonDraft,
  type AutomationDraft,
} from "../src/features/automations/editor-model";
import type { CalendarRule } from "../src/features/automations/calendar";
import type { AutomationSettings } from "../src/features/automations/model";
import {
  isAwayConfigured,
  isOnAirConfigured,
  isPresenceConfigured,
} from "../src/features/automations/presentation";
import {
  validateCalendar,
  validatePresence,
} from "../src/features/automations/validation";

const settings: AutomationSettings = {
  onAir: {
    enabled: false,
    bridgeId: null,
    target: null,
    targets: [],
    mode: "color",
    xy: null,
    mirek: 366,
    scene: null,
    trigger: "microphone_or_camera",
    color: "red",
    brightness: 100,
    ignoredApps: [],
  },
  away: {
    enabled: false,
    bridgeId: null,
    target: null,
    targets: [],
    scene: null,
    action: "off",
    dimBrightness: 10,
    includeSleep: true,
    restoreOnReturn: true,
  },
  priority: ["onAir", "away", "focus", "pcSync", "calendar", "presence"],
};

const calendarRule = (id: string): CalendarRule => ({
  id,
  name: "Meetings",
  enabled: false,
  feedIds: [],
  titleIncludes: "",
  titleExcludes: "",
  busyOnly: true,
  includeAllDay: false,
  leadMinutes: 0,
  trailMinutes: 0,
  bridgeId: "bridge",
  targets: [{ kind: "light", id: "desk", name: "Desk" }],
  look: "color",
  xy: [0.675, 0.322],
  mirek: 366,
  brightness: 100,
  scene: null,
  restore: true,
});

test("configured visibility comes only from persisted automation data", () => {
  expect(isOnAirConfigured(settings.onAir)).toBe(false);
  expect(isAwayConfigured(settings.away)).toBe(false);
  expect(isOnAirConfigured({ ...settings.onAir, bridgeId: "old" })).toBe(true);
  expect(
    isPresenceConfigured({
      enabled: false,
      bridgeId: null,
      devices: [{ id: "p", name: "Phone", ip: "1", mac: null, enabled: false }],
      arrivalScene: null,
      departureTargets: [],
    }),
  ).toBe(true);
});

test("singleton merge preserves unrelated settings and priority", () => {
  const draft: AutomationDraft = {
    kind: "onAir",
    value: { ...settings.onAir, brightness: 42 },
  };
  const merged = mergeSingletonDraft(settings, draft);
  expect(merged.onAir.brightness).toBe(42);
  expect(merged.away).toBe(settings.away);
  expect(merged.priority).toBe(settings.priority);
});

test("calendar merge preserves rule order and rejects a removed edited rule", () => {
  const one = calendarRule("one");
  const two = calendarRule("two");
  const merged = mergeCalendarDraft(
    { feeds: [{ id: "feed", name: "Work", enabled: true }], rules: [one, two] },
    { ...one, name: "Changed" },
    "edit",
  );
  expect(merged?.rules.map((rule) => rule.id)).toEqual(["one", "two"]);
  expect(merged?.rules[0].name).toBe("Changed");
  expect(
    mergeCalendarDraft({ feeds: [], rules: [two] }, one, "edit"),
  ).toBeNull();
});

test("dirty and same-entity conflict checks ignore unrelated settings", () => {
  const initial: AutomationDraft = { kind: "away", value: settings.away };
  expect(draftChanged(initial, initial)).toBe(false);
  expect(
    draftChanged(initial, {
      kind: "away",
      value: { ...settings.away, includeSleep: false },
    }),
  ).toBe(true);
  expect(hasEntityConflict(initial, initial, "edit")).toBe(false);
  expect(
    hasEntityConflict(
      initial,
      { kind: "away", value: { ...settings.away, includeSleep: false } },
      "edit",
    ),
  ).toBe(true);
});

test("presence and calendar validation enforce real requirements", () => {
  const context = {
    bridgeId: "bridge",
    targetIds: new Set(["desk"]),
    sceneIds: new Set<string>(),
    feeds: [{ id: "feed", name: "Work", enabled: true }],
  };
  expect(
    validatePresence(
      {
        enabled: false,
        bridgeId: "bridge",
        devices: [],
        arrivalScene: null,
        departureTargets: [],
      },
      context,
    ).map((issue) => issue.field),
  ).toEqual(["devices", "actions"]);
  expect(validateCalendar(calendarRule("rule"), context)).toEqual([]);
  expect(
    validateCalendar(
      { ...calendarRule("rule"), feedIds: ["missing"] },
      context,
    )[0].field,
  ).toBe("feeds");
});
