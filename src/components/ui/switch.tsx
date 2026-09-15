import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "@/lib/utils";

function Switch({
  className,
  size = "default",
  dimWhenDisabled = true,
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default" | "lg" | "xl";
  dimWhenDisabled?: boolean;
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center rounded-full border border-transparent transition-all outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 data-[size=default]:h-[18.4px] data-[size=default]:w-[32px] data-[size=sm]:h-[14px] data-[size=sm]:w-[24px] data-[size=lg]:h-6 data-[size=lg]:w-11 data-[size=xl]:h-7 data-[size=xl]:w-[52px] dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:bg-muted-foreground data-unchecked:bg-input dark:data-unchecked:bg-input/80 data-disabled:cursor-not-allowed",
        dimWhenDisabled && "data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full bg-background ring-0 transition-transform group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 group-data-[size=lg]/switch:size-5 group-data-[size=xl]/switch:size-6 group-data-[size=default]/switch:data-checked:translate-x-[calc(100%-2px)] group-data-[size=sm]/switch:data-checked:translate-x-[calc(100%-2px)] group-data-[size=lg]/switch:data-checked:translate-x-[22px] group-data-[size=xl]/switch:data-checked:translate-x-[26px] group-data-[size=default]/switch:data-unchecked:translate-x-0 group-data-[size=sm]/switch:data-unchecked:translate-x-0 group-data-[size=lg]/switch:data-unchecked:translate-x-0 group-data-[size=xl]/switch:data-unchecked:translate-x-0 dark:data-unchecked:bg-muted-foreground"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
