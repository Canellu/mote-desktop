import { Badge } from "@/components/ui/badge";
import { useEntitlements } from "@/context/EntitlementContext";
import { cn } from "@/lib/utils";

/**
 * Says which tier the running app is in.
 *
 * In a release build it is a plain badge that appears only once Pro is actually
 * owned, so it can never imply an entitlement the customer does not have. In a
 * development build it is always present and clickable, and toggling it swaps
 * the whole app between Free and Pro — the badge is the control, so the state
 * and the switch for it can never disagree.
 */
export const ProBadge: React.FC<{ className?: string }> = ({ className }) => {
  const { hasPro, setDebugPro } = useEntitlements();

  if (!setDebugPro) {
    if (!hasPro) return null;

    return <Badge className={cn("rounded-full px-2.5", className)}>Pro</Badge>;
  }

  return (
    <button
      type="button"
      onClick={() => void setDebugPro(!hasPro)}
      aria-pressed={hasPro}
      title={
        hasPro
          ? "Development build: Pro is on. Click for Free."
          : "Development build: Free tier. Click for Pro."
      }
      className={cn(
        "rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className,
      )}
    >
      <Badge
        variant={hasPro ? "default" : "outline"}
        className={cn(
          "rounded-full px-2.5 transition-colors",
          // Dashed while unentitled so a development build never looks like a
          // shipped Free app that happens to show a badge.
          !hasPro && "border-dashed text-muted-foreground",
        )}
      >
        {hasPro ? "Pro" : "Free"}
      </Badge>
    </button>
  );
};
