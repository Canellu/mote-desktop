import { PacedSlider } from "@/components/PacedSlider";
import { Switch } from "@/components/ui/switch";
import { GroupLightWheels } from "@/features/space-screen/components/GroupLightWheels";
import type { HueLight, HueRoomZone } from "@/types/hue";
import { useMemo, type ReactNode } from "react";
import { sceneLightDraft, type SceneLightDraft } from "../sceneDraft";

export const SceneLightEditor = ({
  space,
  lights,
  drafts,
  onChangeMany,
  disabled,
  headerEnd,
}: {
  space: HueRoomZone;
  lights: HueLight[];
  drafts: Record<string, SceneLightDraft>;
  onChangeMany: (changes: Record<string, SceneLightDraft>) => void;
  disabled: boolean;
  /** Shown at the right end of the Color / White row. */
  headerEnd?: ReactNode;
}) => {
  const draftFor = (light: HueLight) =>
    drafts[light.id] ?? sceneLightDraft(light);
  const previewLights = useMemo(
    () =>
      lights.map((light) => {
        const draft = drafts[light.id] ?? sceneLightDraft(light);
        return {
          ...light,
          isOn: draft.on,
          brightness: draft.brightness,
          xy: draft.xy,
          ct: draft.mirek,
          colorMode: draft.xy
            ? "xy"
            : draft.mirek != null
              ? "ct"
              : light.colorMode,
        };
      }),
    [lights, drafts],
  );
  const onLights = previewLights.filter((light) => light.isOn);
  const anyOn = onLights.length > 0;
  const brightnessPct = anyOn
    ? Math.round(
        onLights.reduce((sum, light) => sum + (light.brightness ?? 0), 0) /
          onLights.length,
      )
    : 0;
  const updateAll = (change: (light: HueLight) => SceneLightDraft) =>
    onChangeMany(
      Object.fromEntries(lights.map((light) => [light.id, change(light)])),
    );

  return (
    <section
      className="flex w-full min-w-0 flex-1 flex-col gap-6 rounded-2xl bg-(--settings-surface) p-5"
      inert={disabled}
      aria-label={`${space.name} scene lighting`}
    >
      <GroupLightWheels
        compact
        tabsEnd={headerEnd}
        wheelFooter={
          // Labels share row 1 and controls share row 2, so both line up.
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-8 gap-y-2 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>Brightness</span>
              <span className="tabular-nums">{brightnessPct}%</span>
            </div>
            <span className="justify-self-end">{anyOn ? "On" : "Off"}</span>
            <PacedSlider
              value={anyOn ? Math.max(1, brightnessPct) : 1}
              min={1}
              disabled={disabled}
              ariaLabel={`${space.name} scene brightness`}
              isGroup
              liveMs={0}
              onCommit={(brightness) =>
                updateAll((light) => ({ ...draftFor(light), brightness }))
              }
            />
            <Switch
              className="justify-self-end"
              checked={anyOn}
              disabled={disabled}
              aria-label={`Toggle ${space.name} in scene`}
              onCheckedChange={(on) =>
                updateAll((light) => ({ ...draftFor(light), on }))
              }
            />
          </div>
        }
        lights={previewLights}
        onColorPickMany={(picks) =>
          onChangeMany(
            Object.fromEntries(
              picks.map(({ light, xy }) => [
                light.id,
                { ...draftFor(light), xy, mirek: null },
              ]),
            ),
          )
        }
        onTemperaturePickMany={(picks) =>
          onChangeMany(
            Object.fromEntries(
              picks.map(({ light, value }) => [
                light.id,
                { ...draftFor(light), xy: null, mirek: value },
              ]),
            ),
          )
        }
      />
    </section>
  );
};
