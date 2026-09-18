import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useEntitlements } from "@/context/EntitlementContext";
import { useProUpgrade } from "@/features/pro/proUpgrade";
import { ManageControls } from "@/features/widget-screen/components/ManageControls";
import type {
  WidgetCornerMode,
  WidgetSizeMode,
  WidgetThemeMode,
} from "@/features/widget-screen/types";
import type {
  WidgetConfigDraft,
  WidgetSummary,
} from "@/features/widget-screen/useWidgets";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  Monitor,
  MonitorSmartphone,
  Maximize2,
  Minimize2,
  Moon,
  Pin,
  PinOff,
  Sun,
  Scaling,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import {
  FLAT_CARD,
  SETTINGS_EXPANDABLE_CARD,
  SETTINGS_EXPANDABLE_TRIGGER,
  SETTINGS_EXPANDABLE_TRIGGER_OPEN,
} from "../constants";
import { DeleteResourceButton } from "./DeleteResourceButton";
import { ProTag } from "./ProTag";
import { SegmentedControl, type SegmentIcon } from "./SegmentedControl";
import { WIDGET_CORNER_OPTIONS } from "./widgetCornerOptions";
import { WidgetPositionPicker } from "./WidgetPositionPicker";

const THEME_MODES = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] satisfies Array<{
  value: WidgetThemeMode;
  label: string;
  icon: SegmentIcon;
}>;

const SIZE_MODES = [
  { value: "small", label: "Small", icon: Minimize2 },
  { value: "default", label: "Default", icon: Scaling },
  { value: "large", label: "Large", icon: Maximize2 },
] satisfies Array<{
  value: WidgetSizeMode;
  label: string;
  icon: SegmentIcon;
}>;

