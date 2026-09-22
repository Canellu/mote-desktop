import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, ChevronLeft } from "lucide-react";

export interface WizardFinalAction {
  label: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}

export const SettingsWizardLayout = ({
  steps,
  step,
  maxUnlockedStep,
  stepsDone,
  stepsClassName,
  className,
  fixedChrome = false,
  onStepChange,
  canContinue,
  onContinue,
  finalAction,
  onCancel,
  children,
}: {
  steps: readonly string[];
  step: number;
  maxUnlockedStep: number;
  /**
   * Whether each step has what it needs. Given, every step is reachable and
   * the row says which are settled rather than which have been visited —
   * for wizards whose steps do not depend on each other.
   */
  stepsDone?: readonly boolean[];
  /** Narrows the step row against the content, e.g. "max-w-xl". */
  stepsClassName?: string;
  /** Overrides the outer wizard shell without changing its inner content width. */
  className?: string;
  /** Pins the stepper and actions over a full-height scrolling child. */
  fixedChrome?: boolean;
  onStepChange: (step: number) => void;
  canContinue: boolean;
  onContinue: () => void;
  finalAction: WizardFinalAction;
  onCancel?: () => void;
  children: React.ReactNode;
}) => (
  <div
    className={cn(
      "mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col text-foreground",
      fixedChrome && "relative",
      className,
    )}
  >
    <header
      className={cn(
        "w-full shrink-0",
        fixedChrome && "absolute inset-x-0 top-0 z-20 bg-background",
      )}
    >
      <div
        className={cn(
          "mx-auto w-full pt-2 pb-8",
          fixedChrome && "pt-8",
          stepsClassName ?? "max-w-2xl",
        )}
      >
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
          }}
        >
          {steps.map((label, index) => {
            const active = index === step;
            const done = stepsDone?.[index] ?? index <= maxUnlockedStep;
            const clickable = stepsDone ? true : index <= maxUnlockedStep;
            return (
              <button
                key={label}
                type="button"
                disabled={!clickable}
                aria-current={active ? "step" : undefined}
                onClick={() => onStepChange(index)}
                className={cn(
                  "group flex flex-col items-center gap-2 text-center",
                  clickable ? "cursor-pointer" : "cursor-default",
                )}
              >
                <span
                  className={cn(
                    "flex min-w-0 max-w-full items-center gap-1.5 text-xs transition-colors",
                    active
                      ? "font-semibold text-primary"
                      : done
                        ? "font-medium text-foreground/80"
                        : "font-medium text-muted-foreground",
                    clickable && !active && "group-hover:text-foreground",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-full transition-colors",
                      active
                        ? "bg-primary/15 ring-1 ring-primary/30"
                        : done
                          ? "bg-primary/12 text-primary"
                          : "border border-border/80",
                    )}
                  >
                    {active ? (
                      <span className="size-1.5 rounded-full bg-primary" />
                    ) : done ? (
                      <Check className="size-3" strokeWidth={2.75} />
                    ) : null}
                  </span>
                  <span className="truncate">{label}</span>
                  <span className="sr-only">
                    {active
                      ? ", current step"
                      : done
                        ? ", completed"
                        : ", not completed"}
                  </span>
                </span>
                <span
                  className={cn(
                    "block h-1 w-full rounded-full transition-[opacity,background-color] duration-200 ease-out",
                    active
                      ? "bg-primary"
                      : done
                        ? "bg-primary/35"
                        : "bg-border",
                    clickable && !active && "group-hover:opacity-75",
                  )}
                />
              </button>
            );
          })}
        </div>
      </div>
    </header>

    {children}

    <footer
      className={cn(
        "w-full shrink-0 border-t border-foreground/10 pt-5",
        fixedChrome && "absolute inset-x-0 bottom-0 z-20 bg-background pb-6",
      )}
    >
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4">
        {step > 0 ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => onStepChange(Math.max(0, step - 1))}
            className="text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft size={16} />
            Back
          </Button>
        ) : onCancel ? (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            className="text-muted-foreground hover:text-foreground"
          >
            Cancel
          </Button>
        ) : (
          <span />
        )}
        {step < steps.length - 1 ? (
          <Button
            type="button"
            size="lg"
            disabled={!canContinue}
            onClick={onContinue}
            className="rounded-full px-10"
          >
            Continue
          </Button>
        ) : (
          <Button
            type="button"
            size="lg"
            disabled={finalAction.disabled}
            onClick={finalAction.onClick}
            className="rounded-full px-10"
          >
            {finalAction.label}
          </Button>
        )}
      </div>
    </footer>
  </div>
);

export const SettingsWizardContainedStep = ({
  children,
  className,
  contentClassName,
}: {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) => (
  <section
    className={cn(
      "mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col overflow-hidden",
      className,
    )}
  >
    <div
      className={cn(
        "flex min-h-0 w-full flex-1 flex-col gap-6 py-4",
        contentClassName,
      )}
    >
      {children}
    </div>
  </section>
);

export const SettingsWizardViewport = ({
  stepKey,
  contained,
  centerPage = true,
  children,
}: {
  stepKey: React.Key;
  /** True when a child such as ScrollArea owns scrolling for this step. */
  contained: boolean;
  centerPage?: boolean;
  children: React.ReactNode;
}) => (
  <main
    className={cn(
      "flex min-h-0 flex-1 flex-col",
      contained ? "overflow-hidden" : "overflow-y-auto",
    )}
  >
    <div
      key={stepKey}
      className={cn(
        "flex flex-1 flex-col animate-in fade-in",
        contained ? "min-h-0" : "min-h-full",
        !contained && centerPage && "justify-center",
      )}
      style={{
        animationDuration: "600ms",
        animationTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {children}
    </div>
  </main>
);
