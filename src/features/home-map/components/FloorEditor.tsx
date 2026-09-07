import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { HomeMapDocument, MapFloor } from "../types";
import { describeFloorRemoval } from "../placement";

export function FloorEditor({
  map,
  floor,
  busy,
  onRename,
  onAddFloor,
  onRemoveFloor,
}: {
  map: HomeMapDocument;
  floor: MapFloor;
  busy: boolean;
  onRename: (name: string) => void;
  onAddFloor: () => void;
  onRemoveFloor: () => void;
}) {
  const [name, setName] = useState(floor.name);
  useEffect(() => {
    setName(floor.name);
  }, [floor.id, floor.name]);

  const removal = describeFloorRemoval(map, floor.id);
  const last = map.floors.length === 1;

  return (
    <div className="space-y-3">
      <div className="grid gap-1.5">
        <Label htmlFor="map-floor-name">Floor name</Label>
        <Input
          id="map-floor-name"
          value={name}
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => onRename(name)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onRename(name);
            }
            if (event.key === "Escape") setName(floor.name);
          }}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={onAddFloor}
        >
          <Plus />
          Add floor
        </Button>
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button size="sm" variant="ghost" disabled={busy || last}>
                <Trash2 />
                Remove floor
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {floor.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                {removal && removal.roomNames.length > 0
                  ? `This takes ${removal.roomNames.join(", ")} off the map`
                  : "This floor has no rooms yet"}
                {removal && removal.lightCount > 0
                  ? `, and returns ${removal.lightCount} ${
                      removal.lightCount === 1 ? "light" : "lights"
                    } to the unplaced list`
                  : ""}
                . Your Hue rooms, zones, scenes, and lights stay exactly as they
                are, and this stays a draft until you save the map.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={onRemoveFloor}>
                Remove floor
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
