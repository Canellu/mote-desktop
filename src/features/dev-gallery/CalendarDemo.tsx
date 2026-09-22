import { useState } from "react";
import type {
  CalendarSettings,
  CalendarStatus,
} from "@/features/automations/calendar";
import { CalendarEditor } from "@/features/automations/components/CalendarEditor";
import { demoLightGroups, demoScenes } from "./demoHome";

const initialSettings: CalendarSettings = {
  feeds: [
    { id: "work", name: "Work", enabled: true },
    { id: "home", name: "Family", enabled: true },
  ],
  rules: [
    {
      id: "meetings",
      name: "Meetings",
      enabled: true,
      feedIds: ["work"],
      titleIncludes: "",
      titleExcludes: "optional",
      busyOnly: true,
      includeAllDay: false,
      leadMinutes: 2,
      trailMinutes: 0,
      bridgeId: "demo",
      targets: [{ kind: "light", id: "demo-light-0", name: "Office light 1" }],
      look: "color",
      xy: [0.675, 0.322],
      mirek: 366,
      brightness: 80,
      scene: null,
      restore: true,
    },
    {
      id: "focus-blocks",
      name: "Focus blocks",
      enabled: false,
      feedIds: [],
      titleIncludes: "focus",
      titleExcludes: "",
      busyOnly: true,
      includeAllDay: false,
      leadMinutes: 0,
      trailMinutes: 0,
      bridgeId: "demo",
      targets: [],
      look: "scene",
      xy: [0.3, 0.3],
      mirek: 233,
      brightness: 100,
      scene: { id: "demo-scene-0", name: "Concentrate" },
      restore: true,
    },
  ],
};

/**
 * Two calendars and two rules, one of them on for a meeting. Editing reaches
 * for the backend and does nothing here.
 */
export function CalendarDemo() {
  const [settings, setSettings] = useState(initialSettings);
  const now = Date.now();
  const status: CalendarStatus = {
    syncing: false,
    feeds: [
      { id: "work", syncedAt: now - 4 * 60_000, error: null, events: 14 },
      {
        id: "home",
        syncedAt: null,
        error: "The calendar could not be reached.",
        events: 0,
      },
    ],
    rules: [
      {
        id: "meetings",
        active: {
          feedId: "work",
          title: "Weekly sync",
          start: now - 10 * 60_000,
          end: now + 20 * 60_000,
          allDay: false,
        },
        next: null,
        error: null,
      },
      {
        id: "focus-blocks",
        active: null,
        next: {
          feedId: "work",
          title: "Focus time",
          start: now + 26 * 3_600_000,
          end: now + 28 * 3_600_000,
          allDay: false,
        },
        error: null,
      },
    ],
  };
  return (
    <CalendarEditor
      settings={settings}
      status={status}
      lightGroups={demoLightGroups}
      scenes={demoScenes}
      bridgeId="demo"
      hasPro
      onSettingsChange={setSettings}
    />
  );
}
