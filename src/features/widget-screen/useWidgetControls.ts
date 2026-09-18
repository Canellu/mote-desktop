import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  WidgetControl,
  WidgetCornerMode,
  WidgetSizeMode,
  WidgetState,
  WidgetThemeMode,
} from "./types";

/** Emitted by the Rust side when a widget's controls change (here or from the
 * main window's Settings tab) so a live widget updates without reopening. */
const CONTROLS_CHANGED_EVENT = "widget-controls-changed";
const SETTINGS_CHANGED_EVENT = "widget-settings-changed";

/**
 * Loads and persists this widget's control config. Controls live server-side
 * (in `widget-settings.json`) so they survive reopens and can be edited from
 * either window; `save` writes optimistically and reloads authoritative state
 * if the write fails.
 */
export const useWidgetControls = (widgetId: string) => {
  const [controls, setControls] = useState<WidgetControl[]>([]);
  const [themeMode, setThemeMode] = useState<WidgetThemeMode>("system");
  const [sizeMode, setSizeMode] = useState<WidgetSizeMode>("default");
  const [cornerMode, setCornerMode] = useState<WidgetCornerMode>("rounded");
  const [loaded, setLoaded] = useState(false);
  // The last value we wrote, so the echoed change event doesn't clobber a newer
  // optimistic edit with a stale payload.
  const pending = useRef<WidgetControl[] | null>(null);

  useEffect(() => {
    let active = true;
    void invoke<WidgetState>("get-widget-state", { widgetId })
      .then((state) => {
        if (!active) return;
        setControls(state.controls ?? []);
        setThemeMode(state.themeMode ?? "system");
        setSizeMode(state.sizeMode ?? "default");
        setCornerMode(state.cornerMode ?? "rounded");
      })
      .catch(() => {
        // A brand-new or unconfigured widget has none yet; start empty.
      })
      .finally(() => {
        if (active) setLoaded(true);
      });

    const unlisten = listen<WidgetState>(CONTROLS_CHANGED_EVENT, (event) => {
      if (event.payload.widgetId !== widgetId) return;
      if (pending.current) {
        pending.current = null;
        return;
      }
      setControls(event.payload.controls ?? []);
    });
    const unlistenSettings = listen<WidgetState>(
      SETTINGS_CHANGED_EVENT,
      (event) => {
        if (event.payload.widgetId !== widgetId) return;
        setControls(event.payload.controls ?? []);
        setThemeMode(event.payload.themeMode ?? "system");
        setSizeMode(event.payload.sizeMode ?? "default");
        setCornerMode(event.payload.cornerMode ?? "rounded");
      },
    );

    return () => {
      active = false;
      void unlisten.then((dispose) => dispose());
      void unlistenSettings.then((dispose) => dispose());
    };
  }, [widgetId]);

  const save = useCallback(
    async (next: WidgetControl[]) => {
      setControls(next);
      pending.current = next;
      try {
        await invoke("set-widget-controls", { widgetId, controls: next });
      } catch {
        pending.current = null;
        void invoke<WidgetControl[]>("get-widget-controls", { widgetId })
          .then(setControls)
          .catch(() => undefined);
      }
    },
    [widgetId],
  );

  return {
    controls,
    themeMode,
    sizeMode,
    cornerMode,
    loaded,
    save,
  };
};
