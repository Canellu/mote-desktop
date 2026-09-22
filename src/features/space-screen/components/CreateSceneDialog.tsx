import { invoke } from "@tauri-apps/api/core";
import { LoaderCircle } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

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
import { Label } from "@/components/ui/label";
import type { HueRoomZone } from "@/types/hue";

export function CreateSceneDialog({
  open,
  onOpenChange,
  roomZone,
  hasLights,
  onRefresh,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomZone: HueRoomZone;
  hasLights: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);

  const changeOpen = (nextOpen: boolean) => {
    if (pending.current) return;
    setName("");
    setError(null);
    onOpenChange(nextOpen);
  };

  const create = async () => {
    if (pending.current || !name.trim() || !hasLights) return;
    pending.current = true;
    setSaving(true);
    setError(null);
    try {
      await invoke("create-hue-scene", {
        name: name.trim(),
        groupId: roomZone.id,
        groupType: roomZone.resourceType,
      });
    } catch (cause) {
      setError(String(cause) || "Unable to create scene. Try again.");
      pending.current = false;
      setSaving(false);
      return;
    }
    pending.current = false;
    setSaving(false);
    changeOpen(false);
    toast.success("Scene created from current light state");
    // Creation succeeded; a refresh failure must not invite a duplicate save.
    try {
      await onRefresh();
    } catch {
      toast.error(
        "Scene saved, but the scene list could not refresh. Reopen this room or zone to reload it.",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent showCloseButton={!saving} aria-busy={saving}>
        <DialogHeader>
          <DialogTitle>Create scene</DialogTitle>
          <DialogDescription>
            Save the current lighting in {roomZone.name} so you can return to it
            anytime.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="new-space-scene-name">Scene name</Label>
            <Input
              id="new-space-scene-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter scene name"
              maxLength={32}
              disabled={saving || !hasLights}
              required
            />
            {!hasLights && (
              <p className="text-muted-foreground">
                Add lights to this {roomZone.resourceType} before creating a
                scene.
              </p>
            )}
            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => changeOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || !name.trim() || !hasLights}
            >
              {saving && <LoaderCircle className="animate-spin" />}
              {saving ? "Creating…" : "Create scene"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
