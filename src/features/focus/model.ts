import type { AutomationLightGroup } from "@/features/automations/components/AutomationLightPicker";
import type { AutomationTarget } from "@/features/automations/model";

/** Mirrors `Vibe` in src-tauri/src/services/automations/focus.rs. */
export type FocusVibe = "calm" | "journey" | "race" | "minimal";
export type FocusPhase = "focus" | "break" | "longBreak";
export type FocusLifecycle =
  | "idle"
  | "running"
  | "paused"
  | "intermission"
  | "completed";
/** Which of a ritual's looks a preview shows. */
export type FocusLook = "focus" | "warning" | "break";

/** Mirrors `FocusRitual`. */
export interface FocusRitual {
  id: string;
  name: string;
  focusMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  rounds: number;
  bridgeId: string | null;
  targets: AutomationTarget[];
  vibe: FocusVibe;
  focusXy: [number, number];
  warningXy: [number, number];
  breakXy: [number, number];
  focusBrightness: number;
  breakBrightness: number;
  notify: boolean;
}

/** Mirrors `FocusStatus`. `endsAt` is wall-clock milliseconds while running. */
export interface FocusStatus {
  lifecycle: FocusLifecycle;
  ritualId: string | null;
  ritualName: string | null;
  phase: FocusPhase | null;
  nextPhase: FocusPhase | null;
  intermission: boolean;
  round: number;
  rounds: number;
  stageMs: number;
  remainingMs: number;
  endsAt: number | null;
  focusedMs: number;
  completedRounds: number;
  pausedBySleep: boolean;
  error: string | null;
}

export interface FocusData {
  rituals: FocusRitual[];
  lastRitualId: string | null;
  status: FocusStatus;
}

export const idleFocusStatus: FocusStatus = {
  lifecycle: "idle",
  ritualId: null,
  ritualName: null,
  phase: null,
  nextPhase: null,
  intermission: false,
  round: 0,
  rounds: 0,
  stageMs: 0,
  remainingMs: 0,
  endsAt: null,
  focusedMs: 0,
  completedRounds: 0,
  pausedBySleep: false,
  error: null,
};

/** The ritual's lights belong to a bridge other than the one in use. */
export const onAnotherBridge = (ritual: FocusRitual, bridgeId: string | null) =>
  !!ritual.bridgeId && ritual.bridgeId !== bridgeId;

/** True once a ritual has lights this bridge can actually drive. */
export const ritualHasLights = (ritual: FocusRitual, bridgeId: string | null) =>
  ritual.targets.length > 0 && !onAnotherBridge(ritual, bridgeId);

/** A ritual's lights in words: "Office and Desk", or "Office and 2 more". */
export function ritualLightsLabel(
  ritual: FocusRitual,
  lightGroups: AutomationLightGroup[],
  bridgeId: string | null,
): string {
  if (!ritual.targets.length) return "No lights yet";
  if (onAnotherBridge(ritual, bridgeId)) return "Lights on another bridge";
  const options = lightGroups.flatMap((group) => group.options);
  const names = ritual.targets.map(
    (target) =>
      options.find(
        (option) => option.kind === target.kind && option.id === target.id,
      )?.name ?? target.name,
  );
  return names.length <= 2
    ? names.join(" and ")
    : `${names[0]} and ${names.length - 1} more`;
}

export const isSessionActive = (status: FocusStatus | null) =>
  !!status &&
  (status.lifecycle === "running" ||
    status.lifecycle === "paused" ||
    status.lifecycle === "intermission");

export interface RhythmPreset {
  id: string;
  name: string;
  focusMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  rounds: number;
  vibe: FocusVibe;
}

