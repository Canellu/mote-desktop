import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  type FeedbackButtonMode,
  useFeedbackPreferences,
} from "@/features/feedback/preferences";
import { openFirewallSettings } from "@/lib/firewall";
import { selectableVariants } from "@/lib/selection-styles";
import { cn } from "@/lib/utils";
import { type UiDensity, useUiDensityStore } from "@/stores/UiDensityStore";
import { useFormatPreferences } from "@/stores/FormatPreferencesStore";
import {
  DEFAULT_UI_SCALE,
  UI_SCALE_STEPS,
  useUiScaleStore,
} from "@/stores/UiScaleStore";
import {
  EyeOff,
  MessageSquare,
  MessageSquareText,
  Minus,
  Monitor,
  Moon,
  Plus,
  RotateCcw,
  Rows2,
  ShieldCheck,
  Rows3,
  Rows4,
  Sun,
  X,
} from "lucide-react";
import type { ThemeMode } from "../../../context/ThemeContext";
import {
  SegmentedControl,
  type SegmentIcon,
} from "../components/SegmentedControl";
import {
  SettingsRow,
  SettingsSection,
  SettingsStack,
} from "../components/SettingsList";
import type { AppSettings, CloseButtonBehavior } from "../types";

const themeOptions = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] satisfies Array<{ value: ThemeMode; label: string; icon: SegmentIcon }>;

const densityOptions = [
  { value: "roomy", label: "Spacious", icon: Rows2 },
  { value: "comfortable", label: "Default", icon: Rows3 },
  { value: "compact", label: "Compact", icon: Rows4 },
] satisfies Array<{ value: UiDensity; label: string; icon: SegmentIcon }>;

const feedbackButtonOptions = [
  { value: "full", label: "Button", icon: MessageSquareText },
  { value: "icon", label: "Icon", icon: MessageSquare },
  { value: "hidden", label: "Hidden", icon: EyeOff },
] satisfies Array<{
  value: FeedbackButtonMode;
  label: string;
  icon: SegmentIcon;
}>;

const closeButtonOptions = [
  {
    value: "exit",
    label: "Close app",
    icon: X,
    summary: "Close Mote Desktop fully when the window is dismissed.",
    closeNote: "Quit Mote Desktop",
    minimizeNote: "Keep running in tray",
  },
  {
    value: "minimizeToTray",
    label: "Minimize to tray",
    icon: Minus,
    summary: "Keep Mote Desktop available when the window is dismissed.",
    closeNote: "Hide to tray",
    minimizeNote: "Send to taskbar",
  },
] satisfies Array<{
  value: CloseButtonBehavior;
  label: string;
  icon: SegmentIcon;
  summary: string;
  closeNote: string;
  minimizeNote: string;
}>;

