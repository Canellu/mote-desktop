import { Popover } from "@base-ui/react/popover";
import { Clock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CONTROL_SURFACE_CLASS } from "@/lib/control-surface";
import { cn } from "@/lib/utils";
import {
  formatClock,
  useFormatPreferences,
} from "@/stores/FormatPreferencesStore";

const MINUTE_STEP = 5;

const parse = (value: string) => {
  const [hour = 0, minute = 0] = value.split(":").map(Number);
  return { hour, minute };
};

const toValue = (hour: number, minute: number) =>
  `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

/** One scrolling column of choices; the chosen one scrolls into view. */
const Column = ({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: Array<{ value: number; label: string }>;
  selected: number;
  onSelect: (value: number) => void;
}) => {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current
      ?.querySelector("[data-selected]")
      ?.scrollIntoView({ block: "center" });
  }, []);
  return (
    <ScrollArea
      fade
      hideScrollbar
      className="w-16"
      viewportClassName="max-h-56"
    >
      <div
        ref={list}
        role="listbox"
        aria-label={label}
        className="grid gap-0.5 p-1"
      >
        {options.map((option) => {
          const active = option.value === selected;
          return (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={active}
              data-selected={active ? "" : undefined}
              onClick={() => onSelect(option.value)}
              className={cn(
                "h-8 rounded-lg text-sm tabular-nums transition-colors hover:bg-foreground/8",
                active &&
                  "bg-foreground/12 font-semibold hover:bg-foreground/12",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
};

/**
 * A time of day, picked from hour and minute columns in the app's 12- or
 * 24-hour format. The value is always "HH:MM" on a 24-hour clock.
 */
export const TimeField = ({
  value,
  onChange,
  disabled,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
}) => {
  const format = useFormatPreferences((state) => state.timeFormat);
  const [open, setOpen] = useState(false);
  const { hour, minute } = parse(value);
  const twelve = format === "12h";
  const pm = hour >= 12;

  const hours = twelve
    ? Array.from({ length: 12 }, (_, i) => ({
        value: i === 0 ? 12 : i,
        label: String(i === 0 ? 12 : i),
      }))
    : Array.from({ length: 24 }, (_, i) => ({
        value: i,
        label: String(i).padStart(2, "0"),
      }));
  // Five-minute steps, plus the current minute when it falls between them.
  const minuteValues = Array.from(
    { length: 60 / MINUTE_STEP },
    (_, i) => i * MINUTE_STEP,
  );
  if (!minuteValues.includes(minute)) {
    minuteValues.push(minute);
    minuteValues.sort((a, b) => a - b);
  }
  const minutes = minuteValues.map((value) => ({
    value,
    label: String(value).padStart(2, "0"),
  }));

  const shownHour = twelve ? (hour % 12 === 0 ? 12 : hour % 12) : hour;
  const setHour = (next: number) =>
    onChange(toValue(twelve ? (next % 12) + (pm ? 12 : 0) : next, minute));
  const setPeriod = (afternoon: boolean) =>
    onChange(toValue((hour % 12) + (afternoon ? 12 : 0), minute));

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        disabled={disabled}
        aria-label={`${ariaLabel}: ${formatClock(hour, minute, format)}`}
        className={cn(
          "flex h-9 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-medium tabular-nums whitespace-nowrap outline-none transition-colors hover:bg-foreground/5 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-popup-open:ring-[3px] data-popup-open:ring-ring/50",
          CONTROL_SURFACE_CLASS,
          className,
        )}
      >
        {formatClock(hour, minute, format)}
        <Clock className="size-3.5 text-muted-foreground" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="start"
          sideOffset={6}
          className="z-50"
        >
          <Popover.Popup className="flex origin-(--transform-origin) gap-1 rounded-2xl bg-popover p-1 text-popover-foreground shadow-2xl ring-1 ring-foreground/5 outline-none dark:ring-foreground/10">
            <Column
              label="Hour"
              options={hours}
              selected={shownHour}
              onSelect={setHour}
            />
            <Column
              label="Minute"
              options={minutes}
              selected={minute}
              onSelect={(next) => onChange(toValue(hour, next))}
            />
            {twelve && (
              <div
                role="listbox"
                aria-label="AM or PM"
                className="grid content-start gap-0.5 p-1"
              >
                {(["AM", "PM"] as const).map((period) => {
                  const active = (period === "PM") === pm;
                  return (
                    <button
                      key={period}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => setPeriod(period === "PM")}
                      className={cn(
                        "h-8 w-14 rounded-lg text-sm transition-colors hover:bg-foreground/8",
                        active &&
                          "bg-foreground/12 font-semibold hover:bg-foreground/12",
                      )}
                    >
                      {period}
                    </button>
                  );
                })}
              </div>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
};
