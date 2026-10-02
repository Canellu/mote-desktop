import type { HueScene } from "@/types/hue";
import { humanize, isRecord } from "@/features/settings-screen/utils/format";

/** A behavior_instance as the bridge returns it (Hue API v2). */
export interface BehaviorInstance {
  id: string;
  script_id: string;
  enabled: boolean;
  configuration: unknown;
  dependees?: Array<{ target?: { rid?: string; rtype?: string } }>;
  metadata?: { name?: string };
}

export interface BehaviorScript {
  id: string;
  metadata?: { name?: string; category?: string };
}

/** Every {rid, rtype} reference anywhere in a configuration. */
export const referencesIn = (
  value: unknown,
  found: Array<{ rid: string; rtype: string }> = [],
) => {
  if (Array.isArray(value)) value.forEach((item) => referencesIn(item, found));
  else if (isRecord(value)) {
    if (typeof value.rid === "string" && typeof value.rtype === "string")
      found.push({ rid: value.rid, rtype: value.rtype });
    Object.values(value).forEach((item) => referencesIn(item, found));
  }
  return found;
};

/** The device's behaviors on the bridge: those that point at it or its services. */
export const behaviorsFor = (instances: BehaviorInstance[], ids: Set<string>) =>
  instances.filter(
    (instance) =>
      instance.dependees?.some(
        (dependee) => dependee.target?.rid && ids.has(dependee.target.rid),
      ) || referencesIn(instance.configuration).some((ref) => ids.has(ref.rid)),
  );

export type Json = Record<string, unknown>;

export const ACTION_LABELS: Record<string, string> = {
  dim_up: "Brighten",
  dim_down: "Dim",
  home_off: "Turn off all lights",
  all_off: "Turn off",
  do_nothing: "Nothing",
};

/** Hold actions offered when editing; both seen on real Hue dimmer setups. */
export const HOLD_ACTIONS = ["home_off", "do_nothing"];

export const TIME_KEY = "time_based_extended";
export const CYCLE_KEY = "scene_cycle_extended";
/** One scene on every press, as the bridge's own "recall single". */
export const SINGLE_KEY = "recall_single_extended";
const KEY_FOR = {
  time: TIME_KEY,
  cycle: CYCLE_KEY,
  single: SINGLE_KEY,
} as const;
export const DEFAULT_TIMES = ["07:00", "10:00", "17:00", "20:00", "23:00"];

// ---- Reading a button setup ----------------------------------------------

export interface SlotDraft {
  time: string;
  sceneId: string;
}

export interface PressDraft {
  mode: "time" | "cycle" | "single";
  slots: SlotDraft[];
  withOff: boolean;
}

export interface ButtonDraft {
  rid: string;
  /** Null when the press does something this editor doesn't handle. */
  press: PressDraft | null;
  /** The bridge's press setup when `press` couldn't read it; kept as is. */
  pressRaw: unknown;
  hold: string | null;
  /** What holding repeats, such as dim_up; shown, not edited. */
  repeat: string | null;
}

export interface ButtonSetup {
  groupId: string;
  buttons: ButtonDraft[];
}

export const pad = (value: number) => String(value).padStart(2, "0");

export const recalledScene = (actions: unknown): string => {
  const first = Array.isArray(actions) ? actions[0] : null;
  const recall =
    isRecord(first) && isRecord(first.action) ? first.action.recall : null;
  return isRecord(recall) && typeof recall.rid === "string" ? recall.rid : "";
};

export const parsePress = (value: unknown): PressDraft | null => {
  if (!isRecord(value)) return null;
  const single = value[SINGLE_KEY];
  if (isRecord(single))
    return {
      mode: "single",
      withOff: isRecord(single.with_off) && single.with_off.enabled === true,
      slots: [
        { time: DEFAULT_TIMES[0], sceneId: recalledScene(single.actions) },
      ],
    };
  const time = value[TIME_KEY];
  const cycle = value[CYCLE_KEY];
  const inner = isRecord(time) ? time : isRecord(cycle) ? cycle : null;
  if (!inner || !Array.isArray(inner.slots)) return null;
  const withOff = isRecord(inner.with_off) && inner.with_off.enabled === true;
  if (isRecord(time))
    return {
      mode: "time",
      withOff,
      slots: inner.slots.map((slot) => {
        const start =
          isRecord(slot) && isRecord(slot.start_time) ? slot.start_time : {};
        return {
          time: `${pad(Number(start.hour ?? 0))}:${pad(Number(start.minute ?? 0))}`,
          sceneId: isRecord(slot) ? recalledScene(slot.actions) : "",
        };
      }),
    };
  return {
    mode: "cycle",
    withOff,
    slots: inner.slots.map((slot, index) => ({
      time: DEFAULT_TIMES[index] ?? "12:00",
      sceneId: recalledScene(slot),
    })),
  };
};

export const actionOf = (value: unknown): string | null =>
  isRecord(value) && typeof value.action === "string" ? value.action : null;

