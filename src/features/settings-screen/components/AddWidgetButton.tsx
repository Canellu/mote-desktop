import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus } from "lucide-react";
import { ProTag } from "./ProTag";

/**
 * Header action for the Widget tab. Mirrors {@link AddDevicesButton}: it always
 * keeps its label and shows a transient "Opening..." state while a new widget
 * window is being spawned. `pro` marks it once Free's one widget exists.
 */
export const AddWidgetButton = ({
  loading,
  disabled,
  disabledReason,
  pro,
  onClick,
}: {
  loading?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  pro?: boolean;
  onClick: () => void;
}) => {
  const button = (
    <Button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      className="shrink-0"
    >
      <Plus size={16} />
      {loading ? "Opening..." : "Add widget"}
      {/* The button is filled with the primary colour the tag normally uses. */}
      {pro ? (
        <ProTag className="border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground" />
      ) : null}
    </Button>
  );

  if (!disabled || !disabledReason) return button;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={<span className="inline-flex">{button}</span>}
        />
        <TooltipContent side="bottom" align="end" className="max-w-64">
          {disabledReason}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
