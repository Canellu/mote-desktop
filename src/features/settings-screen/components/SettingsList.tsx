import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Children, Fragment } from "react";

export const SettingsStack = ({ children }: { children: React.ReactNode }) => (
  <div className="grid min-w-0 grid-cols-1 gap-10">{children}</div>
);

export const SettingsSection = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => {
  const rows = Children.toArray(children);

  return (
    <section className="grid grid-cols-1 gap-4">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {/* A row component can render nothing (the Store update row outside a
          Store install), which would leave its separator dangling. Hide any
          separator that no longer sits between two rows. */}
      <div className="grid min-w-0 grid-cols-1 gap-4 rounded-2xl bg-(--settings-surface) p-4 @3xl:p-5 [&>[data-slot=separator]:is(:first-child,:last-child,:has(+[data-slot=separator]))]:hidden">
        {rows.map((row, index) => (
          <Fragment key={`settings-row-${index}`}>
            {index > 0 && <Separator />}
            {row}
          </Fragment>
        ))}
      </div>
    </section>
  );
};

export const SettingsRow = ({
  title,
  description,
  alignControlWithDescription = false,
  keepControlInline = false,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  alignControlWithDescription?: boolean;
  keepControlInline?: boolean;
  children: React.ReactNode;
}) => (
  <div
    className={
      keepControlInline
        ? "grid min-h-14 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2"
        : // Wraps per row: the control drops below the text as soon as the text
          // would get narrower than its basis, however wide the control is.
          "flex min-h-14 min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-3"
    }
  >
    <div
      className={cn(
        "grid min-w-0 gap-1",
        !keepControlInline && "flex-1 basis-64",
      )}
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <div className="max-w-prose text-sm leading-5 text-muted-foreground">
          {description}
        </div>
      )}
    </div>
    <div
      className={cn(
        "flex min-w-0 max-w-full items-center",
        keepControlInline && "shrink-0 justify-end",
        // A wrapped control would otherwise start its own line at the left.
        !keepControlInline && "ml-auto",
        alignControlWithDescription && "self-end",
      )}
    >
      {children}
    </div>
  </div>
);
