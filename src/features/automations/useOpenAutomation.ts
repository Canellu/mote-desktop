import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import type { Variants } from "motion/react";
import { useCallback } from "react";
import type { AutomationRule } from "./model";

/**
 * Name and blurb for each automation. The Settings header shows these in place
 * of the tab's own title while one is open, so they live outside the editor.
 */
export const automationRuleInfo: Record<
  AutomationRule,
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
};

// A window shows one Settings screen, so whether the open automation is an entry
// we pushed is window state rather than per-component state: the header's back
// button has to unwind the very entry the list's click pushed.
let pushedEntry = false;

/**
 * Reads and drives the open automation through the `?automation=<rule>` search
 * param, so the detail view is a real history entry and the mouse Back button
 * closes it instead of leaving Settings with it still on screen.
 *
 * Opening pushes. Closing pops that entry when we pushed it, and otherwise (a
 * deep link or a reload straight into an automation) replaces, so a closed
 * automation never reopens on Forward.
 */
export function useOpenAutomation() {
  const navigate = useNavigate();
  const router = useRouter();
  const search = useSearch({ from: "/settings" });
  const automation = search.automation ?? null;
  const setAutomation = useCallback(
    (rule: AutomationRule | null) => {
      if (rule === null && pushedEntry) {
        pushedEntry = false;
        router.history.back();
        return;
      }
      pushedEntry = rule !== null;
      void navigate({
        to: "/settings",
        search: { ...search, automation: rule ?? undefined },
        replace: rule === null,
      });
    },
    [navigate, router, search],
  );
  return { automation, setAutomation };
}

/**
 * The push/pop slide shared by the Settings header and the automation content,
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
