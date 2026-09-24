import type { HueLight, HueRoomZone } from "@/types/hue";

export interface SceneLightDraft {
  on: boolean;
  brightness: number;
  xy: [number, number] | null;
  mirek: number | null;
}

export const sceneLightDraft = (light: HueLight): SceneLightDraft => ({
  on: light.isOn,
  brightness: Math.max(1, Math.round(light.brightness ?? 100)),
  xy: light.colorMode === "xy" && light.supportsColor ? light.xy : null,
  mirek:
    light.colorMode !== "xy" && light.supportsCt
      ? (light.ct ?? light.ctMin ?? 250)
      : null,
});

export const sceneLightAction = (light: HueLight, draft: SceneLightDraft) => {
  const action: Record<string, unknown> = { on: { on: draft.on } };
  if (draft.on) {
    if (light.brightness != null) {
      action.dimming = { brightness: draft.brightness };
    }
    if (draft.xy && light.supportsColor) {
      action.color = { xy: { x: draft.xy[0], y: draft.xy[1] } };
    } else if (draft.mirek != null && light.supportsCt) {
      action.color_temperature = { mirek: draft.mirek };
    }
  }
  return action;
};

export const buildSceneBody = (
  name: string,
  space: HueRoomZone,
  lights: HueLight[],
  drafts: Record<string, SceneLightDraft>,
) => ({
  type: "scene",
  metadata: { name },
  group: { rid: space.id, rtype: space.resourceType },
  actions: lights
    .filter((light) => space.lightIds.includes(light.id))
    .map((light) => {
      const draft = drafts[light.id] ?? sceneLightDraft(light);
      return {
        target: { rid: light.id, rtype: "light" },
        action: sceneLightAction(light, draft),
      };
    }),
});
