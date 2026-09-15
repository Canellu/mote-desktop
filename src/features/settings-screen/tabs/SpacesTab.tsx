import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getRoomZoneIcon } from "@/features/home-screen/components/room-zone-icons";
import { blinkableLightIds, useBlinkLights } from "@/hooks/useBlinkLights";
import { selectableVariants } from "@/lib/selection-styles";
import { cn } from "@/lib/utils";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import type { HueLight, HueRoomZone, HueSettingsDevice } from "@/types/hue";
import { Check, Lightbulb, Loader2, Pencil, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EditableResourceRow } from "../components/EditableResourceRow";
import { EmptyText } from "../components/EmptyText";
import { Panel } from "../components/Panel";
import { SPACE_ARCHETYPES } from "../constants";
import type { DeleteResource, RenameResource } from "../types";

type MemberOption = HueSettingsDevice | HueLight;

export const SpacesTab = ({
  lights,
  roomZones,
  devices,
  onRename,
  onDelete,
  onUpdateMembers,
}: {
  lights: HueLight[];
  roomZones: HueRoomZone[];
  devices: HueSettingsDevice[];
  onRename: RenameResource;
  onDelete: DeleteResource;
  onUpdateMembers: (roomZone: HueRoomZone, ids: string[]) => Promise<void>;
}) => {
  const rooms = roomZones.filter((space) => space.resourceType === "room");
  const zones = roomZones.filter((space) => space.resourceType === "zone");

  const renderSpaces = (spaces: HueRoomZone[], emptyText: string) => (
    <div className="grid min-w-0 gap-3">
      {spaces.map((roomZone) => (
        <SpaceManagementRow
          key={roomZone.id}
          roomZone={roomZone}
          rooms={rooms}
          devices={devices}
          lights={lights}
          onRename={onRename}
          onDelete={onDelete}
          onUpdateMembers={onUpdateMembers}
        />
      ))}
      {spaces.length === 0 && <EmptyText>{emptyText}</EmptyText>}
    </div>
  );

  return (
    <div className="space-y-5">
      <Panel title="Rooms" contentClassName="min-w-0 overflow-hidden">
        {renderSpaces(rooms, "No rooms yet.")}
      </Panel>
      <Panel title="Zones" contentClassName="min-w-0 overflow-hidden">
        {renderSpaces(zones, "No zones yet.")}
      </Panel>
    </div>
  );
};

const SpaceManagementRow = ({
  roomZone,
  rooms,
  devices,
  lights,
  onRename,
  onDelete,
  onUpdateMembers,
}: {
  roomZone: HueRoomZone;
  rooms: HueRoomZone[];
  devices: HueSettingsDevice[];
  lights: HueLight[];
  onRename: RenameResource;
  onDelete: DeleteResource;
  onUpdateMembers: (roomZone: HueRoomZone, ids: string[]) => Promise<void>;
}) => {
  const memberOptions =
    roomZone.resourceType === "room"
      ? devices.filter((device) => !device.serviceTypes.includes("bridge"))
      : lights;
  const memberIds =
    roomZone.resourceType === "room" ? roomZone.deviceIds : roomZone.lightIds;
  const memberNames = memberOptions
    .filter((option) => memberIds.includes(option.id))
    .map((option) => option.name);

  return (
    <EditableResourceRow
      id={roomZone.id}
      resourceType={roomZone.resourceType}
      name={roomZone.name}
      eyebrow={roomZone.resourceType === "room" ? "Room" : "Zone"}
      meta={[
        roomZone.resourceType === "room"
          ? `${memberIds.length} ${memberIds.length === 1 ? "device" : "devices"}`
          : `${memberIds.length} ${memberIds.length === 1 ? "light" : "lights"}`,
        memberPreview(memberNames),
      ]}
      onRename={onRename}
      onDelete={onDelete}
      showRenameAction={false}
      deleteDescription={`Delete ${roomZone.resourceType} "${roomZone.name}" from the bridge.`}
      actions={
        <MembershipEditor
          roomZone={roomZone}
          rooms={rooms}
          options={memberOptions}
          selectedIds={memberIds}
          onRename={(name, archetype) =>
            onRename(roomZone.resourceType, roomZone.id, name, archetype)
          }
          onSave={(ids) => onUpdateMembers(roomZone, ids)}
        />
      }
    />
  );
};

