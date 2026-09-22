import {
  CalendarClock,
  House,
  Lock,
  Mic,
  MonitorPlay,
  Timer,
  type LucideIcon,
} from "lucide-react";
import type { AutomationSource } from "./model";

/** Every entry in the priority list, named the way the list shows it. */
export const automationSourceInfo: Record<
  AutomationSource,
  { title: string; when: string; icon: LucideIcon }
> = {
  onAir: { title: "On-air light", when: "While you are on a call", icon: Mic },
  away: {
    title: "When this PC locks",
    when: "While this PC is locked",
    icon: Lock,
  },
  focus: {
    title: "Focus sessions",
    when: "During a focus session",
    icon: Timer,
  },
  pcSync: {
    title: "PC Sync",
    when: "While PC Sync streams to an area",
    icon: MonitorPlay,
  },
  calendar: {
    title: "Calendar",
    when: "Around the calendar events you choose",
    icon: CalendarClock,
  },
  presence: {
    title: "Presence",
    when: "When everyone leaves or someone comes home",
    icon: House,
  },
};
