import { cn } from "@/lib/utils";
import type { ReactNode, Ref } from "react";

/**
 * The buy button, which is deliberately not the ordinary Button.
 *
 * The one control in the app asking for money, so it gets a warm gradient, a
 * sheen swept across on hover, a lift, and a real press. The sheen is a
 * translated pseudo-element rather than an animated gradient because transform
 * is the only property here the compositor can run without repainting the
 * button on every frame.
 *
 * Its geometry is worth leaving alone: the sheen parks at `-left-full` and
 * travels 300%, which sweeps a button of any width. An earlier attempt at the
 * same effect on the tier badge resolved entirely off-canvas and drew nothing.
 */
export const BuyButton: React.FC<{
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
}> = ({ children, onClick, disabled, className, ref }) => (
  <button
    ref={ref}
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "group relative isolate overflow-hidden rounded-2xl px-8 py-3.5",
      "text-base font-semibold tracking-tight text-amber-950",
      "bg-[linear-gradient(110deg,oklch(0.88_0.15_86)_0%,oklch(0.82_0.19_58)_45%,oklch(0.75_0.20_28)_100%)]",
      "shadow-[0_10px_30px_-12px_oklch(0.72_0.19_50/0.9),inset_0_1px_0_oklch(1_0_0/0.45)]",
      // Tailwind v4 lifts and presses through the `translate` and `scale`
      // properties rather than `transform`, so both must be listed or they jump
      // while the sheen glides. The lift shares the sheen's curve and settles as
      // it crosses; the press alone stays quick, so a click still feels instant.
      "transition-[translate,scale,box-shadow,filter] duration-500 ease-out",
      "hover:-translate-y-0.5 hover:brightness-[1.04]",
      "hover:shadow-[0_16px_38px_-12px_oklch(0.72_0.19_50/0.95),inset_0_1px_0_oklch(1_0_0/0.55)]",
      "active:translate-y-0 active:scale-[0.985] active:brightness-[0.98] active:duration-100",
      "outline-none focus-visible:ring-2 focus-visible:ring-white/70",
      "disabled:pointer-events-none disabled:opacity-60",
      "before:pointer-events-none before:absolute before:inset-y-0 before:-left-full before:w-1/2 before:-skew-x-12",
      "before:bg-[linear-gradient(to_right,transparent,oklch(1_0_0/0.55),transparent)]",
      "before:transition-transform before:duration-700 before:ease-out",
      "group-hover:before:translate-x-[300%] hover:before:translate-x-[300%]",
      "motion-reduce:transition-none motion-reduce:before:hidden motion-reduce:hover:translate-y-0",
      className,
    )}
  >
    <span className="relative z-10">{children}</span>
  </button>
);
