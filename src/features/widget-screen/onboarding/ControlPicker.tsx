import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getRoomZoneIcon } from "@/features/home-screen/components/room-zone-icons";
import { useBlinkLights } from "@/hooks/useBlinkLights";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import type { HueLight, HueRoomZone } from "@/types/hue";
import { Lightbulb, Search } from "lucide-react";
import { useState } from "react";
import { newControlId, type ControlTarget, type WidgetControl } from "../types";

interface ResolvedTarget {
  target: ControlTarget;
  name: string;
  /** Whether a brightness slider makes sense for this target. */
  dimmable: boolean;
  icon: React.ReactNode;
}

const resolveRoomZone = (roomZone: HueRoomZone): ResolvedTarget => {
  const Icon = getRoomZoneIcon(roomZone.class);
  return {
    target: { kind: roomZone.resourceType, id: roomZone.id },
    name: roomZone.name,
    dimmable: roomZone.groupedLightId != null,
    icon: <Icon size={20} strokeWidth={2.5} />,
  };
};

const resolveLight = (light: HueLight): ResolvedTarget => ({
  target: { kind: "light", id: light.id },
  name: light.name,
  dimmable: light.brightness != null,
  icon: <Lightbulb size={20} strokeWidth={2.5} />,
});

/** Turn a picked target into a fresh control with sensible defaults. The
 * brightness slider and quick scenes are configured afterwards from the row. */
const controlFromTarget = (resolved: ResolvedTarget): WidgetControl => ({
  id: newControlId(),
  target: resolved.target,
  label: null,
  showBrightness: resolved.dimmable,
  sceneIds: [],
  compact: false,
  hotkey: null,
});

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="px-1 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
    {children}
  </p>
);

const TargetRow = ({
  resolved,
  onSelect,
}: {
  resolved: ResolvedTarget;
  onSelect: () => void;
}) => (
  <button
    type="button"
    onClick={onSelect}
    className="flex w-full items-center gap-3 rounded-lg border border-border/60 bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
  >
    <span className="flex size-8 shrink-0 items-center justify-center text-muted-foreground">
      {resolved.icon}
    </span>
    <span className="min-w-0 flex-1 truncate text-sm font-medium">
      {resolved.name}
    </span>
  </button>
);

/**
 * Search box plus a scrollable list of rooms, zones, and lights. Picking one
 * builds a control and hands it back; there's no extra step.
 */
export const ControlPicker = ({
  onSelect,
}: {
  onSelect: (control: WidgetControl) => void;
}) => {
  const roomZones = useHueResourcesStore((state) => state.roomZones);
  const lights = useHueResourcesStore((state) => state.lights);
  const { blink } = useBlinkLights();
  const [query, setQuery] = useState("");

  const rooms = roomZones.filter((rz) => rz.resourceType === "room");
  const zones = roomZones.filter((rz) => rz.resourceType === "zone");
  const term = query.trim().toLowerCase();
  const match = (name: string) => name.toLowerCase().includes(term);

  // Blink the picked target's light(s) so the user can confirm the choice
  // even though the picker closes immediately.
  const pick = (resolved: ResolvedTarget, lightIds: string[]) => {
    void blink(`${resolved.target.kind}:${resolved.target.id}`, lightIds);
    onSelect(controlFromTarget(resolved));
  };

  const matchedRooms = rooms.filter((rz) => match(rz.name));
  const matchedZones = zones.filter((rz) => match(rz.name));
  const matchedLights = lights.filter((light) => match(light.name));
  const empty =
    matchedRooms.length === 0 &&
    matchedZones.length === 0 &&
    matchedLights.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="relative">
        <Search
          size={15}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search rooms, zones, lights…"
          className="pl-9"
        />
      </div>

      <ScrollArea fade className="min-h-0 flex-1" viewportClassName="pr-2">
        {empty ? (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            Nothing matches “{query.trim()}”.
          </p>
        ) : (
          <div className="grid gap-1">
            {matchedRooms.length > 0 && <SectionLabel>Rooms</SectionLabel>}
            {matchedRooms.map((rz) => (
              <TargetRow
                key={rz.id}
                resolved={resolveRoomZone(rz)}
                onSelect={() => pick(resolveRoomZone(rz), rz.lightIds)}
              />
            ))}

            {matchedZones.length > 0 && <SectionLabel>Zones</SectionLabel>}
            {matchedZones.map((rz) => (
              <TargetRow
                key={rz.id}
                resolved={resolveRoomZone(rz)}
                onSelect={() => pick(resolveRoomZone(rz), rz.lightIds)}
              />
            ))}

            {matchedLights.length > 0 && <SectionLabel>Lights</SectionLabel>}
            {matchedLights.map((light) => (
              <TargetRow
                key={light.id}
                resolved={resolveLight(light)}
                onSelect={() => pick(resolveLight(light), [light.id])}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};
