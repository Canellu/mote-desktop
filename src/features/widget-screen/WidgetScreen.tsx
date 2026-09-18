import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEntitlements } from "@/context/EntitlementContext";
import { cn } from "@/lib/utils";
import { EntertainmentStoreEffects } from "@/stores/EntertainmentStore";
import {
  HueResourcesStoreEffects,
  useHueResourcesStore,
} from "@/stores/HueResourcesStore";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Loader2, Pin, PinOff, Settings, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ControlCard } from "./components/ControlCard";
import type { WidgetControl } from "./types";
import { useWidgetControls } from "./useWidgetControls";
import {
  WIDGET_SIZE_METRICS,
  WIDGET_SIDE_PADDING,
  resolveWidgetTheme,
  widgetCardGridColumns,
  widgetShellStyle,
} from "./widgetShell";

interface WidgetWindowState {
  widgetId: string;
  pinned: boolean;
  userSized: boolean;
}

const TITLE_BAR_HEIGHT = 36;
const WIDGET_MIN_HEIGHT = 136;
const RESIZE_SAVE_DELAY_MS = 300;
/** Side/bottom inset (px) around the control grid — Tailwind `p-4`. Kept tight
 * so the cards sit close to the edges; the top still uses the larger
 * `edgePadding` to clear the overlaid title bar. */
const TitleBarButton = ({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: (event: React.MouseEvent) => void;
  children: React.ReactNode;
}) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <button
          type="button"
          aria-label={label}
          onClick={(event) => {
            event.stopPropagation();
            onClick(event);
          }}
          className="flex size-7 items-center justify-center rounded-lg text-foreground/75 transition-colors hover:bg-foreground/10 hover:text-foreground"
        >
          {children}
        </button>
      }
    />
    <TooltipContent side="bottom">{label}</TooltipContent>
  </Tooltip>
);

const WidgetTitleBar = ({
  widgetId,
  onOpenSettings,
  onRevealChange,
}: {
  widgetId: string;
  onOpenSettings: () => void;
  /** Notifies the shell when the title bar is hovered/focused so it can reveal
   * its own background and border in step with the title bar. */
  onRevealChange: (revealed: boolean) => void;
}) => {
  const [pinned, setPinned] = useState(false);
  const { hasPro } = useEntitlements();
  const [hovering, setHovering] = useState(false);
  const [focusing, setFocusing] = useState(false);
  // An unpinned widget is "in arrangement mode": keep its background and title
  // bar visible so it's easy to spot and grab. Once pinned, it settles in and
  // only reveals its chrome on hover/focus.
  const revealed = !pinned || hovering || focusing;

  useEffect(() => {
    onRevealChange(revealed);
  }, [revealed, onRevealChange]);

  useEffect(() => {
    void invoke<WidgetWindowState>("get-widget-state", { widgetId })
      .then((state) => setPinned(state.pinned))
      .catch(() => setPinned(false));

    // The pin can also be toggled from the Settings tab; mirror that change here
    // so the title bar's pin icon and drag-lock stay in sync with the backend.
    const unlisten = listen<{ widgetId: string; pinned: boolean }>(
      "widget-settings-changed",
      (event) => {
        if (event.payload.widgetId !== widgetId) return;
        setPinned(event.payload.pinned);
      },
    );
    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, [widgetId]);

  const togglePinned = async () => {
    const nextPinned = !pinned;
    setPinned(nextPinned);
    try {
      await invoke("set-widget-pinned", { widgetId, pinned: nextPinned });
    } catch {
      setPinned(pinned);
    }
  };

  return (
    <header
      className={cn(
        "absolute inset-x-0 top-0 z-10 flex flex-row items-center justify-end gap-1 px-2 text-foreground",
        "transition-opacity",
        revealed ? "opacity-100" : "opacity-0",
        pinned ? "cursor-default" : "cursor-grab",
      )}
      style={{ height: TITLE_BAR_HEIGHT }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setFocusing(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setFocusing(false);
        }
      }}
      onMouseDown={(event) => {
        // A pinned widget is locked to its spot, so dragging is disabled.
        if (
          pinned ||
          event.button !== 0 ||
          (event.target as HTMLElement).closest("button")
        ) {
          return;
        }
        void getCurrentWindow()
          .startDragging()
          .finally(() =>
            invoke("save-widget-bounds", { widgetId }).catch(() => undefined),
          );
      }}
    >
      <TooltipProvider>
        <div className="flex items-center gap-0.5">
          {/* Pinning is Pro, and this window has no room to sell it, so Free
              leaves the button out. Unpinning is always offered. */}
          {hasPro || pinned ? (
            <TitleBarButton
              label={pinned ? "Unpin widget" : "Pin widget"}
              onClick={() => void togglePinned()}
            >
              {/* Swap to the slashed "off" glyph so the icon reflects what the
                  button will do; keep the same color in both states. */}
              {pinned ? <PinOff size={15} /> : <Pin size={15} />}
            </TitleBarButton>
          ) : null}
          <TitleBarButton label="Widget settings" onClick={onOpenSettings}>
            <Settings size={15} />
          </TitleBarButton>
          <TitleBarButton
            label="Close widget"
            onClick={() => void invoke("close-widget-window", { widgetId })}
          >
            <X size={16} />
          </TitleBarButton>
        </div>
      </TooltipProvider>
    </header>
  );
};

