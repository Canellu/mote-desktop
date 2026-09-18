import { useEntitlements } from "@/context/EntitlementContext";
import type {
  WidgetConfigDraft,
  WidgetSummary,
} from "@/features/widget-screen/useWidgets";
import { Panel } from "../components/Panel";
import { ProSetupBanner } from "../components/ProSetupBanner";
import { SettingsStack } from "../components/SettingsList";
import { WidgetCard } from "../components/WidgetCard";

interface WidgetTabProps {
  widgets: WidgetSummary[];
  focusedWidgetId?: string;
  focusRequest?: number;
  onReopen: (id: string) => void;
  onClose: (id: string) => void;
  onRemove: (id: string) => Promise<void>;
  onSetPinned: (id: string, pinned: boolean) => void;
  onSetAlwaysOnTop: (id: string, alwaysOnTop: boolean) => void;
  onSetConfig: (id: string, config: WidgetConfigDraft) => void;
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

  return (
    <SettingsStack>
      {banner}
      <Panel title="Widgets" contentClassName="min-h-[30vh]">
        <div className="space-y-3">
          {sorted.map((widget) => (
            <WidgetCard
              key={widget.widgetId}
              widget={widget}
              openRequest={
                widget.widgetId === focusedWidgetId ? focusRequest : undefined
              }
              onReopen={onReopen}
              onClose={onClose}
              onRemove={onRemove}
              onSetPinned={onSetPinned}
              onSetAlwaysOnTop={onSetAlwaysOnTop}
              onSetConfig={onSetConfig}
            />
          ))}
        </div>
      </Panel>
    </SettingsStack>
  );
};
