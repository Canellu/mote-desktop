import { isRecord } from "@/features/settings-screen/utils/format";
import type { HueScene } from "@/types/hue";
import { groupOf, pad, recall, recalledScene, type Json } from "./button-setup";

/**
 * A motion sensor's behavior on the bridge, as the Hue app sets it up. Two
 * layouts exist: a newer one nesting everything under `motion` and
 * `light_level`, and an older one with `when`, `where` and `settings` at the
 * top. Both are read and written in place.
 */

/** dark_threshold at its maximum: everything counts as dark. */
export const ALWAYS_DARK = 65534;

/** Hue light level is 10000 × log10(lux) + 1. */
export const luxOf = (level: number) => Math.round(10 ** ((level - 1) / 10000));

/** When the lights may turn on, as offered when editing. */
export const DAYLIGHT_CHOICES = [
  {
    threshold: ALWAYS_DARK,
    label: "Always",
    detail: "Turns on even when the room is bright",
  },
  {
    threshold: 16000,
    label: "When it's getting dark",
    detail: "Stays off while there's enough daylight",
  },
  {
    threshold: 10000,
    label: "Only when it's dark",
    detail: "Like at night or in a dark hallway",
  },
] as const;

export interface MotionSlot {
  /** "HH:MM", or the event name when the slot starts at sunrise or sunset. */
  time: string;
  /** "time" for a clock time; anything else is kept and shown as is. */
  startType: string;
  /** The scene motion turns on; "" when motion does something else. */
  sceneId: string;
  /** Minutes without motion before the lights go off; null when never. */
  offAfter: number | null;
}

export interface MotionSetup {
  groupId: string;
  slots: MotionSlot[];
  /** null when the setup has no daylight check. */
  darkThreshold: number | null;
}

/** Where each part lives in this configuration's layout. */
const parts = (config: Json) => {
  const nested = isRecord(config.motion) ? config.motion : null;
  const root = nested ?? config;
  const lightLevel = isRecord(config.light_level) ? config.light_level : null;
  const daylight =
    lightLevel && isRecord(lightLevel.daylight)
      ? lightLevel.daylight.daylight_sensitivity
      : null;
  const sensitivity = isRecord(daylight)
    ? daylight.settings
    : isRecord(config.settings)
      ? config.settings.daylight_sensitivity
      : null;
  return {
    root,
    when: isRecord(root.when) ? root.when : null,
    sensitivity: isRecord(sensitivity) ? sensitivity : null,
  };
};

const sceneOnMotion = (onMotion: unknown) =>
  isRecord(onMotion) ? recalledScene(onMotion.recall_single) : "";

const minutesOf = (onNoMotion: unknown) => {
  if (!isRecord(onNoMotion) || !isRecord(onNoMotion.after)) return null;
  const { minutes, seconds } = onNoMotion.after as Json;
  if (typeof minutes === "number") return minutes;
  if (typeof seconds === "number") return Math.round(seconds / 60);
  return null;
};

export const parseMotionSetup = (config: Json): MotionSetup | null => {
  const { root, when, sensitivity } = parts(config);
  if (!when || !Array.isArray(when.timeslots)) return null;
  const groupId = groupOf(root.where);
  if (!groupId) return null;
  const slots = when.timeslots.map((slot): MotionSlot => {
    const start =
      isRecord(slot) && isRecord(slot.start_time) ? slot.start_time : {};
    const type = typeof start.type === "string" ? start.type : "time";
    const clock = isRecord(start.time) ? start.time : {};
    return {
      time:
        type === "time"
          ? `${pad(Number(clock.hour ?? 0))}:${pad(Number(clock.minute ?? 0))}`
          : type,
      startType: type,
      sceneId: isRecord(slot) ? sceneOnMotion(slot.on_motion) : "",
      offAfter: isRecord(slot) ? minutesOf(slot.on_no_motion) : null,
    };
  });
  const threshold = sensitivity?.dark_threshold;
  return {
    groupId,
    slots,
    darkThreshold: typeof threshold === "number" ? threshold : null,
  };
};

const toMinutes = (time: string) => {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return hour * 60 + minute;
};

/** Clock-time slots in the order of the day; others keep their place after. */
export const sortSlots = <T extends { slot: MotionSlot }>(entries: T[]) =>
  [...entries].sort((a, b) =>
    a.slot.startType === "time" && b.slot.startType === "time"
      ? toMinutes(a.slot.time) - toMinutes(b.slot.time)
      : 0,
  );

/**
 * The configuration with the edits applied. Each slot keeps whatever the
 * editor doesn't change; a new slot copies the shape the Hue app writes.
 */
export const buildMotionConfig = (
  original: Json,
  base: MotionSetup,
  setup: MotionSetup,
  groupType: string,
  /** For each edited slot, which original slot it came from (or null). */
  origins: Array<number | null>,
): Json => {
  const next = structuredClone(original);
  const { root, when, sensitivity } = parts(next);
  if (setup.groupId !== base.groupId)
    root.where = [{ group: { rid: setup.groupId, rtype: groupType } }];
  if (
    sensitivity &&
    setup.darkThreshold != null &&
    setup.darkThreshold !== base.darkThreshold
  )
    sensitivity.dark_threshold = setup.darkThreshold;
  if (!when) return next;
  const previous = Array.isArray(when.timeslots) ? when.timeslots : [];
  const slots = sortSlots(
    setup.slots.map((slot, index) => ({ slot, origin: origins[index] })),
  ).map(({ slot, origin }) => {
    const before = origin != null ? base.slots[origin] : null;
    const kept =
      origin != null && isRecord(previous[origin])
        ? (structuredClone(previous[origin]) as Json)
        : null;
    const entry: Json = kept ?? {
      on_motion: { recall_single: recall(slot.sceneId) },
      on_no_motion: {
        after: { minutes: slot.offAfter ?? 10 },
        recall_single: [{ action: "all_off" }],
      },
      start_time: { time: { hour: 0, minute: 0 }, type: "time" },
    };
    if (slot.startType === "time" && (!before || slot.time !== before.time)) {
      const [hour, minute] = slot.time.split(":").map(Number);
      entry.start_time = { time: { hour, minute }, type: "time" };
    }
    if (before && slot.sceneId !== before.sceneId) {
      const onMotion = isRecord(entry.on_motion) ? entry.on_motion : {};
      entry.on_motion = { ...onMotion, recall_single: recall(slot.sceneId) };
    }
    if (before && slot.offAfter !== before.offAfter) {
      if (slot.offAfter == null) delete entry.on_no_motion;
      else {
        const onNoMotion = isRecord(entry.on_no_motion)
          ? entry.on_no_motion
          : { recall_single: [{ action: "all_off" }] };
        entry.on_no_motion = {
          ...onNoMotion,
          after: { minutes: slot.offAfter },
        };
      }
    }
    return entry;
  });
  when.timeslots = slots;
  return next;
};

/** Why a setup can't be saved yet, or null. */
export const motionProblem = (setup: MotionSetup, roomScenes: HueScene[]) => {
  if (setup.slots.length === 0) return "Add at least one time.";
  if (
    setup.slots.some(
      (slot) => !roomScenes.some((scene) => scene.id === slot.sceneId),
    )
  )
    return "Choose a scene for every time.";
  const times = setup.slots
    .filter((slot) => slot.startType === "time")
    .map((slot) => slot.time);
  if (new Set(times).size !== times.length)
    return "Two times start at the same moment.";
  return null;
};
