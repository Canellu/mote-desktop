import { expect, test, mock } from "bun:test";
import {
  validAccelerator,
  validShortcut,
  normalizeAccelerator,
} from "../src/features/shortcuts/model";

const handlers = new Map<string, (event: { state: string }) => void>();
const unavailable = new Set<string>();
const calls: unknown[] = [];
let stored = "[]";
let storageFails = false;
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: () => stored,
    setItem: (_key: string, value: string) => {
      if (storageFails) throw new Error("Disk full");
      stored = value;
    },
  },
});
mock.module("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  invoke: async (...args: unknown[]) => {
    calls.push(args);
  },
}));
mock.module("sonner", () => ({ toast: { error: () => {} } }));
mock.module("@tauri-apps/plugin-global-shortcut", () => ({
  register: async (
    key: string,
    handler: (event: { state: string }) => void,
  ) => {
    if (unavailable.has(key)) throw new Error("Already registered");
    handlers.set(key, handler);
  },
  unregister: async (key: string) => {
    handlers.delete(key);
  },
  unregisterAll: async () => {
    handlers.clear();
  },
}));
const { initializeShortcuts, saveShortcut, useShortcutStore } =
  await import("../src/features/shortcuts/store");
const shortcut = {
  id: "one",
  accelerator: "Control+Alt+Shift+KeyL",
  bridgeId: "BRIDGE",
  targetKind: "light" as const,
  targetId: "light-id",
  targetName: "Desk",
  action: "toggle" as const,
  brightness: 50,
  enabled: true,
};

test("accepts arbitrary combinations while rejecting malformed shortcuts", () => {
  for (const key of [
    "Super+KeyL",
    "Alt+F4",
    "Control+KeyC",
    "Control+Alt+KeyE",
    "Control+Alt+Shift+F12",
    "F8",
    "KeyL",
    "Control+ArrowUp",
    "Alt+Numpad0",
    "Escape",
  ])
    expect(validAccelerator(key)).toBe(true);
  for (const key of ["", "Ctrl+", "Control", "Ctrl++L", "Ctrl+L+M"])
    expect(validAccelerator(key)).toBe(false);
  expect(normalizeAccelerator("shift + CTRL + l")).toBe("Control+Shift+KeyL");
  expect(normalizeAccelerator("Win+J")).toBe("Super+KeyJ");
  expect(validShortcut(shortcut)).toBe(true);
  expect(validShortcut({ ...shortcut, targetKind: "scene" })).toBe(false);
  expect(validShortcut({ ...shortcut, brightness: 101 })).toBe(false);
});

test("conflict and persistence failures preserve the previous working binding", async () => {
  await initializeShortcuts();
  await saveShortcut(shortcut, shortcut.id);
  const replacement = { ...shortcut, accelerator: "Control+Alt+Shift+KeyM" };
  unavailable.add(replacement.accelerator);
  await expect(saveShortcut(replacement, shortcut.id)).rejects.toThrow(
    "could not be registered",
  );
  expect(handlers.has(shortcut.accelerator)).toBe(true);
  expect(JSON.parse(stored)[0].accelerator).toBe(shortcut.accelerator);
  unavailable.clear();
  storageFails = true;
  await expect(saveShortcut(replacement, shortcut.id)).rejects.toThrow(
    "Disk full",
  );
  storageFails = false;
  expect(handlers.has(shortcut.accelerator)).toBe(true);
  expect(handlers.has(replacement.accelerator)).toBe(false);
  await expect(saveShortcut({ ...shortcut, id: "two" }, "two")).rejects.toThrow(
    "already assigned",
  );
});

test("successive presses work without a release event; rapid duplicates are ignored", async () => {
  const handler = handlers.get(shortcut.accelerator)!;
  handler({ state: "Pressed" });
  handler({ state: "Pressed" });
  expect(calls).toHaveLength(1);
  await new Promise((resolve) => setTimeout(resolve, 550));
  handler({ state: "Pressed" });
  expect(calls).toHaveLength(2);
  handler({ state: "Released" });
  handler({ state: "Pressed" });
  await Promise.resolve();
  expect(calls).toHaveLength(2);
  await saveShortcut({ ...shortcut, enabled: false }, shortcut.id);
  expect(handlers.size).toBe(0);
  await saveShortcut(null, shortcut.id);
  expect(useShortcutStore.getState().shortcuts).toHaveLength(0);
});
