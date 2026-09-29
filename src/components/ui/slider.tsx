import { Slider as SliderPrimitive } from "@base-ui/react/slider";

import { cn } from "@/lib/utils";

type SliderStyle = React.CSSProperties & {
  "--slider-thumb-size"?: string;
  "--slider-track-size"?: string;
};

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  size = "default",
  dimWhenDisabled = true,
  style,
  // Base UI reads the accessible name from the thumb's hidden input, not the
  // root, so route aria-label to every thumb.
  "aria-label": ariaLabel,
  ...props
}: SliderPrimitive.Root.Props & {
  size?: "default" | "lg" | "xl";
  dimWhenDisabled?: boolean;
}) {
  const _values = Array.isArray(value)
    ? value
    : Array.isArray(defaultValue)
      ? defaultValue
      : [min, max];

  return (
    <SliderPrimitive.Root
      className={cn(
        // The track is a translucent foreground tint, not a solid token, so it
        // reads a step darker (light) or lighter (dark) than whatever surface
        // the slider sits on. A solid --muted vanished on light cards.
        "group/slider data-horizontal:w-full data-vertical:h-full [--slider-default-range-background:color-mix(in_oklch,var(--foreground)_35%,transparent)] [--slider-default-track-background:color-mix(in_oklch,var(--foreground)_10%,transparent)] dark:[--slider-default-range-background:color-mix(in_oklch,var(--foreground)_25%,transparent)] dark:[--slider-default-track-background:color-mix(in_oklch,var(--foreground)_12%,transparent)]",
        className,
      )}
      data-slot="slider"
      data-size={size}
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      style={
        {
          "--slider-thumb-size":
            size === "xl" ? "1.5rem" : size === "lg" ? "1.25rem" : "1rem",
          "--slider-track-size":
            size === "xl" ? "1.25rem" : size === "lg" ? "1rem" : "0.75rem",
          ...style,
        } as SliderStyle
      }
      {...props}
    >
      <SliderPrimitive.Control
        className={cn(
          "relative flex w-full touch-none items-center select-none data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col",
          dimWhenDisabled && "data-disabled:opacity-50",
        )}
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative grow overflow-hidden rounded-4xl select-none data-horizontal:h-[var(--slider-track-size)] data-horizontal:w-full data-vertical:h-full data-vertical:w-[var(--slider-track-size)]"
          style={{
            background:
              "var(--slider-track-background,var(--slider-default-track-background))",
          }}
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="transition-[inset-inline-start,inset-inline-end,left,right,width,transform,translate] duration-[var(--paced-ease,0ms)] ease-out select-none data-horizontal:h-full data-vertical:w-full"
            style={{
              background:
                "var(--slider-range-background,var(--slider-default-range-background))",
              backgroundSize: "var(--slider-range-background-size,auto)",
            }}
          />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            aria-label={ariaLabel}
            className={cn(
              "block size-[var(--slider-thumb-size)] shrink-0 rounded-4xl border border-foreground/30 bg-background shadow-sm ring-ring/50 transition-[color,background-color,border-color,inset-inline-start,inset-inline-end,left,right,width,transform,translate] duration-[var(--paced-ease,0ms)] ease-out select-none hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden disabled:pointer-events-none dark:border-foreground/25",
              dimWhenDisabled && "disabled:opacity-50",
            )}
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
