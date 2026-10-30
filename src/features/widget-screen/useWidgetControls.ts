import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  WidgetControl,
  WidgetBackgroundMode,
  WidgetCollapseMode,
  WidgetMascotStyle,
  WidgetCollapseCorner,
  WidgetCornerMode,
  WidgetSizeMode,
  WidgetState,
  WidgetThemeMode,
} from "./types";
import { DEFAULT_TILE_OPACITY, WIDGET_SCALE } from "./useWidgets";

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
  const [backgroundMode, setBackgroundMode] =
    useState<WidgetBackgroundMode>("solid");
  const [tileOpacity, setTileOpacity] = useState(DEFAULT_TILE_OPACITY);
  const [title, setTitle] = useState<string | null>(null);
  const [collapseMode, setCollapseMode] =
    useState<WidgetCollapseMode>("mascot");
  const [mascotStyle, setMascotStyle] =
    useState<WidgetMascotStyle>("celShaded");
  const [mascotAnimated, setMascotAnimated] = useState(true);
  const [scale, setScale] = useState<number>(WIDGET_SCALE.default);
  const [collapsedScale, setCollapsedScale] = useState<number>(
    WIDGET_SCALE.default,
  );
  const [collapseCorner, setCollapseCorner] =
    useState<WidgetCollapseCorner>("topLeft");
  const [autoCollapseSeconds, setAutoCollapseSeconds] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
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
        setBackgroundMode(state.backgroundMode ?? "solid");
        setTileOpacity(state.tileOpacity ?? DEFAULT_TILE_OPACITY);
        setTitle(state.title ?? null);
        setCollapseMode(state.collapseMode ?? "mascot");
        setMascotStyle(state.mascotStyle ?? "celShaded");
        setMascotAnimated(state.mascotAnimated ?? true);
        setScale(state.scale ?? WIDGET_SCALE.default);
        setCollapsedScale(
          state.collapsedScale ?? state.scale ?? WIDGET_SCALE.default,
        );
        setCollapseCorner(state.collapseCorner ?? "topLeft");
        setAutoCollapseSeconds(state.autoCollapseSeconds ?? 0);
        setCollapsed(state.collapsed ?? false);
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
        setBackgroundMode(event.payload.backgroundMode ?? "solid");
        setTileOpacity(event.payload.tileOpacity ?? DEFAULT_TILE_OPACITY);
        setTitle(event.payload.title ?? null);
        setCollapseMode(event.payload.collapseMode ?? "mascot");
        setMascotStyle(event.payload.mascotStyle ?? "celShaded");
        setMascotAnimated(event.payload.mascotAnimated ?? true);
        setScale(event.payload.scale ?? WIDGET_SCALE.default);
        setCollapsedScale(
          event.payload.collapsedScale ??
            event.payload.scale ??
            WIDGET_SCALE.default,
        );
        setAutoCollapseSeconds(event.payload.autoCollapseSeconds ?? 0);
        // `collapsed` is left to the widget window, which folds and unfolds
        // itself and would be cut short mid-animation by its own echo.
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
    backgroundMode,
    tileOpacity,
    title,
    collapseMode,
    mascotStyle,
    mascotAnimated,
    scale,
    collapsedScale,
    collapseCorner,
    setCollapseCorner,
    autoCollapseSeconds,
    collapsed,
    setCollapsed,
    loaded,
    save,
  };
};
