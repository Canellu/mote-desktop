import { useEffect, useId, useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/**
 * One automation in the overview. The whole card opens its editor: the title
 * button's hit area stretches over the card, and only the switch sits above it.
 * The card sits a step above the page — a shade of its own in light mode, the
 * card color in dark — and lifts on hover, so it reads as a row you enter.
 */
export function AutomationCard({
  icon: Icon,
  title,
  summary,
  status,
  statusTone = "neutral",
  enabled,
  canEnable,
  pending = false,
  onToggle,
  onEdit,
  focusRequested = false,
}: {
  icon: LucideIcon;
  title: string;
  summary: string;
  status: string;
  statusTone?: "neutral" | "active" | "warning";
  enabled: boolean;
  canEnable: boolean;
  pending?: boolean;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  focusRequested?: boolean;
}) {
  const editRef = useRef<HTMLButtonElement>(null);
  const detailId = useId();
  useEffect(() => {
    if (focusRequested) editRef.current?.focus();
  }, [focusRequested]);
  const canToggle = !pending && (enabled || canEnable);
  return (
    <div className="group relative grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-2xl border border-border/60 [--row-surface:var(--settings-surface)] bg-(--row-surface) p-4 transition-colors dark:[--row-surface:var(--card)] has-[[data-edit]:hover]:bg-(--settings-surface-hover) has-[[data-edit]:focus-visible]:ring-2 has-[[data-edit]:focus-visible]:ring-ring @2xl:gap-4">
      <span
        aria-hidden="true"
        className={cn(
          "flex size-10 shrink-0 items-center justify-center self-start rounded-xl border @2xl:self-center",
          enabled
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-border/60 bg-muted/40 text-muted-foreground",
        )}
      >
        <Icon size={18} />
      </span>
      <div className="grid min-w-0 gap-1">
        <h3 className="text-sm font-semibold">
          <button
            ref={editRef}
            type="button"
            data-edit
            disabled={pending}
            aria-describedby={detailId}
            onClick={onEdit}
            className="text-left outline-none after:absolute after:inset-0 after:rounded-2xl disabled:cursor-default"
          >
            {title}
          </button>
        </h3>
        <div id={detailId} className="grid gap-1">
          <p className="max-w-prose text-sm leading-5 text-muted-foreground">
            {summary}
          </p>
          <p
            role="status"
            className={cn(
              "text-xs leading-5",
              statusTone === "active" && "text-success",
              statusTone === "warning" && "text-(--warn-text)",
              statusTone === "neutral" && "text-muted-foreground",
            )}
          >
            {enabled && statusTone !== "warning" ? "Enabled · " : ""}
            {status}
          </p>
        </div>
      </div>
      {/* A switch that can't turn on lets the click fall through to the
          editor, where the missing setup is. */}
      <Switch
        aria-label={`${enabled ? "Turn off" : "Turn on"} ${title}`}
        checked={enabled}
        disabled={!canToggle}
        onCheckedChange={onToggle}
        className={cn("z-10", !canToggle && "pointer-events-none")}
      />
      <ChevronRight
        aria-hidden
        size={16}
        className="shrink-0 text-muted-foreground transition-[color,translate] group-has-[[data-edit]:hover]:translate-x-0.5 group-has-[[data-edit]:hover]:text-foreground"
      />
    </div>
  );
}
