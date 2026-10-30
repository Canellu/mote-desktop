import { useEntitlements } from "@/context/EntitlementContext";
import { cn } from "@/lib/utils";
import { MonitorSmartphone } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  WidgetConfigDraft,
  WidgetSummary,
} from "@/features/widget-screen/useWidgets";
import { Panel } from "../components/Panel";
import { ProSetupBanner } from "../components/ProSetupBanner";
import { SettingsStack } from "../components/SettingsList";
import { SegmentedControl } from "../components/SegmentedControl";
import { WidgetSettings } from "../components/WidgetSettings";

interface WidgetTabProps {
  widgets: WidgetSummary[];
  focusedWidgetId?: string;
  focusRequest?: number;
  onReopen: (id: string) => void;
  onClose: (id: string) => void;
  onRemove: (id: string) => Promise<void>;
  onSetPinned: (id: string, pinned: boolean) => void;
  onSetAlwaysOnTop: (id: string, alwaysOnTop: boolean) => void;
  onSetConfig: (id: string, config: Partial<WidgetConfigDraft>) => void;
}

export const WidgetTab = ({
  widgets,
  focusedWidgetId,
  focusRequest,
  onReopen,
  onClose,
  onRemove,
  onSetPinned,
  onSetAlwaysOnTop,
  onSetConfig,
}: WidgetTabProps) => {
  const { hasPro } = useEntitlements();
  // Active widgets float to the top so the ones currently on screen are easiest
  // to reach; otherwise keep the original order.
  const sorted = [...widgets].sort(
    (a, b) => Number(b.enabled) - Number(a.enabled),
  );
  const [selectedId, setSelectedId] = useState(focusedWidgetId);

  // Opening a widget from elsewhere (its window, a shortcut) selects it here.
  useEffect(() => {
    if (focusRequest !== undefined && focusedWidgetId !== undefined) {
      setSelectedId(focusedWidgetId);
    }
  }, [focusRequest, focusedWidgetId]);

  // Free is one widget with one room, zone, or light, so say so before anybody
  // builds past it. The Rust gates are the boundary; this only explains it.
  const banner = hasPro ? null : (
    <ProSetupBanner feature="advanced_widgets">
      Free includes one widget with one room, zone, or light. Mote Pro adds more
      widgets and controls, plus theme, size, corners, placement, pinning, and
      always on top.
    </ProSetupBanner>
  );

  if (widgets.length === 0) {
    return (
      <SettingsStack>
        {banner}
        <Panel title="Widgets" contentClassName="min-h-[30vh]">
          <div className="flex min-h-48 flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium">No widgets yet</p>
            <p className="text-sm text-muted-foreground">
              Use Add widget to open compact room and zone controls in a
              separate window.
            </p>
            <p className="mt-2 max-w-xs text-xs text-muted-foreground">
              Pin a widget to lock it in place. Set up the controls it controls
              here.
            </p>
          </div>
        </Panel>
      </SettingsStack>
    );
  }

  const selected =
    sorted.find((widget) => widget.widgetId === selectedId) ?? sorted[0];
  const count = selected.controls.length;

  return (
    <SettingsStack>
      {banner}
      <div className="grid gap-4">
        {/* One widget's settings at a time; with several, pick which here. */}
        {sorted.length > 1 ? (
          <SegmentedControl
            value={selected.widgetId}
            onValueChange={setSelectedId}
            ariaLabel="Widget"
            options={sorted.map((widget) => ({
              value: widget.widgetId,
              label: widget.title ?? "Hue Widget",
              icon: MonitorSmartphone,
            }))}
            layoutId="widget-picker-pill"
          />
        ) : null}
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold">
              {selected.title ?? "Hue Widget"}
            </p>
            <p className="text-sm text-muted-foreground">
              {count === 0
                ? "No controls"
                : `${count} control${count > 1 ? "s" : ""}`}
            </p>
          </div>
          <span
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
              selected.enabled
                ? "bg-(--success-surface) text-(--success-text)"
                : "bg-muted text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                selected.enabled ? "bg-success" : "bg-muted-foreground",
              )}
            />
            {selected.enabled
              ? "Active"
              : selected.locked
                ? "Needs Pro"
                : "Inactive"}
          </span>
        </div>
      </div>
      <WidgetSettings
        key={selected.widgetId}
        widget={selected}
        onReopen={onReopen}
        onClose={onClose}
        onRemove={onRemove}
        onSetPinned={onSetPinned}
        onSetAlwaysOnTop={onSetAlwaysOnTop}
        onSetConfig={onSetConfig}
      />
    </SettingsStack>
  );
};
