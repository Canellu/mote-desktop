import { CalendarClock, Lock, Mic, Radar, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AutomationKind } from "@/features/automations/editor-model";

const choices: {
  kind: AutomationKind;
  title: string;
  description: string;
  example: string;
  icon: LucideIcon;
}[] = [
  {
    kind: "onAir",
    title: "On-air light",
    description: "Change lights while your microphone or camera is in use.",
    example: "For example, turn your office light red during calls.",
    icon: Mic,
  },
  {
    kind: "away",
    title: "When this PC locks",
    description:
      "Turn lights off, dim them, or use a scene when you lock this PC.",
    example: "For example, turn off the office when you step away.",
    icon: Lock,
  },
  {
    kind: "presence",
    title: "Presence",
    description:
      "Turn lights off when everyone leaves and set a scene when someone returns.",
    example: "Mote checks the phones on your home Wi-Fi.",
    icon: Radar,
  },
  {
    kind: "calendar",
    title: "Calendar event",
    description: "Change lights around selected calendar events.",
    example: "For example, show a meeting light two minutes before it starts.",
    icon: CalendarClock,
  },
];

export function AutomationTypePicker({
  configured,
  onChoose,
  onCancel,
}: {
  configured: ReadonlySet<AutomationKind>;
  onChoose: (kind: AutomationKind) => void;
  onCancel?: () => void;
}) {
  return (
    <section
      className="grid min-w-0 gap-5"
      aria-labelledby="automation-type-title"
    >
      <div className="grid gap-1">
        <h2 id="automation-type-title" className="text-lg font-semibold">
          Add automation
        </h2>
        <p className="text-sm text-muted-foreground">
          Choose what should make your lights respond.
        </p>
      </div>
      <div className="grid min-w-0 gap-3 @2xl:grid-cols-2">
        {choices.map(({ kind, title, description, example, icon: Icon }) => {
          const exists = kind !== "calendar" && configured.has(kind);
          return (
            <button
              key={kind}
              type="button"
              className="group grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-2xl bg-(--settings-surface) p-4 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
              onClick={() => onChoose(kind)}
            >
              <span className="flex size-9 items-center justify-center rounded-xl bg-card text-muted-foreground ring-1 ring-foreground/5 group-hover:text-foreground">
                <Icon size={17} aria-hidden />
              </span>
              <span className="grid min-w-0 gap-1">
                <span className="text-sm font-semibold">{title}</span>
                <span className="text-sm leading-5 text-muted-foreground">
                  {description}
                </span>
                <span className="text-xs leading-5 text-muted-foreground">
                  {exists ? "Edit existing or finish setup" : example}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {onCancel && (
        <div>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}
    </section>
  );
}
