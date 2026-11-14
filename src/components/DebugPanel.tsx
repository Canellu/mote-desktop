import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Minus, Square } from "lucide-react";
import {
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Button } from "./ui/button";

interface DebugPanelProps {
  /** Header label. */
  title?: string;
  /** Top-left starting position, in px. */
  initialPosition?: { x: number; y: number };
  /** Start collapsed (header only). */
  defaultCollapsed?: boolean;
  /** Panel width utility class (e.g. `w-72`). */
  className?: string;
  /** Tuning/debug controls go here. */
  children?: ReactNode;
}

/**
 * A floating, draggable, collapsible panel for dev tuning/debugging overlays.
 * Drag it by the header; pass any controls as children. Purely presentational —
 * it owns position + collapse state and nothing else, so it can be reused for
 * any future knobs-and-readouts panel.
 */
export const DebugPanel: React.FC<DebugPanelProps> = ({
  title = "Debug",
  initialPosition = { x: 16, y: 64 },
  defaultCollapsed = false,
  className,
  children,
}) => {
  const [pos, setPos] = useState(initialPosition);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const onPointerDown = (e: ReactPointerEvent) => {
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!dragRef.current) return;
    setPos({
      x: e.clientX - dragRef.current.dx,
      y: e.clientY - dragRef.current.dy,
    });
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    dragRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div
      className={cn(
        "fixed z-9999 w-72 rounded-xl border border-border bg-popover/95 text-popover-foreground shadow-2xl backdrop-blur",
        className,
      )}
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        className="flex cursor-move items-center justify-between gap-2 rounded-t-xl border-b border-border px-3 py-2 select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <span className="text-sm font-semibold tracking-wide">{title}</span>
        <Button
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand" : "Collapse"}
          variant="ghost"
          size="icon-sm"
          className="rounded-sm"
        >
          {collapsed ? <Square /> : <Minus />}
        </Button>
      </div>

      {!collapsed && (
        <ScrollArea viewportClassName="max-h-[70vh]" contentClassName="p-3">
          {children}
        </ScrollArea>
      )}
    </div>
  );
};