export const groupOf = (where: unknown): string | null => {
  const first = Array.isArray(where) ? where[0] : null;
  const group = isRecord(first) ? first.group : null;
  return isRecord(group) && typeof group.rid === "string" ? group.rid : null;
};

/** A Hue switch setup: buttons keyed by button service id, each with a room. */
export const parseButtonSetup = (config: Json): ButtonSetup | null => {
  if (!isRecord(config.buttons)) return null;
  let groupId: string | null = groupOf(config.where);
  const buttons = Object.entries(config.buttons).flatMap(([rid, entry]) => {
    if (!isRecord(entry)) return [];
    groupId ??= groupOf(entry.where);
    return [
      {
        rid,
        press: parsePress(entry.on_short_release),
        pressRaw: entry.on_short_release ?? null,
        hold: actionOf(entry.on_long_press),
        repeat: actionOf(entry.on_repeat),
      },
    ];
  });
  return groupId && buttons.length > 0 ? { groupId, buttons } : null;
};

// ---- Writing a button setup ----------------------------------------------

export const recall = (sceneId: string) => [
  { action: { recall: { rid: sceneId, rtype: "scene" } } },
];

/**
 * The configuration with the edits applied. Only what changed from `base` is
 * rewritten, so anything this editor doesn't understand stays as it was.
 */
export const buildConfig = (
  original: Json,
  base: ButtonSetup,
  setup: ButtonSetup,
  groupType: string,
): Json => {
  const next = structuredClone(original);
  const where = [{ group: { rid: setup.groupId, rtype: groupType } }];
  const groupChanged = setup.groupId !== base.groupId;
  const buttons = next.buttons as Json;
  if (groupChanged && "where" in next) next.where = where;
  for (const button of setup.buttons) {
    const entry = buttons[button.rid];
    if (!isRecord(entry)) continue;
    const before = base.buttons.find((item) => item.rid === button.rid);
    if (groupChanged) entry.where = where;
    if (
      button.press &&
      JSON.stringify(button.press) !== JSON.stringify(before?.press)
    ) {
      const key = KEY_FOR[button.press.mode];
      const old = isRecord(entry.on_short_release)
        ? entry.on_short_release
        : {};
      // Settings of the same kind the editor doesn't touch are kept.
      const same = isRecord(old[key]) ? (old[key] as Json) : {};
      const previous = (old[TIME_KEY] ?? old[CYCLE_KEY]) as Json | undefined;
      if (button.press.mode === "single") {
        entry.on_short_release = {
          [key]: {
            ...same,
            actions: recall(button.press.slots[0]?.sceneId ?? ""),
            with_off: { enabled: button.press.withOff },
          },
        };
        if (button.hold && button.hold !== before?.hold)
          entry.on_long_press = { action: button.hold };
        continue;
      }
      const slots =
        button.press.mode === "time"
          ? [...button.press.slots]
              .sort((a, b) => a.time.localeCompare(b.time))
              .map((slot) => {
                const [hour, minute] = slot.time.split(":").map(Number);
                return {
                  actions: recall(slot.sceneId),
                  start_time: { hour, minute },
                };
              })
          : button.press.slots.map((slot) => recall(slot.sceneId));
      entry.on_short_release = {
        [key]: {
          ...same,
          repeat_timeout: previous?.repeat_timeout ?? { seconds: 3 },
          slots,
          with_off: { enabled: button.press.withOff },
        },
      };
    }
    if (button.hold && button.hold !== before?.hold)
      entry.on_long_press = { action: button.hold };
  }
  return next;
};

/** Why a setup can't be saved yet, or null. */
export const problemWith = (setup: ButtonSetup, roomScenes: HueScene[]) => {
  for (const button of setup.buttons) {
    if (!button.press) continue;
    if (button.press.slots.length === 0) return "Add at least one scene.";
    if (
      button.press.slots.some(
        (slot) => !roomScenes.some((scene) => scene.id === slot.sceneId),
      )
    )
      return "Choose a scene for every step.";
    const times = button.press.slots.map((slot) => slot.time);
    if (button.press.mode === "time" && new Set(times).size !== times.length)
      return "Two steps start at the same time.";
  }
  return null;
};

/** A press setup the editor can't read, in words: its kind and its scenes. */
export const describeRawPress = (
  raw: unknown,
  nameOf: (id: string) => string | undefined,
): string | null => {
  if (raw == null) return null;
  const action = actionOf(raw);
  if (action) return ACTION_LABELS[action] ?? humanize(action);
  if (!isRecord(raw)) return null;
  const kind = Object.keys(raw)[0];
  const scenes = referencesIn(raw)
    .filter((ref) => ref.rtype === "scene")
    .map((ref) => nameOf(ref.rid) ?? "a scene");
  const label = kind ? humanize(kind) : "Custom";
  return scenes.length > 0 ? `${label}: ${scenes.join(", ")}` : label;
};
