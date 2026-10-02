import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { ArrowLeft, X } from "lucide-react";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/** Unsaved edits in a panel, which leaving it offers to save or discard. */
export interface DetailsGuard {
  dirty: boolean;
  save: () => Promise<boolean>;
  discard: () => void;
}

/**
 * Lets the frame inside decide how the sheet closes: a click outside or Escape
 * reaches the sheet, but only the frame knows whether there are unsaved edits.
 */
const LeaveContext = createContext<
  React.MutableRefObject<((action: () => void) => void) | null>
>({ current: null });

/**
 * The side panel the Devices lists open their details in. It stays mounted
 * while what it shows changes, so it slides in and out instead of popping,
 * and keeps showing the last details while it slides away.
 */
export const DetailsSheet = ({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** A DetailsFrame; keep the last one here while `open` turns false. */
  children: React.ReactNode;
}) => {
  const leaveRef = useRef<((action: () => void) => void) | null>(null);
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        if (leaveRef.current) leaveRef.current(onClose);
        else onClose();
      }}
    >
      <SheetContent
        // Settings' raised surface, so its fields and controls stand off it in
        // both themes, as they do on the Settings page it opens from.
        className="w-full gap-0 bg-(--settings-raised) sm:max-w-md"
        showCloseButton={false}
      >
        <LeaveContext.Provider value={leaveRef}>
          {children}
        </LeaveContext.Provider>
      </SheetContent>
    </Sheet>
  );
};

/**
 * What a details panel shows, laid out like the light and scene side panes: a
 * header with a small label, a way back and one close button; a scrolling
 * body; and an optional footer pinned to the bottom for Cancel and Save.
 */
export const DetailsFrame = ({
  onClose,
  eyebrow,
  title,
  back,
  footer,
  removal,
  guard,
  children,
}: {
  onClose: () => void;
  /** The small label at the top, such as the product or "Fixture". */
  eyebrow: string;
  /** What the panel shows, for assistive technology; the body shows it too. */
  title: string;
  back?: { label: string; onClick: () => void };
  /** Cancel and Save, pinned to the bottom. */
  footer?: React.ReactNode;
  /**
   * Taking the thing away (Delete, Ungroup), pinned to the bottom with the
   * footer so it's always in reach, above Cancel and Save.
   */
  removal?: React.ReactNode;
  /** Closing or going back with unsaved edits asks first, as side panes do. */
  guard?: DetailsGuard;
  children: React.ReactNode;
}) => {
  const [pending, setPending] = useState<(() => void) | null>(null);
  const leave = (action: () => void) => {
    if (guard?.dirty) setPending(() => action);
    else action();
  };
  // Clicks outside and Escape reach the sheet; route them through the guard.
  const leaveRef = useContext(LeaveContext);
  useLayoutEffect(() => {
    leaveRef.current = leave;
    return () => {
      if (leaveRef.current === leave) leaveRef.current = null;
    };
  });

  return (
    <>
      <div className="flex items-center justify-between gap-2 px-6 pt-3">
        <div className="flex min-w-0 items-center">
          {back && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="-ml-1 mr-1 text-muted-foreground"
              aria-label={`Back to ${back.label}`}
              title={`Back to ${back.label}`}
              onClick={() => leave(back.onClick)}
            >
              <ArrowLeft />
            </Button>
          )}
          <p className="truncate font-heading text-xs font-medium text-muted-foreground">
            {eyebrow}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="-mr-1"
          aria-label="Close"
          onClick={() => leave(onClose)}
        >
          <X />
        </Button>
      </div>
      <SheetTitle className="sr-only">{title}</SheetTitle>
      <SheetDescription className="sr-only">{eyebrow}</SheetDescription>

      <ScrollArea
        fade
        hideScrollbar
        className="min-h-0 flex-1"
        viewportClassName="px-6 pb-6"
        // The color and temperature wheels have an intrinsic width; pin the
        // content to the viewport so they shrink to fit, as the side pane does.
        contentClassName="flex min-h-full min-w-0! flex-col"
      >
        <div className="flex flex-1 flex-col gap-6 pt-2">{children}</div>
      </ScrollArea>

      {(removal || footer) && (
        <div className="grid gap-4 border-t border-border p-6 pt-4">
          {removal}
          {footer && <div className="flex gap-2">{footer}</div>}
        </div>
      )}

      <AlertDialog
        open={pending != null}
        onOpenChange={(next) => !next && setPending(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              Save your changes before leaving?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              variant="outline"
              onClick={() => {
                guard?.discard();
                pending?.();
                setPending(null);
              }}
            >
              Discard
            </AlertDialogAction>
            <AlertDialogAction
              onClick={async () => {
                const action = pending;
                setPending(null);
                if (guard && (await guard.save())) action?.();
              }}
            >
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

/** A titled block in a details panel. */
export const DetailsSection = ({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  /** A control at the end of the heading, such as Change lights. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <section className="grid gap-3">
    <div className="flex min-h-8 items-center justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-sm font-medium">{title}</h3>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
    {children}
  </section>
);
