"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cva, type VariantProps } from "class-variance-authority";
import { createContext, useContext } from "react";

import { cn } from "@/lib/utils";

type TabsOrientation = NonNullable<TabsPrimitive.Root.Props["orientation"]>;

const TabsOrientationContext =
  createContext<TabsOrientation>("horizontal");

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsOrientationContext.Provider value={orientation}>
      <TabsPrimitive.Root
        data-slot="tabs"
        data-orientation={orientation}
        className={cn("flex gap-2 data-horizontal:flex-col", className)}
        {...props}
      />
    </TabsOrientationContext.Provider>
  );
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-4xl text-muted-foreground data-[orientation=vertical]:h-fit data-[orientation=vertical]:flex-col data-[orientation=vertical]:rounded-2xl data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        // A faint hairline keeps the unselected track readable on any surface.
        default: "border border-foreground/10 bg-muted",
        line: "gap-1 bg-transparent",
      },
      size: {
        default: "p-[3px] data-[orientation=horizontal]:h-9",
        lg: "p-1 data-[orientation=horizontal]:h-10",
        xl: "rounded-3xl p-1 data-[orientation=horizontal]:h-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function TabsList({
  className,
  variant = "default",
  size = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  const orientation = useContext(TabsOrientationContext);

  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-orientation={orientation}
      data-variant={variant}
      data-size={size}
      className={cn(tabsListVariants({ variant, size }), className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  const orientation = useContext(TabsOrientationContext);

  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      data-orientation={orientation}
      className={cn(
        "relative inline-flex h-full flex-1 items-center justify-center gap-1.5 rounded-xl border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-[size=lg]/tabs-list:gap-1.5 group-data-[size=lg]/tabs-list:rounded-2xl group-data-[size=lg]/tabs-list:px-3 group-data-[size=lg]/tabs-list:pb-1.5 group-data-[size=lg]/tabs-list:text-[15px] group-data-[size=xl]/tabs-list:gap-2 group-data-[size=xl]/tabs-list:rounded-[1.25rem] group-data-[size=xl]/tabs-list:px-4 group-data-[size=xl]/tabs-list:text-base data-[orientation=vertical]:w-full data-[orientation=vertical]:justify-start data-[orientation=vertical]:px-2.5 data-[orientation=vertical]:py-1.5 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 group-data-[size=xl]/tabs-list:has-data-[icon=inline-end]:pr-3 group-data-[size=xl]/tabs-list:has-data-[icon=inline-start]:pl-3 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm dark:group-data-[variant=default]/tabs-list:data-active:shadow-none group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 group-data-[size=xl]/tabs-list:[&_svg:not([class*='size-'])]:size-5",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
        // In dark the selected pill takes a light tint: a background-colored fill
        // vanishes against the list there.
        "data-active:border-foreground/12 data-active:bg-background data-active:text-foreground dark:data-active:border-foreground/8 dark:data-active:bg-foreground/10 dark:data-active:text-foreground",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity data-[orientation=horizontal]:after:inset-x-0 data-[orientation=horizontal]:after:bottom-[-5px] data-[orientation=horizontal]:after:h-0.5 data-[orientation=vertical]:after:inset-y-0 data-[orientation=vertical]:after:-right-1 data-[orientation=vertical]:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