const Centered = ({ children }: { children: React.ReactNode }) => (
  <div className="flex min-h-24 w-full flex-col items-center justify-center gap-2 px-6 text-center">
    {children}
  </div>
);

/** The responsive control grid, or an empty/loading/unconfigured prompt. */
const ControlList = ({
  controls,
  sizeMode,
  onOpenSettings,
}: {
  controls: WidgetControl[];
  sizeMode: import("./types").WidgetSizeMode;
  onOpenSettings: () => void;
}) => {
  const roomZones = useHueResourcesStore((state) => state.roomZones);
  const lights = useHueResourcesStore((state) => state.lights);
  const bridgeConnected = useHueResourcesStore(
    (state) => state.bridgeConnected,
  );
  const loadFailed = useHueResourcesStore((state) => state.error != null);
  const isLoading = useHueResourcesStore((state) => state.isLoading);
  const empty = roomZones.length === 0 && lights.length === 0;

  // Self-heal: while there's nothing to show, quietly retry the load. The
  // bridge-reconnect event also triggers a reload, so this mostly covers a
  // bridge that was unreachable when the widget opened (e.g. at OS login).
  useEffect(() => {
    if (!empty) return;
    const interval = window.setInterval(() => {
      const store = useHueResourcesStore.getState();
      if (!store.isLoading) void store.loadAll();
    }, 15000);
    return () => window.clearInterval(interval);
  }, [empty]);

  if (empty) {
    if (!bridgeConnected || loadFailed) {
      return (
        <Centered>
          <p className="text-base font-semibold">Can’t reach your Hue Bridge</p>
          <p className="text-sm text-muted-foreground">
            Retrying automatically — check that the bridge is powered and on
            your network.
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={isLoading}
            onClick={() => void useHueResourcesStore.getState().loadAll()}
          >
            {isLoading && <Loader2 className="animate-spin" />}
            Reconnect
          </Button>
        </Centered>
      );
    }
    return (
      <Centered>
        <p className="text-base font-semibold">No Hue devices</p>
        <p className="text-sm text-muted-foreground">
          Open the main app to set up your bridge — this widget picks it up
          automatically.
        </p>
      </Centered>
    );
  }

  if (controls.length === 0) {
    return (
      <Centered>
        <p className="text-sm font-semibold">No controls</p>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={onOpenSettings}
        >
          <Settings size={15} />
          Configure in Settings
        </Button>
      </Centered>
    );
  }

  // The same uniform grid the main app's room/zone screen uses: `auto-fill`
  // columns of a fixed basis that wrap into as many columns as fit the window.
  // Every card is therefore one column wide (no card ever balloons to fill a
  // sparse row, the way a flex-`grow` lone card would), and grid stretches each
  // card to its row's height so siblings on a row read as one even band.
  return (
    <div
      className="grid w-full content-start"
      style={{
        gap: WIDGET_SIZE_METRICS[sizeMode].gridGap,
        gridTemplateColumns: widgetCardGridColumns(sizeMode),
      }}
    >
      {controls.map((control) => (
        <ControlCard key={control.id} control={control} sizeMode={sizeMode} />
      ))}
    </div>
  );
};

