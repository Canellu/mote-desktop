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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";

export const DeleteResourceButton = ({
  label,
  description,
  tooltip,
  triggerLabel,
  onDelete,
}: {
  label: string;
  description: string;
  tooltip?: string;
  triggerLabel?: string;
  onDelete: () => Promise<void>;
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      await onDelete();
    } catch (deleteError) {
      setError(String(deleteError) || "Unable to delete resource.");
    } finally {
      setIsDeleting(false);
    }
  };

  const trigger = (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            size={triggerLabel ? "default" : "icon"}
            variant={triggerLabel ? "destructive" : "ghost"}
            aria-label={tooltip ?? `Delete ${label}`}
          />
        }
      >
        <Trash2 />
        {triggerLabel}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm text-(--destructive-text)">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel size="xl" disabled={isDeleting}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            size="xl"
            className="gap-2"
            disabled={isDeleting}
            onClick={(event) => {
              event.preventDefault();
              void handleDelete();
            }}
          >
            {isDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (!tooltip) return trigger;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={<span className="inline-flex">{trigger}</span>}
        />
        <TooltipContent side="bottom">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
