import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  getLightIcon,
  LIGHT_ICON_OPTIONS,
} from "@/features/space-screen/utils/light-icons";
import { CONTROL_SURFACE_CLASS } from "@/lib/control-surface";
import { selectableVariants } from "@/lib/selection-styles";
import { cn } from "@/lib/utils";
import { Lightbulb, Pencil, type LucideIcon } from "lucide-react";
import { useState } from "react";

const MAX_NAME_LENGTH = 32;

const labelFromHueId = (id: string) =>
  id
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

/**
 * The top of a light's details, laid out like the light side pane's editor: a
 * large icon tile that opens the icon picker, and the name with a pencil that
 * turns it into a field. Both only change the draft; the panel's Save writes
 * them, so a rename needs no buttons of its own.
 */
export const LightHero = ({
  icon,
  fallbackIcon,
  name,
  disabled,
  onIconChange,
  onNameChange,
}: {
  /** The chosen archetype, or "" when there is none or the lights disagree. */
  icon: string;
  /** Shown when there is no single icon, such as a fixture of mixed lights. */
  fallbackIcon?: LucideIcon;
  name: string;
  disabled?: boolean;
  /** Without it the icon is shown but can't be changed. */
  onIconChange?: (icon: string) => void;
  /** Without it the name is shown but can't be changed. */
  onNameChange?: (name: string) => void;
}) => {
  const [renaming, setRenaming] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const Icon = icon ? getLightIcon(icon) : (fallbackIcon ?? Lightbulb);
  const options =
    !icon || LIGHT_ICON_OPTIONS.some((option) => option.value === icon)
      ? LIGHT_ICON_OPTIONS
      : [
          { value: icon, label: labelFromHueId(icon), Icon: Lightbulb },
          ...LIGHT_ICON_OPTIONS,
        ];

  return (
    <div className="flex flex-col items-center gap-3 pt-1">
      <button
        type="button"
        disabled={disabled || !onIconChange}
        onClick={() => setPickerOpen(true)}
        aria-label={onIconChange ? "Choose icon" : undefined}
        title={onIconChange ? "Choose icon" : undefined}
        className={cn(
          // The fields' surface, so the tile reads as something to press.
          "flex size-16 items-center justify-center rounded-2xl text-foreground transition-[background-color,box-shadow] focus-visible:outline-none disabled:pointer-events-none",
          CONTROL_SURFACE_CLASS,
          // Changeable: it rings on hover and focus.
          onIconChange &&
            "hover:ring-2 hover:ring-ring/50 focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <Icon size={32} strokeWidth={2.25} />
      </button>

      {renaming && onNameChange ? (
        <div className="flex w-full flex-col items-center gap-1">
          <Input
            autoFocus
            size="lg"
            value={name}
            maxLength={MAX_NAME_LENGTH}
            disabled={disabled}
            aria-label="Name"
            className="max-w-full text-center font-heading text-lg font-medium"
            onChange={(event) => onNameChange(event.target.value)}
            onFocus={(event) => event.target.select()}
            onBlur={() => setRenaming(false)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "Escape") {
                // Escape only leaves the field; the panel stays open.
                event.preventDefault();
                event.stopPropagation();
                setRenaming(false);
              }
            }}
          />
          <span className="text-xs text-muted-foreground tabular-nums">
            {name.length}/{MAX_NAME_LENGTH}
          </span>
        </div>
      ) : onNameChange ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setRenaming(true)}
          title="Rename"
          className="flex max-w-full items-center gap-1.5 rounded-md px-2 py-0.5 text-center font-heading text-lg font-medium text-foreground hover:bg-muted disabled:opacity-50"
        >
          <span className="truncate">{name || "Unnamed"}</span>
          <Pencil className="size-4 shrink-0 text-muted-foreground" />
        </button>
      ) : (
        <p className="max-w-full truncate px-2 py-0.5 font-heading text-lg font-medium">
          {name}
        </p>
      )}

      {onIconChange && (
        <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Choose icon</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onIconChange(option.value);
                    setPickerOpen(false);
                  }}
                  data-selected={option.value === icon ? "" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-2xl p-3 text-center text-xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    selectableVariants(),
                    option.value === icon && "text-foreground",
                  )}
                >
                  <option.Icon size={26} className="text-foreground" />
                  {option.label}
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
