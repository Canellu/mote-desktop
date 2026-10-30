import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useEntitlements } from "@/context/EntitlementContext";
import { useProUpgrade } from "@/features/pro/proUpgrade";
import { ManageControls } from "@/features/widget-screen/components/ManageControls";
import type {
  WidgetBackgroundMode,
  WidgetCornerMode,
  WidgetSizeMode,
  WidgetThemeMode,
} from "@/features/widget-screen/types";
import {
  DEFAULT_TILE_OPACITY,
  type WidgetConfigDraft,
  type WidgetSummary,
} from "@/features/widget-screen/useWidgets";
import { cn } from "@/lib/utils";
import {
  Blend,
  ChevronDown,
  Monitor,
  MonitorSmartphone,
  Maximize2,
  Minimize2,
  Moon,
  Pin,
  PinOff,
  RotateCcw,
  Sun,
  Scaling,
  Square,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import {
  SETTINGS_EXPANDABLE_CARD,
  SETTINGS_EXPANDABLE_TRIGGER,
  SETTINGS_EXPANDABLE_TRIGGER_OPEN,
  SETTINGS_WRAP_ROW,
  SETTINGS_WRAP_ROW_TEXT,
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

const BACKGROUND_MODES = [
  { value: "solid", label: "Solid", icon: Square },
  { value: "translucent", label: "Translucent", icon: Blend },
] satisfies Array<{
  value: WidgetBackgroundMode;
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
    backgroundMode,
    tileOpacity,
    controls,
    locked,
  } = widget;
  // Follows the slider while dragging; saved once on release.
  const [opacityDraft, setOpacityDraft] = useState(tileOpacity);
  useEffect(() => setOpacityDraft(tileOpacity), [tileOpacity]);
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
      backgroundMode,
      tileOpacity,
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
        "@container/widget-card gap-0 py-0",
        // Both share the raised fill; active widgets add real elevation and
        // closed ones stay flat.
        SETTINGS_EXPANDABLE_CARD,
        !enabled && "shadow-none dark:shadow-none",
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
          className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-2 pl-4 text-left"
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
          title={enabled ? "Active" : locked ? "Needs Pro" : "Inactive"}
          className={cn(
            "mr-1 flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-75 @max-sm/widget-card:size-6 @max-sm/widget-card:justify-center @max-sm/widget-card:px-0",
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
          {/* Narrow cards keep only the dot; the name needs the room more. */}
          <span className="@max-sm/widget-card:sr-only">
            {enabled ? "Active" : locked ? "Needs Pro" : "Inactive"}
          </span>
        </button>
        <button
          type="button"
          onClick={toggleConfigure}
          aria-label={
            configOpen ? "Close widget settings" : "Open widget settings"
          }
          aria-expanded={configOpen}
          className="mr-2 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground @sm/widget-card:mr-4"
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
              <div className={cn("mb-4", SETTINGS_WRAP_ROW)}>
                <div className={SETTINGS_WRAP_ROW_TEXT}>
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

              <div className={cn("mb-4", SETTINGS_WRAP_ROW)}>
                <div className={SETTINGS_WRAP_ROW_TEXT}>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    Pinned
                    <ProTag />
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

              <div className={cn("mb-4", SETTINGS_WRAP_ROW)}>
                <div className={SETTINGS_WRAP_ROW_TEXT}>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    Always on top
                    <ProTag />
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

              <div className={cn("mb-4", SETTINGS_WRAP_ROW)}>
                <div className={SETTINGS_WRAP_ROW_TEXT}>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    Theme
                    <ProTag />
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

              <div className={cn("mb-4", SETTINGS_WRAP_ROW)}>
                <div className={SETTINGS_WRAP_ROW_TEXT}>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    Widget size
                    <ProTag />
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

              <div className={cn("mb-4", SETTINGS_WRAP_ROW)}>
                <div className={SETTINGS_WRAP_ROW_TEXT}>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    Corners
                    <ProTag />
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

              <div className={cn("mb-4", SETTINGS_WRAP_ROW)}>
                <div className={SETTINGS_WRAP_ROW_TEXT}>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    Tile background
                    <ProTag />
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Let the desktop show through the tiles.
                  </p>
                </div>
                <SegmentedControl
                  value={backgroundMode}
                  onValueChange={(value) =>
                    value !== "solid" && !hasPro
                      ? upgrade()
                      : updateConfig({
                          backgroundMode: value as WidgetBackgroundMode,
                        })
                  }
                  ariaLabel="Widget tile background"
                  options={BACKGROUND_MODES}
                  layoutId={`widget-background-mode-pill-${widgetId}`}
                />
              </div>

              {backgroundMode === "translucent" ? (
                <div className="mb-4 grid gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">Tile opacity</p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {opacityDraft}%
                        {opacityDraft === DEFAULT_TILE_OPACITY
                          ? " · Default"
                          : null}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="rounded-lg"
                        disabled={opacityDraft === DEFAULT_TILE_OPACITY}
                        onClick={() => {
                          setOpacityDraft(DEFAULT_TILE_OPACITY);
                          updateConfig({ tileOpacity: DEFAULT_TILE_OPACITY });
                        }}
                      >
                        <RotateCcw />
                        Reset
                      </Button>
                    </div>
                  </div>
                  <Slider
                    aria-label="Tile opacity"
                    min={10}
                    max={90}
                    step={5}
                    value={[opacityDraft]}
                    onValueChange={(next) =>
                      setOpacityDraft(Array.isArray(next) ? next[0] : next)
                    }
                    onValueCommitted={(next) =>
                      updateConfig({
                        tileOpacity: Array.isArray(next) ? next[0] : next,
                      })
                    }
                  />
                </div>
              ) : null}

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
