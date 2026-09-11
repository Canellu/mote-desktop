import { useEntitlements } from "@/context/EntitlementContext";
import { useProUpgrade } from "@/features/pro/proUpgrade";
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

/**
 * The Free mark, and next to it the way out of it.
 *
 * Deliberately not muted. A tier badge nobody notices sells nothing, so "Free"
 * stays quiet and readable while "Get Pro" is given the accent colour, an
 * underline on hover, and a real hit area. It is the only place in the chrome
 * that asks for money, so it should look like something you may click, not like
 * a disabled label.
 */
const freeSurface = cn(
  "rounded-full border px-2.5 py-px",
  "border-foreground/15 bg-foreground/5",
  "text-[0.8125rem] leading-5 font-medium tracking-tight text-foreground/70",
);

/**
 * Says which tier the running app is in, beside the product name.
 *
 * On Free it also carries the upgrade path. On Pro it is just the mark. In a
 * development build the mark itself toggles the tier, so both states can be
 * seen without a Store purchase.
 */
export const ProBadge: React.FC<{ className?: string }> = ({ className }) => {
  const { hasPro, setDebugPro } = useEntitlements();
  const { requestPro } = useProUpgrade();

  // The title bar starts a window drag from its own mousedown, so every control
  // here has to stop the press or clicking it throws the window across the
  // desktop instead of doing its job.
  const stopDrag = {
    onMouseDown: (event: React.MouseEvent) => event.stopPropagation(),
    onPointerDown: (event: React.PointerEvent) => event.stopPropagation(),
  };

  const mark = hasPro ? (
    <span className={proSurface}>Pro</span>
  ) : (
    <span className={freeSurface}>Free</span>
  );

  return (
    <span className={cn("flex items-center gap-2", className)}>
      {setDebugPro ? (
        <button
          type="button"
          {...stopDrag}
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
            // A bare wrapper: no box of its own, so the pill is the only thing
            // that paints. Anything else here shows up as a plate behind it.
            "inline-flex appearance-none rounded-full border-0 bg-transparent p-0",
            "outline-none transition-[filter] duration-150",
            "focus-visible:ring-2 focus-visible:ring-ring/50",
            "hover:brightness-[1.06]",
          )}
        >
          {mark}
        </button>
      ) : (
        mark
      )}

      {!hasPro && (
        <button
          type="button"
          {...stopDrag}
          onClick={(event) => {
            event.stopPropagation();
            requestPro("general");
          }}
          className={cn(
            "rounded-md px-1 py-0.5 text-[0.8125rem] leading-5 font-semibold",
            "text-primary underline-offset-4 hover:underline",
            "outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          )}
        >
          Get Pro
        </button>
      )}
    </span>
  );
};
