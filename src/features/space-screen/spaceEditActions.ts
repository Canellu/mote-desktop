import { invoke } from "@tauri-apps/api/core";

import type { HueLight, HueRoomZone, HueScene } from "@/types/hue";

import {
  buildCopiedActions,
  capabilitiesFromLight,
  capabilitiesFromResource,
  creatablePalette,
  type LightCapabilities,
} from "./sceneCopy";

export type LightFunction = "functional" | "decorative" | "mixed";

export type SpaceEditOperation =
  | {
      type: "copy-scenes";
      sceneIds: string[];
      targetSpaceId: string;
    }
  | { type: "delete-scenes"; sceneIds: string[] }
  | {
      type: "set-light-function";
      lightIds: string[];
      value: LightFunction;
    }
  | {
      type: "place-lights";
      lightIds: string[];
      targetSpaceId: string | null;
    }
  | {
      type: "place-accessories";
      deviceIds: string[];
      targetRoomId: string | null;
    }
  | {
      type: "update-space-metadata";
      name: string;
      archetype: string;
    };

interface SpaceEditSnapshot {
  activeSpace: HueRoomZone;
  roomZones: HueRoomZone[];
  lights: HueLight[];
  scenes: HueScene[];
}

type RawResource = Record<string, unknown>;

const updateRoom = (roomId: string, deviceIds: string[]) =>
  invoke("update-room-members", { roomId, deviceIds: [...new Set(deviceIds)] });

const updateZone = (zoneId: string, lightIds: string[]) =>
  invoke("update-zone-members", { zoneId, lightIds: [...new Set(lightIds)] });

/** Raw v2 lights, for what each can accept; empty when the read fails. */
const loadLightResources = (): Promise<RawResource[]> =>
  invoke<RawResource[]>("get-hue-resource", { resourceType: "light" }).catch(
    () => [],
  );

const copyScene = async (
  scene: HueScene,
  target: HueRoomZone,
  snapshot: SpaceEditSnapshot,
  lightResources: RawResource[],
): Promise<void> => {
  const resources = await invoke<RawResource[]>("get-hue-resource", {
    resourceType: scene.resourceType,
    id: scene.id,
  });
  const source = resources[0];
  if (!source) throw new Error(`Scene "${scene.name}" no longer exists.`);

  const sourceActions = Array.isArray(source.actions)
    ? (source.actions as RawResource[])
    : [];
  if (sourceActions.length === 0)
    throw new Error(`Scene "${scene.name}" has no light actions to copy.`);
  if (target.lightIds.length === 0)
    throw new Error(`${target.name} has no lights for the copied scene.`);

  const targets = target.lightIds.map((lightId): LightCapabilities => {
    const resource = lightResources.find((light) => light.id === lightId);
    if (resource) return capabilitiesFromResource(resource);
    const light = snapshot.lights.find((item) => item.id === lightId);
    if (light) return capabilitiesFromLight(light);
    return {
      id: lightId,
      dimming: false,
      color: false,
      ct: null,
      gradient: false,
      effects: [],
      effectsV2: [],
    };
  });

  const body: RawResource = {
    type: "scene",
    metadata: { name: scene.name },
    group: { rid: target.id, rtype: target.resourceType },
    actions: buildCopiedActions(sourceActions, targets),
  };

  // The extras that make it a Hue-app scene: its picture and dynamic palette.
  const extras: RawResource = {};
  const image = (source.metadata as RawResource | undefined)?.image as
    | RawResource
    | undefined;
  if (image?.rtype === "public_image" && typeof image.rid === "string")
    extras.metadata = {
      name: scene.name,
      image: { rid: image.rid, rtype: "public_image" },
    };
  const palette = creatablePalette(source.palette);
  if (palette) {
    extras.palette = palette;
    if (typeof source.speed === "number") extras.speed = source.speed;
    if (typeof source.auto_dynamic === "boolean")
      extras.auto_dynamic = source.auto_dynamic;
  }

  if (Object.keys(extras).length === 0) {
    await invoke("create-hue-resource", { resourceType: "scene", body });
    return;
  }
  try {
    await invoke("create-hue-resource", {
      resourceType: "scene",
      body: { ...body, ...extras },
    });
  } catch {
    // The bridge refused an extra; the plain scene is still worth having.
    await invoke("create-hue-resource", { resourceType: "scene", body });
  }
};

const placeLights = async (
  lightIds: string[],
  targetSpaceId: string | null,
  snapshot: SpaceEditSnapshot,
): Promise<void> => {
  const selected = snapshot.lights.filter((light) => lightIds.includes(light.id));
  const target = targetSpaceId
    ? snapshot.roomZones.find((space) => space.id === targetSpaceId)
    : null;

  if (snapshot.activeSpace.resourceType === "zone") {
    await updateZone(
      snapshot.activeSpace.id,
      snapshot.activeSpace.lightIds.filter((id) => !lightIds.includes(id)),
    );
    if (target) {
      if (target.resourceType !== "zone")
        throw new Error("Zone lights can only be moved to another zone.");
      await updateZone(target.id, [...target.lightIds, ...lightIds]);
    }
    return;
  }

  const deviceIds = selected.map((light) => light.deviceId).filter(Boolean) as string[];
  if (deviceIds.length !== selected.length)
    throw new Error("One or more selected lights are missing their device id.");
  await updateRoom(
    snapshot.activeSpace.id,
    snapshot.activeSpace.deviceIds.filter((id) => !deviceIds.includes(id)),
  );
  if (target) {
    if (target.resourceType !== "room")
      throw new Error("Room lights can only be moved to another room.");
    await updateRoom(target.id, [...target.deviceIds, ...deviceIds]);
  }
};

