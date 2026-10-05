import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
} from "@dnd-kit/sortable";

import {
  INSPECTOR_TRANSITION,
  useInspectorSettle,
  useInspectorSettleWidth,
} from "@/features/space-screen/utils/inspector-layout";
import { ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useHue } from "@/context/HueContext";
import { SpaceTile } from "@/features/home-screen/components/SpaceTile";
import { buildFixtureGroup } from "@/features/space-screen/utils/light-groups";
import {
  getLightIcon,
  LIGHT_ICON_OPTIONS,
} from "@/features/space-screen/utils/light-icons";
import { groupFixtures, indexFixtures, type Fixture } from "@/lib/fixtures";
import { useFixtureGroups } from "@/stores/FixtureGroupsStore";
import type { HueLight, HueRoomZone } from "@/types/hue";
import { LightCard } from "./LightCard";
import { SectionGrip } from "./SectionDragHandle";
import { SortableItem } from "./SortableItem";

type ControlCommitPhase = "live" | "final";

/**
 * Forces a re-render whenever `ref`'s element changes size. Layout animations
 * only fire across React renders, but the grid's width changes from CSS-driven
 * events (window resizing) that never trigger a render on their own. Observing
 * the element and re-rendering on each size tick lets `motion`'s `layout`
 * re-measure and animate the reflow instead of snapping. The observer is
 * frame-rate bounded and idle unless resizing — including while the inspector
 * pane moves, since the grid is pinned to its settled width then.
 */
function useAnimateOnResize(ref: React.RefObject<HTMLElement | null>) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => rerender());
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
}

/** A room's lights, for the All lights page's "Rooms" grouping. */
export interface LightRoomSection {
  id: string;
  name: string;
  lightIds: string[];
}

type LightGrouping = "rooms" | "all";
const GROUPING_STORAGE_KEY = "hue-all-lights-grouping";

const readGrouping = (): LightGrouping => {
  try {
    return localStorage.getItem(GROUPING_STORAGE_KEY) === "all"
      ? "all"
      : "rooms";
  } catch {
    return "rooms";
  }
};

/** Order of the flat "All" list; "custom" is the order dragged in Customize. */
type LightSort = "custom" | "name" | "type";
const SORT_STORAGE_KEY = "hue-all-lights-sort";
const SORT_LABELS: Record<LightSort, string> = {
  custom: "Custom order",
  name: "Name",
  type: "Light type",
};

const readSort = (): LightSort => {
  try {
    const stored = localStorage.getItem(SORT_STORAGE_KEY);
    return stored === "name" || stored === "type" ? stored : "custom";
  } catch {
    return "custom";
  }
};

const typeLabel = (light: HueLight) =>
  LIGHT_ICON_OPTIONS.find((option) => option.value === light.typeName)?.label ??
  "~"; // unknown types sort last

const sortLights = (lights: HueLight[], sort: LightSort): HueLight[] => {
  if (sort === "custom") return lights;
  const byName = (a: HueLight, b: HueLight) => a.name.localeCompare(b.name);
  return [...lights].sort(
    sort === "name"
      ? byName
      : (a, b) => typeLabel(a).localeCompare(typeLabel(b)) || byName(a, b),
  );
};

const writeStored = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Non-fatal: the choice holds for this session.
  }
};

/** One tile in the grid: a lone light, or a fixture's heads as one product. */
type LightUnit =
  | { kind: "light"; id: string; light: HueLight }
  | { kind: "fixture"; id: string; fixture: Fixture; group: HueRoomZone };

interface LightsSectionProps {
  lights: HueLight[];
  selectedLightId: string | null;
  /** The group pane's selection, so an open fixture tile reads as selected. */
  selectedGroupId: string | null;
  hueEventRevision: number;
  /** Reorder mode: cards become drag handles and live controls are muted. */
  editing: boolean;
  /** Enables drag-and-drop ordering. False while selecting in Manage mode. */
  reordering: boolean;
  /** Optional header control (e.g. the Manage-mode "Select all" toggle). */
  headerAction?: React.ReactNode;
  /** Rooms to group by; offers the Rooms/All switch when given. */
  roomSections?: LightRoomSection[];
  /** Persist the new light order (full list of ids) after a reorder drag. */
  onReorder: (orderedIds: string[]) => void;
  onSelectLight: (id: string) => void;
  onLightToggle: (light: HueLight, nextOn: boolean) => void;
  onLightBrightness: (
    light: HueLight,
    pct: number,
    phase: ControlCommitPhase,
  ) => void;
  /** A fixture tile acts like a small group: these drive all its heads. */
  onOpenFixture: (group: HueRoomZone) => void;
  onFixtureToggle: (group: HueRoomZone, nextOn: boolean) => void;
  onFixtureBrightness: (
    group: HueRoomZone,
    pct: number,
    phase: ControlCommitPhase,
  ) => void;
}

