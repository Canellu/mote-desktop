import { describe, expect, test } from "bun:test";
import { buildSceneBody } from "../src/features/settings-screen/sceneDraft";
import { ScenePreviewSession } from "../src/features/settings-screen/scenePreview";
import type { HueLight, HueRoomZone } from "../src/types/hue";

const space = {
  id: "room-id",
  resourceType: "room",
  lightIds: ["color-id", "white-id", "switch-id"],
} as HueRoomZone;

const lights = [
  {
    id: "color-id",
    isOn: true,
    brightness: 80,
    colorMode: "xy",
    xy: [0.4, 0.3],
    supportsColor: true,
    supportsCt: true,
    ct: 300,
  },
  {
    id: "white-id",
    isOn: true,
    brightness: 60,
    colorMode: "ct",
    xy: null,
    supportsColor: false,
    supportsCt: true,
    ct: 250,
  },
  {
    id: "switch-id",
    isOn: false,
    brightness: null,
    colorMode: null,
    xy: null,
    supportsColor: false,
    supportsCt: false,
    ct: null,
  },
  {
    id: "outside-id",
    isOn: true,
    brightness: 90,
    colorMode: null,
    xy: null,
    supportsColor: false,
    supportsCt: false,
    ct: null,
  },
] as HueLight[];

describe("scene draft", () => {
  test("saves edited per-light actions only for the selected space", () => {
    const body = buildSceneBody("Evening", space, lights, {
      "color-id": { on: true, brightness: 35, xy: [0.5, 0.4], mirek: null },
      "white-id": { on: true, brightness: 70, xy: null, mirek: 350 },
    });

    expect(body.actions).toEqual([
      {
        target: { rid: "color-id", rtype: "light" },
        action: {
          on: { on: true },
          dimming: { brightness: 35 },
          color: { xy: { x: 0.5, y: 0.4 } },
        },
      },
      {
        target: { rid: "white-id", rtype: "light" },
        action: {
          on: { on: true },
          dimming: { brightness: 70 },
          color_temperature: { mirek: 350 },
        },
      },
      {
        target: { rid: "switch-id", rtype: "light" },
        action: { on: { on: false } },
      },
    ]);
  });
});

describe("scene preview", () => {
  test("does not write or restore lights whose draft is unchanged", async () => {
    const writes: string[] = [];
    const session = new ScenePreviewSession(
      lights.slice(0, 2),
      async (light) => {
        writes.push(light.id);
      },
      0,
    );
    await session.apply({});
    await session.restore();
    expect(writes).toEqual([]);
  });

  test("restores the starting light state after in-flight edits", async () => {
    let releaseFirstWrite!: () => void;
    let firstWriteStarted!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    const started = new Promise<void>((resolve) => {
      firstWriteStarted = resolve;
    });
    const writes: { id: string; brightness: number }[] = [];
    const session = new ScenePreviewSession(
      lights.slice(0, 2),
      async (light, draft) => {
        writes.push({ id: light.id, brightness: draft.brightness });
        if (writes.length === 1) {
          firstWriteStarted();
          await firstWrite;
        }
      },
      0,
    );

    const first = session.apply({
      "color-id": { on: true, brightness: 40, xy: [0.5, 0.4], mirek: null },
    });
    await started;
    const edited = session.apply({
      "color-id": { on: true, brightness: 20, xy: [0.5, 0.4], mirek: null },
    });
    const restored = session.restore();
    releaseFirstWrite();
    await Promise.all([first, edited, restored]);

    expect(writes).toEqual([
      { id: "color-id", brightness: 40 },
      { id: "color-id", brightness: 80 },
    ]);
  });
});
