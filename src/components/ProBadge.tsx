import { useEntitlements } from "@/context/EntitlementContext";
import { cn } from "@/lib/utils";

/**
 * Gold, lit from above. A flat fill read as a disabled chip next to the title
 * bar's muted text, so the tier mark carries its own light: a diagonal gradient
 * for the metal, an inset white ring and a specular band across the top for the
 * shine, and a warm outer glow so it lifts off the translucent bar rather than
 * sitting flush in it.
 */
const proSurface = cn(
  "relative overflow-hidden rounded-full px-2.5 py-px text-[0.8125rem] leading-5 font-semibold tracking-tight",
  "text-amber-950",
  "bg-[linear-gradient(135deg,oklch(0.93_0.12_98)_0%,oklch(0.86_0.16_82)_42%,oklch(0.76_0.17_64)_100%)]",
  "ring-1 ring-white/45 ring-inset",
  "shadow-[0_1px_2px_oklch(0.45_0.12_60/0.35),0_0_14px_-3px_oklch(0.82_0.18_72/0.85),0_0_26px_-8px_oklch(0.86_0.18_78/0.7)]",
  // Specular band over the top half, and a soft sheen sweeping the diagonal.
  "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-1/2",
  "before:bg-[linear-gradient(to_bottom,oklch(1_0_0/0.6),oklch(1_0_0/0))]",
  "after:pointer-events-none after:absolute after:-inset-y-2 after:-left-1/3 after:w-1/3 after:-rotate-12",
  "after:bg-[linear-gradient(to_right,oklch(1_0_0/0),oklch(1_0_0/0.55),oklch(1_0_0/0))]",
);

/** Unentitled, and only ever seen in a development build. */
const freeSurface = cn(
  "rounded-full border border-dashed border-muted-foreground/50 px-2.5 py-px",
  "text-[0.8125rem] leading-5 font-medium tracking-tight text-muted-foreground",
);

/**
 * Says which tier the running app is in, beside the product name.
 *
 * In a release build it is inert and appears only once Pro is actually owned, so
 * it can never imply an entitlement the customer does not have. In development
 * it is always present and clicking it swaps the whole app between Free and Pro
 * — the mark is the switch, so the state and the control for it cannot disagree.
 */
export const ProBadge: React.FC<{ className?: string }> = ({ className }) => {
  const { hasPro, setDebugPro } = useEntitlements();

  if (!setDebugPro) {
    if (!hasPro) return null;

    return <span className={cn(proSurface, className)}>Pro</span>;
  }

  return (
    <button
      type="button"
      // The title bar drags the window from its own mousedown, so the press has
      // to stop here or every click on the badge throws the window across the
      // desktop instead of toggling the tier.
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        void setDebugPro(!hasPro);
      }}
      aria-pressed={hasPro}
      title={
        hasPro
          ? "Development build: Pro is on. Click for Free."
          : "Development build: Free tier. Click for Pro."
      }
      className={cn(
        "rounded-full outline-none transition-[filter,opacity] duration-150",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50",
        hasPro ? "hover:brightness-[1.06]" : "opacity-80 hover:opacity-100",
        className,
      )}
    >
      <span className={hasPro ? proSurface : freeSurface}>
        {hasPro ? "Pro" : "Free"}
      </span>
    </button>
  );
};
