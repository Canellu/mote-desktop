import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LightColorChange } from "@/stores/HueResourcesStore";
import type { HueLight } from "@/types/hue";
import { ColorWheel } from "./ColorWheel";
import { TemperatureWheel } from "./TemperatureWheel";

type Tab = "color" | "kelvin";

/**
 * One thumb for a whole group: picking sets every capable light to the same
 * color or white. Used where a thumb per light would be unreadable, such as
 * the All lights pane.
 */
export const GroupColorWheels: React.FC<{
  lights: HueLight[];
  onPick: (change: Pick<LightColorChange, "xy" | "ct" | "vividHex">) => void;
}> = ({ lights, onPick }) => {
  const colorLights = lights.filter((light) => light.supportsColor);
  const ctLights = lights.filter((light) => light.supportsCt);
  const tabs = useMemo<Tab[]>(
    () => [
      ...(colorLights.length > 0 ? (["color"] as const) : []),
      ...(ctLights.length > 0 ? (["kelvin"] as const) : []),
    ],
    [colorLights.length, ctLights.length],
  );
  const [tab, setTab] = useState<Tab>("color");
  useEffect(() => {
    if (tabs.length > 0 && !tabs.includes(tab)) setTab(tabs[0]);
  }, [tabs, tab]);

  // The thumb starts where the lit lights are; an even mix has no one
  // answer, so the first lit light stands for the group.
  const litColor = colorLights.find((light) => light.isOn && light.xy);
  const xy = (litColor ?? colorLights.find((light) => light.xy))?.xy ?? null;
  const ctMin = Math.min(...ctLights.map((light) => light.ctMin ?? 153));
  const ctMax = Math.max(...ctLights.map((light) => light.ctMax ?? 500));
  const litCts = ctLights.flatMap((light) =>
    light.isOn && light.ct != null ? [light.ct] : [],
  );
  const ct =
    litCts.length > 0
      ? Math.round(
          litCts.reduce((sum, value) => sum + value, 0) / litCts.length,
        )
      : Math.round((ctMin + ctMax) / 2);

  if (tabs.length === 0) return null;
  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
      {tabs.length > 1 && (
        <TabsList className="w-full">
          {tabs.map((id) => (
            <TabsTrigger key={id} value={id}>
              {id === "color" ? "Color" : "White"}
            </TabsTrigger>
          ))}
        </TabsList>
      )}
      {colorLights.length > 0 && (
        <TabsContent value="color" className="flex w-full flex-col gap-3 p-8">
          <ColorWheel
            xy={xy}
            onPick={(nextXy, vividHex) => onPick({ xy: nextXy, vividHex })}
          />
          <p className="text-center text-xs text-muted-foreground">
            Sets {colorLights.length} color{" "}
            {colorLights.length === 1 ? "light" : "lights"}
          </p>
        </TabsContent>
      )}
      {ctLights.length > 0 && (
        <TabsContent value="kelvin" className="flex w-full flex-col gap-3 p-8">
          <TemperatureWheel
            value={ct}
            min={ctMin}
            max={ctMax}
            onPick={(value) => onPick({ ct: value })}
          />
          <p className="text-center text-xs text-muted-foreground">
            Sets {ctLights.length} white{" "}
            {ctLights.length === 1 ? "light" : "lights"}
          </p>
        </TabsContent>
      )}
    </Tabs>
  );
};
