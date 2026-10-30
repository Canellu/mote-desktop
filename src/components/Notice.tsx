import { cn } from "@/lib/utils";
import {
  CircleCheck,
  Info,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

const TONES = {
  info: { className: "bg-(--info-surface) text-(--info-text)", icon: Info },
  warn: {
    className: "bg-(--warn-surface) text-(--warn-text)",
    icon: TriangleAlert,
  },
  success: {
    className: "bg-(--success-surface) text-(--success-text)",
    icon: CircleCheck,
  },
} satisfies Record<string, { className: string; icon: LucideIcon }>;

/**
 * A note in one of the status colours: the opaque `--{tone}-surface` with its
 * same-hue `--{tone}-text`, set for both themes in App.css, and the tone's
 * icon unless another is given.
 */
export const Notice = ({
  tone = "info",
  icon,
  className,
  children,
}: {
  tone?: keyof typeof TONES;
  icon?: LucideIcon;
  className?: string;
  children: React.ReactNode;
}) => {
  const Icon = icon ?? TONES[tone].icon;
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-2xl p-4 text-sm",
        TONES[tone].className,
        className,
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
};
