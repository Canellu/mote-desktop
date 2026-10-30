import { MASCOT_STYLES, mascotSrc } from "@/features/widget-screen/mascot";
import type { WidgetMascotStyle } from "@/features/widget-screen/types";
import { cn } from "@/lib/utils";

/** The Mascot option's icon in the collapsed-look control: the moth itself. */
export const MothIcon = ({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) => (
  <img
    src={mascotSrc("celShaded")}
    alt=""
    draggable={false}
    width={size}
    height={size}
    className={cn("object-contain", className)}
  />
);

/** Picks which drawing of the moth a widget collapses into. */
export const MascotStylePicker = ({
  value,
  onValueChange,
}: {
  value: WidgetMascotStyle;
  onValueChange: (value: WidgetMascotStyle) => void;
}) => (
  <div
    role="radiogroup"
    aria-label="Mascot style"
    className="flex flex-wrap gap-2"
  >
    {MASCOT_STYLES.map((style) => {
      const selected = style.value === value;
      return (
        <button
          key={style.value}
          type="button"
          role="radio"
          aria-checked={selected}
          className={cn(
            "flex w-20 flex-col items-center gap-1 rounded-xl border px-1 pt-2 pb-1.5 transition-colors",
            selected
              ? "border-primary bg-primary/10"
              : "border-border/60 hover:bg-muted",
          )}
          onClick={() => onValueChange(style.value)}
        >
          <img
            src={style.src}
            alt=""
            draggable={false}
            className="size-14 object-contain"
          />
          <span
            className={cn(
              "text-xs",
              selected
                ? "font-medium text-foreground"
                : "text-muted-foreground",
            )}
          >
            {style.label}
          </span>
        </button>
      );
    })}
  </div>
);
