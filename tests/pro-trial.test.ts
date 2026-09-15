import { describe, expect, test } from "bun:test";
import {
  daysLeftUntil,
  dueTrialReminder,
  formatDaysLeft,
} from "../src/features/pro/trial";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_789_000_000_000;

describe("pro trial", () => {
  test("counts days left upwards, and never below zero", () => {
    expect(daysLeftUntil(NOW + 14 * DAY, NOW)).toBe(14);
    expect(daysLeftUntil(NOW + 13 * DAY + 1, NOW)).toBe(14);
    expect(daysLeftUntil(NOW + 1, NOW)).toBe(1);
    expect(daysLeftUntil(NOW - DAY, NOW)).toBe(0);
  });

  test("says one day in the singular", () => {
    expect(formatDaysLeft(1)).toBe("1 day left");
    expect(formatDaysLeft(3)).toBe("3 days left");
  });

  test("reminds at three days and at one day, once each", () => {
    expect(dueTrialReminder(4, new Set())).toBeNull();
    expect(dueTrialReminder(3, new Set())).toBe(3);
    expect(dueTrialReminder(2, new Set([3]))).toBeNull();
    expect(dueTrialReminder(1, new Set([3]))).toBe(1);
    expect(dueTrialReminder(1, new Set([3, 1]))).toBeNull();
  });

  test("opening Mote on the last day shows one reminder, not two", () => {
    expect(dueTrialReminder(1, new Set())).toBe(1);
  });
});
