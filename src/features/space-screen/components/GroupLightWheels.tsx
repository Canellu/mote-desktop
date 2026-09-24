import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { HueLight } from "@/types/hue";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { GroupLightRail } from "./GroupLightRail";
import { MultiColorWheel } from "./MultiColorWheel";
import { MultiTemperatureWheel } from "./MultiTemperatureWheel";

type Tab = "color" | "kelvin";

/**
 * Compact wheel size: the window height left after the page chrome and the
 * rail below it (~47.5rem), between 16rem and 26rem. Under 16rem the page
 * scrolls instead; it only drops below that when the column is narrower.
 */
const WheelBox = ({
  compact,
  footer,
  children,
}: {
  compact: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) => (
  <>
    <div
      className={cn(
        compact && "mx-auto w-[min(100%,clamp(16rem,100dvh_-_47.5rem,26rem))]",
      )}
    >
      {children}
    </div>
    {footer}
  </>
);

export const GroupLightWheels = ({
  lights,
  onColorPickMany,
  onTemperaturePickMany,
  compact = false,
  wheelFooter,
  tabsEnd,
}: {
  lights: HueLight[];
  compact?: boolean;
  /** Rendered full width between the wheel and the rail. */
  wheelFooter?: ReactNode;
  /** Right end of the tab row, in the compact layout. */
  tabsEnd?: ReactNode;
  onColorPickMany: (
    picks: { light: HueLight; xy: [number, number]; vividHex: string }[],
  ) => void;
  onTemperaturePickMany: (picks: { light: HueLight; value: number }[]) => void;
}) => {
  const colorLights = useMemo(
    () => lights.filter((light) => light.supportsColor),
    [lights],
  );
  const ctLights = useMemo(
    () => lights.filter((light) => light.supportsCt),
    [lights],
  );
  const availableTabs = useMemo<Tab[]>(() => {
    const tabs: Tab[] = [];
    if (colorLights.length > 0) tabs.push("color");
    if (ctLights.length > 0) tabs.push("kelvin");
    return tabs;
  }, [colorLights.length, ctLights.length]);
  const [tab, setTab] = useState<Tab>("color");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);

  useEffect(() => {
    const memberIds = new Set(lights.map((light) => light.id));
    setSelectedIds(
      (current) => new Set([...current].filter((id) => memberIds.has(id))),
    );
  }, [lights]);

  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.includes(tab))
      setTab(availableTabs[0]);
  }, [availableTabs, tab]);

  const rail = (members: HueLight[]) => (
    <div className={cn(compact && "min-w-0")}>
      <GroupLightRail
        lights={members}
        selectedIds={selectedIds}
        focusedId={focusedId}
        onToggle={(id) =>
          setSelectedIds((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })
        }
        onSelectAll={() =>
          setSelectedIds(new Set(members.map((light) => light.id)))
        }
        onClear={() => setSelectedIds(new Set())}
        onFocusedIdChange={setFocusedId}
      />
    </div>
  );

  const tabTriggers = availableTabs.map((id) => (
    <TabsTrigger key={id} value={id}>
      {id === "color" ? "Color" : "White"}
    </TabsTrigger>
  ));

  if (availableTabs.length === 0) return null;
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as Tab)}
      className={cn(compact && "min-w-0 flex-1")}
    >
      {compact ? (
        // Equal side columns keep the tabs centred whatever sits at the end.
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          {availableTabs.length > 1 ? (
            <TabsList className="col-start-2">{tabTriggers}</TabsList>
          ) : (
            <span className="col-start-2" />
          )}
          <div className="justify-self-end">{tabsEnd}</div>
        </div>
      ) : (
        availableTabs.length > 1 && (
          <TabsList className="w-full">{tabTriggers}</TabsList>
        )
      )}
      {colorLights.length > 0 && (
        <TabsContent
          value="color"
          className={cn(
            "w-full gap-4",
            compact ? "flex flex-col gap-6 pt-2" : "flex flex-col p-8",
          )}
        >
          <WheelBox compact={compact} footer={wheelFooter}>
            <MultiColorWheel
              lights={colorLights}
              selectedIds={selectedIds}
              focusedId={focusedId}
              onFocusedIdChange={setFocusedId}
              onPickMany={onColorPickMany}
            />
          </WheelBox>
          {rail(colorLights)}
        </TabsContent>
      )}
      {ctLights.length > 0 && (
        <TabsContent
          value="kelvin"
          className={cn(
            "w-full gap-4",
            compact ? "flex flex-col gap-6 pt-2" : "flex flex-col p-8",
          )}
        >
          <WheelBox compact={compact} footer={wheelFooter}>
            <MultiTemperatureWheel
              lights={ctLights}
              selectedIds={selectedIds}
              focusedId={focusedId}
              onFocusedIdChange={setFocusedId}
              onPickMany={onTemperaturePickMany}
            />
          </WheelBox>
          {rail(ctLights)}
        </TabsContent>
      )}
    </Tabs>
  );
};
