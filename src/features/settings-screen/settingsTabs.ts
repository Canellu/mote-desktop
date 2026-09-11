import {
  Blocks,
  Boxes,
  Cable,
  CircleHelp,
  Home,
  Keyboard,
  Monitor,
  MonitorPlay,
  Palette,
  Router,
  SlidersHorizontal,
  Sparkles,
  Tv,
  type LucideIcon,
} from "lucide-react";

export type SettingsGroupValue = "app" | "home" | "connections";

/**
 * Top-level settings groups shown as folder tabs. Each group owns a set of
 * leaf tabs (see `settingsTabs`) surfaced as a secondary segmented control.
 * Keep this list short — it is the primary nav and must never wrap.
 */
export const settingsGroups = [
  {
    value: "app",
    label: "App",
    icon: SlidersHorizontal,
  },
  {
    value: "home",
    label: "Your Home",
    icon: Home,
  },
  {
    value: "connections",
    label: "Connections",
    icon: Cable,
  },
] satisfies Array<{
  value: SettingsGroupValue;
  label: string;
  icon: LucideIcon;
}>;

export const settingsTabs = [
  {
    value: "general",
    label: "General",
    group: "app",
    description: "Set app appearance and desktop window behavior.",
    icon: Monitor,
  },
  {
    value: "shortcuts",
    label: "Shortcuts",
    group: "app",
    description: "Choose global keyboard shortcuts for lights and scenes.",
    icon: Keyboard,
  },
  {
    value: "widget",
    label: "Widgets",
    group: "app",
    description: "Create and manage pinned desktop widget windows.",
    icon: Blocks,
  },
  {
    value: "about",
    label: "About & Support",
    group: "app",
    description:
      "View version, support, privacy, legal, and diagnostic information.",
    icon: CircleHelp,
  },
  {
    value: "spaces",
    label: "Rooms & Zones",
    group: "home",
    description: "Organize rooms, zones, lights, and memberships.",
    icon: Home,
  },
  {
    value: "entertainment",
    label: "Entertainment Areas",
    group: "home",
    description: "Arrange compatible lights for entertainment and sync.",
    icon: Sparkles,
  },
  {
    value: "devices",
    label: "Devices",
    group: "home",
    description: "Review Hue devices, sensors, switches, and connectivity.",
    icon: Boxes,
  },
  {
    value: "scenes",
    label: "Scenes",
    group: "home",
    description: "Create and manage room and zone scenes.",
    icon: Palette,
  },
  {
    value: "bridge",
    label: "Bridge",
    group: "connections",
    description: "Manage bridge connection and saved credentials.",
    icon: Router,
  },
  {
    value: "pc-sync",
    label: "PC Sync",
    group: "connections",
    description: "Set up light sync driven directly by this PC.",
    icon: MonitorPlay,
  },
  {
    value: "sync-box",
    label: "Sync Box",
    group: "connections",
    description: "Manage your Hue Play HDMI Sync Box connection.",
    icon: Tv,
  },
] satisfies Array<{
  value: string;
  label: string;
  group: SettingsGroupValue;
  description: string;
  icon: LucideIcon;
}>;

/** Leaf tabs belonging to a group, in declaration order. */
export const groupTabs = (group: SettingsGroupValue) =>
  settingsTabs.filter((tab) => tab.group === group);

/** The group that owns a given leaf tab (falls back to the first group). */
export const groupForTab = (value: string): SettingsGroupValue =>
  settingsTabs.find((tab) => tab.value === value)?.group ??
  settingsGroups[0].value;
