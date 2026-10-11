import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { TriangleAlert } from "lucide-react";

const EXPLANATION =
  "The bridge hasn't heard back from this light, so its state may be out of date. Hue sometimes reports a working light this way, so the controls stay on. If nothing happens, check that it's powered at the wall switch.";

/** "Unreachable" with a hover explanation; the light stays controllable. */
export const UnreachableHint: React.FC<{ className?: string }> = ({
  className,
}) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            role="status"
            className={cn(
              "inline-flex items-center gap-1 text-sm text-muted-foreground",
              className,
            )}
          >
            <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">Unreachable</span>
          </span>
        }
      />
      <TooltipContent side="top" className="max-w-64">
        {EXPLANATION}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);
