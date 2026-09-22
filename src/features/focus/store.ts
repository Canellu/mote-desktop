import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { create } from "zustand";
import { openProUpgrade } from "@/features/pro/proUpgrade";
import {
  describeCommandError,
  isPurchaseRequired,
} from "@/lib/entitlement-errors";
import {
  idleFocusStatus,
  type FocusData,
  type FocusRitual,
  type FocusStatus,
} from "./model";

interface FocusState {
  rituals: FocusRitual[] | null;
  lastRitualId: string | null;
  status: FocusStatus;
  loadError: string | null;
}

export const useFocusStore = create<FocusState>(() => ({
  rituals: null,
  lastRitualId: null,
  status: idleFocusStatus,
  loadError: null,
}));

let loading: Promise<void> | undefined;

/** Loads once per window, then follows the status the Rust runtime publishes. */
export function loadFocus(): Promise<void> {
  return (loading ??= (async () => {
    if (!isTauri()) {
      useFocusStore.setState({
        rituals: [],
        loadError: "Open Mote Desktop to run focus sessions.",
      });
      return;
    }
    try {
      // Subscribe before reading, so a change in between is not lost.
      await listen<FocusStatus>("focus-status", (event) => {
        useFocusStore.setState({ status: event.payload });
      });
      const data = await invoke<FocusData>("get-focus-data");
      apply(data);
    } catch (error) {
      useFocusStore.setState({ loadError: describeCommandError(error) });
    }
  })());
}

function apply(data: FocusData) {
  useFocusStore.setState({
    rituals: data.rituals,
    lastRitualId: data.lastRitualId,
    status: data.status,
    loadError: null,
  });
}

/** A failure a person can act on: Pro opens the purchase window. */
function report(error: unknown) {
  if (isPurchaseRequired(error)) openProUpgrade("local_automation");
  else toast.error(describeCommandError(error));
}

export async function saveRitual(ritual: FocusRitual): Promise<boolean> {
  try {
    apply(await invoke<FocusData>("save-focus-ritual", { ritual }));
    return true;
  } catch (error) {
    report(error);
    return false;
  }
}

export async function deleteRitual(id: string): Promise<void> {
  try {
    apply(await invoke<FocusData>("delete-focus-ritual", { id }));
  } catch (error) {
    report(error);
  }
}

async function command(name: string, args?: Record<string, unknown>) {
  try {
    const status = await invoke<FocusStatus>(name, args);
    useFocusStore.setState({ status });
    return true;
  } catch (error) {
    report(error);
    return false;
  }
}

export const startFocus = (ritualId: string) =>
  command("start-focus", { ritualId }).then((started) => {
    if (started) useFocusStore.setState({ lastRitualId: ritualId });
    return started;
  });
export const pauseFocus = () => command("pause-focus");
export const resumeFocus = () => command("resume-focus");
export const skipFocusPhase = () => command("skip-focus-phase");
export const extendFocusPhase = () => command("extend-focus-phase");
export const stopFocus = () => command("stop-focus");
export const dismissFocus = () => command("dismiss-focus");
