import type {
  WidgetBackgroundMode,
  WidgetCollapseMode,
  WidgetThemeMode,
} from "@/features/widget-screen/types";
import {
  Blend,
  Circle,
  Monitor,
  Moon,
  RectangleHorizontal,
  Square,
  Sun,
} from "lucide-react";
import { MothIcon } from "./MascotStylePicker";
import type { SegmentIcon } from "./SegmentedControl";

// The widget appearance choices, shared by the Widgets tab and the create
// wizard so both offer the same options. Corners live in widgetCornerOptions.

export const WIDGET_THEME_OPTIONS = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] satisfies Array<{
  value: WidgetThemeMode;
  label: string;
  icon: SegmentIcon;
}>;

export const WIDGET_BACKGROUND_OPTIONS = [
  { value: "solid", label: "Solid", icon: Square },
  { value: "translucent", label: "Translucent", icon: Blend },
] satisfies Array<{
  value: WidgetBackgroundMode;
  label: string;
  icon: SegmentIcon;
}>;

export const WIDGET_COLLAPSE_OPTIONS = [
  { value: "mascot", label: "Mascot", icon: MothIcon },
  { value: "pill", label: "Pill", icon: RectangleHorizontal },
  { value: "bubble", label: "Bubble", icon: Circle },
] satisfies Array<{
  value: WidgetCollapseMode;
  label: string;
  icon: SegmentIcon;
}>;
