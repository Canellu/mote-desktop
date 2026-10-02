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
  INSPECTOR_TRANSITION_EVENT,
  type InspectorTransitionDetail,
  requestInspectorTransition,
} from "@/features/space-screen/utils/inspector-transition";
import { useBlocker } from "@tanstack/react-router";
import { ArrowLeft, Pencil, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface SidePaneEditGuard {
  dirty: boolean;
  discard: () => void;
  save: () => Promise<boolean>;
}

interface SidePaneProps {
  /** Small uppercase label above the body (e.g. the product or scene kind). */
  eyebrow: string;
  /** Read-only body; the generic shell wraps it in a scroll area. */
  view: React.ReactNode;
  /** Resource id; switching it collapses edit mode back to the view. */
  resetKey: string;
  /** Pinned footer shown below the read-only view (hidden while editing). */
  viewFooter?: React.ReactNode;
  onClose: () => void;
  /**
   * Open straight into the editing body with no read-only view to go back to:
   * leaving edit closes the pane.
   */
  editOnly?: boolean;
  /** Accessible label for the pencil/edit toggle. */
  editLabel?: string;
  /**
   * Editing body, slid in from the right when the pencil is tapped. When
   * omitted the pencil is hidden and the pane is read-only. `active` mirrors the
   * editing state so the content can (re)seed its form; `exitEdit` slides back.
   */
  renderEdit?: (ctx: {
    active: boolean;
    exitEdit: () => void;
    guardRef: React.MutableRefObject<SidePaneEditGuard | null>;
  }) => React.ReactNode;
}

/**
 * Generic inspector shell shared by the light and scene panes. Owns the header
 * (eyebrow, edit/close buttons, animated back arrow) and the two-pane view/edit
 * slider; callers supply the read-only `view` and an optional `renderEdit` body.
 */
export const SidePane: React.FC<SidePaneProps> = ({
  eyebrow,
  view,
  resetKey,
  viewFooter,
  onClose,
  editLabel = "Edit",
  renderEdit,
  editOnly = false,
}) => {
  // Edit mode slides the editing pane in from the right and swaps the header's
  // action button for a back arrow, rather than opening a separate modal.
  const [editing, setEditing] = useState(editOnly);
  const [pendingTransition, setPendingTransition] = useState<
    (() => void) | null
  >(null);
  const guardRef = useRef<SidePaneEditGuard | null>(null);

  // Reset to the starting view whenever a different resource is selected.
  useEffect(() => {
    setEditing(editOnly);
  }, [resetKey]);

  useLayoutEffect(() => {
    const handleTransition = (rawEvent: Event) => {
      const event = rawEvent as CustomEvent<InspectorTransitionDetail>;
      if (!editing || !guardRef.current?.dirty) return;
      event.preventDefault();
      setPendingTransition(() => event.detail.proceed);
    };
    window.addEventListener(INSPECTOR_TRANSITION_EVENT, handleTransition);
    return () =>
      window.removeEventListener(INSPECTOR_TRANSITION_EVENT, handleTransition);
  }, [editing]);

  const routeBlocker = useBlocker({
    shouldBlockFn: ({ action }) => {
      if (!editing) return false;
      // Unsaved edits: intercept any navigation away to offer Save/Discard.
      if (guardRef.current?.dirty) return true;
      // Clean edits: let a mouse Back unwind edit mode before it closes the
      // whole pane, so Back steps out one level at a time. Programmatic closes
      // (the X button) and in-place content swaps still collapse edit directly.
      return !editOnly && (action === "BACK" || action === "GO");
    },
    enableBeforeUnload: editing && Boolean(guardRef.current?.dirty),
    withResolver: true,
  });

  // A blocked *clean* Back means "step out of edit mode": drop to the read-only
  // view and cancel the navigation so the pane stays open. A second Back then
  // closes the pane itself.
  useEffect(() => {
    if (routeBlocker.status !== "blocked" || guardRef.current?.dirty) return;
    setEditing(editOnly);
    routeBlocker.reset();
  }, [routeBlocker]);

  const finishTransition = (proceed: () => void) => {
    setPendingTransition(null);
    setEditing(editOnly);
    proceed();
  };

  const discardAndContinue = () => {
    guardRef.current?.discard();
    if (guardRef.current) guardRef.current.dirty = false;
    if (pendingTransition) {
      finishTransition(pendingTransition);
    } else if (routeBlocker.status === "blocked") {
      setEditing(editOnly);
      routeBlocker.proceed();
    }
  };

  const saveAndContinue = async () => {
    if (!guardRef.current) return;
    if (!(await guardRef.current.save())) return;
    guardRef.current.dirty = false;
    if (pendingTransition) {
      finishTransition(pendingTransition);
    } else if (routeBlocker.status === "blocked") {
      setEditing(editOnly);
      routeBlocker.proceed();
    }
  };

  const editable = renderEdit != null;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Let a nested control (popover, rename input) or an open dialog own
      // Escape before it reaches the pane.
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (pendingTransition != null || routeBlocker.status === "blocked") {
        return;
      }

      event.preventDefault();
      // Escape unwinds one level, like Back: step out of edit mode first
      // (guarding dirty edits), otherwise close the pane.
      if (editing && editOnly) {
        requestInspectorTransition(onClose);
      } else if (editing) {
        requestInspectorTransition(() => setEditing(editOnly));
      } else {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editing, editOnly, pendingTransition, routeBlocker.status, onClose]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-6 pt-3 pb-0">
        <div className="flex min-w-0 items-center">
          {/* Back arrow animates in alongside the eyebrow in edit mode. */}
          <AnimatePresence initial={false}>
            {editing && !editOnly && (
              <motion.button
                key="back"
                type="button"
                initial={{ width: 0, opacity: 0, marginRight: 0 }}
                animate={{ width: 32, opacity: 1, marginRight: 4 }}
                exit={{ width: 0, opacity: 0, marginRight: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="-ml-1 flex h-8 shrink-0 items-center justify-center overflow-hidden rounded-md text-muted-foreground hover:bg-muted"
                aria-label="Back"
                onClick={() =>
                  requestInspectorTransition(() => setEditing(editOnly))
                }
              >
                <ArrowLeft size={18} />
              </motion.button>
            )}
          </AnimatePresence>
          <p className="truncate font-heading text-xs font-medium text-muted-foreground">
            {eyebrow}
          </p>
        </div>
        <div className="-mr-1 flex shrink-0 gap-1">
          {editable && !editing && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={editLabel}
              onClick={() => setEditing(true)}
            >
              <Pencil />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          className="flex h-full w-[200%] transition-transform duration-300 ease-out"
          style={{ transform: editing ? "translateX(-50%)" : "translateX(0)" }}
        >
          {/* View pane */}
          <div className="flex h-full w-1/2 shrink-0 flex-col" inert={editing}>
            <ScrollArea
              fade
              hideScrollbar
              className="min-h-0 flex-1"
              viewportClassName="px-6 pb-6"
              // Base UI's ScrollArea.Content sets `min-width: fit-content`, so
              // the color/temperature wheels (whose 360px canvas has an
              // intrinsic width) blow the pane out and overflow. Pin the content
              // wrapper to the viewport width so `w-full` shrinks to fit.
              contentClassName="min-w-0!"
            >
              {view}
            </ScrollArea>
            {viewFooter}
          </div>

          {/* Edit pane */}
          <div className="flex h-full w-1/2 shrink-0 flex-col" inert={!editing}>
            {renderEdit?.({
              active: editing,
              exitEdit: editOnly ? onClose : () => setEditing(false),
              guardRef,
            })}
          </div>
        </div>
      </div>

      <AlertDialog
        open={
          pendingTransition != null ||
          (routeBlocker.status === "blocked" &&
            Boolean(guardRef.current?.dirty))
        }
        onOpenChange={(open) => {
          if (open) return;
          setPendingTransition(null);
          if (routeBlocker.status === "blocked") routeBlocker.reset();
        }}
      >
        <AlertDialogContent>
          <button
            type="button"
            aria-label="Close"
            onClick={() => {
              setPendingTransition(null);
              if (routeBlocker.status === "blocked") routeBlocker.reset();
            }}
            className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <X className="size-4" />
          </button>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              Save your changes before leaving this editor?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction variant="outline" onClick={discardAndContinue}>
              Discard
            </AlertDialogAction>
            <AlertDialogAction onClick={() => void saveAndContinue()}>
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
