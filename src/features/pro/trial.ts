/** One day, in the milliseconds the backend reports times in. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days until `endsAt`, counted up, so a trial with an hour to go has one day. */
export function daysLeftUntil(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / DAY_MS));
}

export function formatDaysLeft(days: number): string {
  return days === 1 ? "1 day left" : `${days} days left`;
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