function CloseButtonChoiceList({
  value,
  onValueChange,
  disabled,
}: {
  /** Unset until the saved behavior is known, so neither card is selected. */
  value: CloseButtonBehavior | undefined;
  onValueChange: (value: CloseButtonBehavior) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Minimize and close button behavior"
      className="grid grid-cols-1 gap-3 @2xl:grid-cols-2"
    >
      {closeButtonOptions.map(
        ({ value: optionValue, label, summary, closeNote, minimizeNote }) => {
          const selected = value === optionValue;

          return (
            <button
              key={optionValue}
              type="button"
              role="radio"
              aria-checked={selected}
              data-selected={selected ? "" : undefined}
              disabled={disabled}
              onClick={() => onValueChange(optionValue)}
              className={cn(
                "relative grid content-start gap-4 rounded-xl p-4 text-left",
                selectableVariants(),
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              <span className="grid min-h-14 min-w-0 content-start gap-1">
                <span className="text-sm font-semibold text-foreground">
                  {label}
                </span>
                <span className="min-h-10 text-xs leading-5 text-muted-foreground">
                  {summary}
                </span>
              </span>

              <dl className="grid gap-2 text-sm">
                <div className="grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-3 rounded-lg bg-background/80 px-3 py-2">
                  <dt className="flex size-8 items-center justify-center rounded-md bg-foreground/6 text-muted-foreground">
                    <X size={15} aria-label="Close button" />
                  </dt>
                  <dd className="min-w-0 font-medium text-foreground">
                    {closeNote}
                  </dd>
                </div>
                <div className="grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-3 rounded-lg bg-background/80 px-3 py-2">
                  <dt className="flex size-8 items-center justify-center rounded-md bg-foreground/6 text-muted-foreground">
                    <Minus size={15} aria-label="Minimize button" />
                  </dt>
                  <dd className="min-w-0 font-medium text-foreground">
                    {minimizeNote}
                  </dd>
                </div>
              </dl>
            </button>
          );
        },
      )}
    </div>
  );
}

function UiScaleStepper() {
  const scale = useUiScaleStore((state) => state.scale);
  const setScale = useUiScaleStore((state) => state.setScale);
  const stepScale = useUiScaleStore((state) => state.stepScale);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={scale === DEFAULT_UI_SCALE}
        onClick={() => setScale(DEFAULT_UI_SCALE)}
      >
        <RotateCcw />
        Reset
      </Button>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          aria-label="Decrease interface scale"
          disabled={scale === UI_SCALE_STEPS[0]}
          onClick={() => stepScale(-1)}
        >
          <Minus />
        </Button>
        <span
          aria-live="polite"
          className="w-14 text-center text-sm font-medium tabular-nums text-foreground"
        >
          {Math.round(scale * 100)}%
        </span>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          aria-label="Increase interface scale"
          disabled={scale === UI_SCALE_STEPS[UI_SCALE_STEPS.length - 1]}
          onClick={() => stepScale(1)}
        >
          <Plus />
        </Button>
      </div>
    </div>
  );
}

export const GeneralTab = ({
  themeMode,
  onThemeModeChange,
  appSettings,
  isLoadingAppSettings,
  isSavingAppSettings,
  onUpdateCloseButtonBehavior,
  onUpdateAutoStart,
  onUpdateDesktopShortcut,
}: {
  themeMode: ThemeMode;
  onThemeModeChange: (themeMode: ThemeMode) => void;
  appSettings: AppSettings | null;
  isLoadingAppSettings: boolean;
  isSavingAppSettings: boolean;
  onUpdateCloseButtonBehavior: (behavior: CloseButtonBehavior) => void;
  onUpdateAutoStart: (enabled: boolean) => void;
  onUpdateDesktopShortcut: (enabled: boolean) => void;
}) => {
  const [feedbackPreferences, updateFeedbackPreferences] =
    useFeedbackPreferences();
  const density = useUiDensityStore((state) => state.density);
  const {
    timeFormat,
    measurementSystem,
    temperatureUnit,
    setTimeFormat,
    setMeasurementSystem,
    setTemperatureUnit,
  } = useFormatPreferences();
  const setDensity = useUiDensityStore((state) => state.setDensity);

  return (
    <div>
      <SettingsStack>
        <SettingsSection title="Preferences">
          <SettingsRow title="Appearance">
            <SegmentedControl
              value={themeMode}
              onValueChange={onThemeModeChange}
              ariaLabel="Theme mode"
              options={themeOptions}
              layoutId="app-theme-mode-pill"
            />
          </SettingsRow>
          <SettingsRow
            title="Interface scale"
            description="Make everything in the main window smaller or larger. Ctrl + and Ctrl − also work, and Ctrl 0 resets."
          >
            <UiScaleStepper />
          </SettingsRow>
          <SettingsRow
            title="Spacing"
            description="How much space Home and room screens use: margins, gaps, tile size, and icons. Compact fits more on screen."
          >
            <SegmentedControl
              value={density}
              onValueChange={setDensity}
              ariaLabel="Interface spacing"
              options={densityOptions}
              layoutId="app-density-pill"
            />
          </SettingsRow>
          <SettingsRow
            title="Feedback button"
            description="Show it in the title bar with its label, as an icon only, or hide it."
          >
            <SegmentedControl
              value={feedbackPreferences.buttonMode}
              onValueChange={(buttonMode) =>
                updateFeedbackPreferences({ buttonMode })
              }
              ariaLabel="Feedback button display"
              options={feedbackButtonOptions}
              layoutId="feedback-button-mode-pill"
            />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Units and formats">
          <SettingsRow
            title="Time"
            description="How times are written across the app, such as a switch's time-of-day scenes."
          >
            <SegmentedControl
              value={timeFormat}
              onValueChange={setTimeFormat}
              ariaLabel="Time format"
              options={[
                { value: "24h", label: "24-hour" },
                { value: "12h", label: "12-hour" },
              ]}
              layoutId="app-time-format-pill"
            />
          </SettingsRow>
          <SettingsRow
            title="Measurements"
            description="Lengths on the home map: metres and centimetres, or feet and inches."
          >
            <SegmentedControl
              value={measurementSystem}
              onValueChange={setMeasurementSystem}
              ariaLabel="Measurement system"
              options={[
                { value: "metric", label: "Metric" },
                { value: "imperial", label: "Imperial" },
              ]}
              layoutId="app-measurement-pill"
            />
          </SettingsRow>
          <SettingsRow
            title="Temperature"
            description="Readings from motion sensors."
          >
            <SegmentedControl
              value={temperatureUnit}
              onValueChange={setTemperatureUnit}
              ariaLabel="Temperature unit"
              options={[
                { value: "celsius", label: "°C" },
                { value: "fahrenheit", label: "°F" },
              ]}
              layoutId="app-temperature-pill"
            />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Window">
          <div className="grid gap-3">
            <p className="text-sm font-medium text-foreground">
              Minimize &amp; close button behavior
            </p>
            <CloseButtonChoiceList
              value={appSettings?.closeButtonBehavior}
              onValueChange={onUpdateCloseButtonBehavior}
              disabled={isLoadingAppSettings || isSavingAppSettings}
            />
          </div>

          <SettingsRow
            title="Start on login"
            description="Launch Mote Desktop when you sign in to Windows."
            keepControlInline
          >
            <Switch
              aria-label="Start Mote Desktop on login"
              checked={appSettings?.autoStart ?? false}
              disabled={
                isLoadingAppSettings ||
                isSavingAppSettings ||
                !appSettings?.autoStartSupported
              }
              onCheckedChange={(checked) => onUpdateAutoStart(checked)}
            />
          </SettingsRow>

          <SettingsRow
            title="Desktop shortcut"
            description="Keep a Mote Desktop shortcut on your Windows desktop."
            keepControlInline
          >
            <Switch
              aria-label="Keep a Mote Desktop shortcut on the desktop"
              checked={appSettings?.desktopShortcut ?? false}
              disabled={
                isLoadingAppSettings ||
                isSavingAppSettings ||
                !appSettings?.desktopShortcutSupported
              }
              onCheckedChange={(checked) => onUpdateDesktopShortcut(checked)}
            />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Network">
          <SettingsRow
            title="Windows Firewall"
            description="If Mote can't find a Sync Box or another bridge, or loses your bridge after its address changes, make sure Mote Desktop is allowed through Windows Firewall."
          >
            <Button
              variant="outline"
              onClick={() => void openFirewallSettings()}
            >
              <ShieldCheck />
              Open firewall settings
            </Button>
          </SettingsRow>
        </SettingsSection>
      </SettingsStack>
    </div>
  );
};
