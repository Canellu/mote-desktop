import { cn } from "@/lib/utils";

export const Panel = ({
  title,
  action,
  children,
  className,
  contentClassName,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) => (
  <section className={cn("space-y-3", className)}>
    <div className="flex items-start justify-between gap-2">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {action}
    </div>
    <div
      className={cn(
        "rounded-2xl bg-(--settings-surface) p-5",
        contentClassName,
      )}
    >
      {children}
    </div>
  </section>
);
