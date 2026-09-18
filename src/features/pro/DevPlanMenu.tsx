import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useEntitlements,
  type DebugTier,
  type EntitlementSnapshot,
} from "@/context/EntitlementContext";
import {
  markTrialWelcomeSeen,
  TRIAL_REMINDER_DAYS,
} from "@/features/pro/trial";
import { cn } from "@/lib/utils";
import { ChevronDown, FlaskConical, Sparkles } from "lucide-react";

/** The states somebody can be in, in the order they meet them. */
const STATES: { tier: DebugTier; label: string }[] = [
  { tier: "free", label: "Free, before pairing" },
  { tier: "trial", label: "Pro trial" },
  { tier: "trial_ending", label: "Pro trial, 3 days left" },
  { tier: "trial_ended", label: "Free, after the trial" },
  { tier: "pro", label: "Pro, bought" },
];

// The title bar starts a window drag from its own mousedown, and React carries
// a press inside the menu's portal up to it, so the menu stops it here too.
const stopDrag = (event: React.MouseEvent) => event.stopPropagation();

/**
 * Development only: puts the app in each plan state, beside the badge that
 * shows it.
 *
 * Every override starts a new trial, and a new trial opens its welcome. So the
 * first launch is simply a trial left to do that, and "Pro trial" marks the
 * welcome seen to show the trial as somebody days into it has it.
 */
export const DevPlanMenu: React.FC<{
  setDebugTier: (tier: DebugTier) => Promise<EntitlementSnapshot | null>;
}> = ({ setDebugTier }) => {
  const { hasPro, onTrial, trialDaysLeft, trialEnded } = useEntitlements();

  const current: DebugTier =
    hasPro && !onTrial
      ? "pro"
      : onTrial
        ? (trialDaysLeft ?? 0) <= Math.max(...TRIAL_REMINDER_DAYS)
          ? "trial_ending"
          : "trial"
        : trialEnded
          ? "trial_ended"
          : "free";

  const enter = async (tier: DebugTier) => {
    const next = await setDebugTier(tier);
    if (tier === "trial" && next?.trial) {
      markTrialWelcomeSeen(next.trial.startedAt);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            onMouseDown={stopDrag}
            title="Development only: switch the plan state"
            className={cn(
              "flex h-6 items-center gap-1 rounded-full border border-dashed px-2",
              "border-foreground/25 text-[0.6875rem] font-medium text-muted-foreground",
              "outline-none transition-colors hover:border-foreground/45 hover:text-foreground",
              "focus-visible:ring-2 focus-visible:ring-ring/50",
            )}
          />
        }
      >
        <FlaskConical size={12} aria-hidden />
        Plan
        <ChevronDown size={12} aria-hidden />
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-64" onMouseDown={stopDrag}>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Plan state · development only</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => void setDebugTier("trial")}>
            <Sparkles />
            <span className="grid">
              First launch
              <span className="text-xs text-muted-foreground">
                A new trial; the welcome opens from the badge
              </span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuRadioGroup
          value={current}
          onValueChange={(tier) => void enter(tier as DebugTier)}
        >
          {STATES.map(({ tier, label }) => (
            <DropdownMenuRadioItem key={tier} value={tier}>
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
