import type { ReactElement, ReactNode } from "react";
import { Popover } from "@base-ui/react/popover";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

/** Small, anchored controls leave the plan available around them. */
export function MapPopover({
  trigger,
  title,
  children,
}: {
  trigger: ReactElement;
  title: string;
  children: ReactNode;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger render={trigger} />
      <Popover.Portal>
        <Popover.Positioner
          sideOffset={8}
          className="z-50"
          collisionPadding={16}
        >
          <Popover.Popup className="w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground outline-none">
            <ScrollArea
              viewportClassName="max-h-[calc(var(--available-height)-2px)]"
              contentClassName="p-4"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <Popover.Title className="text-sm font-medium">
                  {title}
                </Popover.Title>
                <Popover.Close
                  render={
                    <Button size="icon-sm" variant="ghost" aria-label="Close">
                      <X />
                    </Button>
                  }
                />
              </div>
              {children}
            </ScrollArea>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
