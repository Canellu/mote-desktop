import { cn } from "@/lib/utils";

/**
 * Marks a single option that needs Mote Pro. The option stays clickable and
 * opens the purchase dialog instead of applying, as the dashboard's custom
 * layout does, so the tag only says why.
 */
export const ProTag = ({ className }: { className?: string }) => (
  <span
    className={cn(
      "inline-flex shrink-0 items-center rounded-full border border-primary/30 bg-primary/10 px-1.5 text-[10px] leading-4 font-semibold tracking-wide text-primary uppercase",
      className,
    )}
  >
    Pro
  </span>
);
