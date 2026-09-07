import { useEffect, useState } from "react";
import { Combine, FolderPlus, MoveRight, Scissors, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { HueRoomZone } from "@/types/hue";
import type { MapArea, MapControlTarget, MapFloor } from "../types";

const UNLINKED = "none";
const key = (target: MapControlTarget) =>
  `${target.resourceType}:${target.resourceId}`;

export function RoomEditorPanel({
  floor,
  area,
  roomZones,
  combineIds,
  dividing,
  combining,
  busy,
  onRename,
  onLink,
  onRemove,
  onStartDivide,
  onStartCombine,
  onCombine,
  onCancelTool,
  zoneCandidateCount,
  moveCandidateCount,
  onCreateZone,
  onMoveDevices,
}: {
  floor: MapFloor;
  area: MapArea | null;
  roomZones: HueRoomZone[];
  combineIds: string[];
  dividing: boolean;
  combining: boolean;
  busy: boolean;
  onRename: (name: string) => void;
  onLink: (target: MapControlTarget | null) => void;
  onRemove: () => void;
  onStartDivide: () => void;
  onStartCombine: () => void;
  onCombine: () => void;
  onCancelTool: () => void;
  /** Lights whose markers sit in this room, offered as a new zone. */
  zoneCandidateCount: number;
  /** Devices in this room that belong to another Hue room. */
  moveCandidateCount: number;
  onCreateZone: () => void;
  onMoveDevices: () => void;
}) {
  const [name, setName] = useState(area?.name ?? "");
  useEffect(() => {
    setName(area?.name ?? "");
  }, [area?.id, area?.name]);

  if (combining)
    return (
      <div className="space-y-3">
        <h3 className="text-base font-medium">Combine rooms</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Click the adjoining rooms to combine. They keep the first room&apos;s
          name and its Hue link.
        </p>
        <ul className="space-y-1 text-sm">
          {combineIds.map((id, index) => (
            <li key={id} className="wrap-anywhere">
              {index + 1}.{" "}
              {floor.areas.find((entry) => entry.id === id)?.name ?? id}
            </li>
          ))}
          {combineIds.length === 0 && (
            <li className="text-muted-foreground">No rooms chosen yet.</li>
          )}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={combineIds.length < 2 || busy}
            onClick={onCombine}
          >
            Combine {combineIds.length > 1 ? combineIds.length : ""} rooms
          </Button>
          <Button size="sm" variant="outline" onClick={onCancelTool}>
            Cancel
          </Button>
        </div>
      </div>
    );

  if (!area)
    return (
      <div className="space-y-3">
        <h3 className="text-base font-medium">Rooms</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Select a room on the map to rename it, link it to a Hue room or zone,
          or divide it.
        </p>
        <Button size="sm" variant="outline" onClick={onStartCombine}>
          <Combine />
          Combine rooms
        </Button>
      </div>
    );

  const linked = area.target
    ? roomZones.find(
        (candidate) =>
          candidate.id === area.target!.resourceId &&
          candidate.resourceType === area.target!.resourceType,
      )
    : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-1.5">
        <Label htmlFor="map-room-name">Room name</Label>
        <Input
          id="map-room-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => onRename(name)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onRename(name);
            }
            if (event.key === "Escape") setName(area.name);
          }}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="map-room-target">Controls</Label>
        <Select
          value={area.target ? key(area.target) : UNLINKED}
          onValueChange={(value) => {
            if (!value || value === UNLINKED) {
              onLink(null);
              return;
            }
            const [resourceType, resourceId] = value.split(":");
            onLink({
              resourceType: resourceType as MapControlTarget["resourceType"],
              resourceId,
            });
          }}
        >
          <SelectTrigger id="map-room-target" className="w-full">
            <SelectValue>{linked?.name ?? "Not linked"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNLINKED}>Not linked</SelectItem>
            {roomZones.map((candidate) => (
              <SelectItem
                key={`${candidate.resourceType}:${candidate.id}`}
                value={`${candidate.resourceType}:${candidate.id}`}
              >
                {`${candidate.name} · ${candidate.lightCount} ${
                  candidate.lightCount === 1 ? "light" : "lights"
                }`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {area.target && !linked
            ? "This room points at a Hue room or zone that is no longer on the bridge."
            : "Linking uses an existing Hue room or zone. Nothing on the bridge is renamed or created."}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={dividing ? "secondary" : "outline"}
          aria-pressed={dividing}
          onClick={dividing ? onCancelTool : onStartDivide}
          disabled={busy}
        >
          <Scissors />
          {dividing ? "Cancel divide" : "Divide room"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onStartCombine}
          disabled={busy}
        >
          <Combine />
          Combine
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onRemove}
          disabled={busy || floor.areas.length < 2}
        >
          <Trash2 />
          Remove
        </Button>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Removing a room takes it off the map only. Hue rooms, zones, and lights
        stay exactly as they are.
      </p>

      <div className="space-y-2 border-t border-border pt-4">
        <h4 className="text-sm font-medium">Change Hue itself</h4>
        <p className="text-xs leading-relaxed text-muted-foreground">
          These are queued for review and only sent when you save the map.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy || zoneCandidateCount === 0}
            onClick={onCreateZone}
          >
            <FolderPlus />
            Create zone from {zoneCandidateCount}{" "}
            {zoneCandidateCount === 1 ? "light" : "lights"}
          </Button>
          {moveCandidateCount > 0 && linked?.resourceType === "room" && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={onMoveDevices}
            >
              <MoveRight />
              Move {moveCandidateCount}{" "}
              {moveCandidateCount === 1 ? "device" : "devices"} into{" "}
              {linked.name}
            </Button>
          )}
        </div>
        {zoneCandidateCount === 0 && (
          <p className="text-xs text-muted-foreground">
            Place lights in this room first; a zone is created from the lights
            you reviewed, never from the room's shape.
          </p>
        )}
      </div>
    </div>
  );
}