export interface SpaceEditResult {
  scenesCopied: number;
  /** Scenes left alone because the target already has one by that name. */
  scenesSkipped: number;
}

const sceneKey = (name: string) => name.trim().toLocaleLowerCase();

/** Names of the scenes a room or zone holds, read fresh from the bridge. */
const sceneNamesIn = async (
  target: HueRoomZone,
  snapshot: SpaceEditSnapshot,
): Promise<Set<string>> => {
  try {
    const scenes = await invoke<RawResource[]>("get-hue-resource", {
      resourceType: "scene",
    });
    return new Set(
      scenes
        .filter((scene) => (scene.group as RawResource)?.rid === target.id)
        .map((scene) =>
          sceneKey(String((scene.metadata as RawResource)?.name ?? "")),
        ),
    );
  } catch {
    return new Set(
      snapshot.scenes
        .filter((scene) => scene.group === target.id)
        .map((scene) => sceneKey(scene.name)),
    );
  }
};

export const executeSpaceEditOperations = async (
  operations: SpaceEditOperation[],
  snapshot: SpaceEditSnapshot,
): Promise<SpaceEditResult> => {
  const result: SpaceEditResult = { scenesCopied: 0, scenesSkipped: 0 };
  for (const operation of operations) {
    switch (operation.type) {
      case "copy-scenes": {
        const target = snapshot.roomZones.find(
          (space) => space.id === operation.targetSpaceId,
        );
        if (!target) throw new Error("The target room or zone no longer exists.");
        const existing = await sceneNamesIn(target, snapshot);
        const lightResources = await loadLightResources();
        for (const sceneId of operation.sceneIds) {
          const scene = snapshot.scenes.find((item) => item.id === sceneId);
          if (!scene) continue;
          if (existing.has(sceneKey(scene.name))) {
            result.scenesSkipped += 1;
            continue;
          }
          await copyScene(scene, target, snapshot, lightResources);
          existing.add(sceneKey(scene.name));
          result.scenesCopied += 1;
        }
        break;
      }
      case "delete-scenes":
        for (const sceneId of operation.sceneIds) {
          const scene = snapshot.scenes.find((item) => item.id === sceneId);
          if (scene)
            await invoke("delete-hue-resource", {
              resourceType: scene.resourceType,
              id: scene.id,
            });
        }
        break;
      case "set-light-function":
        for (const lightId of operation.lightIds) {
          const light = snapshot.lights.find((item) => item.id === lightId);
          if (!light) continue;
          await invoke("update-hue-resource", {
            resourceType: "light",
            id: light.id,
            body: {
              metadata: {
                name: light.name,
                ...(light.typeName ? { archetype: light.typeName } : null),
                function: operation.value,
              },
            },
          });
        }
        break;
      case "place-lights":
        await placeLights(operation.lightIds, operation.targetSpaceId, snapshot);
        break;
      case "place-accessories": {
        if (snapshot.activeSpace.resourceType !== "room")
          throw new Error("Accessories can only be assigned to rooms.");
        await updateRoom(
          snapshot.activeSpace.id,
          snapshot.activeSpace.deviceIds.filter(
            (id) => !operation.deviceIds.includes(id),
          ),
        );
        if (operation.targetRoomId) {
          const target = snapshot.roomZones.find(
            (space) =>
              space.id === operation.targetRoomId &&
              space.resourceType === "room",
          );
          if (!target) throw new Error("The target room no longer exists.");
          await updateRoom(target.id, [
            ...target.deviceIds,
            ...operation.deviceIds,
          ]);
        }
        break;
      }
      case "update-space-metadata":
        await invoke("update-hue-resource", {
          resourceType: snapshot.activeSpace.resourceType,
          id: snapshot.activeSpace.id,
          body: {
            metadata: {
              name: operation.name.trim(),
              archetype: operation.archetype,
            },
          },
        });
        break;
    }
  }
  return result;
};

/** Toast text for a finished scene copy. */
export const sceneCopySummary = ({
  scenesCopied,
  scenesSkipped,
}: SpaceEditResult): string => {
  const scenes = (count: number) => `${count} scene${count === 1 ? "" : "s"}`;
  if (scenesCopied === 0) return "Already there, nothing copied";
  if (scenesSkipped === 0) return `${scenes(scenesCopied)} copied`;
  return `${scenes(scenesCopied)} copied, ${scenesSkipped} already there`;
};
