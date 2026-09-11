import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MessageSquareText, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useFeedbackPreferences } from "./preferences";

const MAX_MESSAGE_LENGTH = 1_200;

const feedbackCategories = {
  bug: "Report a bug",
  feature: "Suggest a feature",
  general: "General feedback",
} as const;

type FeedbackCategory = keyof typeof feedbackCategories;

const isFeedbackCategory = (value: string | null): value is FeedbackCategory =>
  value != null && value in feedbackCategories;

export const FeedbackButton = () => {
  const [preferences] = useFeedbackPreferences();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>("general");
  const [message, setMessage] = useState("");
  const submitFeedback = () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;

    // UI-only until the hosted feedback endpoint is connected.
    setOpen(false);
    setMessage("");
    toast.success("Thanks for your feedback");
  };

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
    <Dialog open={open} onOpenChange={setOpen}>
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

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>
            Tell us what happened or what would make Mote better.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="feedback-category">Feedback type</Label>
            <Select
              value={category}
              onValueChange={(value) => {
                if (isFeedbackCategory(value)) setCategory(value);
              }}
            >
              <SelectTrigger id="feedback-category" className="w-full">
                <SelectValue>{() => feedbackCategories[category]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(feedbackCategories).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="feedback-message">Your feedback</Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {message.length}/{MAX_MESSAGE_LENGTH}
              </span>
            </div>
            <textarea
              id="feedback-message"
              value={message}
              maxLength={MAX_MESSAGE_LENGTH}
              rows={7}
              placeholder="What should we know?"
              className="min-h-36 w-full resize-none rounded-2xl border border-foreground/12 bg-input/30 px-4 py-3 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:border-foreground/8"
              onChange={(event) => setMessage(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
          <Button
            type="button"
            disabled={!message.trim()}
            onClick={submitFeedback}
          >
            <Send />
            Send feedback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