export const WidgetCard = ({
  widget,
  openRequest,
  onReopen,
  onClose,
  onRemove,
  onSetPinned,
  onSetAlwaysOnTop,
  onSetConfig,
}: {
  widget: WidgetSummary;
  openRequest?: number;
  onReopen: (id: string) => void;
  onClose: (id: string) => void;
  onRemove: (id: string) => Promise<void>;
  onSetPinned: (id: string, pinned: boolean) => void;
  onSetAlwaysOnTop: (id: string, alwaysOnTop: boolean) => void;
  onSetConfig: (id: string, config: WidgetConfigDraft) => void;
}) => {
  const {
    widgetId,
    enabled,
    pinned,
    alwaysOnTop,
    themeMode,
    sizeMode,
    cornerMode,
    controls,
    locked,
  } = widget;
  const { hasPro } = useEntitlements();
  const { requestPro } = useProUpgrade();
  const upgrade = () => requestPro("advanced_widgets");
  const [configOpen, setConfigOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const count = controls.length;

  useEffect(() => {
    if (openRequest === undefined) return;
    setConfigOpen(true);
  }, [openRequest]);

  const updateConfig = (next: Partial<WidgetConfigDraft>) =>
    onSetConfig(widgetId, {
      controls,
      themeMode,
      sizeMode,
      cornerMode,
      ...next,
    });

  // Free is one widget at the system theme, standard size and corners, neither
  // pinned nor on top. Reaching past that offers Pro; stepping back inside it never does,
  // so nothing can be left stuck where a lapsed purchase put it.
  const activate = () => (locked ? upgrade() : onReopen(widgetId));

  const toggleConfigure = () => setConfigOpen((open) => !open);

  return (
    <Card
      className={cn(
        "gap-0 py-0",
        // Active widgets read as "lifted" off the list with real elevation;
        // closed ones stay as quiet flat rows.
        enabled ? SETTINGS_EXPANDABLE_CARD : FLAT_CARD,
      )}
    >
      <div
        className={cn(
          "flex items-center",
          SETTINGS_EXPANDABLE_TRIGGER,
          configOpen && SETTINGS_EXPANDABLE_TRIGGER_OPEN,
        )}
      >
        <button
          type="button"
          onClick={toggleConfigure}
          aria-expanded={configOpen}
          className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left"
        >
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-lg border",
              enabled
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border/60 text-muted-foreground",
            )}
          >
            <MonitorSmartphone size={15} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {widget.title ?? "Hue Widget"}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {count === 0
                ? "No controls"
                : `${count} control${count > 1 ? "s" : ""}`}
            </span>
          </span>

          {pinned ? (
            <Pin size={12} className="shrink-0 text-muted-foreground" />
          ) : null}
        </button>
        <button
          type="button"
          aria-label={enabled ? "Deactivate widget" : "Activate widget"}
          className={cn(
            "mr-2 flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-75",
            enabled
              ? "bg-(--success-surface) text-(--success-text)"
              : "bg-muted text-muted-foreground",
          )}
          onClick={() => (enabled ? onClose(widgetId) : activate())}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              enabled ? "bg-success" : "bg-muted-foreground",
            )}
          />
          {enabled ? "Active" : locked ? "Needs Pro" : "Inactive"}
        </button>
        <button
          type="button"
          onClick={toggleConfigure}
          aria-label={
            configOpen ? "Close widget settings" : "Open widget settings"
          }
          aria-expanded={configOpen}
          className="mr-4 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground"
        >
          <ChevronDown
            size={16}
            className={cn("transition-transform", configOpen && "rotate-180")}
          />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {configOpen ? (
          <motion.div
            key="configuration"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              duration: prefersReducedMotion ? 0 : 0.2,
              ease: [0.4, 0, 0.2, 1],
            }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/60 px-4 py-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Active</p>
                  <p className="text-xs text-muted-foreground">
                    Show this widget in its own window.
                  </p>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={(checked) =>
                    checked ? activate() : onClose(widgetId)
                  }
                  aria-label="Active"
                />
              </div>

              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    Pinned
                    {hasPro ? null : <ProTag />}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Lock this widget to its current position.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="rounded-lg"
                  aria-label={pinned ? "Unpin widget" : "Pin widget"}
                  onClick={() =>
                    !pinned && !hasPro
                      ? upgrade()
                      : onSetPinned(widgetId, !pinned)
                  }
                >
                  {pinned ? <PinOff /> : <Pin />}
                  {pinned ? "Unpin" : "Pin"}
                </Button>
              </div>

              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    Always on top
                    {hasPro ? null : <ProTag />}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Keep this widget floating above other windows.
                  </p>
                </div>
                <Switch
                  checked={alwaysOnTop}
                  onCheckedChange={(checked) =>
                    checked && !hasPro
                      ? upgrade()
                      : onSetAlwaysOnTop(widgetId, checked)
                  }
                  aria-label="Always on top"
                />
              </div>

              <WidgetPositionPicker
                widgetId={widgetId}
                onProRequired={hasPro ? undefined : upgrade}
              />

              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    Theme
                    {hasPro ? null : <ProTag />}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Choose the widget's light or dark appearance.
                  </p>
                </div>
                <SegmentedControl
                  value={themeMode}
                  onValueChange={(value) =>
                    value !== "system" && !hasPro
                      ? upgrade()
                      : updateConfig({ themeMode: value as WidgetThemeMode })
                  }
                  ariaLabel="Widget theme"
                  options={THEME_MODES}
                  layoutId={`widget-theme-mode-pill-${widgetId}`}
                />
              </div>

              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    Widget size
                    {hasPro ? null : <ProTag />}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Adjust the dimensions of the widget controls.
                  </p>
                </div>
                <SegmentedControl
                  value={sizeMode}
                  onValueChange={(value) =>
                    value !== "default" && !hasPro
                      ? upgrade()
                      : updateConfig({ sizeMode: value as WidgetSizeMode })
                  }
                  ariaLabel="Widget size"
                  options={SIZE_MODES}
                  layoutId={`widget-size-mode-pill-${widgetId}`}
                />
              </div>

              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    Corners
                    {hasPro ? null : <ProTag />}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Round the widget and its cards more or less.
                  </p>
                </div>
                <SegmentedControl
                  value={cornerMode}
                  onValueChange={(value) =>
                    value !== "rounded" && !hasPro
                      ? upgrade()
                      : updateConfig({ cornerMode: value as WidgetCornerMode })
                  }
                  ariaLabel="Widget corners"
                  options={WIDGET_CORNER_OPTIONS}
                  layoutId={`widget-corner-mode-pill-${widgetId}`}
                />
              </div>

              <ManageControls
                controls={controls}
                onChange={(controls) => updateConfig({ controls })}
                onProRequired={hasPro ? undefined : upgrade}
              />

              <div className="mt-5 flex border-t border-border/60 pt-4">
                <span className="ml-auto">
                  <DeleteResourceButton
                    label="widget"
                    description="This permanently removes the widget and its saved controls. This can't be undone."
                    tooltip="Delete widget"
                    triggerLabel="Delete"
                    onDelete={() => onRemove(widgetId)}
                  />
                </span>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Card>
  );
};