const MembershipEditor = ({
  roomZone,
  rooms,
  options,
  selectedIds,
  onRename,
  onSave,
}: {
  roomZone: HueRoomZone;
  rooms: HueRoomZone[];
  options: MemberOption[];
  selectedIds: string[];
  onRename: (name: string, archetype: string) => Promise<void>;
  onSave: (ids: string[]) => Promise<void>;
}) => {
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState(roomZone.name);
  const [draftArchetype, setDraftArchetype] = useState(roomZone.class);
  const [query, setQuery] = useState("");
  const [mobileMemberView, setMobileMemberView] = useState<
    "selected" | "available"
  >("selected");
  const [draftIds, setDraftIds] = useState(selectedIds);
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setDraftIds(selectedIds);
  }, [open, selectedIds]);

  useEffect(() => {
    if (!recentlyAddedId) return;
    const timeout = window.setTimeout(() => setRecentlyAddedId(null), 1600);
    return () => window.clearTimeout(timeout);
  }, [recentlyAddedId]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredOptions = useMemo(
    () =>
      options.filter((option) =>
        [option.name, option.productName]
          .filter(Boolean)
          .some((value) =>
            value!.toLocaleLowerCase().includes(normalizedQuery),
          ),
      ),
    [normalizedQuery, options],
  );
  const filteredById = new Map(
    filteredOptions.map((option) => [option.id, option] as const),
  );
  const selected = draftIds
    .map((id) => filteredById.get(id))
    .filter((option): option is MemberOption => option != null);
  const available = filteredOptions.filter(
    (option) => !draftIds.includes(option.id),
  );
  const availableGroups = groupMembers(available, roomZone, rooms);
  const addedCount = draftIds.filter((id) => !selectedIds.includes(id)).length;
  const removedCount = selectedIds.filter(
    (id) => !draftIds.includes(id),
  ).length;
  const trimmedName = draftName.trim();
  const nameDirty = trimmedName.length > 0 && trimmedName !== roomZone.name;
  const archetypeDirty = draftArchetype !== roomZone.class;
  const membershipDirty = addedCount > 0 || removedCount > 0;
  const isDirty = nameDirty || archetypeDirty || membershipDirty;

  const toggle = (id: string) => {
    const isAdding = !draftIds.includes(id);
    setRecentlyAddedId(isAdding ? id : null);
    setDraftIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const save = async () => {
    if (!trimmedName) {
      setError("Enter a name for this space.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      if (nameDirty || archetypeDirty)
        await onRename(trimmedName, draftArchetype);
      if (membershipDirty) await onSave(draftIds);
      setOpen(false);
    } catch (saveError) {
      setError(String(saveError) || "Unable to update members.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (isSaving) return;
    setOpen(nextOpen);
    if (nextOpen) {
      setDraftName(roomZone.name);
      setDraftArchetype(roomZone.class);
      setDraftIds(selectedIds);
      setRecentlyAddedId(null);
      setQuery("");
      setMobileMemberView("selected");
      setError(null);
    }
  };

  const noun = roomZone.resourceType === "room" ? "devices" : "lights";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            type="button"
            size="default"
            variant="outline"
            className="gap-2"
          >
            <Pencil />
            Edit
          </Button>
        }
      />
      <DialogContent className="flex h-[min(46rem,calc(100dvh-2rem))] min-h-0 flex-col overflow-hidden sm:max-w-4xl">
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>
            Edit {roomZone.resourceType === "room" ? "room" : "zone"}
          </DialogTitle>
          <DialogDescription>
            {roomZone.resourceType === "room"
              ? "Choose the devices in this room. A device can belong to one room."
              : "Choose the lights in this zone. A light can belong to multiple zones."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid shrink-0 gap-4 min-[440px]:grid-cols-[minmax(0,1fr)_minmax(10rem,0.55fr)]">
          <div className="grid gap-2">
            <Label htmlFor={`space-name-${roomZone.id}`}>Name</Label>
            <Input
              id={`space-name-${roomZone.id}`}
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              disabled={isSaving}
              size="lg"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`space-icon-${roomZone.id}`}>Icon</Label>
            <Select
              items={Object.fromEntries(
                archetypeOptions(roomZone.class).map((option) => [
                  option.value,
                  option.label,
                ]),
              )}
              value={draftArchetype}
              onValueChange={(value) => value && setDraftArchetype(value)}
              disabled={isSaving}
            >
              <SelectTrigger
                id={`space-icon-${roomZone.id}`}
                className="h-10 w-full"
              >
                <SelectValue>
                  {(value: string | null) => {
                    const option = archetypeOptions(roomZone.class).find(
                      (candidate) => candidate.value === value,
                    );
                    if (!option) return "Choose icon";
                    const Icon = getRoomZoneIcon(option.value);
                    return (
                      <>
                        <Icon className="size-5 text-muted-foreground" />
                        <span>{option.label}</span>
                      </>
                    );
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {archetypeOptions(roomZone.class).map((option) => {
                  const Icon = getRoomZoneIcon(option.value);
                  return (
                    <SelectItem key={option.value} value={option.value}>
                      <Icon className="size-5 text-muted-foreground" />
                      <span>{option.label}</span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="relative shrink-0">
          <Search
            size={17}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${noun}`}
            className="pl-10"
            autoFocus
          />
        </div>

        <div className="hidden min-h-0 flex-1 gap-4 md:grid md:grid-cols-2">
          <MemberColumn
            title={`Selected (${draftIds.length})`}
            emptyText={
              normalizedQuery
                ? "No selected members match your search."
                : `No ${noun} selected yet.`
            }
            groups={[{ label: null, options: selected }]}
            selectedIds={draftIds}
            revealId={recentlyAddedId}
            highlightedId={recentlyAddedId}
            onToggle={toggle}
          />
          <MemberColumn
            title={`Available (${options.length - draftIds.length})`}
            emptyText={
              normalizedQuery
                ? "No available members match your search."
                : `All available ${noun} are selected.`
            }
            groups={availableGroups}
            selectedIds={draftIds}
            onToggle={toggle}
          />
        </div>

        <Tabs
          value={mobileMemberView}
          onValueChange={(value) =>
            setMobileMemberView(value as "selected" | "available")
          }
          className="min-h-0 flex-1 md:hidden"
        >
          <TabsList className="w-full shrink-0" aria-label="Member list">
            <TabsTrigger value="selected">
              Selected ({draftIds.length})
            </TabsTrigger>
            <TabsTrigger value="available">
              Available ({options.length - draftIds.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="selected" className="min-h-0">
            <MemberColumn
              className="h-full min-h-0"
              title={`Selected (${draftIds.length})`}
              hideTitle
              emptyText={
                normalizedQuery
                  ? "No selected members match your search."
                  : `No ${noun} selected yet.`
              }
              groups={[{ label: null, options: selected }]}
              selectedIds={draftIds}
              revealId={recentlyAddedId}
              highlightedId={recentlyAddedId}
              onToggle={toggle}
            />
          </TabsContent>
          <TabsContent value="available" className="min-h-0">
            <MemberColumn
              className="h-full min-h-0"
              title={`Available (${options.length - draftIds.length})`}
              hideTitle
              emptyText={
                normalizedQuery
                  ? "No available members match your search."
                  : `All available ${noun} are selected.`
              }
              groups={availableGroups}
              selectedIds={draftIds}
              onToggle={toggle}
            />
          </TabsContent>
        </Tabs>

        <DialogFooter className="shrink-0 flex-row flex-wrap items-center justify-end border-t border-border/60 pt-4 sm:justify-between">
          <div className="mr-auto min-w-0 text-sm">
            {error ? (
              <p className="break-words text-(--destructive-text)">{error}</p>
            ) : isDirty ? (
              <p className="text-muted-foreground">
                {changeSummary(
                  nameDirty,
                  archetypeDirty,
                  addedCount,
                  removedCount,
                )}
              </p>
            ) : (
              <p className="text-muted-foreground">No unsaved changes</p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={isSaving}
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="gap-2"
            disabled={!isDirty || isSaving}
            onClick={() => void save()}
          >
            {isSaving ? <Loader2 className="animate-spin" /> : <Check />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const MemberColumn = ({
  className,
  title,
  hideTitle = false,
  emptyText,
  groups,
  selectedIds,
  revealId,
  highlightedId,
  onToggle,
}: {
  className?: string;
  title: string;
  hideTitle?: boolean;
  emptyText: string;
  groups: Array<{ label: string | null; options: MemberOption[] }>;
  selectedIds: string[];
  revealId?: string | null;
  highlightedId?: string | null;
  onToggle: (id: string) => void;
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const optionCount = groups.reduce(
    (count, group) => count + group.options.length,
    0,
  );

  useEffect(() => {
    if (!revealId) return;
    const viewport = viewportRef.current;
    const row = rowRefs.current.get(revealId);
    if (!viewport || !row) return;

    const viewportRect = viewport.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches
      ? "auto"
      : "smooth";

    if (rowRect.bottom > viewportRect.bottom) {
      viewport.scrollTo({
        top: viewport.scrollTop + rowRect.bottom - viewportRect.bottom + 8,
        behavior,
      });
    } else if (rowRect.top < viewportRect.top) {
      viewport.scrollTo({
        top: viewport.scrollTop - (viewportRect.top - rowRect.top) - 8,
        behavior,
      });
    }
  }, [optionCount, revealId]);

  return (
    <section
      className={cn(
        "flex min-h-48 min-w-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-background/40",
        className,
      )}
    >
      {!hideTitle && (
        <h3 className="shrink-0 border-b border-border/60 px-4 py-3 font-medium">
          {title}
        </h3>
      )}
      {optionCount === 0 ? (
        <p className="m-auto px-6 py-10 text-center text-sm text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        <ScrollArea
          fade="bottom"
          className="min-h-0 flex-1"
          viewportClassName="p-2"
          viewportRef={viewportRef}
        >
          <div className="grid gap-3">
            {groups.map((group, index) => (
              <div key={group.label ?? index} className="grid gap-1">
                {group.label && (
                  <p className="px-2 pb-1 pt-1 text-xs font-medium text-muted-foreground">
                    {group.label}
                  </p>
                )}
                {group.options.map((option) => (
                  <MemberRow
                    key={option.id}
                    option={option}
                    selected={selectedIds.includes(option.id)}
                    highlighted={highlightedId === option.id}
                    rowRef={(node) => {
                      if (node) rowRefs.current.set(option.id, node);
                      else rowRefs.current.delete(option.id);
                    }}
                    onToggle={() => onToggle(option.id)}
                  />
                ))}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </section>
  );
};

const MemberRow = ({
  option,
  selected,
  highlighted,
  rowRef,
  onToggle,
}: {
  option: MemberOption;
  selected: boolean;
  highlighted: boolean;
  rowRef: (node: HTMLDivElement | null) => void;
  onToggle: () => void;
}) => {
  const lights = useHueResourcesStore((state) => state.lights);
  const { blink } = useBlinkLights();
  const idsToBlink = blinkableLightIds(option, lights);

  const toggle = () => {
    if (!selected) void blink(option.id, idsToBlink);
    onToggle();
  };

  return (
    <div
      ref={rowRef}
      data-selected={selected ? "" : undefined}
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-xl pr-1 transition-[background-color,box-shadow] duration-300",
        selectableVariants({ treatment: "row" }),
        highlighted && "bg-primary/10 ring-1 ring-primary/25",
      )}
    >
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-3 py-2.5">
        <Checkbox checked={selected} onCheckedChange={toggle} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{option.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {friendlyMemberMeta(option, lights)}
          </span>
        </span>
      </label>
      {idsToBlink.length > 0 && (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={`Identify ${option.name}`}
          title={`Identify ${option.name}`}
          onClick={() => void blink(option.id, idsToBlink)}
        >
          <Lightbulb />
        </Button>
      )}
    </div>
  );
};

const groupMembers = (
  options: MemberOption[],
  roomZone: HueRoomZone,
  rooms: HueRoomZone[],
) => {
  const grouped = new Map<string, MemberOption[]>();
  for (const option of options) {
    const owner = rooms.find((room) =>
      "serviceTypes" in option
        ? room.deviceIds.includes(option.id)
        : option.deviceId
          ? room.deviceIds.includes(option.deviceId)
          : room.lightIds.includes(option.id),
    );
    const label = owner
      ? owner.id === roomZone.id
        ? roomZone.resourceType === "room"
          ? "This room"
          : owner.name
        : roomZone.resourceType === "room"
          ? `${owner.name} · selecting moves it`
          : owner.name
      : "Not assigned to a room";
    grouped.set(label, [...(grouped.get(label) ?? []), option]);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => {
      if (left === "Not assigned to a room") return -1;
      if (right === "Not assigned to a room") return 1;
      return left.localeCompare(right);
    })
    .map(([label, groupOptions]) => ({
      label,
      options: groupOptions.sort((a, b) => a.name.localeCompare(b.name)),
    }));
};

const friendlyMemberMeta = (option: MemberOption, lights: HueLight[]) => {
  if ("serviceTypes" in option) {
    const lightCount = lights.filter(
      (light) => light.deviceId === option.id,
    ).length;
    return [
      option.productName ?? friendlyDeviceKind(option),
      lightCount > 1 ? `${lightCount} lights` : null,
      option.reachable ? null : "Offline",
    ]
      .filter(Boolean)
      .join(" · ");
  }

  return [option.productName ?? "Light", option.reachable ? null : "Offline"]
    .filter(Boolean)
    .join(" · ");
};

const friendlyDeviceKind = (device: HueSettingsDevice) => {
  if (device.serviceTypes.includes("light")) return "Light";
  if (
    device.serviceTypes.includes("button") ||
    device.serviceTypes.includes("relative_rotary")
  )
    return "Switch";
  if (device.serviceTypes.includes("motion")) return "Motion sensor";
  return "Hue device";
};

const memberPreview = (names: string[]) => {
  if (names.length === 0) return null;
  const visible = names.slice(0, 2).join(", ");
  return names.length > 2 ? `${visible} +${names.length - 2}` : visible;
};

const archetypeOptions = (current: string) =>
  SPACE_ARCHETYPES.some((option) => option.value === current)
    ? SPACE_ARCHETYPES
    : [
        {
          value: current,
          label: current
            .replace(/_/g, " ")
            .replace(/^./, (letter: string) => letter.toLocaleUpperCase()),
        },
        ...SPACE_ARCHETYPES,
      ];

const changeSummary = (
  nameChanged: boolean,
  iconChanged: boolean,
  added: number,
  removed: number,
) =>
  [
    nameChanged ? "Name changed" : null,
    iconChanged ? "Icon changed" : null,
    added > 0 ? `${added} added` : null,
    removed > 0 ? `${removed} removed` : null,
  ]
    .filter(Boolean)
    .join(" · ");
