import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const inputVariants = cva(
  "w-full min-w-0 rounded-4xl border border-foreground/12 bg-input/30 transition-colors dark:border-foreground/8 outline-none file:inline-flex file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-[3px] aria-invalid:ring-(--destructive) data-success:ring-[3px] data-success:ring-(--success)",
  {
    variants: {
      size: {
        // One size at every width: the mobile-browser 16px (which stops iOS
        // zooming into a field) only made the text jump in a desktop window.
        default: "h-9 px-3 py-1 text-sm file:h-7",
        lg: "h-10 px-4 py-1.5 text-base file:h-8",
        xl: "h-12 px-5 py-2 text-base file:h-9",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

function Input({
  className,
  type,
  size = "default",
  ...props
}: Omit<React.ComponentProps<"input">, "size"> &
  VariantProps<typeof inputVariants>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(inputVariants({ size }), className)}
      {...props}
    />
  );
}

export { Input, inputVariants };
