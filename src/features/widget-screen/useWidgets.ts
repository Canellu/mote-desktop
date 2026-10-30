import { openProUpgrade } from "@/features/pro/proUpgrade";
import {
  describeCommandError,
  isPurchaseRequired,
} from "@/lib/entitlement-errors";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type {
  WidgetBackgroundMode,
  WidgetCollapseMode,
  WidgetMascotStyle,
  WidgetExpandHorizontal,
  WidgetExpandVertical,
  WidgetControl,
  WidgetCornerMode,
  WidgetSizeMode,
  WidgetState,
  WidgetThemeMode,
} from "./types";

export type WidgetSummary = WidgetState;

/** Mirrors the Rust widget scale range: the whole widget is drawn at 70–130%
 * in 1% steps, and anything but 100% is Pro. */
export const WIDGET_SCALE = {
  min: 70,
  max: 130,
  step: 1,
  default: 100,
} as const;

/** Mirrors the Rust `MAX_COLLAPSED_WIDGET_SCALE`: collapsed, the widget is
 * one pill or moth, so it may grow far past the open widget's limit. */
export const WIDGET_COLLAPSED_SCALE_MAX = 300;

/** Mirrors the Rust auto-collapse range; 0 collapses as soon as the pointer
 * leaves. `off` is how the frontend holds it turned off, and what it sends to
 * turn it off. `default` is what turning it on starts at. */
export const AUTO_COLLAPSE_SECONDS = {
  off: -1,
  min: 0,
  max: 30,
  default: 5,
} as const;

/** Mirrors the Rust `default_tile_opacity`. */
export const DEFAULT_TILE_OPACITY = 40;

const toSummary = (state: WidgetState): WidgetSummary => ({
  widgetId: state.widgetId,
  title: state.title ?? null,
  enabled: state.enabled,
  pinned: state.pinned,
  alwaysOnTop: state.alwaysOnTop ?? false,
  userSized: state.userSized ?? false,
  themeMode: state.themeMode ?? "system",
  sizeMode: state.sizeMode ?? "default",
  cornerMode: state.cornerMode ?? "rounded",
  backgroundMode: state.backgroundMode ?? "solid",
  tileOpacity: state.tileOpacity ?? DEFAULT_TILE_OPACITY,
  scale: state.scale ?? WIDGET_SCALE.default,
  collapsedScale: state.collapsedScale ?? state.scale ?? WIDGET_SCALE.default,
  collapseMode: state.collapseMode ?? "mascot",
  mascotStyle: state.mascotStyle ?? "celShaded",
  mascotAnimated: state.mascotAnimated ?? true,
  expandVertical: state.expandVertical ?? "up",
  expandHorizontal: state.expandHorizontal ?? "right",
  autoCollapseSeconds: state.autoCollapseSeconds ?? AUTO_COLLAPSE_SECONDS.off,
  collapseCorner: state.collapseCorner ?? "topLeft",
  collapsed: state.collapsed ?? false,
  controls: state.controls ?? [],
  locked: state.locked ?? false,
});

/**
 * Reports a failed widget command. A Pro refusal opens the purchase dialog, since
 * it answers what was just asked for. Anything else is described rather than
 * printed: the gate's refusals are JSON.
 */
const reportFailure = (error: unknown, fallback: string) => {
  if (isPurchaseRequired(error)) {
    openProUpgrade("advanced_widgets");
    return;
  }
  toast.error(describeCommandError(error) || fallback);
};

export interface WidgetConfigDraft {
  controls: WidgetControl[];
  themeMode: WidgetThemeMode;
  sizeMode: WidgetSizeMode;
  cornerMode: WidgetCornerMode;
  backgroundMode: WidgetBackgroundMode;
  tileOpacity: number;
  scale: number;
  collapsedScale: number;
  collapseMode: WidgetCollapseMode;
  mascotStyle: WidgetMascotStyle;
  mascotAnimated: boolean;
  expandVertical: WidgetExpandVertical;
  expandHorizontal: WidgetExpandHorizontal;
  autoCollapseSeconds: number;
}

/**
 * Tracks every persisted widget (open and closed) from the main window and
 * exposes actions to open, reopen, close, remove, and pin them. The list is
 * refreshed on mount, when the main window regains focus (widgets can be closed
 * from their own title bar), and after each action.
 */
