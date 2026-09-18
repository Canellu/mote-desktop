import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { create } from "zustand";
import { describeCommandError } from "@/lib/entitlement-errors";
import type { AutomationSettings, AutomationStatus } from "./model";

interface AutomationState {
  settings: AutomationSettings | null;
  status: AutomationStatus | null;
  loadError: string | null;
}

export const useAutomationStore = create<AutomationState>(() => ({
  settings: null,
  status: null,
  loadError: null,
}));

let loading: Promise<void> | undefined;
let confirmedSettings: AutomationSettings | null = null;

/** Loads once per window, then follows the status the Rust runtime publishes. */
export function loadAutomations(): Promise<void> {
  return (loading ??= (async () => {
    if (!isTauri()) {
      useAutomationStore.setState({
        loadError: "Open Mote Desktop to set up automations.",
      });
      return;
    }
    try {
      // Subscribe before reading, so a change in between is not lost.
      await listen<AutomationStatus>("automation-status", (event) => {
        useAutomationStore.setState({ status: event.payload });
      });
      const [settings, status] = await Promise.all([
        invoke<AutomationSettings>("get-automation-settings"),
        invoke<AutomationStatus>("get-automation-status"),
      ]);
      confirmedSettings = settings;
      useAutomationStore.setState({ settings, status, loadError: null });
    } catch (error) {
      useAutomationStore.setState({ loadError: describeCommandError(error) });
    }
  })());
}

let saving: Promise<void> = Promise.resolve();
let saveRevision = 0;

/**
 * Shows edits immediately while persisting snapshots in order. Older responses
 * cannot replace a newer edit; failed final saves restore the last confirmed value.
 */
export function saveAutomationSettings(
  change: (current: AutomationSettings) => AutomationSettings,
): Promise<void> {
  const current = useAutomationStore.getState().settings;
  if (!current) return Promise.resolve();
  confirmedSettings ??= current;
  const next = change(current);
  const revision = ++saveRevision;
  useAutomationStore.setState({ settings: next });
  const run = saving.then(async () => {
    try {
      const saved = await invoke<AutomationSettings>(
        "set-automation-settings",
        { settings: next },
      );
      confirmedSettings = saved;
      if (revision === saveRevision) {
        useAutomationStore.setState({ settings: saved });
      }
    } catch (error) {
      if (revision === saveRevision) {
        useAutomationStore.setState({ settings: confirmedSettings });
        toast.error(describeCommandError(error));
      }
    }
  });
  saving = run;
  return run;
}
