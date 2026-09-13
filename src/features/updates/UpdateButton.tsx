import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowDownToLine, Loader2 } from "lucide-react";
import { useState } from "react";
import { useStoreUpdate } from "./useStoreUpdate";

/** The confirmation both entry points share. */
export const UpdateDialog = ({
  open,
  onOpenChange,
  mandatory,
  onInstall,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  mandatory: boolean;
  onInstall: () => void;
}) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent size="sm">
      <AlertDialogHeader>
        <AlertDialogTitle>
          {mandatory ? "Required update" : "Install the update?"}
        </AlertDialogTitle>
        <AlertDialogDescription>
          A newer Mote Desktop is ready in the Microsoft Store. Mote closes
          while Windows installs it, and PC Sync stops first if it is running.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Later</AlertDialogCancel>
        <AlertDialogAction onClick={onInstall}>
          Install update
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

/**
 * Title-bar entry point. Renders nothing unless the Store reports a newer
 * package, so a current or development build never shows it.
 */
export const UpdateButton = () => {
  const { status, installing, install } = useStoreUpdate();
  const [open, setOpen] = useState(false);

  if (!status.supported || !status.available) return null;

  return (
    <>
      <button
        type="button"
        aria-label={
          status.mandatory ? "Install required update" : "Install update"
        }
        disabled={installing}
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        className="flex h-full items-center justify-center gap-1.5 px-3 text-xs font-medium text-foreground transition-colors hover:bg-foreground/5 disabled:opacity-60 dark:hover:bg-foreground/10"
      >
        {installing ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <span className="relative flex">
            <ArrowDownToLine size={15} strokeWidth={2.2} />
            <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-(--success)" />
          </span>
        )}
        {installing ? "Updating…" : "Update"}
      </button>
      <UpdateDialog
        open={open}
        onOpenChange={setOpen}
        mandatory={status.mandatory}
        onInstall={() => {
          setOpen(false);
          void install();
        }}
      />
    </>
  );
};
