import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RoomCanvas } from "@/features/entertainment-placement/RoomCanvas";
import {
  createVirtualTvDisplay,
  DEFAULT_TV_ASPECT_RATIO,
  type TvAspectRatio,
} from "@/features/entertainment-placement/tv-display";
import { TvAspectRatioControl } from "@/features/entertainment-placement/TvAspectRatioControl";
import { getRoomZoneIcon } from "@/features/home-screen/components/room-zone-icons";
import { useBlinkLights } from "@/hooks/useBlinkLights";
import { selectableVariants } from "@/lib/selection-styles";
import { cn } from "@/lib/utils";
import type {
  HueEntertainmentConfiguration,
  HueEntertainmentService,
  HueLight,
  HuePosition,
  HueRoomZone,
} from "@/types/hue";
import {
  ChevronDown,
  Cuboid,
  Lightbulb,
  Monitor,
  Music,
  Search,
  Sparkles,
  Tv,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  SETTINGS_EXPANDABLE_CARD,
  SETTINGS_EXPANDABLE_TRIGGER,
  SETTINGS_EXPANDABLE_TRIGGER_OPEN,
} from "../constants";
import {
  entertainmentCapabilities,
  type EntertainmentLightCapability,
} from "../entertainment";
import {
  SettingsWizardContainedStep,
  SettingsWizardLayout,
  SettingsWizardViewport,
} from "./SettingsWizardLayout";

const MAX_CHANNELS = 20;
const STEPS = ["Details", "Lights", "Placement"];
const UNGROUPED_LABEL = "Other lights";
const UNGROUPED_KEY = "other";

const CONFIGURATION_TYPES = [
  {
    value: "screen",
    label: "TV",
    description: "Lights arranged around a television.",
    icon: Tv,
  },
  {
    value: "monitor",
    label: "Monitor",
    description: "Lights arranged around one or more monitors.",
    icon: Monitor,
  },
  {
    value: "music",
    label: "Music",
    description: "Lights placed for music visualization.",
    icon: Music,
  },
  {
    value: "3dspace",
    label: "3D space",
    description: "Lights distributed throughout a room.",
    icon: Cuboid,
  },
  {
    value: "other",
    label: "Other",
    description: "A general entertainment layout.",
    icon: Sparkles,
  },
] as const;

export interface CreateEntertainmentAreaOptions {
  name: string;
  configurationType: HueEntertainmentConfiguration["configuration_type"];
  capabilities: EntertainmentLightCapability[];
  placements: Record<string, HuePosition>;
  tvAspectRatio: TvAspectRatio;
}

