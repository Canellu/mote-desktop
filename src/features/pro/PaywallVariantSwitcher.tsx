import {
  PAYWALL_VARIANTS,
  usePaywallVariant,
} from "@/features/pro/proVariants";
import { useProUpgrade } from "@/features/pro/proUpgrade";
import { cn } from "@/lib/utils";

/**
 * Switches which paywall design is shown, and opens it.
 *
 * Development-only. A customer has no reason to choose a paywall, and shipping
 * the choice would mean shipping four designs to maintain forever. It exists so
 * the four can be compared in the real app rather than in screenshots; when one
 * wins, delete this, the variants that lost, and `proVariants.ts`.
 */
export const PaywallVariantSwitcher: React.FC<{ className?: string }> = ({
  className,
}) => {
  const { variant, setVariant } = usePaywallVariant();
  const { requestPro } = useProUpgrade();

  if (!import.meta.env.DEV) return null;

  // The title bar drags the window from its own mousedown, so every control
  // here has to stop the press or clicking throws the window across the screen.
  const stopDrag = {
    onMouseDown: (event: React.MouseEvent) => event.stopPropagation(),
    onPointerDown: (event: React.PointerEvent) => event.stopPropagation(),
  };

  return (
    <div
      {...stopDrag}
      role="group"
      aria-label="Paywall design"
      className={cn(
        // Centred absolutely, so on a narrow window it would sit on top of the
        // product name and the Get Pro action. Only shown when there is room.
        "hidden items-center overflow-hidden rounded-md border border-border/70 bg-background/60 lg:flex",
        className,
      )}
    >
      {PAYWALL_VARIANTS.map(({ id, label }) => {
        const active = id === variant;
        return (
          <button
            key={id}
            type="button"
            {...stopDrag}
            aria-pressed={active}
            title={`Show the ${label} paywall`}
            onClick={(event) => {
              event.stopPropagation();
              setVariant(id);
              // Selecting a design shows it. Comparing four of them by
              // switching and then reopening by hand gets old immediately.
              requestPro("general");
            }}
            className={cn(
              "px-2 py-0.5 text-[0.6875rem] leading-5 font-medium transition-colors",
              "outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              active
                ? "bg-foreground/10 text-foreground"
                : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
};
