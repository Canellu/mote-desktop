import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import type { Variants } from "motion/react";
import { useCallback, useEffect } from "react";
import { loadCalendar, useCalendarStore } from "./calendar";
import type { AutomationPage, AutomationsSearch } from "./model";
import { loadAutomations, useAutomationStore } from "./store";

/**
 * Name and blurb for each automation. The app header shows these in place of
 * the screen's own title while one is open, so they live outside the editor.
 */
export const automationRuleInfo: Record<
  AutomationPage,
  { title: string; description: string }
> = {
  onAir: {
    title: "On-air light",
    description:
      "Turn a light a color of your choice while an app uses your microphone or camera.",
  },
  away: {
    title: "When this PC locks",
    description:
      "Turn lights off, dim them, or use a scene when you lock this PC.",
  },
  presence: {
    title: "Presence",
    description:
      "Turn lights off when everyone's phone leaves home, and set a scene when someone is back.",
  },
  calendar: {
    title: "Calendar rule",
    description: "Change lights around matching calendar events.",
  },
};

// A window shows one Automations screen, so whether the open automation is an
// entry we pushed is window state rather than per-component state: the header's
// back button has to unwind the very entry the list's click pushed.
let pushedEntry = false;

/**
 * Reads and drives the open automation through the `/automations` search, so
 * the detail view is a real history entry and the mouse Back button closes it
 * instead of leaving the screen with it still showing.
 *
 * Opening pushes. Closing pops that entry when we pushed it, and otherwise (a
 * deep link or a reload straight into an automation) replaces, so a closed
 * automation never reopens on Forward.
 */
export function useOpenAutomation() {
  const navigate = useNavigate();
  const router = useRouter();
  // Loose, so the app header can close an automation from outside the route.
  const search = useSearch({ strict: false }) as AutomationsSearch;
  const automation = search.automation ?? null;
  const calendarRuleId = search.calendarRuleId ?? null;
  const setAutomation = useCallback(
    (rule: AutomationPage | null, ruleId?: string) => {
      if (rule === null && pushedEntry) {
        pushedEntry = false;
        router.history.back();
        return;
      }
      pushedEntry = rule !== null;
      void navigate({
        to: "/automations",
        search: {
          automation: rule ?? undefined,
          calendarRuleId: rule === "calendar" ? ruleId : undefined,
        },
        replace: rule === null,
      });
    },
    [navigate, router],
  );
  return { automation, calendarRuleId, setAutomation };
}

/** The app header's title and blurb while the Automations screen shows. */
export function useAutomationsHeader() {
  const { automation, calendarRuleId, setAutomation } = useOpenAutomation();
  const ruleName = useCalendarStore((state) =>
    calendarRuleId
      ? state.settings?.rules.find((rule) => rule.id === calendarRuleId)?.name
      : undefined,
  );
  const { title, description } = !automation
    ? {
        title: "Automations",
        description: "Let your lights respond to your day",
      }
    : automation === "calendar" && calendarRuleId
      ? {
          title: ruleName || "Calendar rule",
          description: "Change lights around matching calendar events.",
        }
      : automationRuleInfo[automation];
  return {
    title,
    description,
    /** A page is open, so Back returns to the list. */
    pageOpen: automation !== null,
    closePage: () => setAutomation(null),
  };
}

/**
 * Names of the automations changing lights right now, for the Home header's
 * Automations button. Presence only acts in the moment, so it never runs.
 */
export function useRunningAutomations(): string[] {
  useEffect(() => {
    void loadAutomations();
    void loadCalendar();
  }, []);
  const status = useAutomationStore((state) => state.status);
  const calendar = useCalendarStore((state) => state.settings);
  const calendarStatus = useCalendarStore((state) => state.status);
  const running: string[] = [];
  if (status?.onAir.active) running.push(automationRuleInfo.onAir.title);
  if (status?.away.active) running.push(automationRuleInfo.away.title);
  for (const rule of calendar?.rules ?? []) {
    const active = calendarStatus?.rules.find(
      (candidate) => candidate.id === rule.id,
    )?.active;
    if (rule.enabled && active) running.push(rule.name || "Calendar rule");
  }
  return running;
}

/**
 * The push/pop slide shared by the gallery header and the automation content,
 * so the title and the body travel together. `custom` is the direction: 1 going
 * into an automation, -1 coming back, and 0 for a plain fade when the person
 * has asked for reduced motion.
 */
export const automationNavVariants: Variants = {
  initial: (direction: number) => ({ opacity: 0, x: 24 * direction }),
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.22, ease: "easeOut" },
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: -24 * direction,
    transition: { duration: 0.16, ease: "easeIn" },
  }),
};
