import { Button } from "@/components/ui/button";
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
import { suggestedFixtureName, type Fixture } from "@/lib/fixtures";
import type { HueLight } from "@/types/hue";
import { Check, ListChecks, Plus } from "lucide-react";
import { useId, useState } from "react";
import { ResourceChecklist } from "./ResourceChecklist";

/**
 * Groups lights the bridge lists separately into one fixture, or changes which
 * lights one the person made holds. The bridge has no notion of a fixture, so
 * this is the only way one exists; `suggestedIds` only pre-ticks likely heads.
 */
export const FixtureDialog = ({
  fixture,
  lights,
  suggestedIds = [],
  onSave,
}: {
  /** The fixture whose lights are changed; absent when creating one. */
  fixture?: Fixture;
  /** The lights to choose from, usually the ones in one room. */
  lights: HueLight[];
  suggestedIds?: string[];
  /** Returns the error to show, or null once saved. */
  onSave: (name: string, lightIds: string[]) => string | null;
}) => {
  const nameId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const selected = lights.filter((light) => selectedIds.includes(light.id));
  const placeholder =
    selected.length > 0 ? suggestedFixtureName(selected) : "Fixture name";

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setSelectedIds(fixture?.lightIds ?? suggestedIds);
      setName("");
      setError(null);
    }
    setOpen(next);
  };

  const toggle = (id: string) =>
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    );

  const save = () => {
    // A fixture being changed keeps its name; it is renamed from its panel.
    const failure = onSave(
      fixture ? fixture.name : name.trim() || placeholder,
      selectedIds,
    );
    if (failure) setError(failure);
    else setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
          >
            {fixture ? <ListChecks size={14} /> : <Plus size={14} />}
            {fixture ? "Change lights" : "Create fixture"}
          </Button>
        }
      />
      <DialogContent className="min-w-0 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {fixture ? `Lights in ${fixture.name}` : "Create fixture"}
          </DialogTitle>
          <DialogDescription>
            {fixture
              ? "Choose which lights belong to this fixture."
              : "Choose the lights that are one physical product, like the spots and ceiling of a Hue Centris. Mote shows them together here and on the map; each stays its own light on the bridge."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-w-0 gap-4">
          {!fixture && (
            <div className="grid gap-2">
              <Label htmlFor={nameId}>Name</Label>
              <Input
                id={nameId}
                value={name}
                placeholder={placeholder}
                maxLength={32}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
          )}
          <div className="grid min-w-0 gap-2">
            <Label>Lights</Label>
            <ResourceChecklist
              options={lights}
              selectedIds={selectedIds}
              emptyText="No lights in this room."
              onToggle={toggle}
            />
            <p className="text-xs text-muted-foreground">
              Ticking a light makes it blink, so you can check it is the right
              one. Lights in another fixture are not listed.
            </p>
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-end">
          <p className="mr-auto min-w-0 text-sm break-words">
            {error ? (
              <span className="text-(--destructive-text)">{error}</span>
            ) : (
              <span className="text-muted-foreground">
                {selected.length} selected
              </span>
            )}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="gap-2"
            disabled={selected.length < 2}
            onClick={save}
          >
            <Check />
            {fixture ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
