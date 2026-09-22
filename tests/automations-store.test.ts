import { expect, mock, test } from "bun:test";
import type { AutomationSettings } from "../src/features/automations/model";

const writes: {
  settings: AutomationSettings;
  resolve: () => void;
  reject: () => void;
}[] = [];
const errors: unknown[] = [];
mock.module("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  invoke: (_command: string, { settings }: { settings: AutomationSettings }) =>
    new Promise((resolve, reject) => {
      writes.push({
        settings,
        resolve: () => resolve(settings),
        reject: () => reject(new Error("Save failed")),
      });
    }),
}));
mock.module("sonner", () => ({
  toast: { error: (error: unknown) => errors.push(error) },
}));
mock.module("@tauri-apps/api/event", () => ({
  listen: async () => () => undefined,
}));

const { saveAutomationSettings, useAutomationStore } =
  await import("../src/features/automations/store");

test("a missing loaded store reports failure", async () => {
  useAutomationStore.setState({ settings: null });
  expect(await saveAutomationSettings((settings) => settings)).toBe(false);
});

test("rapid selections stay visible, writes serialize, and failed saves restore confirmed settings", async () => {
  const initial: AutomationSettings = {
    onAir: {
      enabled: false,
      bridgeId: "bridge",
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
      bridgeId: "bridge",
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
  useAutomationStore.setState({ settings: initial });
  const add = (id: string) =>
    saveAutomationSettings((current) => ({
      ...current,
      onAir: {
        ...current.onAir,
        targets: [...current.onAir.targets, { kind: "light", id, name: id }],
      },
    }));
  const selected = () =>
    useAutomationStore
      .getState()
      .settings!.onAir.targets.map((target) => target.id);

  const first = add("one");
  expect(selected()).toEqual(["one"]);
  const second = add("two");
  expect(selected()).toEqual(["one", "two"]);
  await Promise.resolve();
  expect(writes).toHaveLength(1);
  writes[0].resolve();
  expect(await first).toBe(true);
  expect(selected()).toEqual(["one", "two"]);
  expect(writes).toHaveLength(2);
  expect(writes[1].settings.onAir.targets.map((target) => target.id)).toEqual([
    "one",
    "two",
  ]);
  writes[1].resolve();
  expect(await second).toBe(true);

  const third = add("three");
  const fourth = add("four");
  await Promise.resolve();
  writes[2].reject();
  expect(await third).toBe(false);
  expect(selected()).toEqual(["one", "two", "three", "four"]);
  expect(errors).toHaveLength(0);
  writes[3].reject();
  expect(await fourth).toBe(false);
  expect(selected()).toEqual(["one", "two"]);
  expect(errors).toHaveLength(1);
});
