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
import { Loader2 } from "lucide-react";
import { useState } from "react";

interface RemoveResourceSectionProps {
  /** Heading for the pane row, e.g. "Remove Lamp". */
  title: string;
  /** One-line subtext for the pane row, e.g. "Removes Lamp from Office". */
  description: string;
  /** Trigger + confirm button copy: "Remove" for reversible, "Delete" otherwise. */
  actionLabel: string;
  /** Confirmation dialog heading. */
  confirmTitle: string;
  /** Confirmation dialog body — explains exactly what the action does. */
  confirmBody: React.ReactNode;
  /**
   * Optional inline link rendered under the body, pointing the user at the
   * place that owns the heavier action (e.g. Settings → Devices for a full
   * delete). Navigating typically unmounts this pane, which closes the dialog.
   */
  navLink?: { label: string; onNavigate: () => void };
  /** Confirm button tone: neutral for a reversible remove, danger for a delete. */
  confirmTone?: "neutral" | "danger";
  /** Whether the trigger is interactive (e.g. disabled while a device id is missing). */
  disabled?: boolean;
  /** Performs the action; the dialog stays open and surfaces any thrown error. */
  onConfirm: () => Promise<void>;
}

/**
 * The "remove from this space" affordance pinned above a side pane's
 * Cancel/Save footer: a neutral row (label + subtext on the left, a low-key
 * button on the right) that opens a confirmation dialog. The dialog spells out
 * that this only affects the current room/zone and links to where a permanent
 * delete lives.
 */
export const RemoveResourceSection: React.FC<RemoveResourceSectionProps> = ({
  title,
  description,
  actionLabel,
  confirmTitle,
  confirmBody,
  navLink,
  confirmTone = "neutral",
  disabled,
  onConfirm,
}) => {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setIsBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (confirmError) {
      setError(String(confirmError) || "Something went wrong. Try again.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <AlertDialog onOpenChange={(open) => !open && setError(null)}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <AlertDialogTrigger
          render={
            <Button
              type="button"
              variant={confirmTone === "danger" ? "destructive" : "outline"}
              disabled={disabled}
            />
          }
        >
          {actionLabel}
        </AlertDialogTrigger>
      </div>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
          <AlertDialogDescription>{confirmBody}</AlertDialogDescription>
        </AlertDialogHeader>

        {navLink && (
          <Button
            variant="outline"
            className="self-start w-max"
            onClick={navLink.onNavigate}
          >
            {navLink.label}
          </Button>
        )}

        {error && <p className="text-sm text-(--destructive-text)">{error}</p>}

        <AlertDialogFooter>
          <AlertDialogCancel size="xl" disabled={isBusy} variant="ghost">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant={confirmTone === "danger" ? "destructive" : "default"}
            size="xl"
            className="gap-2"
            disabled={isBusy}
            onClick={(event) => {
              // Keep the dialog open while the request runs so a failure can
              // surface inline; on success the pane unmounts and tears it down.
              event.preventDefault();
              void confirm();
            }}
          >
            {isBusy ? <Loader2 className="animate-spin" /> : null}
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
