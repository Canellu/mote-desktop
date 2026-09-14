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
          while Windows installs it and opens again when it is done. PC Sync
          stops first if it is running.
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
  const { status, installing, progress, install } = useStoreUpdate();
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
        className="group flex h-full items-center justify-center px-1.5 outline-none disabled:opacity-60"
      >
        {/* A filled pill, unlike its neighbours, so a pending update is
          noticed rather than read as another title-bar control. */}
        <span className="flex h-7 items-center gap-1.5 rounded-md bg-info px-2.5 text-xs font-medium text-info-foreground shadow-xs transition-colors group-hover:bg-info/85 group-focus-visible:ring-2 group-focus-visible:ring-ring">
          {installing ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <ArrowDownToLine size={15} strokeWidth={2.2} />
          )}
          {/* Tabular digits keep the pill from twitching as the percent climbs. */}
          <span className="tabular-nums">
            {!installing
              ? "Update"
              : progress
                ? `Updating ${progress.percent}%`
                : "Updating…"}
          </span>
        </span>
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