export const LightsSection: React.FC<LightsSectionProps> = ({
  lights,
  selectedLightId,
  selectedGroupId,
  hueEventRevision,
  editing,
  reordering,
  headerAction,
  roomSections,
  onReorder,
  onSelectLight,
  onLightToggle,
  onLightBrightness,
  onOpenFixture,
  onFixtureToggle,
  onFixtureBrightness,
}) => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const lightsGridRef = useRef<HTMLDivElement>(null);
  useAnimateOnResize(lightsGridRef);
  // While the inspector pane moves, lay the grid out at the width it will end
  // at, so it re-columns once as the move starts and glides with the pane.
  const settle = useInspectorSettle();
  const settleWidth = useInspectorSettleWidth(sectionRef);
  const gridStyle = settleWidth != null ? { width: settleWidth } : undefined;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const { bridgeId } = useHue();
  const fixtureGroups = useFixtureGroups(bridgeId);
  const [grouping, setGrouping] = useState<LightGrouping>(readGrouping);
  const changeGrouping = (next: LightGrouping) => {
    setGrouping(next);
    writeStored(GROUPING_STORAGE_KEY, next);
  };
  const [sort, setSort] = useState<LightSort>(readSort);
  const changeSort = (next: LightSort) => {
    setSort(next);
    writeStored(SORT_STORAGE_KEY, next);
  };

  // Heads of one product collapse into a single tile at the first head's spot,
  // so the saved light order still decides where the fixture sits.
  const sections = useMemo(() => {
    const toUnits = (sectionLights: HueLight[]): LightUnit[] => {
      const { byId, ofLight } = indexFixtures(
        groupFixtures(sectionLights, { overrides: fixtureGroups }),
      );
      const seen = new Set<string>();
      const units: LightUnit[] = [];
      for (const light of sectionLights) {
        const fixture = byId.get(ofLight.get(light.id) ?? "");
        if (!fixture || fixture.lights.length < 2) {
          units.push({ kind: "light", id: light.id, light });
        } else if (!seen.has(fixture.id)) {
          seen.add(fixture.id);
          const group = buildFixtureGroup(fixture);
          units.push({ kind: "fixture", id: group.id, fixture, group });
        }
      }
      return units;
    };

    if (!roomSections)
      return [{ id: "all", name: null, units: toUnits(lights) }];
    if (grouping === "all")
      return [
        { id: "all", name: null, units: toUnits(sortLights(lights, sort)) },
      ];
    const placed = new Set<string>();
    const result: { id: string; name: string | null; units: LightUnit[] }[] =
      roomSections.flatMap((room) => {
        const ids = new Set(room.lightIds);
        const roomLights = lights.filter((light) => ids.has(light.id));
        for (const light of roomLights) placed.add(light.id);
        return roomLights.length > 0
          ? [{ id: room.id, name: room.name, units: toUnits(roomLights) }]
          : [];
      });
    const unplaced = lights.filter((light) => !placed.has(light.id));
    if (unplaced.length > 0)
      result.push({
        id: "unplaced",
        name: "Not in a room",
        units: toUnits(unplaced),
      });
    return result;
  }, [lights, fixtureGroups, roomSections, grouping, sort]);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = lights.map((light) => light.id);
    const from = ids.indexOf(active.id as string);
    const to = ids.indexOf(over.id as string);
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to));
    // Dragging sets the order by hand, so the list should show it.
    if (roomSections) changeSort("custom");
  };

  const renderCard = (light: HueLight) => (
    <LightCard
      light={light}
      selected={light.id === selectedLightId}
      hueEventRevision={hueEventRevision}
      editing={editing}
      onSelect={onSelectLight}
      onToggle={onLightToggle}
      onBrightness={onLightBrightness}
    />
  );

  const renderUnit = (unit: LightUnit) =>
    unit.kind === "light" ? (
      renderCard(unit.light)
    ) : (
      <SpaceTile
        roomZone={unit.group}
        members={unit.fixture.lights}
        icon={getLightIcon(unit.fixture.lights[0]?.typeName ?? null)}
        subtitle={`${unit.fixture.lights.length} lights`}
        selected={unit.group.id === selectedGroupId}
        hueEventRevision={hueEventRevision}
        onOpenSpace={() => onOpenFixture(unit.group)}
        onRoomZoneToggle={onFixtureToggle}
        onRoomZoneBrightness={onFixtureBrightness}
      />
    );

  const gridClassName =
    "grid grid-cols-[repeat(auto-fill,minmax(min(var(--tile-min-width),100%),1fr))] gap-(--light-grid-gap)";

  return (
    <div ref={sectionRef} className="flex flex-col gap-(--section-header-gap)">
      <div className="flex h-7 items-center justify-between gap-3">
        <div className="flex items-center">
          <SectionGrip />
          <p className="text-sm font-medium text-muted-foreground">
            Lights{" "}
            <span className="text-muted-foreground">{lights.length}</span>
          </p>
        </div>
        {headerAction ??
          (roomSections && !editing && (
            <div className="flex items-center gap-2">
              {grouping === "all" && (
                <Select
                  value={sort}
                  onValueChange={(value) =>
                    value && changeSort(value as LightSort)
                  }
                >
                  <SelectTrigger
                    size="sm"
                    aria-label="Sort lights"
                    className="h-7! rounded-full! pr-2.5 pl-3 text-xs"
                  >
                    <ArrowUpDown className="size-3.5!" />
                    <SelectValue>
                      {(value: LightSort) => SORT_LABELS[value]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent align="end">
                    {(Object.keys(SORT_LABELS) as LightSort[]).map((value) => (
                      <SelectItem key={value} value={value}>
                        {SORT_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div
                role="group"
                aria-label="Group lights"
                className="inline-flex items-center gap-1 rounded-full bg-muted p-0.5"
              >
                {(
                  [
                    { value: "all", label: "All" },
                    { value: "rooms", label: "Rooms" },
                  ] as const
                ).map(({ value, label }) => (
                  <Button
                    key={value}
                    size="sm"
                    className="h-6 rounded-full px-2.5 text-xs"
                    variant={grouping === value ? "secondary" : "ghost"}
                    aria-pressed={grouping === value}
                    onClick={() => changeGrouping(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          ))}
      </div>
      {lights.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This room or zone has no individual lights.
        </p>
      ) : reordering ? (
        // While editing, drop the layout animation (it fights dnd-kit's drag
        // transforms) and make each card sortable within the same grid. Order
        // is per light, so fixtures show as their heads here.
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={lights.map((light) => light.id)}
            strategy={rectSortingStrategy}
          >
            <div className={gridClassName} style={gridStyle}>
              {lights.map((light) => (
                <SortableItem key={light.id} id={light.id} editing>
                  {renderCard(light)}
                </SortableItem>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : editing ? (
        // Manage mode selects single lights, so fixtures show as their heads.
        <div className={gridClassName} style={gridStyle}>
          {lights.map((light) => (
            <div key={light.id}>{renderCard(light)}</div>
          ))}
        </div>
      ) : (
        <div
          ref={lightsGridRef}
          className="flex flex-col gap-(--section-header-gap)"
        >
          {sections.map((section) => (
            <div key={section.id} className="flex flex-col gap-2">
              {section.name && (
                <p className="text-xs font-medium text-muted-foreground">
                  {section.name}
                </p>
              )}
              <div className={gridClassName} style={gridStyle}>
                <AnimatePresence mode="popLayout" initial={false}>
                  {section.units.map((unit) => (
                    <motion.div
                      key={unit.id}
                      layout
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{
                        duration: 0.2,
                        ease: "easeOut",
                        layout: settle ? INSPECTOR_TRANSITION : undefined,
                      }}
                    >
                      {renderUnit(unit)}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
