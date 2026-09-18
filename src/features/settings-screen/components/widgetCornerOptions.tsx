import type { WidgetCornerMode } from "@/features/widget-screen/types";
import type { SegmentIcon } from "./SegmentedControl";

/** A single corner drawn at a style's rounding, so each option shows its shape. */
const cornerIcon = (radius: number): SegmentIcon => {
  const arc = radius > 0 ? `A${radius} ${radius} 0 0 1 ${4 + radius} 4` : "";
  const CornerIcon = ({
    size = 17,
    className,
  }: {
    size?: number;
    className?: string;
  }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d={`M4 20V${4 + radius}${arc}H20`} />
    </svg>
  );
  return CornerIcon;
};

/**
 * The widget's corner styles, in order of roundness. A fixed set: the shell and
 * its cards were tuned to look right at each step, which a free value would not.
 */
export const WIDGET_CORNER_OPTIONS = [
  { value: "square", label: "Square", icon: cornerIcon(0) },
  { value: "soft", label: "Soft", icon: cornerIcon(4) },
  { value: "rounded", label: "Rounded", icon: cornerIcon(8) },
  { value: "round", label: "Round", icon: cornerIcon(13) },
] satisfies Array<{
  value: WidgetCornerMode;
  label: string;
  icon: SegmentIcon;
}>;
