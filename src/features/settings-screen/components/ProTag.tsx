import { useEntitlements } from "@/context/EntitlementContext";
import { cn } from "@/lib/utils";

/**
 * Marks something that needs Mote Pro. On Free the option stays clickable and
 * opens the purchase dialog instead of applying, as the dashboard's custom
 * layout does, so the tag only says why. On a trial the option works and the
 * tag says what goes when the trial ends. Once Pro is bought there is nothing
 * left to say, and it renders nothing.
 */
export const ProTag = ({ className }: { className?: string }) => {
  const { purchased } = useEntitlements();
  if (purchased) return null;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border border-primary/30 bg-primary/10 px-1.5 text-[10px] leading-4 font-semibold tracking-wide text-primary uppercase",
        className,
      )}
    >
      Pro
    </span>
  );
};
