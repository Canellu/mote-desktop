import { useEntitlements } from "@/context/EntitlementContext";
import { useProUpgrade } from "@/features/pro/proUpgrade";
import { dueTrialReminder, formatDaysLeft } from "@/features/pro/trial";
import { useEffect } from "react";
import { toast } from "sonner";

// Keyed by the trial's start, so a notice belongs to one trial and never leaks
// into the next installation's.
const remindersKey = (startedAt: number) =>
  `mote-pro-trial-reminders:${startedAt}`;
const endedKey = (startedAt: number) => `mote-pro-trial-ended:${startedAt}`;

function readShown(key: string): Set<number> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((days): days is number => typeof days === "number")
        : [],
    );
  } catch {
    return new Set();
  }
}

function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable; the notice may then repeat, which is harmless.
  }
}

/**
 * Says when the trial is about to end, and once that it has. Renders nothing.
 *
 * The reminders are a toast because they should not interrupt; the end is the
 * purchase dialog because that is the one moment it is worth interrupting for.
 */
export const TrialNotices: React.FC = () => {
  const { snapshot, onTrial, trialDaysLeft, trialEnded } = useEntitlements();
  const { requestPro } = useProUpgrade();
  const startedAt = snapshot.trial?.startedAt ?? null;

  useEffect(() => {
    if (!onTrial || startedAt === null || trialDaysLeft === null) return;

    const shown = readShown(remindersKey(startedAt));
    const due = dueTrialReminder(trialDaysLeft, shown);
    if (due === null) return;

    shown.add(due);
    remember(remindersKey(startedAt), JSON.stringify([...shown]));
    toast.message(`${formatDaysLeft(trialDaysLeft)} on your Pro trial`, {
      description:
        "Everything you set up stays saved. Get Mote Pro to keep it working.",
      action: { label: "Get Pro", onClick: () => requestPro("general") },
      duration: 12_000,
    });
  }, [onTrial, startedAt, trialDaysLeft, requestPro]);

  useEffect(() => {
    if (!trialEnded || startedAt === null) return;

    const key = endedKey(startedAt);
    try {
      if (localStorage.getItem(key)) return;
    } catch {
      return;
    }

    remember(key, "shown");
    requestPro("trial_ended");
  }, [trialEnded, startedAt, requestPro]);

  return null;
};
