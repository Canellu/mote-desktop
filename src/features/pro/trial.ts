/** One day, in the milliseconds the backend reports times in. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days until `endsAt`, counted up, so a trial with an hour to go has one day. */
export function daysLeftUntil(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / DAY_MS));
}

export function formatDaysLeft(days: number): string {
  return days === 1 ? "1 day left" : `${days} days left`;
}

/**
 * How much of the trial is still to run, from 0 to 1. Measured in whole days,
 * so it moves with the day count beside it rather than creeping by the hour.
 */
export function trialShareLeft(
  daysLeft: number,
  startedAt: number,
  endsAt: number,
): number {
  const length = Math.max(1, Math.round((endsAt - startedAt) / DAY_MS));
  return Math.min(1, Math.max(0, daysLeft / length));
}

/** Days left at which a reminder fires, once each. */
export const TRIAL_REMINDER_DAYS: readonly number[] = [3, 1];

/**
 * The reminder due with `daysLeft` to go, or null.
 *
 * Only the nearest threshold counts, so opening Mote for the first time on the
 * last day shows one notice rather than the three-day and one-day ones stacked.
 */
export function dueTrialReminder(
  daysLeft: number,
  shown: ReadonlySet<number>,
): number | null {
  const reached = TRIAL_REMINDER_DAYS.filter((days) => daysLeft <= days);
  if (reached.length === 0) return null;

  const nearest = Math.min(...reached);
  return shown.has(nearest) ? null : nearest;
}

// Keyed by the trial's start, so the welcome belongs to one trial and never
// leaks into the next installation's.
const welcomeKey = (startedAt: number) => `mote-pro-trial-welcome:${startedAt}`;

/** Whether the trial that started at `startedAt` has been welcomed. */
export function trialWelcomeSeen(startedAt: number): boolean {
  try {
    return localStorage.getItem(welcomeKey(startedAt)) !== null;
  } catch {
    // Unreadable storage would repeat the welcome on every launch; say seen.
    return true;
  }
}

export function markTrialWelcomeSeen(startedAt: number): void {
  try {
    localStorage.setItem(welcomeKey(startedAt), "shown");
  } catch {
    // The welcome may then show again next launch, which is harmless.
  }
}
