import { useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { create } from "zustand";
import { describeCommandError } from "@/lib/entitlement-errors";
import type { AutomationScene, AutomationTarget } from "./model";

/** Mirrors `CalendarFeed` in src-tauri/src/services/automations/calendar/mod.rs. */
export interface CalendarFeed {
  id: string;
  name: string;
  enabled: boolean;
}

export type CalendarLook = "color" | "white" | "scene" | "off" | "dim";

/** Mirrors `CalendarRule`. */
export interface CalendarRule {
  id: string;
  name: string;
  enabled: boolean;
  feedIds: string[];
  titleIncludes: string;
  titleExcludes: string;
  busyOnly: boolean;
  includeAllDay: boolean;
  leadMinutes: number;
  trailMinutes: number;
  bridgeId: string | null;
  targets: AutomationTarget[];
  look: CalendarLook;
  xy: [number, number];
  mirek: number;
  brightness: number;
  scene: AutomationScene | null;
  restore: boolean;
}

/** Where a rule editor's part sits in the page, for the editor's section list. */
export const calendarSectionId = (ruleId: string, part: string) =>
  `calendar-${ruleId}-${part}`;

export interface CalendarSettings {
  feeds: CalendarFeed[];
  /** In priority order: an earlier rule keeps a light a later one wants. */
  rules: CalendarRule[];
}

/** Mirrors `EventMatch`. Times are wall-clock milliseconds. */
export interface EventMatch {
  feedId: string;
  title: string;
  start: number;
  end: number;
  allDay: boolean;
}

export interface CalendarStatus {
  feeds: {
    id: string;
    syncedAt: number | null;
    error: string | null;
    events: number;
  }[];
  rules: {
    id: string;
    active: EventMatch | null;
    next: EventMatch | null;
    error: string | null;
  }[];
  syncing: boolean;
}

interface CalendarData {
  settings: CalendarSettings;
  status: CalendarStatus;
}

interface CalendarState {
  settings: CalendarSettings | null;
  status: CalendarStatus | null;
  loadError: string | null;
}

export const useCalendarStore = create<CalendarState>(() => ({
  settings: null,
  status: null,
  loadError: null,
}));

let loading: Promise<void> | undefined;

export function loadCalendar(): Promise<void> {
  return (loading ??= (async () => {
    if (!isTauri()) {
      useCalendarStore.setState({
        loadError: "Open Mote Desktop to set up calendar rules.",
      });
      return;
    }
    try {
      await listen<CalendarStatus>("calendar-status", (event) => {
        useCalendarStore.setState({ status: event.payload });
      });
      const data = await invoke<CalendarData>("get-calendar-data");
      useCalendarStore.setState({ ...data, loadError: null });
    } catch (error) {
      useCalendarStore.setState({ loadError: describeCommandError(error) });
      loading = undefined;
    }
  })());
}

function apply(data: CalendarData) {
  useCalendarStore.setState({ settings: data.settings, status: data.status });
}

/** Saves a change, showing it at once, and puts the last saved one back if refused. */
export async function saveCalendar(
  change: (current: CalendarSettings) => CalendarSettings,
): Promise<boolean> {
  const current = useCalendarStore.getState().settings;
  if (!current) return false;
  const next = change(current);
  useCalendarStore.setState({ settings: next });
  try {
    apply(
      await invoke<CalendarData>("set-calendar-settings", { settings: next }),
    );
    return true;
  } catch (error) {
    useCalendarStore.setState({ settings: current });
    toast.error(describeCommandError(error));
    return false;
  }
}

/** Adds a calendar by address; resolves with its events this week. */
export async function addCalendarFeed(
  name: string,
  url: string,
): Promise<number> {
  const [data, events] = await invoke<[CalendarData, number]>(
    "add-calendar-feed",
    { id: crypto.randomUUID(), name, url },
  );
  apply(data);
  return events;
}

export async function removeCalendarFeed(id: string): Promise<void> {
  try {
    apply(await invoke<CalendarData>("remove-calendar-feed", { id }));
  } catch (error) {
    toast.error(describeCommandError(error));
  }
}

export function refreshCalendars() {
  return invoke("refresh-calendars").catch((error) =>
    toast.error(describeCommandError(error)),
  );
}

export function newCalendarRule(): CalendarRule {
  return {
    id: crypto.randomUUID(),
    name: "Meetings",
    enabled: false,
    feedIds: [],
    titleIncludes: "",
    titleExcludes: "",
    busyOnly: true,
    includeAllDay: false,
    leadMinutes: 0,
    trailMinutes: 0,
    bridgeId: null,
    targets: [],
    look: "color",
    xy: [0.675, 0.322],
    mirek: 366,
    brightness: 100,
    scene: null,
    restore: true,
  };
}

/** The events a rule being edited would act on this week, kept fresh. */
export function useRuleMatches(rule: CalendarRule | null): EventMatch[] {
  const [matches, setMatches] = useState<EventMatch[]>([]);
  const version = useCalendarStore((s) => s.status);
  useEffect(() => {
    if (!rule || !isTauri()) return;
    let current = true;
    const timer = setTimeout(() => {
      invoke<EventMatch[]>("preview-calendar-rule", { rule }).then(
        (found) => current && setMatches(found),
        () => current && setMatches([]),
      );
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [rule, version]);
  return matches;
}

// One queue per webview: a late update must never land after its stop request.
let pending: Promise<unknown> = Promise.resolve();
let request = 0;
function enqueue(rule: CalendarRule | null) {
  const id = ++request;
  const result = pending
    .catch(() => undefined)
    .then(() => {
      if (id !== request) return;
      return invoke("preview-calendar-look", { rule });
    });
  pending = result;
  return result;
}

/** Shows a rule's look on its lights while `rule` is set, renewing the lease. */
export function useCalendarPreview(rule: CalendarRule | null): {
  error: string | null;
} {
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    if (!isTauri()) return;
    const current = ++generation.current;
    let disposed = false;
    const send = () => {
      if (disposed) return;
      void enqueue(rule).then(
        () => {
          if (!disposed && generation.current === current) setError(null);
        },
        (reason) => {
          if (!disposed && generation.current === current)
            setError(describeCommandError(reason));
        },
      );
    };
    const timer = setTimeout(send, rule ? 180 : 0);
    const renewal = rule ? setInterval(send, 5_000) : undefined;
    return () => {
      disposed = true;
      clearTimeout(timer);
      if (renewal) clearInterval(renewal);
    };
  }, [rule]);
  useEffect(
    () => () => {
      if (isTauri()) void enqueue(null).catch(() => undefined);
    },
    [],
  );
  return { error: rule ? error : null };
}

/** "Tue 09:30", or "Today 09:30" and "Tomorrow 09:30" nearby. */
export function formatWhen(at: number, allDay = false): string {
  const date = new Date(at);
  const today = new Date();
  const days = Math.round(
    (new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() -
      new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
      ).getTime()) /
      86_400_000,
  );
  const day =
    days === 0
      ? "Today"
      : days === 1
        ? "Tomorrow"
        : date.toLocaleDateString([], { weekday: "short" });
  if (allDay) return `${day}, all day`;
  return `${day} ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}