export const EntertainmentAreaWizard = ({
  lights,
  services,
  roomZones,
  isLoadingCapabilities,
  capabilityError,
  isCreating,
  onCreate,
}: {
  lights: HueLight[];
  services: HueEntertainmentService[];
  roomZones: HueRoomZone[];
  isLoadingCapabilities: boolean;
  capabilityError: string | null;
  isCreating: boolean;
  onCreate: (options: CreateEntertainmentAreaOptions) => void;
}) => {
  const capabilities = useMemo(
    () => entertainmentCapabilities(lights, services),
    [lights, services],
  );
  const [step, setStep] = useState(0);
  const [maxUnlockedStep, setMaxUnlockedStep] = useState(0);
  const [name, setName] = useState("");
  const [configurationType, setConfigurationType] =
    useState<HueEntertainmentConfiguration["configuration_type"]>("screen");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [placements, setPlacements] = useState<Record<string, HuePosition>>({});
  const [query, setQuery] = useState("");
  const [activeLightId, setActiveLightId] = useState<string | null>(null);
  const [tvAspectRatio, setTvAspectRatio] = useState<TvAspectRatio>(
    DEFAULT_TV_ASPECT_RATIO,
  );
  const [openLightGroups, setOpenLightGroups] = useState<Set<string>>(
    () => new Set(),
  );

  const capabilityByLightId = useMemo(
    () =>
      new Map(
        capabilities.map((capability) => [capability.light.id, capability]),
      ),
    [capabilities],
  );
  const selectedCapabilities = selectedIds.flatMap((id) => {
    const capability = capabilityByLightId.get(id);
    return capability ? [capability] : [];
  });
  const selectedChannelCount = selectedCapabilities.reduce(
    (total, capability) => total + capability.channelCount,
    0,
  );
  const normalizedQuery = query.trim().toLowerCase();
  const filteredCapabilities = capabilities.filter(({ light }) =>
    normalizedQuery.length === 0
      ? true
      : [light.name, light.productName, light.modelId].some((value) =>
          value?.toLowerCase().includes(normalizedQuery),
        ),
  );
  // Rooms claim lights first (a light lives in exactly one room); zones only
  // label lights that no room owns.
  const groupByLightId = useMemo(() => {
    const groups = new Map<
      string,
      Pick<HueRoomZone, "id" | "name" | "class" | "resourceType">
    >();
    [...roomZones]
      .sort((a, b) =>
        a.resourceType === b.resourceType
          ? a.name.localeCompare(b.name)
          : a.resourceType === "room"
            ? -1
            : 1,
      )
      .forEach((group) => {
        group.lightIds.forEach((lightId) => {
          if (!groups.has(lightId)) groups.set(lightId, group);
        });
      });
    return groups;
  }, [roomZones]);
  const groupedCapabilities = [
    ...filteredCapabilities
      .reduce((groups, capability) => {
        const roomZone = groupByLightId.get(capability.light.id);
        const key = roomZone
          ? `${roomZone.resourceType}:${roomZone.id}`
          : UNGROUPED_KEY;
        const existing = groups.get(key);
        if (existing) {
          existing.capabilities.push(capability);
        } else {
          groups.set(key, {
            key,
            name: roomZone?.name ?? UNGROUPED_LABEL,
            class: roomZone?.class,
            resourceType: roomZone?.resourceType,
            capabilities: [capability],
          });
        }
        return groups;
      }, new Map<string, LightCapabilityGroup>())
      .entries(),
  ]
    .map(([, group]) => ({
      ...group,
      capabilities: [...group.capabilities].sort((a, b) =>
        a.light.name.localeCompare(b.light.name),
      ),
    }))
    .sort((a, b) =>
      a.key === UNGROUPED_KEY
        ? 1
        : b.key === UNGROUPED_KEY
          ? -1
          : a.name.localeCompare(b.name),
    );

  const initializePlacements = () => {
    setPlacements((current) => {
      const next = { ...current };
      selectedIds.forEach((id, index) => {
        if (next[id]) return;
        const angle =
          selectedIds.length === 1
            ? 0
            : (index / selectedIds.length) * Math.PI * 2 - Math.PI / 2;
        next[id] = {
          x: selectedIds.length === 1 ? 0 : round(Math.cos(angle) * 0.72),
          y: 0.8,
          z: selectedIds.length === 1 ? 0 : round(-Math.sin(angle) * 0.72),
        };
      });
      return next;
    });
    setActiveLightId((current) =>
      current && selectedIds.includes(current)
        ? current
        : (selectedIds[0] ?? null),
    );
  };

  const canContinue =
    (step === 0 && name.trim().length > 0) ||
    (step === 1 &&
      selectedCapabilities.length > 0 &&
      selectedChannelCount <= MAX_CHANNELS) ||
    step === 2;

  const nextStep = () => {
    if (!canContinue) return;
    if (step === 1) initializePlacements();
    setStep((current) => {
      const next = Math.min(STEPS.length - 1, current + 1);
      setMaxUnlockedStep((unlocked) => Math.max(unlocked, next));
      return next;
    });
  };

  const { blink } = useBlinkLights();

  // Blinks a light when it is added to the area. Placement interactions do not
  // blink because selecting and dragging pins would repeatedly distract.
  const blinkLight = (id: string) => void blink(id, [id]);

  const toggleLight = (capability: EntertainmentLightCapability) => {
    const id = capability.light.id;
    if (!selectedIds.includes(id)) blinkLight(id);
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      const channels = current.reduce(
        (total, lightId) =>
          total + (capabilityByLightId.get(lightId)?.channelCount ?? 0),
        0,
      );
      return channels + capability.channelCount <= MAX_CHANNELS
        ? [...current, id]
        : current;
    });
  };

  const toggleLightGroup = (group: LightCapabilityGroup) => {
    const groupIds = new Set(
      group.capabilities.map((capability) => capability.light.id),
    );
    const allSelected = group.capabilities.every((capability) =>
      selectedIds.includes(capability.light.id),
    );

    if (allSelected) {
      setSelectedIds((current) => current.filter((id) => !groupIds.has(id)));
      return;
    }

    const outsideChannels = selectedCapabilities.reduce(
      (total, capability) =>
        groupIds.has(capability.light.id)
          ? total
          : total + capability.channelCount,
      0,
    );
    const groupChannels = group.capabilities.reduce(
      (total, capability) => total + capability.channelCount,
      0,
    );
    if (outsideChannels + groupChannels > MAX_CHANNELS) return;

    const newlySelectedIds = group.capabilities
      .map((capability) => capability.light.id)
      .filter((id) => !selectedIds.includes(id));
    void blink(group.key, newlySelectedIds);
    setSelectedIds((current) => [
      ...current.filter((id) => !groupIds.has(id)),
      ...groupIds,
    ]);
  };

  const toggleLightGroupOpen = (key: string) => {
    setOpenLightGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const updatePlacement = (id: string, update: Partial<HuePosition>) => {
    setPlacements((current) => ({
      ...current,
      [id]: { ...(current[id] ?? { x: 0, y: 0.8, z: 0 }), ...update },
    }));
  };

  const submit = () => {
    if (
      !name.trim() ||
      selectedCapabilities.length === 0 ||
      selectedCapabilities.some(({ light }) => !placements[light.id])
    ) {
      return;
    }
    onCreate({
      name: name.trim(),
      configurationType,
      capabilities: selectedCapabilities,
      placements,
      tvAspectRatio,
    });
  };

  const activeLight = activeLightId
    ? capabilityByLightId.get(activeLightId)?.light
    : undefined;
  const activePlacement = activeLightId ? placements[activeLightId] : undefined;

  return (
    <SettingsWizardLayout
      steps={STEPS}
      step={step}
      maxUnlockedStep={maxUnlockedStep}
      onStepChange={(nextStep) => {
        if (nextStep === 2) initializePlacements();
        setStep(nextStep);
      }}
      canContinue={canContinue}
      onContinue={nextStep}
      finalAction={{
        label: isCreating ? "Creating…" : "Create entertainment area",
        disabled:
          isCreating || !name.trim() || selectedCapabilities.length === 0,
        onClick: submit,
      }}
    >
      <SettingsWizardViewport stepKey={step} contained={step !== 0}>
        {step === 0 ? (
          <section className="mx-auto flex w-full max-w-2xl flex-col gap-9 py-8">
            <div className="space-y-3 text-center">
              <h1 className="font-heading text-3xl font-semibold">
                Set up your area
              </h1>
              <p className="text-base text-muted-foreground">
                Name the area and choose what its light placement is optimized
                for.
              </p>
            </div>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canContinue) nextStep();
              }}
              maxLength={32}
              placeholder="Living room TV"
              autoFocus
              size="xl"
              className="mx-auto max-w-md rounded-2xl border-foreground/15 bg-input/50 text-center text-lg"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {CONFIGURATION_TYPES.map((option) => {
                const Icon = option.icon;
                const active = configurationType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    data-selected={active ? "" : undefined}
                    onClick={() => setConfigurationType(option.value)}
                    className={cn(
                      "flex items-start gap-3 rounded-2xl p-4 text-left",
                      selectableVariants(),
                    )}
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-foreground/5">
                      <Icon size={19} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 font-semibold">
                        {option.label}
                      </span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {option.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {step === 1 ? (
          <SettingsWizardContainedStep contentClassName="gap-5">
            <div className="shrink-0 space-y-3 text-center">
              <h1 className="font-heading text-3xl font-semibold">
                Add compatible lights
              </h1>
              <p className="text-base text-muted-foreground">
                Only lights whose bridge service supports entertainment
                rendering are shown.
              </p>
            </div>
            <div className="relative shrink-0">
              <Search
                size={18}
                className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search compatible lights"
                size="xl"
                className="rounded-2xl border-foreground/15 bg-input/50 pl-12"
              />
            </div>
            {isLoadingCapabilities ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Checking light capabilities…
              </p>
            ) : capabilityError ? (
              <p className="py-12 text-center text-sm text-(--destructive-text)">
                {capabilityError}
              </p>
            ) : capabilities.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No entertainment-capable lights were found on this bridge.
              </p>
            ) : (
              <ScrollArea
                fade="bottom"
                className="min-h-0 flex-1 overflow-hidden"
              >
                <div className="space-y-3 pr-1 pb-1">
                  {groupedCapabilities.length > 0 ? (
                    groupedCapabilities.map((group) => (
                      <LightGroupCard
                        key={group.key}
                        group={group}
                        open={
                          normalizedQuery.length > 0 ||
                          openLightGroups.has(group.key)
                        }
                        selectedIds={selectedIds}
                        selectedCapabilities={selectedCapabilities}
                        onToggleOpen={() => toggleLightGroupOpen(group.key)}
                        onToggleGroup={() => toggleLightGroup(group)}
                        onToggleLight={toggleLight}
                      />
                    ))
                  ) : (
                    <p className="rounded-2xl border border-foreground/12 bg-input/40 px-4 py-8 text-center text-sm text-muted-foreground">
                      No compatible lights match your search.
                    </p>
                  )}
                </div>
              </ScrollArea>
            )}
            <p className="shrink-0 text-center text-xs text-muted-foreground">
              {selectedIds.length} selected · {selectedChannelCount}/
              {MAX_CHANNELS} channels
            </p>
          </SettingsWizardContainedStep>
        ) : null}

        {step === 2 ? (
          <SettingsWizardContainedStep
            className="max-w-3xl"
            contentClassName="gap-5 py-2"
          >
            <div className="shrink-0 space-y-2 text-center">
              <h1 className="font-heading text-3xl font-semibold">
                Place your lights
              </h1>
              <p className="text-sm text-muted-foreground">
                Drag each light to where it sits in the room. Use the Front
                preset to line up heights, and Top for a floor plan.
              </p>
            </div>
            {configurationType === "screen" && (
              <div className="flex shrink-0 items-center justify-center">
                <TvAspectRatioControl
                  value={tvAspectRatio}
                  onChange={setTvAspectRatio}
                />
              </div>
            )}
            <RoomCanvas
              configurationType={configurationType}
              displays={
                configurationType === "screen"
                  ? [createVirtualTvDisplay(tvAspectRatio)]
                  : undefined
              }
              pins={selectedCapabilities.map(({ light }, index) => ({
                key: light.id,
                label: `${index + 1}`,
                name: light.name,
                position: placements[light.id] ?? { x: 0, y: 0.8, z: 0 },
              }))}
              activeKey={activeLightId}
              onActivate={setActiveLightId}
              onMove={updatePlacement}
              className="min-h-64 w-full flex-1"
            />
            <ScrollArea className="max-h-32 shrink-0">
              <div className="flex gap-2 pb-2">
                {selectedCapabilities.map(({ light }, index) => (
                  <button
                    key={light.id}
                    type="button"
                    onClick={() => setActiveLightId(light.id)}
                    data-selected={activeLightId === light.id ? "" : undefined}
                    className={cn(
                      "flex min-w-40 items-center gap-2 rounded-xl px-3 py-2 text-left",
                      selectableVariants(),
                    )}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground/7 text-xs font-semibold">
                      {index + 1}
                    </span>
                    <span className="min-w-0 truncate text-sm font-medium">
                      {light.name}
                    </span>
                  </button>
                ))}
              </div>
            </ScrollArea>
            {activeLight && activePlacement ? (
              <div className="grid shrink-0 gap-3 rounded-2xl bg-foreground/4 px-4 py-3 sm:grid-cols-2">
                <div className="flex items-center gap-3">
                  <div className="min-w-24">
                    <p className="truncate text-sm font-medium">
                      {activeLight.name}
                    </p>
                    <p className="text-xs text-muted-foreground">Depth</p>
                  </div>
                  <span className="text-xs text-muted-foreground">Front</span>
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={0.05}
                    value={activePlacement.y}
                    aria-label={`${activeLight.name} depth`}
                    onChange={(event) =>
                      updatePlacement(activeLight.id, {
                        y: Number(event.target.value),
                      })
                    }
                    className="min-w-0 flex-1 accent-primary"
                  />
                  <span className="text-xs text-muted-foreground">Back</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="min-w-24 text-xs text-muted-foreground sm:text-right">
                    Height
                  </div>
                  <span className="text-xs text-muted-foreground">Low</span>
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={0.05}
                    value={activePlacement.z}
                    aria-label={`${activeLight.name} height`}
                    onChange={(event) =>
                      updatePlacement(activeLight.id, {
                        z: Number(event.target.value),
                      })
                    }
                    className="min-w-0 flex-1 accent-primary"
                  />
                  <span className="text-xs text-muted-foreground">High</span>
                </div>
              </div>
            ) : null}
          </SettingsWizardContainedStep>
        ) : null}
      </SettingsWizardViewport>
    </SettingsWizardLayout>
  );
};

interface LightCapabilityGroup {
  key: string;
  name: string;
  class?: string;
  resourceType?: HueRoomZone["resourceType"];
  capabilities: EntertainmentLightCapability[];
}

const LightGroupCard = ({
  group,
  open,
  selectedIds,
  selectedCapabilities,
  onToggleOpen,
  onToggleGroup,
  onToggleLight,
}: {
  group: LightCapabilityGroup;
  open: boolean;
  selectedIds: string[];
  selectedCapabilities: EntertainmentLightCapability[];
  onToggleOpen: () => void;
  onToggleGroup: () => void;
  onToggleLight: (capability: EntertainmentLightCapability) => void;
}) => {
  const GroupIcon = group.class ? getRoomZoneIcon(group.class) : Lightbulb;
  const selectedCount = group.capabilities.filter((capability) =>
    selectedIds.includes(capability.light.id),
  ).length;
  const allSelected = selectedCount === group.capabilities.length;
  const partiallySelected = selectedCount > 0 && !allSelected;
  const groupIds = new Set(
    group.capabilities.map((capability) => capability.light.id),
  );
  const outsideChannelCount = selectedCapabilities.reduce(
    (total, capability) =>
      groupIds.has(capability.light.id)
        ? total
        : total + capability.channelCount,
    0,
  );
  const groupChannelCount = group.capabilities.reduce(
    (total, capability) => total + capability.channelCount,
    0,
  );
  const cannotSelectAll =
    !allSelected && outsideChannelCount + groupChannelCount > MAX_CHANNELS;

  return (
    <Collapsible open={open} onOpenChange={onToggleOpen}>
      <Card className={cn("gap-0 py-0", SETTINGS_EXPANDABLE_CARD)}>
        <div
          className={cn(
            "relative flex min-w-0 items-stretch",
            SETTINGS_EXPANDABLE_TRIGGER,
            open && SETTINGS_EXPANDABLE_TRIGGER_OPEN,
          )}
        >
          <Checkbox
            checked={allSelected}
            indeterminate={partiallySelected}
            aria-label={`${allSelected ? "Clear" : "Select"} all lights in ${group.name}`}
            disabled={cannotSelectAll}
            onCheckedChange={onToggleGroup}
            className="absolute top-1/2 left-9 z-10 -translate-x-1/2 -translate-y-1/2 after:-inset-3.5"
          />
          <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-3 py-4 pr-5 pl-[72px] text-left">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-foreground/5 text-muted-foreground">
              <GroupIcon size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {group.name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {selectedCount > 0 ? `${selectedCount} selected · ` : ""}
                {group.capabilities.length}{" "}
                {group.capabilities.length === 1 ? "light" : "lights"}
                {group.resourceType ? ` · ${group.resourceType}` : ""}
              </span>
            </span>
            <ChevronDown
              size={17}
              className={cn(
                "shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <div className="divide-y divide-foreground/10 border-t border-border/60">
            {group.capabilities.map((capability) => {
              const checked = selectedIds.includes(capability.light.id);
              const wouldExceed =
                !checked &&
                selectedCapabilities.reduce(
                  (total, selected) => total + selected.channelCount,
                  0,
                ) +
                  capability.channelCount >
                  MAX_CHANNELS;
              return (
                <label
                  key={capability.light.id}
                  data-selected={checked ? "" : undefined}
                  className={cn(
                    "relative flex items-center gap-3 px-3 py-3",
                    selectableVariants({ treatment: "row" }),
                    wouldExceed
                      ? "cursor-not-allowed opacity-45"
                      : "cursor-pointer",
                  )}
                >
                  <span className="flex w-12 shrink-0 items-center justify-center">
                    <Checkbox
                      checked={checked}
                      disabled={wouldExceed}
                      onCheckedChange={() => onToggleLight(capability)}
                    />
                  </span>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-foreground/5 text-muted-foreground">
                    <Lightbulb size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {capability.light.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[
                        capability.light.productName,
                        capability.light.reachable ? "Reachable" : "Offline",
                        capability.channelCount > 1
                          ? `${capability.channelCount} channels`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

const round = (value: number) => Math.round(value * 100) / 100;
