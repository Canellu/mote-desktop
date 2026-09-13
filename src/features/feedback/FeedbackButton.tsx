import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MessageSquareText } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { FeedbackDialog } from "./FeedbackDialog";
import { useFeedbackPreferences } from "./preferences";

export const FeedbackButton = () => {
  const [preferences] = useFeedbackPreferences();
  const [open, setOpen] = useState(false);

  // Hiding this button hides one entry point, not the feature: Settings ->
  // Help and legal keeps its own "Send feedback" row.
  if (preferences.buttonMode === "hidden") return null;

  // Lives in the title bar, so it never floats over a full-bleed workspace.
  const trigger = (
    <button
      type="button"
      aria-label="Send feedback"
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        setOpen(true);
      }}
      className={cn(
        "flex h-full items-center justify-center gap-1.5 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground dark:hover:bg-foreground/10",
        preferences.buttonMode === "icon" ? "aspect-square" : "px-3 text-xs",
      )}
    >
      <MessageSquareText size={16} strokeWidth={2.2} />
      {preferences.buttonMode === "full" && "Feedback"}
    </button>
  );

  return (
    <FeedbackDialog open={open} onOpenChange={setOpen}>
      {preferences.buttonMode === "icon" ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger render={trigger} />
            <TooltipContent side="bottom">Send feedback</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        trigger
      )}
    </FeedbackDialog>
  );
};
