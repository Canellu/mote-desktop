import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ColorWheel } from "@/features/space-screen/components/ColorWheel";
import { TemperatureWheel } from "@/features/space-screen/components/TemperatureWheel";
import type { HueLight, HuePowerupPreset } from "@/types/hue";
import type { PowerOnDraft } from "./powerOn";

const PRESET_ITEMS: Record<HuePowerupPreset, string> = {
  safety: "Default",
  last_on_state: "Last on",
  powerfail: "Power loss recovery",
  custom: "Custom",
};

const PRESET_HELP: Record<HuePowerupPreset, string> = {
  safety: "Turns on at full brightness with a warm white color.",
  last_on_state: "Turns on using the color and brightness last used while on.",
  powerfail:
    "Restores the state from before power was lost, including staying off.",
  custom: "Turns on with the brightness and color selected below.",
};

export const PowerOnFields = ({
  light,
  value,
  onChange,
  disabled,
}: {
  light: HueLight;
  value: PowerOnDraft;
  onChange: (value: PowerOnDraft) => void;
  disabled?: boolean;
}) => {
  if (!light.powerup) {
    return (
      <div className="grid gap-1">
        <Label>Power on</Label>
        <p className="text-xs text-muted-foreground">
          Power-on behavior is not available for this light.
        </p>
      </div>
    );
  }

  const supportsColorChoice = light.supportsColor && light.supportsCt;
  const colorMode = value.xy != null ? "color" : "temperature";
  const ctMin = light.ctMin ?? 153;
  const ctMax = light.ctMax ?? 500;
  const kelvin = Math.round(1_000_000 / (value.mirek ?? ctMin));

  return (
    <div className="grid gap-2">
      <Label>Power on</Label>
      <Select
        items={PRESET_ITEMS}
        value={value.preset}
        onValueChange={(preset) =>
          onChange({ ...value, preset: preset as HuePowerupPreset })
        }
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(PRESET_ITEMS).map(([preset, label]) => (
            <SelectItem key={preset} value={preset}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {PRESET_HELP[value.preset]}
      </p>

      {value.preset === "custom" && (
        <div className="mt-1 grid gap-4 rounded-xl bg-muted/45 p-4">
          <div className="grid gap-2.5">
            <div className="flex items-center justify-between">
              <Label>Brightness</Label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {value.brightness}%
              </span>
            </div>
            <Slider
              value={[value.brightness]}
              min={1}
              max={100}
              disabled={disabled}
              aria-label="Power-on brightness"
              onValueChange={(next) =>
                onChange({
                  ...value,
                  brightness: Array.isArray(next) ? next[0] : next,
                })
              }
            />
          </div>

          {(light.supportsColor || light.supportsCt) && (
            // The same wheels and tabs the light's own controls use.
            <Tabs
              value={colorMode}
              onValueChange={(mode) =>
                onChange(
                  mode === "color"
                    ? {
                        ...value,
                        mirek: null,
                        xy: value.xy ?? light.xy ?? [0.3127, 0.329],
                      }
                    : {
                        ...value,
                        mirek:
                          value.mirek ??
                          light.ct ??
                          Math.round((ctMin + ctMax) / 2),
                        xy: null,
                      },
                )
              }
            >
              <div className="flex items-center justify-between gap-3">
                {supportsColorChoice ? (
                  <TabsList className="w-full">
                    <TabsTrigger value="temperature" disabled={disabled}>
                      White
                    </TabsTrigger>
                    <TabsTrigger value="color" disabled={disabled}>
                      Color
                    </TabsTrigger>
                  </TabsList>
                ) : (
                  <Label>{light.supportsCt ? "White" : "Color"}</Label>
                )}
              </div>
              {light.supportsCt && (
                <TabsContent
                  value="temperature"
                  className="grid justify-items-center gap-2 px-6 pt-4"
                  inert={disabled}
                >
                  <TemperatureWheel
                    value={value.mirek ?? Math.round((ctMin + ctMax) / 2)}
                    min={ctMin}
                    max={ctMax}
                    onPick={(mirek) => onChange({ ...value, mirek, xy: null })}
                  />
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {kelvin} K
                  </span>
                </TabsContent>
              )}
              {light.supportsColor && (
                <TabsContent
                  value="color"
                  className="flex w-full px-6 pt-4"
                  inert={disabled}
                >
                  <ColorWheel
                    xy={value.xy}
                    gamut={light.gamut}
                    onPick={(xy) => onChange({ ...value, mirek: null, xy })}
                  />
                </TabsContent>
              )}
            </Tabs>
          )}
        </div>
      )}
    </div>
  );
};
