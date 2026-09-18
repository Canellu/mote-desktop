import { useEntitlements } from "@/context/EntitlementContext";
import { useHue } from "@/context/HueContext";
import { useProUpgrade } from "@/features/pro/proUpgrade";
import {
  dueTrialReminder,
  formatDaysLeft,
  markTrialWelcomeSeen,
  TRIAL_REMINDER_DAYS,
  trialWelcomeSeen,
} from "@/features/pro/trial";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import { useEffect } from "react";
import { toast } from "sonner";

// Keyed by the trial's start, so a notice belongs to one trial and never leaks
// into the next installation's.
const remindersKey = (startedAt: number) =>
  `mote-pro-trial-reminders:${startedAt}`;
const endedKey = (startedAt: number) => `mote-pro-trial-ended:${startedAt}`;

/** Lets Home finish arriving before the welcome grows out of the badge. */
const WELCOME_DELAY_MS = 700;

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

function seen(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    // Unreadable storage would repeat the notice on every launch, so say seen.
    return true;
  }
}

/**
 * Says once that the trial has started, when it is about to end, and once that
 * it has. Renders nothing.
 *
 * The start is the plan itself, grown out of the badge that reopens it, so the
 * trial is known about from its first day rather than discovered on its last.
 * The reminders are toasts because they should not interrupt; the end is the
 * purchase dialog because that is the one moment it is worth interrupting for.
 */
export const TrialNotices: React.FC = () => {
  const { snapshot, onTrial, trialDaysLeft, trialEnded } = useEntitlements();
  const { requestPro, showPlan } = useProUpgrade();
  const { configured, connected, isAddingBridge } = useHue();
  const resourcesHasLoaded = useHueResourcesStore((state) => state.hasLoaded);
  const startedAt = snapshot.trial?.startedAt ?? null;

  // The trial starts the moment the first bridge pairs, which is mid-setup.
  // Opened then, the welcome would cover the wizard's own ending, so it waits
  // for the same conditions App uses to show Home.
  const homeShown =
    configured && connected && resourcesHasLoaded && !isAddingBridge;

  useEffect(() => {
    if (!homeShown || !onTrial || startedAt === null) return;
    if (trialDaysLeft === null) return;
    // In the last stretch the reminder says it instead, with the count that matters.
    if (trialDaysLeft <= Math.max(...TRIAL_REMINDER_DAYS)) return;

    if (trialWelcomeSeen(startedAt)) return;

    const timer = window.setTimeout(() => {
      // Asked again: the development menu can mark it seen in the meantime.
      if (trialWelcomeSeen(startedAt)) return;
      markTrialWelcomeSeen(startedAt);
      showPlan({ welcome: true });
    }, WELCOME_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [homeShown, onTrial, startedAt, trialDaysLeft, showPlan]);

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
    if (seen(key)) return;

    remember(key, "shown");
    requestPro("trial_ended");
  }, [trialEnded, startedAt, requestPro]);

  return null;
};
