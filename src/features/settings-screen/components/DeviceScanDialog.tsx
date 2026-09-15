import { invoke } from "@tauri-apps/api/core";
import { Check, Loader2, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DiscoveryWifi } from "@/components/DiscoveryWifi";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import type { HueRoomZone } from "@/types/hue";
import { useDeviceScan, type FoundDevice } from "../hooks/useDeviceScan";

const NEW_ROOM_VALUE = "new-room";

interface Placement {
  status: "saving" | "done" | "error";
  label?: string;
  error?: string;
}

interface DeviceScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Re-pull the settings summary + resources after a device is placed. */
  onRefresh: () => Promise<void>;
}

export const DeviceScanDialog: React.FC<DeviceScanDialogProps> = ({
  open,
  onOpenChange,
  onRefresh,
}) => {
  const roomZones = useHueResourcesStore((state) => state.roomZones);
  const { status, found, error, start, stop, reset } = useDeviceScan();

  const [placements, setPlacements] = useState<Record<string, Placement>>({});
  const [newRoomFor, setNewRoomFor] = useState<string | null>(null);
  const [newRoomName, setNewRoomName] = useState("");

  // Auto-start a scan each time the dialog opens; reset everything on close.
  useEffect(() => {
    if (open) {
      setPlacements({});
      setNewRoomFor(null);
      setNewRoomName("");
      void start();
    } else {
      reset();
    }
  }, [open, start, reset]);

  const rooms = useMemo(
    () => roomZones.filter((space) => space.resourceType === "room"),
    [roomZones],
  );
  const zones = useMemo(
    () => roomZones.filter((space) => space.resourceType === "zone"),
    [roomZones],
  );

  const placeInExisting = async (device: FoundDevice, space: HueRoomZone) => {
    setPlacements((current) => ({
      ...current,
      [device.id]: { status: "saving" },
    }));
    try {
      if (space.resourceType === "room") {
        await invoke("assign-device-to-room", {
          deviceId: device.id,
          roomId: space.id,
        });
      } else {
        await invoke("assign-device-to-zone", {
          deviceId: device.id,
          zoneId: space.id,
        });
      }
      setPlacements((current) => ({
        ...current,
        [device.id]: {
          status: "done",
          label: `${space.resourceType === "room" ? "Room" : "Zone"} · ${space.name}`,
        },
      }));
      await onRefresh();
    } catch (placeError) {
      setPlacements((current) => ({
        ...current,
        [device.id]: {
          status: "error",
          error: String(placeError) || "Unable to add the device.",
        },
      }));
    }
  };

  const createRoom = async (device: FoundDevice) => {
    const name = newRoomName.trim();
    if (!name) return;
    setPlacements((current) => ({
      ...current,
      [device.id]: { status: "saving" },
    }));
    try {
      await invoke("create-hue-room", { name, deviceIds: [device.id] });
      setPlacements((current) => ({
        ...current,
        [device.id]: { status: "done", label: `Room · ${name}` },
      }));
      setNewRoomFor(null);
      setNewRoomName("");
      await onRefresh();
    } catch (createError) {
      setPlacements((current) => ({
        ...current,
        [device.id]: {
          status: "error",
          error: String(createError) || "Unable to create the room.",
        },
      }));
    }
  };

  const handleSelect = (device: FoundDevice, value: string | null) => {
    if (!value) return;
    if (value === NEW_ROOM_VALUE) {
      setNewRoomName(device.name);
      setNewRoomFor(device.id);
      return;
    }
    setNewRoomFor((current) => (current === device.id ? null : current));
    const [kind, id] = value.split(":");
    const space = (kind === "room" ? rooms : zones).find(
      (candidate) => candidate.id === id,
    );
    if (space) void placeInExisting(device, space);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Scan for devices</DialogTitle>
          <DialogDescription>
            {status === "scanning"
              ? "Keep new lights and accessories powered and within range of the bridge."
              : "Place each device you found, or close to add it later."}
          </DialogDescription>
        </DialogHeader>

        {status === "scanning" ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <DiscoveryWifi />
            <p className="text-shimmer font-heading text-xl font-semibold">
              Scanning for devices…
            </p>
            {found.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Found {found.length} {found.length === 1 ? "device" : "devices"}{" "}
                so far.
              </p>
            )}
          </div>
        ) : error ? (
          <p className="rounded-xl bg-destructive/10 px-3 py-3 text-sm text-(--destructive-text)">
            {error}
          </p>
        ) : found.length === 0 ? (
          <p className="rounded-xl bg-muted/60 px-3 py-6 text-center text-sm text-muted-foreground">
            No new devices found. Make sure the device is powered and in range,
            then scan again.
          </p>
        ) : (
          <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto">
            {found.map((device) => (
              <FoundDeviceRow
                key={device.id}
                device={device}
                rooms={rooms}
                zones={zones}
                placement={placements[device.id]}
                isCreatingRoom={newRoomFor === device.id}
                newRoomName={newRoomName}
                onNewRoomNameChange={setNewRoomName}
                onSelect={(value) => handleSelect(device, value)}
                onCreateRoom={() => void createRoom(device)}
                onCancelNewRoom={() => setNewRoomFor(null)}
              />
            ))}
          </div>
        )}

        <DialogFooter>
          {status === "scanning" ? (
            <Button type="button" variant="outline" onClick={stop}>
              Done
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => void start()}
              >
                <Search size={16} />
                Scan again
              </Button>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const FoundDeviceRow = ({
  device,
  rooms,
  zones,
  placement,
  isCreatingRoom,
  newRoomName,
  onNewRoomNameChange,
  onSelect,
  onCreateRoom,
  onCancelNewRoom,
}: {
  device: FoundDevice;
  rooms: HueRoomZone[];
  zones: HueRoomZone[];
  placement: Placement | undefined;
  isCreatingRoom: boolean;
  newRoomName: string;
  onNewRoomNameChange: (name: string) => void;
  onSelect: (value: string | null) => void;
  onCreateRoom: () => void;
  onCancelNewRoom: () => void;
}) => {
  // Zones group lights, so only offer them for devices that expose a light.
  const zoneOptions = useMemo(
    () => (device.hasLight ? zones : []),
    [device.hasLight, zones],
  );
  const items = useMemo(() => {
    const map: Record<string, string> = {};
    for (const room of rooms) map[`room:${room.id}`] = `Room · ${room.name}`;
    for (const zone of zoneOptions)
      map[`zone:${zone.id}`] = `Zone · ${zone.name}`;
    map[NEW_ROOM_VALUE] = "Create new room…";
    return map;
  }, [rooms, zoneOptions]);

  return (
    <div className="rounded-xl bg-muted/50 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{device.eyebrow}</p>
          <p className="truncate font-medium">{device.name}</p>
        </div>

        {placement?.status === "done" ? (
          <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-(--success-text)">
            <Check size={16} />
            {placement.label}
          </span>
        ) : placement?.status === "saving" ? (
          <Loader2
            size={16}
            className="shrink-0 animate-spin text-muted-foreground"
          />
        ) : (
          !isCreatingRoom && (
            <Select
              items={items}
              value={null}
              onValueChange={(value) => onSelect(value as string | null)}
            >
              <SelectTrigger size="sm" className="shrink-0">
                <SelectValue placeholder="Add to…" />
              </SelectTrigger>
              <SelectContent align="end">
                {rooms.map((room) => (
                  <SelectItem key={room.id} value={`room:${room.id}`}>
                    Room · {room.name}
                  </SelectItem>
                ))}
                {zoneOptions.map((zone) => (
                  <SelectItem key={zone.id} value={`zone:${zone.id}`}>
                    Zone · {zone.name}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_ROOM_VALUE}>
                  <Plus size={14} className="mr-1 inline" />
                  Create new room…
                </SelectItem>
              </SelectContent>
            </Select>
          )
        )}
      </div>

      {isCreatingRoom && (
        <div className="mt-3 flex gap-2">
          <Input
            value={newRoomName}
            onChange={(event) => onNewRoomNameChange(event.target.value)}
            placeholder="Room name"
            aria-label="New room name"
            autoFocus
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onCreateRoom();
              }
            }}
          />
          <Button
            type="button"
            size="icon"
            onClick={onCreateRoom}
            disabled={!newRoomName.trim()}
            aria-label="Create room"
          >
            <Check />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onCancelNewRoom}
            aria-label="Cancel"
          >
            <X />
          </Button>
        </div>
      )}

      {placement?.status === "error" && (
        <p className="mt-2 text-sm text-(--destructive-text)">
          {placement.error}
        </p>
      )}
    </div>
  );
};
