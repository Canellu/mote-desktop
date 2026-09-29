import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type {
  DeleteResource,
  RenameResource,
  RenameableResourceType,
} from "../types";
import { DeleteResourceButton } from "./DeleteResourceButton";

// Row actions collapse to icon buttons once the row is too narrow for their
// labels, so the resource name keeps room instead of truncating to a letter.
export const ROW_ACTION_CLASS = "@max-lg/row:w-10 @max-lg/row:px-0";
export const ROW_ACTION_LABEL_CLASS = "@max-lg/row:sr-only";

export const EditableResourceRow = ({
  id,
  resourceType,
  name,
  eyebrow,
  meta,
  onRename,
  onDelete,
  deleteDescription,
  actions,
  showRenameAction = true,
  children,
}: {
  id: string;
  resourceType: RenameableResourceType;
  name: string;
  eyebrow: string;
  meta: Array<string | null | undefined>;
  onRename: RenameResource;
  onDelete?: DeleteResource;
  deleteDescription?: string;
  /** Extra row actions rendered before the rename button. */
  actions?: React.ReactNode;
  /** Whether to show the inline rename pencil. */
  showRenameAction?: boolean;
  children?: React.ReactNode;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditing) setDraftName(name);
  }, [isEditing, name]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === name) {
      setIsEditing(false);
      setDraftName(name);
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await onRename(resourceType, id, trimmed);
      setIsEditing(false);
    } catch (renameError) {
      setError(String(renameError) || "Unable to rename resource.");
    } finally {
      setIsSaving(false);
    }
  };

  const visibleMeta = meta.filter(Boolean);

  return (
    <div className="@container/row min-w-0 max-w-full overflow-hidden rounded-xl bg-background/70 px-3 py-3">
      {isEditing ? (
        <form className="flex gap-2" onSubmit={(event) => void submit(event)}>
          <Input
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            aria-label={`${eyebrow} name`}
            disabled={isSaving}
          />
          <Button type="submit" size="icon" disabled={isSaving}>
            {isSaving ? <Loader2 className="animate-spin" /> : <Check />}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={isSaving}
            onClick={() => {
              setIsEditing(false);
              setDraftName(name);
              setError(null);
            }}
          >
            <X />
          </Button>
        </form>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{eyebrow}</p>
            <p className="truncate font-medium">{name}</p>
            {visibleMeta.length > 0 && (
              <p className="truncate text-sm text-muted-foreground">
                {visibleMeta.join(" · ")}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {actions}
            {showRenameAction && (
              <Button
                type="button"
                size="default"
                variant="outline"
                className={cn("gap-2", ROW_ACTION_CLASS)}
                onClick={() => setIsEditing(true)}
                aria-label={`Rename ${name}`}
                title="Rename"
              >
                <Pencil />
                <span className={ROW_ACTION_LABEL_CLASS}>Rename</span>
              </Button>
            )}
            {onDelete && (
              <DeleteResourceButton
                label={name}
                description={deleteDescription ?? `Delete ${name}.`}
                onDelete={() => onDelete(resourceType, id)}
              />
            )}
          </div>
        </div>
      )}
      {error && (
        <p className="mt-2 text-sm text-(--destructive-text)">{error}</p>
      )}
      {children}
    </div>
  );
};