export const useWidgets = () => {
  const [widgets, setWidgets] = useState<WidgetSummary[]>([]);
  const [opening, setOpening] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const list = await invoke<WidgetState[]>("list-widgets");
      setWidgets(list.map(toSummary));
    } catch {
      // Keep the last known list if the lookup fails; it's a non-critical view.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    // A widget can change its own pin/settings from its title bar; refresh so the
    // Settings tab's pin button and list reflect it without waiting for a focus.
    const unlisten = listen("widget-settings-changed", () => void refresh());
    return () => {
      window.removeEventListener("focus", onFocus);
      void unlisten.then((dispose) => dispose());
    };
  }, [refresh]);

  // `widgetId` opens a brand-new widget when omitted, or reopens a known
  // (closed) one when given.
  const openWidget = useCallback(
    async (
      widgetId?: string,
      options?: {
        title?: string;
        controls?: WidgetSummary["controls"];
        themeMode?: WidgetThemeMode;
        sizeMode?: WidgetSizeMode;
        cornerMode?: WidgetCornerMode;
        backgroundMode?: WidgetBackgroundMode;
        tileOpacity?: number;
        scale?: number;
        collapsedScale?: number;
        collapseMode?: WidgetCollapseMode;
        mascotStyle?: WidgetMascotStyle;
        expandVertical?: WidgetExpandVertical;
        expandHorizontal?: WidgetExpandHorizontal;
        autoCollapseSeconds?: number;
      },
    ) => {
      if (opening) return;
      setOpening(true);
      try {
        await invoke("open-widget-window", { widgetId, ...options });
        await refresh();
      } catch (error) {
        reportFailure(error, "Unable to open widget");
      } finally {
        setOpening(false);
      }
    },
    [opening, refresh],
  );

  const closeWidget = useCallback(
    async (widgetId: string) => {
      try {
        await invoke("close-widget-window", { widgetId });
        await refresh();
      } catch (error) {
        reportFailure(error, "Unable to close widget");
      }
    },
    [refresh],
  );

  const removeWidget = useCallback(
    async (widgetId: string) => {
      try {
        await invoke("remove-widget", { widgetId });
        await refresh();
      } catch (error) {
        reportFailure(error, "Unable to remove widget");
      }
    },
    [refresh],
  );

  const setPinned = useCallback(
    async (widgetId: string, pinned: boolean) => {
      try {
        await invoke("set-widget-pinned", { widgetId, pinned });
        await refresh();
      } catch (error) {
        reportFailure(error, "Unable to update widget");
      }
    },
    [refresh],
  );

  const setAlwaysOnTop = useCallback(
    async (widgetId: string, alwaysOnTop: boolean) => {
      setWidgets((current) =>
        current.map((widget) =>
          widget.widgetId === widgetId ? { ...widget, alwaysOnTop } : widget,
        ),
      );
      try {
        await invoke("set-widget-always-on-top", { widgetId, alwaysOnTop });
        await refresh();
      } catch (error) {
        reportFailure(error, "Unable to update widget");
        await refresh();
      }
    },
    [refresh],
  );

  const setControls = useCallback(
    async (widgetId: string, controls: WidgetSummary["controls"]) => {
      setWidgets((current) =>
        current.map((widget) =>
          widget.widgetId === widgetId ? { ...widget, controls } : widget,
        ),
      );
      try {
        await invoke("set-widget-controls", { widgetId, controls });
        await refresh();
      } catch (error) {
        reportFailure(error, "Unable to update controls");
        await refresh();
      }
    },
    [refresh],
  );

  // Sends only the fields that changed. The backend leaves the rest as they
  // are, so the Free view of a widget is never written over its Pro setup.
  const setConfig = useCallback(
    async (widgetId: string, config: Partial<WidgetConfigDraft>) => {
      setWidgets((current) =>
        current.map((widget) =>
          widget.widgetId === widgetId ? { ...widget, ...config } : widget,
        ),
      );
      try {
        await invoke("set-widget-config", { widgetId, ...config });
        await refresh();
      } catch (error) {
        reportFailure(error, "Unable to update widget");
        await refresh();
      }
    },
    [refresh],
  );

  return {
    widgets,
    opening,
    openWidget,
    closeWidget,
    removeWidget,
    setPinned,
    setAlwaysOnTop,
    setControls,
    setConfig,
    refresh,
  };
};