export const WidgetScreen = ({ widgetId }: { widgetId: string }) => {
  const { controls, themeMode, sizeMode, cornerMode } =
    useWidgetControls(widgetId);
  const sizeMetrics = WIDGET_SIZE_METRICS[sizeMode];
  const hasLoaded = useHueResourcesStore((state) => state.hasLoaded);
  const [shellRevealed, setShellRevealed] = useState(false);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const theme = resolveWidgetTheme(themeMode, systemDark);
  const [flashing, setFlashing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  // We snap the window to the content once on first render so a fresh widget
  // opens at a sensible size; after that the user owns the size and the grid
  // simply reflows, so we never force the size again.
  const hasAutoFitRef = useRef(false);
  const resizeSaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    document.documentElement.dataset.window = "widget";
    void invoke("widget-frontend-ready", { widgetId }).catch(() => undefined);
    return () => {
      delete document.documentElement.dataset.window;
    };
  }, [widgetId]);

  // Widgets respect sync-locked lights too; the entertainment store keeps
  // itself fresh from the bridge event stream, no polling needed.

  // If the first load stalls, surface a retry instead of shimmering forever.
  const [connectStalled, setConnectStalled] = useState(false);
  useEffect(() => {
    if (hasLoaded) return;
    const timer = window.setTimeout(() => setConnectStalled(true), 10000);
    return () => window.clearTimeout(timer);
  }, [hasLoaded]);

  // The OS drag-drop handler is disabled (so transparent corners work), which
  // would otherwise let a stray file drop navigate the webview away. Swallow it.
  useEffect(() => {
    const prevent = (event: DragEvent) => event.preventDefault();
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  useEffect(() => {
    void invoke("set-widget-acrylic", {
      widgetId,
      enabled: false,
      radius: null,
      color: null,
    }).catch(() => undefined);
  }, [widgetId]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  // The widget owns its own light/dark appearance: drive the `dark` class (so
  // Tailwind `dark:` variants resolve) and `color-scheme` from the widget's
  // resolved theme rather than the app theme. ThemeProvider is told not to
  // manage the document in widget windows (see `main.tsx`), so this is the only
  // writer and the app's stored theme is never touched.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    const unlisten = listen("widget-flash", () => {
      setFlashing(true);
      window.setTimeout(() => setFlashing(false), 420);
    });
    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, []);

  const syncWidgetLayout = useCallback(() => {
    const content = contentRef.current;
    if (!content || !("__TAURI_INTERNALS__" in window)) return;

    // `contentRef` wraps the cards (it is *not* stretched to the window), so its
    // height is the controls' true intrinsic height at the current width. Adding
    // the top (title-bar) padding and the smaller bottom inset gives the height
    // the window needs to show the content without clipping. Measuring the
    // content itself — rather than the full-height shell — is what lets the
    // window shrink again: the min height now tracks the content instead of
    // ratcheting up to the tallest the window has ever been.
    const contentHeight = content.getBoundingClientRect().height;
    const height = Math.ceil(
      Math.max(
        contentHeight + sizeMetrics.edgePadding + WIDGET_SIDE_PADDING,
        WIDGET_MIN_HEIGHT,
      ),
    );
    if (height <= 0) return;

    // The min width is a single card (at its size setting) plus the padding, so
    // the window can always shrink down to one column; flex handles everything
    // wider than that. `autoFit` only fires on the very first sync (and only
    // takes effect on a not-yet-user-sized widget) — later syncs just keep the
    // min size in step with the content without ever forcing the window's size.
    const autoFit = !hasAutoFitRef.current;
    hasAutoFitRef.current = true;
    void invoke("sync-widget-layout", {
      widgetId,
      minWidth: sizeMetrics.cardBasis + WIDGET_SIDE_PADDING * 2,
      minHeight: height,
      autoFit,
    }).catch(() => undefined);
  }, [sizeMetrics.cardBasis, sizeMetrics.edgePadding, widgetId]);

  useLayoutEffect(() => {
    syncWidgetLayout();
  }, [syncWidgetLayout, controls]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => syncWidgetLayout());
    observer.observe(content);
    return () => observer.disconnect();
  }, [syncWidgetLayout]);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;

    let active = true;
    void getCurrentWindow()
      .onResized(() => {
        if (!active) return;
        if (resizeSaveTimerRef.current != null) {
          window.clearTimeout(resizeSaveTimerRef.current);
        }
        // Persist whatever size the window currently has. The grid reflows in
        // CSS, so this just remembers the user's chosen width/height/position
        // (saving the auto-fit's own size here is harmless — it's correct too).
        resizeSaveTimerRef.current = window.setTimeout(() => {
          void invoke("save-widget-bounds", {
            widgetId,
            userSized: true,
          }).catch(() => undefined);
        }, RESIZE_SAVE_DELAY_MS);
      })
      .then((unlisten) => {
        if (!active) unlisten();
      });

    return () => {
      active = false;
      if (resizeSaveTimerRef.current != null) {
        window.clearTimeout(resizeSaveTimerRef.current);
      }
    };
  }, [widgetId]);

  const openSettings = () =>
    void invoke("open-widget-settings", { widgetId }).catch(() => undefined);

  const shellStyle = useMemo(
    () => widgetShellStyle(theme, sizeMode, cornerMode),
    [cornerMode, sizeMode, theme],
  );

  // While we're still connecting to the bridge there's nothing to grab onto, so
  // keep the shell opaque (the same chrome an unpinned widget shows) instead of
  // leaving a transparent window floating with a lone line of text.
  const showShell = shellRevealed || !hasLoaded;

  return (
    <main
      className={cn(
        "group/widget relative h-screen w-screen overflow-hidden border text-foreground transition-colors",
        showShell ? "border-border/20 shadow-2xl" : "border-transparent",
        flashing && "bg-primary/35",
      )}
      style={
        showShell
          ? shellStyle
          : { ...shellStyle, backgroundColor: "transparent" }
      }
    >
      <HueResourcesStoreEffects />
      <EntertainmentStoreEffects />
      <WidgetTitleBar
        widgetId={widgetId}
        onOpenSettings={openSettings}
        onRevealChange={setShellRevealed}
      />

      {!hasLoaded ? (
        // Center the connecting state on the whole window (not the content
        // wrapper) with a spinner and the shimmering title we use elsewhere.
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
          <p className="text-shimmer font-heading text-sm font-semibold">
            Connecting to your bridge…
          </p>
          {connectStalled && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void useHueResourcesStore.getState().loadAll()}
            >
              Retry
            </Button>
          )}
        </div>
      ) : (
        /* Fill the window and pad the top by the title-bar height (so the
           overlaid title bar never covers the controls) and the other edges by
           the tighter side inset, so the cards sit close to the window edges.
           The cards reflow to whatever width the user picks. The inner wrapper
           carries `contentRef` and is *not* stretched to the window, so its
           measured height is the controls' true content height — that's what
           `syncWidgetLayout` reads to set a min height the window can still
           shrink back down to. */
        <section
          className="h-full w-full overflow-hidden"
          style={{
            paddingTop: sizeMetrics.edgePadding,
            paddingLeft: WIDGET_SIDE_PADDING,
            paddingRight: WIDGET_SIDE_PADDING,
            paddingBottom: WIDGET_SIDE_PADDING,
          }}
        >
          <div ref={contentRef}>
            <ControlList
              controls={controls}
              sizeMode={sizeMode}
              onOpenSettings={openSettings}
            />
          </div>
        </section>
      )}
    </main>
  );
};
