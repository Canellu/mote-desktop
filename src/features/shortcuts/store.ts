import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  register,
  unregister,
  unregisterAll,
} from "@tauri-apps/plugin-global-shortcut";
import { create } from "zustand";
import { toast } from "sonner";
import {
  type LightShortcut,
  validShortcut,
  shortcutLabel,
  normalizeAccelerator,
} from "./model";

const storageKey = "mote-keyboard-shortcuts-v1";
interface ShortcutState {
  shortcuts: LightShortcut[];
  errors: Record<string, string>;
  busy: boolean;
  ready: boolean;
  recording: boolean;
  editing: boolean;
  loadError: string | null;
}
export const useShortcutStore = create<ShortcutState>(() => ({
  shortcuts: [],
  errors: {},
  busy: false,
  ready: false,
  recording: false,
  editing: false,
  loadError: null,
}));
const registered = new Set<string>();
let executing = false;
let lastRun = 0;
let initialization: Promise<void> | undefined;

async function registerShortcut(shortcut: LightShortcut) {
  await register(shortcut.accelerator, (event) => {
    // Windows registers with MOD_NOREPEAT. Do not latch on release events:
    // a missed release would permanently swallow subsequent toggle presses.
    if (event.state !== "Pressed") return;
    if (useShortcutStore.getState().recording) {
      window.dispatchEvent(
        new CustomEvent("mote-shortcut-recorded", {
          detail: shortcut.accelerator,
        }),
      );
      return;
    }
    if (executing || Date.now() - lastRun < 500) return;
    const state = useShortcutStore.getState();
    const current = state.shortcuts.find((s) => s.id === shortcut.id);
    if (!current?.enabled || state.recording || state.editing || state.busy) return;
    executing = true;
    lastRun = Date.now();
    void invoke("execute-shortcut", { ...current })
      .then(() => {
        useShortcutStore.setState((s) => ({
          errors: { ...s.errors, [current.id]: "" },
        }));
      })
      .catch((error: unknown) => {
        const message = String(error);
        useShortcutStore.setState((s) => ({
          errors: { ...s.errors, [current.id]: message },
        }));
        toast.error(`${current.targetName}: ${message}`);
      })
      .finally(() => {
        executing = false;
      });
  });
  registered.add(shortcut.accelerator);
}

const conflictMessage = (s: LightShortcut, error: unknown) =>
  `${shortcutLabel(s.accelerator)} could not be registered. It may be reserved by Windows or another app. Choose another key, or release it in the other app and retry. (${String(error)})`;

export function initializeShortcuts(): Promise<void> {
  return (initialization ??= (async () => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      if (
        !Array.isArray(raw) ||
        !raw.every(validShortcut) ||
        new Set(raw.map((s) => s.id)).size !== raw.length ||
        new Set(raw.map((s) => s.accelerator)).size !== raw.length
      ) {
        throw new Error(
          "Saved shortcuts could not be read. Your saved data has been kept.",
        );
      }
      const shortcuts = raw.map((s) => ({
        ...s,
        accelerator: normalizeAccelerator(s.accelerator),
      }));
      useShortcutStore.setState({ shortcuts });
      if (!isTauri()) return;
      // Clear registrations retained by the native process after a webview reload.
      await unregisterAll();
      for (const shortcut of shortcuts.filter((s) => s.enabled)) {
        try {
          await registerShortcut(shortcut);
        } catch (error) {
          const message = conflictMessage(shortcut, error);
          useShortcutStore.setState((s) => ({
            errors: { ...s.errors, [shortcut.id]: message },
          }));
          toast.error(
            `Shortcut unavailable: ${shortcutLabel(shortcut.accelerator)}`,
          );
        }
      }
    } catch (error) {
      useShortcutStore.setState({ loadError: String(error) });
    } finally {
      useShortcutStore.setState({ ready: true });
    }
  })());
}

// Register the replacement first: a conflict must not disable a working shortcut.
export async function saveShortcut(next: LightShortcut | null, id: string) {
  await initializeShortcuts();
  const state = useShortcutStore.getState();
  if (state.busy)
    throw new Error("Wait for the current shortcut change to finish.");
  if (state.loadError) throw new Error(state.loadError);
  if (!isTauri())
    throw new Error("Open Mote Desktop to save global shortcuts.");
  if (next && !validShortcut(next))
    throw new Error(
      "Enter a key combination (for example Ctrl+L or F8) and a valid action.",
    );
  if (next)
    next = { ...next, accelerator: normalizeAccelerator(next.accelerator) };
  if (
    next &&
    state.shortcuts.some(
      (s) => s.id !== id && s.accelerator === next.accelerator,
    )
  ) {
    throw new Error(
      "This key combination is already assigned in Mote. Edit that shortcut or choose another key.",
    );
  }
  const old = state.shortcuts.find((s) => s.id === id);
  const list = state.shortcuts.filter((s) => s.id !== id);
  if (next) list.push(next);
  let added = false;
  let removed = false;
  useShortcutStore.setState({ busy: true });
  try {
    if (next?.enabled && !registered.has(next.accelerator)) {
      try {
        await registerShortcut(next);
        added = true;
      } catch (error) {
        throw Object.assign(new Error(conflictMessage(next, error)), {
          cause: error,
        });
      }
    }
    if (
      old &&
      registered.has(old.accelerator) &&
      (!next?.enabled || old.accelerator !== next.accelerator)
    ) {
      await unregister(old.accelerator);
      registered.delete(old.accelerator);
      removed = true;
    }
    localStorage.setItem(storageKey, JSON.stringify(list));
    useShortcutStore.setState((s) => ({
      shortcuts: list,
      errors: { ...s.errors, [id]: "" },
    }));
  } catch (error) {
    try {
      if (added && next) {
        await unregister(next.accelerator);
        registered.delete(next.accelerator);
      }
      if (removed && old) await registerShortcut(old);
    } catch (rollbackError) {
      useShortcutStore.setState((s) => ({
        errors: {
          ...s.errors,
          [id]: `Unable to restore shortcut: ${String(rollbackError)}. Retry or restart Mote.`,
        },
      }));
    }
    throw error;
  } finally {
    useShortcutStore.setState({ busy: false });
  }
}
