import { useEntitlements } from "@/context/EntitlementContext";
import { cn } from "@/lib/utils";

/**
 * Gold, lit from above: a diagonal gradient for the metal, an inset white ring
 * and a specular band across the top for the shine.
 *
 * The light stays inside the pill. An outer glow only muddied the edge against
 * the translucent title bar, reading as a grey plate behind the badge rather
 * than as light coming off it.
 */
const proSurface = cn(
  "relative overflow-hidden rounded-full px-2.5 py-px text-[0.8125rem] leading-5 font-semibold tracking-tight",
  "text-amber-950",
  "bg-[linear-gradient(135deg,oklch(0.93_0.12_98)_0%,oklch(0.86_0.16_82)_42%,oklch(0.76_0.17_64)_100%)]",
  "ring-1 ring-white/45 ring-inset",
  // Specular band over the top half. A second diagonal sheen was tried here and
  // removed: at `-left-1/3 w-1/3` it resolved to the strip immediately left of
  // the pill, which `overflow-hidden` clipped away entirely, and the rotation
  // never applied either. It rendered nothing and only read as intent.
  "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-1/2",
  "before:bg-[linear-gradient(to_bottom,oklch(1_0_0/0.6),oklch(1_0_0/0))]",
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
        // A bare wrapper: no box of its own, so the pill is the only thing that
        // paints. Anything else here shows up as a plate behind the badge.
        "inline-flex appearance-none rounded-full border-0 bg-transparent p-0",
        "outline-none transition-[filter,opacity] duration-150",
        "focus-visible:ring-2 focus-visible:ring-ring/50",
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
