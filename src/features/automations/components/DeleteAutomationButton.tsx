import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";

/**
 * Removes an automation after a confirm. On-air, Away and Presence are single
 * settings records rather than list items, so "delete" resets one to its blank
 * state, which takes it off the automations list until it's added again.
 */
export function DeleteAutomationButton({
  name,
  disabled,
  onConfirm,
}: {
  /** What the automation is called, e.g. "On-air light". */
  name: string;
  disabled?: boolean;
  /** Resolves true once it's gone; false keeps the dialog open. */
  onConfirm: () => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        className="text-(--destructive-text)"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Trash2 />
        Delete automation
      </Button>
      <AlertDialog
        open={open}
        onOpenChange={(next) => !deleting && setOpen(next)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              It stops running and its lights and settings are cleared. You can
              add it again from Add automation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={async () => {
                setDeleting(true);
                try {
                  if (await onConfirm()) setOpen(false);
                } finally {
                  setDeleting(false);
                }
              }}
            >
              {deleting && <Loader2 className="animate-spin" />}
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
