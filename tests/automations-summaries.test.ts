import { expect, test } from "bun:test";
import type {
  AwaySettings,
  OnAirSettings,
} from "../src/features/automations/model";
import {
  awaySummary,
  colorName,
  namesPhrase,
  onAirSummary,
} from "../src/features/automations/summaries";

const onAir: OnAirSettings = {
  enabled: false,
  bridgeId: "bridge",
  target: null,
  targets: [{ kind: "light", id: "desk", name: "Desk" }],
  mode: "color",
  xy: null,
  mirek: 366,
  scene: null,
  trigger: "microphone_or_camera",
  color: "red",
  brightness: 80,
  ignoredApps: [],
};

const away: AwaySettings = {
  enabled: false,
  bridgeId: "bridge",
  target: null,
  targets: [
    { kind: "light", id: "desk", name: "Desk" },
    { kind: "light", id: "lamp", name: "Lamp" },
  ],
  scene: null,
  action: "dim",
  dimBrightness: 20,
  includeSleep: true,
  restoreOnReturn: true,
};

test("names read as a short list", () => {
  expect(namesPhrase([], "none")).toBe("none");
  expect(namesPhrase(["Desk"], "none")).toBe("Desk");
  expect(namesPhrase(["Desk", "Lamp"], "none")).toBe("Desk and Lamp");
  expect(namesPhrase(["Desk", "Lamp", "Hall"], "none")).toBe("Desk and 2 more");
});

test("a picked color gets a plain name", () => {
  expect(colorName([0.675, 0.322])).toBe("red");
  expect(colorName([0.5614, 0.4156])).toBe("orange");
  expect(colorName([0.2725, 0.1096])).toBe("purple");
  expect(colorName([0.1532, 0.0475])).toBe("blue");
  expect(colorName([0.3127, 0.329])).toBe("white");
});

test("the on-air sentence agrees with one light or several", () => {
  expect(onAirSummary(onAir).sentence).toBe(
    "When your microphone or camera is in use, Desk turns red at 80%.",
  );
  expect(
    onAirSummary({
      ...onAir,
      xy: [0.1532, 0.0475],
      targets: [...onAir.targets, { kind: "light", id: "lamp", name: "Lamp" }],
    }).sentence,
  ).toBe(
    "When your microphone or camera is in use, Desk and Lamp turn blue at 80%.",
  );
  expect(onAirSummary({ ...onAir, ignoredApps: ["a"] }).sections.when).toBe(
    "Microphone or camera · 1 app ignored",
  );
});

test("the lock sentence says what happens and what comes back", () => {
  const summary = awaySummary(away);
  expect(summary.sentence).toBe(
    "When this PC locks or sleeps, Desk and Lamp dim to 20%. They go back when you unlock it.",
  );
  expect(summary.sections.action).toBe("Desk and Lamp · Dim to 20%");
});