/** The starter rhythms. Choosing one copies its numbers; nothing links back. */
export const rhythmPresets: RhythmPreset[] = [
  {
    id: "clear-mind",
    name: "Clear Mind",
    focusMinutes: 25,
    breakMinutes: 5,
    longBreakMinutes: 15,
    rounds: 4,
    vibe: "calm",
  },
  {
    id: "deep-dive",
    name: "Deep Dive",
    focusMinutes: 50,
    breakMinutes: 10,
    longBreakMinutes: 20,
    rounds: 2,
    vibe: "journey",
  },
  {
    id: "momentum",
    name: "Momentum",
    focusMinutes: 15,
    breakMinutes: 3,
    longBreakMinutes: 10,
    rounds: 4,
    vibe: "race",
  },
  {
    id: "quiet-cue",
    name: "Quiet Cue",
    focusMinutes: 25,
    breakMinutes: 5,
    longBreakMinutes: 15,
    rounds: 4,
    vibe: "minimal",
  },
];

export const vibeInfo: Record<FocusVibe, { name: string; blurb: string }> = {
  calm: {
    name: "Calm",
    blurb: "One cool look that warms as the end nears.",
  },
  journey: {
    name: "Journey",
    blurb: "A gradient across your lights that shifts each quarter.",
  },
  race: {
    name: "Light Race",
    blurb: "Your lights fill up one by one as the minutes go.",
  },
  minimal: {
    name: "Minimal",
    blurb: "A look for each phase and a cue in the last minute.",
  },
};

export const phaseName: Record<FocusPhase, string> = {
  focus: "Focus",
  break: "Break",
  longBreak: "Long break",
};

export function newRitual(
  preset: RhythmPreset = rhythmPresets[0],
): FocusRitual {
  return {
    id: crypto.randomUUID(),
    name: preset.name,
    focusMinutes: preset.focusMinutes,
    breakMinutes: preset.breakMinutes,
    longBreakMinutes: preset.longBreakMinutes,
    rounds: preset.rounds,
    bridgeId: null,
    targets: [],
    vibe: preset.vibe,
    focusXy: [0.28, 0.29],
    warningXy: [0.53, 0.41],
    breakXy: [0.35, 0.47],
    focusBrightness: 80,
    breakBrightness: 50,
    notify: true,
  };
}

/** e.g. "25 / 5 · 4 rounds". */
export function rhythmSummary(ritual: {
  focusMinutes: number;
  breakMinutes: number;
  rounds: number;
}): string {
  return `${ritual.focusMinutes} / ${ritual.breakMinutes} · ${ritual.rounds} ${
    ritual.rounds === 1 ? "round" : "rounds"
  }`;
}

/** The four numbers that shape a session, shared by rituals and presets. */
export type Rhythm = Pick<
  FocusRitual,
  "focusMinutes" | "breakMinutes" | "longBreakMinutes" | "rounds"
>;

export type SessionBlock = {
  kind: "focus" | "break" | "long";
  minutes: number;
  /** Which round a focus stretch belongs to, counting from one. */
  round?: number;
};

/** Every stretch a session runs through, in order. */
export function sessionBlocks(rhythm: Rhythm): SessionBlock[] {
  const blocks: SessionBlock[] = [];
  for (let round = 0; round < rhythm.rounds; round += 1) {
    blocks.push({
      kind: "focus",
      minutes: rhythm.focusMinutes,
      round: round + 1,
    });
    if (round < rhythm.rounds - 1)
      blocks.push({ kind: "break", minutes: rhythm.breakMinutes });
  }
  blocks.push({ kind: "long", minutes: rhythm.longBreakMinutes });
  return blocks;
}

/** The focus time alone, breaks excluded. */
export const focusedMinutes = (rhythm: Rhythm): number =>
  rhythm.rounds * rhythm.focusMinutes;

/** Every rest added up: the breaks between rounds and the long one. */
export const restMinutes = (rhythm: Rhythm): number =>
  Math.max(0, rhythm.rounds - 1) * rhythm.breakMinutes +
  rhythm.longBreakMinutes;

/** "45 min", "1 h", "2 h 10 m". */
export function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (!hours) return `${minutes} min`;
  return minutes ? `${hours} h ${minutes} m` : `${hours} h`;
}

/** The whole session in minutes, breaks included. */
export function sessionMinutes(rhythm: Rhythm): number {
  return (
    rhythm.rounds * rhythm.focusMinutes +
    Math.max(0, rhythm.rounds - 1) * rhythm.breakMinutes +
    rhythm.longBreakMinutes
  );
}

/** "12:05", or "1:02:05" past an hour. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}
