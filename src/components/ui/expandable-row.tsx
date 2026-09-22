import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/**
 * A list of expandable rows: one bordered box, a hairline between the rows.
 * Used wherever a long list folds down to one line each — the automation
 * light and scene pickers, automation priority.
 */
export function ExpandableRowGroup({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "grid min-w-0 content-start divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * One row of such a list: its name, what it holds or what is picked in it, and
 * a chevron that turns as it opens. The panel slides open and shut (Base UI
 * publishes the measured height, see `CollapsibleContent`), and sits on a
 * surface of its own so an open row reads as a section rather than loose
 * content under a line.
 */
export function ExpandableRow({
  title,
  value,
  valueTone = "muted",
  open,
  defaultOpen = false,
  onOpenChange,
  disabled = false,
  panelClassName,
  children,
}: {
  title: ReactNode;
  /** Shown at the end of the row, before the chevron. */
  value?: ReactNode;
  valueTone?: "muted" | "strong";
  /** Controlled state; leave out to let the row keep its own. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** A row with nothing to fold stays open and loses its chevron. */
  disabled?: boolean;
  panelClassName?: string;
  children: ReactNode;
}) {
  const [ownOpen, setOwnOpen] = useState(defaultOpen);
  const isOpen = disabled || (open ?? ownOpen);
  return (
    <Collapsible
      open={isOpen}
      onOpenChange={(next) => {
        if (disabled) return;
        setOwnOpen(next);
        onOpenChange?.(next);
      }}
      className="min-w-0"
    >
      <CollapsibleTrigger
        disabled={disabled}
        className={cn(
          "flex w-full min-w-0 items-center gap-3 px-3 py-3 text-left outline-none transition-colors enabled:hover:bg-foreground/5 focus-visible:bg-foreground/[0.07] disabled:cursor-default",
          isOpen && "bg-foreground/[0.03]",
        )}
      >
        <span className="flex min-w-0 flex-1 items-baseline gap-2.5">
          <span className="shrink-0 truncate text-sm font-medium">{title}</span>
          {value !== undefined && (
            <span
              className={cn(
                "min-w-0 truncate text-xs tabular-nums",
                valueTone === "strong"
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {value}
            </span>
          )}
        </span>
        {!disabled && (
          <ChevronDown
            aria-hidden
            size={16}
            className={cn(
              "shrink-0 text-muted-foreground transition-transform duration-200",
              isOpen && "rotate-180",
            )}
          />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border/60 bg-foreground/[0.02] data-ending-style:border-transparent data-starting-style:border-transparent">
        <div className={cn("px-3 py-3", panelClassName)}>{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Content that comes and goes in place — a warning that appears once a field
 * is empty, say. It slides open and shut instead of shoving the page, and
 * takes no room at all while it is closed.
 */
export function Reveal({
  open,
  className,
  children,
}: {
  open: boolean;
  /** Classes for the wrapper; the child brings its own padding. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <Collapsible open={open} className={cn("min-w-0 empty:hidden", className)}>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}
