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
  WidgetControl,
  WidgetCornerMode,
  WidgetSizeMode,
  WidgetState,
  WidgetThemeMode,
} from "./types";

export type WidgetSummary = WidgetState;

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

  const setConfig = useCallback(
    async (widgetId: string, config: WidgetConfigDraft) => {
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
