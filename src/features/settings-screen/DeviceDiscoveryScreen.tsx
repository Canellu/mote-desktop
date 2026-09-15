import {
  DndContext,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { invoke } from "@tauri-apps/api/core";
import {
  ChevronRight,
  ImageUp,
  Loader2,
  Plus,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import type { HueRoomZone } from "@/types/hue";
import { useDeviceScan, type FoundDevice } from "./hooks/useDeviceScan";
import { decodeQrImageFile, parseHueQrText } from "./utils/qr";

const newRoomId = () => `new:${crypto.randomUUID()}`;

interface DraftRoom {
  id: string;
  name: string;
  isNew: boolean;
}

interface DeviceDiscoveryScreenProps {
  onDone: () => void;
}

export const DeviceDiscoveryScreen: React.FC<DeviceDiscoveryScreenProps> = ({
  onDone,
}) => {
  const roomZones = useHueResourcesStore((state) => state.roomZones);
  const loadAll = useHueResourcesStore((state) => state.loadAll);
  const { status, found, error, start, stop, reset } = useDeviceScan();
  const [roomAssignments, setRoomAssignments] = useState<
    Record<string, string>
  >({});
  const [zoneAssignments, setZoneAssignments] = useState<
    Record<string, string[]>
  >({});
  const [draftRooms, setDraftRooms] = useState<DraftRoom[]>([]);
  const [newRoomName, setNewRoomName] = useState("");
  const [serial, setSerial] = useState("");
  const [qrMessage, setQrMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isReadingQr, setIsReadingQr] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void start();
  }, [start]);

  useEffect(
    () => () => {
      reset();
    },
    [reset],
  );

  const rooms = useMemo(
    () => roomZones.filter((space) => space.resourceType === "room"),
    [roomZones],
  );
  const zones = useMemo(
    () => roomZones.filter((space) => space.resourceType === "zone"),
    [roomZones],
  );
  const allRooms = useMemo<DraftRoom[]>(
    () => [
      ...rooms.map((room) => ({ id: room.id, name: room.name, isNew: false })),
      ...draftRooms,
    ],
    [draftRooms, rooms],
  );
  const foundIds = useMemo(
    () => new Set(found.map((device) => device.id)),
    [found],
  );
  const unassignedCount = found.filter(
    (device) => !roomAssignments[device.id],
  ).length;
  const canSave = found.length > 0 && unassignedCount === 0 && !isSaving;

  const assignRoom = (deviceId: string, roomId: string) => {
    setRoomAssignments((current) => ({ ...current, [deviceId]: roomId }));
    setSaveError(null);
  };

  const toggleZone = (device: FoundDevice, zoneId: string) => {
    if (!device.hasLight) return;
    setZoneAssignments((current) => {
      const selected = new Set(current[device.id] ?? []);
      if (selected.has(zoneId)) selected.delete(zoneId);
      else selected.add(zoneId);
      return { ...current, [device.id]: [...selected] };
    });
    setSaveError(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const deviceId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    const device = found.find((candidate) => candidate.id === deviceId);
    if (!device || !overId) return;
    const [kind, id] = overId.split(":");
    if (kind === "room") assignRoom(deviceId, id);
    if (kind === "zone") toggleZone(device, id);
  };

  const createDraftRoom = (event: FormEvent) => {
    event.preventDefault();
    const name = newRoomName.trim();
    if (!name) return;
    setDraftRooms((current) => [
      ...current,
      { id: newRoomId(), name, isNew: true },
    ]);
    setNewRoomName("");
  };

  const resetDraft = () => {
    setRoomAssignments({});
    setZoneAssignments({});
    setDraftRooms([]);
    setNewRoomName("");
    setSaveError(null);
  };

  const handleQrFile = async (file: File | null) => {
    if (!file) return;
    setQrMessage(null);
    setSaveError(null);
    setIsReadingQr(true);
    try {
      const text = await decodeQrImageFile(file);
      parseHueQrText(text);
      setQrMessage("Hue QR code read. Searching for that device...");
      await start("qr", text);
    } catch (readError) {
      setQrMessage(String(readError) || "Unable to read the QR image.");
    } finally {
      setIsReadingQr(false);
    }
  };

  const startSerialSearch = async (event: FormEvent) => {
    event.preventDefault();
    const value = serial.trim();
    if (!value) return;
    setSaveError(null);
    await start("serial", value);
  };

  const savePlacements = async () => {
    if (!canSave) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const newRoomIdMap = new Map<string, string>();
      for (const room of draftRooms) {
        const assignedDeviceIds = found
          .filter((device) => roomAssignments[device.id] === room.id)
          .map((device) => device.id);
        if (assignedDeviceIds.length === 0) continue;
        const createdRoomId = await invoke<string>("create-hue-room", {
          name: room.name,
          deviceIds: assignedDeviceIds,
        });
        newRoomIdMap.set(room.id, createdRoomId);
      }

      for (const room of rooms) {
        const nextDeviceIds = room.deviceIds.filter((id) => !foundIds.has(id));
        for (const device of found) {
          if (roomAssignments[device.id] === room.id) {
            nextDeviceIds.push(device.id);
          }
        }
        if (!sameIds(nextDeviceIds, room.deviceIds)) {
          await invoke("update-room-members", {
            roomId: room.id,
            deviceIds: nextDeviceIds,
          });
        }
      }

      for (const device of found) {
        if (!device.hasLight) continue;
        for (const zoneId of zoneAssignments[device.id] ?? []) {
          await invoke("assign-device-to-zone", {
            deviceId: device.id,
            zoneId,
          });
        }
      }

      if (newRoomIdMap.size > 0) {
        setRoomAssignments((current) => {
          const next = { ...current };
          for (const [draftId, createdId] of newRoomIdMap) {
            for (const [deviceId, roomId] of Object.entries(next)) {
              if (roomId === draftId) next[deviceId] = createdId;
            }
          }
          return next;
        });
      }
      await loadAll();
      reset();
      onDone();
    } catch (saveError) {
      setSaveError(String(saveError) || "Unable to save device placement.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="flex w-full flex-col gap-5">
        <section className="rounded-2xl bg-muted/45 p-5 dark:bg-muted/30">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <nav
                aria-label="Breadcrumb"
                className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground"
              >
                <button
                  type="button"
                  className="transition-colors hover:text-foreground"
                  onClick={onDone}
                >
                  Settings
                </button>
                <ChevronRight size={13} />
                <button
                  type="button"
                  className="transition-colors hover:text-foreground"
                  onClick={onDone}
                >
                  Devices
                </button>
                <ChevronRight size={13} />
                <span className="text-foreground">Add devices</span>
              </nav>
              <h1 className="mt-1 text-2xl font-semibold">Add devices</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Place every new device in a room. Lights can also be added to
                zones.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={resetDraft}>
                <RotateCcw size={16} />
                Reset
              </Button>
              <Button type="button" variant="outline" onClick={onDone}>
                <X size={16} />
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!canSave}
                onClick={() => void savePlacements()}
              >
                {isSaving ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                Save placement
              </Button>
            </div>
          </div>

          <Separator className="my-4" />

          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr]">
            <div className="rounded-xl bg-background/70 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Normal scan</p>
                  <p className="text-xs text-muted-foreground">
                    Finds nearby lights and accessories.
                  </p>
                </div>
                {status === "scanning" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={stop}
                  >
                    Stop
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void start()}
                  >
                    <RefreshCcw size={14} />
                    Scan again
                  </Button>
                )}
              </div>
            </div>

            <form
              className="rounded-xl bg-background/70 p-3"
              onSubmit={startSerialSearch}
            >
              <p className="text-sm font-medium">Serial number</p>
              <p className="text-xs text-muted-foreground">
                Light-focused legacy search.
              </p>
              <div className="mt-3 flex gap-2">
                <Input
                  value={serial}
                  onChange={(event) => setSerial(event.target.value)}
                  placeholder="Serial number"
                  aria-label="Serial number"
                />
                <Button
                  type="submit"
                  variant="outline"
                  size="icon"
                  disabled={!serial.trim()}
                >
                  <Search />
                </Button>
              </div>
            </form>

            <QrImportPanel
              isReading={isReadingQr}
              message={qrMessage}
              onFile={handleQrFile}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={status === "scanning" ? "secondary" : "outline"}>
              {status === "scanning" ? "Scanning" : "Idle"}
            </Badge>
            <span className="text-muted-foreground">
              {found.length} found · {unassignedCount} need room assignment
            </span>
            {(error || saveError) && (
              <span className="text-(--destructive-text)">
                {error ?? saveError}
              </span>
            )}
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(280px,360px)_1fr]">
          <section className="rounded-2xl bg-muted/45 p-4 dark:bg-muted/30">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Found devices
              </h2>
              {status === "scanning" && (
                <Loader2
                  size={16}
                  className="animate-spin text-muted-foreground"
                />
              )}
            </div>
            <div className="grid gap-3">
              {found.map((device) => (
                <DeviceCard
                  key={device.id}
                  device={device}
                  roomName={
                    allRooms.find(
                      (room) => room.id === roomAssignments[device.id],
                    )?.name
                  }
                  zoneCount={(zoneAssignments[device.id] ?? []).length}
                />
              ))}
              {found.length === 0 && (
                <p className="rounded-xl bg-background/70 px-3 py-8 text-center text-sm text-muted-foreground">
                  {status === "scanning"
                    ? "Scanning in the background. Newly found devices will appear here."
                    : "No new devices found yet."}
                </p>
              )}
            </div>
          </section>

          <section className="grid gap-5">
            <div className="rounded-2xl bg-muted/45 p-4 dark:bg-muted/30">
              <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Rooms
                </h2>
                <form className="flex gap-2" onSubmit={createDraftRoom}>
                  <Input
                    value={newRoomName}
                    onChange={(event) => setNewRoomName(event.target.value)}
                    placeholder="New room name"
                    aria-label="New room name"
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={!newRoomName.trim()}
                  >
                    <Plus size={16} />
                    Add room
                  </Button>
                </form>
              </div>
              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {allRooms.map((room) => (
                  <RoomDropTarget
                    key={room.id}
                    room={room}
                    devices={found.filter(
                      (device) => roomAssignments[device.id] === room.id,
                    )}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-muted/45 p-4 dark:bg-muted/30">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Zones
              </h2>
              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {zones.map((zone) => (
                  <ZoneDropTarget
                    key={zone.id}
                    zone={zone}
                    devices={found.filter((device) =>
                      (zoneAssignments[device.id] ?? []).includes(zone.id),
                    )}
                    onToggle={toggleZone}
                  />
                ))}
                {zones.length === 0 && (
                  <p className="rounded-xl bg-background/70 px-3 py-6 text-sm text-muted-foreground">
                    No zones exist yet. Save room placement first, then create
                    zones in Settings.
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </DndContext>
  );
};

const QrImportPanel = ({
  isReading,
  message,
  onFile,
}: {
  isReading: boolean;
  message: string | null;
  onFile: (file: File | null) => Promise<void>;
}) => (
  <div
    className="rounded-xl bg-background/70 p-3"
    onDragOver={(event) => event.preventDefault()}
    onDrop={(event) => {
      event.preventDefault();
      void onFile(event.dataTransfer.files.item(0));
    }}
  >
    <p className="text-sm font-medium">QR image</p>
    <p className="text-xs text-muted-foreground">
      Drop or choose a Hue QR screenshot/photo.
    </p>
    <div className="mt-3 flex items-center gap-2">
      <label
        htmlFor="hue-qr-image-input"
        className="inline-flex h-8 cursor-pointer items-center justify-center gap-1 rounded-4xl border border-border bg-input/30 px-3 text-sm font-medium hover:bg-input/50"
      >
        {isReading ? (
          <Loader2 className="animate-spin" />
        ) : (
          <ImageUp size={14} />
        )}
        Choose image
      </label>
      <input
        id="hue-qr-image-input"
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => void onFile(event.target.files?.item(0) ?? null)}
      />
    </div>
    {message && <p className="mt-2 text-xs text-muted-foreground">{message}</p>}
  </div>
);

const DeviceCard = ({
  device,
  roomName,
  zoneCount,
}: {
  device: FoundDevice;
  roomName?: string;
  zoneCount: number;
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: device.id,
    });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "cursor-grab rounded-xl bg-background/80 p-3 shadow-sm outline-none transition",
        isDragging && "z-10 opacity-70 ring-[3px] ring-ring/40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{device.eyebrow}</p>
          <p className="truncate font-medium">{device.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[device.modelId, device.swVersion, device.uniqueId]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <Badge variant={device.reachable ? "secondary" : "destructive"}>
          {device.reachable ? "Reachable" : "Offline"}
        </Badge>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {device.serviceTypes.map((serviceType) => (
          <Badge key={serviceType} variant="outline">
            {serviceType}
          </Badge>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-1 text-xs text-muted-foreground">
        <span>{roomName ? `Room: ${roomName}` : "No room selected"}</span>
        {device.hasLight && <span>· {zoneCount} zones</span>}
      </div>
    </div>
  );
};

const RoomDropTarget = ({
  room,
  devices,
}: {
  room: DraftRoom;
  devices: FoundDevice[];
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: `room:${room.id}` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-36 rounded-xl border border-border bg-background/70 p-3 transition",
        isOver && "border-primary ring-[3px] ring-ring/30",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{room.name}</p>
          <p className="text-xs text-muted-foreground">
            {room.isNew ? "New room" : "Room"} · {devices.length} new
          </p>
        </div>
      </div>
      <AssignedDeviceList devices={devices} empty="Drop devices here" />
    </div>
  );
};

const ZoneDropTarget = ({
  zone,
  devices,
  onToggle,
}: {
  zone: HueRoomZone;
  devices: FoundDevice[];
  onToggle: (device: FoundDevice, zoneId: string) => void;
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: `zone:${zone.id}` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-32 rounded-xl border border-border bg-background/70 p-3 transition",
        isOver && "border-primary ring-[3px] ring-ring/30",
      )}
    >
      <p className="truncate font-medium">{zone.name}</p>
      <p className="mb-3 text-xs text-muted-foreground">
        Zone · {devices.length} new lights
      </p>
      <AssignedDeviceList devices={devices} empty="Drop lights here" />
      {devices.map((device) => (
        <Button
          key={device.id}
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 h-7"
          onClick={() => onToggle(device, zone.id)}
        >
          Remove {device.name}
        </Button>
      ))}
    </div>
  );
};

const AssignedDeviceList = ({
  devices,
  empty,
}: {
  devices: FoundDevice[];
  empty: string;
}) =>
  devices.length > 0 ? (
    <div className="grid gap-2">
      {devices.map((device) => (
        <div
          key={device.id}
          className="rounded-lg bg-muted/50 px-2 py-2 text-sm"
        >
          <span className="font-medium">{device.name}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {device.productName ?? device.productArchetype ?? "Hue device"}
          </span>
        </div>
      ))}
    </div>
  ) : (
    <p className="rounded-lg bg-muted/40 px-2 py-6 text-center text-sm text-muted-foreground">
      {empty}
    </p>
  );

const sameIds = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((id) => rightSet.has(id));
};
