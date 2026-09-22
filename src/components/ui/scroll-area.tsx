import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";

import { cn } from "@/lib/utils";

function ScrollArea({
  className,
  viewportClassName,
  contentClassName,
  scrollbarClassName,
  viewportProps,
  children,
  fade = false,
  orientation = "vertical",
  hideScrollbar = false,
  viewportRef,
  ...props
}: ScrollAreaPrimitive.Root.Props & {
  /** Classes applied to the scrollable viewport (where the overflow lives). */
  viewportClassName?: string;
  /** Classes applied to the content wrapper inside the viewport. */
  contentClassName?: string;
  /** Classes applied to the rendered scrollbar. */
  scrollbarClassName?: string;
  /** Props applied to the scrollable viewport. */
  viewportProps?: Omit<
    ScrollAreaPrimitive.Viewport.Props,
    "children" | "className" | "ref"
  >;
  /** Ref to the scrollable viewport element (e.g. to reset scroll position). */
  viewportRef?: React.Ref<HTMLDivElement>;
  /**
   * Fade the content out at the scrollable edges with a gradient mask.
   * `true` fades vertical edges; use `"horizontal"` for left/right edges.
   */
  fade?: boolean | "top" | "bottom" | "left" | "right" | "horizontal";
  /** Which scrollbars to render. */
  orientation?: "vertical" | "horizontal" | "both";
  /** Hide the scrollbar(s) while keeping the content scrollable. */
  hideScrollbar?: boolean;
}) {
  const fadeTop = fade === true || fade === "top";
  const fadeBottom = fade === true || fade === "bottom";
  const fadeLeft = fade === "horizontal" || fade === "left";
  const fadeRight = fade === "horizontal" || fade === "right";
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("group/scroll-area relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        {...viewportProps}
        ref={viewportRef}
        data-slot="scroll-area-viewport"
        className={cn(
          "size-full rounded-[inherit] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          // Only contain overscroll on the axis we actually own so cross-axis
          // wheel events chain up to the page (e.g. vertical scroll over a
          // horizontal rail).
          orientation === "vertical" && "overscroll-y-contain",
          orientation === "horizontal" && "overscroll-x-contain",
          orientation === "both" && "overscroll-contain",
          // Only fades an edge once there's content to scroll toward, driven by
          // the Root's data-overflow-{x,y}-{start,end} attributes.
          (fadeTop || fadeBottom) &&
            "[--sa-fade:0px] [mask-image:linear-gradient(to_bottom,transparent,black_var(--sa-fade-top,var(--sa-fade)),black_calc(100%_-_var(--sa-fade-bottom,var(--sa-fade))),transparent)]",
          fadeTop &&
            "group-data-[overflow-y-start]/scroll-area:[--sa-fade-top:2rem]",
          fadeBottom &&
            "group-data-[overflow-y-end]/scroll-area:[--sa-fade-bottom:2rem]",
          (fadeLeft || fadeRight) &&
            "[--sa-fade:0px] [mask-image:linear-gradient(to_right,transparent,black_var(--sa-fade-left,var(--sa-fade)),black_calc(100%_-_var(--sa-fade-right,var(--sa-fade))),transparent)]",
          fadeLeft &&
            "group-data-[overflow-x-start]/scroll-area:[--sa-fade-left:2rem]",
          fadeRight &&
            "group-data-[overflow-x-end]/scroll-area:[--sa-fade-right:2rem]",
          viewportClassName,
        )}
      >
        {/*
         * Wrap children in Content so Base UI's ResizeObserver watches the
         * inner content, not just the viewport. The viewport keeps a fixed size
         * in flex/grid layouts, so without this the thumb size and overflow
         * state go stale whenever the content height changes without the
         * viewport resizing (e.g. swapping tabs inside a shared scroll area).
         */}
        <ScrollAreaPrimitive.Content className={contentClassName}>
          {children}
        </ScrollAreaPrimitive.Content>
      </ScrollAreaPrimitive.Viewport>
      {!hideScrollbar &&
        (orientation === "vertical" || orientation === "both") && (
          <ScrollAreaScrollbar
            orientation="vertical"
            className={scrollbarClassName}
          />
        )}
      {!hideScrollbar &&
        (orientation === "horizontal" || orientation === "both") && (
          <ScrollAreaScrollbar
            orientation="horizontal"
            className={scrollbarClassName}
          />
        )}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollAreaScrollbar({
  className,
  orientation = "vertical",
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        "z-10 flex touch-none select-none p-0.5 opacity-0 transition-opacity delay-300 group-hover/scroll-area:opacity-100 group-hover/scroll-area:delay-0 data-hovering:opacity-100 data-hovering:delay-0 data-scrolling:opacity-100 data-scrolling:delay-0",
        orientation === "vertical" && "h-full w-2.5",
        orientation === "horizontal" && "w-full flex-col-reverse h-2.5",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-border before:absolute before:inset-[-2px] before:content-['']"
      />
    </ScrollAreaPrimitive.Scrollbar>
  );
}

export { ScrollArea, ScrollAreaScrollbar };
