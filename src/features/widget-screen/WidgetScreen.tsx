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
import { animate, useReducedMotion } from "motion/react";
import { Loader2, Minimize2, Pin, PinOff, Settings, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import appLogo from "@/assets/app-logo.png";
import { ControlCard } from "./components/ControlCard";
import { MascotSprite } from "./MascotSprite";
import type {
  WidgetCollapseCorner,
  WidgetCollapseMode,
  WidgetMascotStyle,
  WidgetControl,
  WidgetState,
} from "./types";
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
/** How far the pointer travels on a pill or bubble before a press is a drag
 * rather than a click that expands it. */
const COLLAPSED_DRAG_THRESHOLD = 4;
/** Windows 11's motion (Fluent): things arrive fast and settle, and leave
 * quicker than they came, as the Start menu, Quick Settings and Settings
 * pages do. Expanding decelerates (Fluent's Decelerate Max); collapsing is
 * shorter and accelerates into the corner, starting slow and finishing fast
 * (an ease-in; Fluent's Accelerate Min eases out again at the end, which
 * read as rushed). Neither overshoots: a bounce shrank the shell below the
 * pill's size and cut its icon and title off. Seconds. */
const EXPAND_DURATION = 0.3;
const COLLAPSE_DURATION = 0.36;
export const EXPAND_TRANSITION = {
  duration: EXPAND_DURATION,
  ease: [0.1, 0.9, 0.2, 1],
} as const;
export const COLLAPSE_TRANSITION = {
  duration: COLLAPSE_DURATION,
  ease: [0.6, 0, 0.8, 0.2],
} as const;
/** How far the cards rise as they fade in on an expand, in px, as a
 * Settings page's content does. */
const CARDS_RISE = 10;
/** How small the moth starts as it lands on a collapse, and how large it
 * swells as it dissolves into the shell on an expand. */
const MOTH_LANDING_SCALE = 0.6;
const MOTH_RELEASE_SCALE = 1.3;

/** Pins an element to the widget's collapse corner, so the shell shrinks into
 * it and grows out of it, and the content inside holds still meanwhile. */
/** The CSS transform origin at a collapse corner. */
const cornerOrigin = (corner: WidgetCollapseCorner) =>
  `${corner.endsWith("Right") ? "right" : "left"} ${corner.startsWith("bottom") ? "bottom" : "top"}`;

const cornerClasses = (corner: WidgetCollapseCorner) =>
  cn(
    corner.startsWith("bottom") ? "bottom-0" : "top-0",
    corner.endsWith("Right") ? "right-0" : "left-0",
  );

/** Resolves once the window has grown past `width`, so an expand animation
 * starts from the real window size. Gives up after half a second. */
const waitForViewportWider = (width: number) =>
  new Promise<void>((resolve) => {
    const started = performance.now();
    const check = () => {
      if (window.innerWidth > width || performance.now() - started > 500) {
        resolve();
      } else {
        requestAnimationFrame(check);
      }
    };
    check();
  });
const WIDGET_MIN_HEIGHT = 136;
const RESIZE_SAVE_DELAY_MS = 300;
/** Side/bottom inset (px) around the control grid — Tailwind `p-4`. Kept tight
 * so the cards sit close to the edges; the top still uses the larger
 * `edgePadding` to clear the overlaid title bar. */
const TitleBarButton = ({
  label,
  onClick,
  folding,
  children,
}: {
  label: string;
  onClick: (event: React.MouseEvent) => void;
  /** The label is portalled outside the shell, so it wouldn't fade with it;
   * it's put away for the fold instead of being left floating on its own. */
  folding: boolean;
  children: React.ReactNode;
}) => (
  <Tooltip disabled={folding}>
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

/** The widget's pin, kept in step with toggles made from the Settings tab. */
const useWidgetPinned = (widgetId: string) => {
  const [pinned, setPinned] = useState(false);

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

  return [pinned, setPinned] as const;
};

const WidgetTitleBar = ({
  widgetId,
  pinned,
  setPinned,
  onOpenSettings,
  onCollapse,
  onRevealChange,
  folding,
}: {
  widgetId: string;
  pinned: boolean;
  setPinned: (pinned: boolean) => void;
  onOpenSettings: () => void;
  onCollapse: () => void;
  /** Notifies the shell when the title bar is hovered/focused so it can reveal
   * its own background and border in step with the title bar. */
  onRevealChange: (revealed: boolean) => void;
  folding: boolean;
}) => {
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
        "absolute inset-x-0 top-0 z-10 flex flex-row items-center justify-between gap-1 px-2 text-foreground",
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
        // The backend persists the new spot once the move settles; on Windows
        // this promise resolves as the drag begins, too early to save from.
        void getCurrentWindow().startDragging();
      }}
    >
      <TooltipProvider>
        {/* The widget's own tools on the left, the window's on the right in
            the order a title bar has them; the gap between is the drag handle. */}
        <div className="flex items-center gap-0.5">
          {/* Pinning is Pro, and this window has no room to sell it, so Free
              leaves the button out. Unpinning is always offered. */}
          {hasPro || pinned ? (
            <TitleBarButton
              folding={folding}
              label={pinned ? "Unpin widget" : "Pin widget"}
              onClick={() => void togglePinned()}
            >
              {/* Swap to the slashed "off" glyph so the icon reflects what the
                  button will do; keep the same color in both states. */}
              {pinned ? <PinOff size={15} /> : <Pin size={15} />}
            </TitleBarButton>
          ) : null}
          <TitleBarButton
            folding={folding}
            label="Widget settings"
            onClick={onOpenSettings}
          >
            <Settings size={15} />
          </TitleBarButton>
        </div>
        <div className="flex items-center gap-0.5">
          <TitleBarButton
            folding={folding}
            label="Collapse widget"
            onClick={onCollapse}
          >
            <Minimize2 size={15} />
          </TitleBarButton>
          <TitleBarButton
            folding={folding}
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

/**
 * The collapsed widget: a slim pill with the widget's title, or a round icon
 * bubble. A click expands it; a press that travels drags it, unless pinned.
 * Its rendered size is what the window shrinks to, so it reports that size
 * whenever it changes.
 */
export const CollapsedWidget = ({
  mode,
  mascotStyle = "celShaded",
  mascotAnimated = true,
  title,
  pinned,
  style,
  probe = false,
  ghost = false,
  onMeasure,
  onExpand,
  onHoverChange,
}: {
  mode: WidgetCollapseMode;
  mascotStyle?: WidgetMascotStyle;
  mascotAnimated?: boolean;
  title: string;
  pinned: boolean;
  style: React.CSSProperties;
  /** An invisible copy the expanded widget measures to know what to shrink
   * into. It takes no input and reports nothing. */
  probe?: boolean;
  /** The pill's contents only, drawn over the folding shell so the icon is
   * already there when the real pill takes over. Takes no input. */
  ghost?: boolean;
  onMeasure?: (width: number, height: number) => void;
  onExpand?: () => void;
  onHoverChange?: (hovering: boolean) => void;
}) => {
  const ref = useRef<HTMLButtonElement>(null);
  const pressRef = useRef<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);
  // Drive the mascot's hover and press poses.
  const [hovering, setHovering] = useState(false);
  const [pressed, setPressed] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !onMeasure) return;
    // The border box, not the bounding rect: the pill can be held scaled
    // while the window changes zoom, and a transform must not change the size
    // the window is fitted to. The observer reports once on observe.
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.borderBoxSize[0];
      onMeasure(Math.ceil(box.inlineSize), Math.ceil(box.blockSize));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [mode, mascotStyle, title, onMeasure]);

  return (
    <button
      ref={ref}
      type="button"
      aria-label={`Expand ${title}`}
      aria-hidden={probe || ghost || undefined}
      tabIndex={probe || ghost ? -1 : undefined}
      className={cn(
        "flex shrink-0 items-center text-foreground",
        "transition-[filter] hover:brightness-110 focus-visible:outline-none",
        mode === "pill" && "h-10 max-w-80 gap-2 pl-3 pr-4",
        mode === "bubble" && "size-11 justify-center",
        // Padded so the moth's float, flutter and glow stay inside the
        // window, which is cut square to this box. Only the moth itself
        // takes the pointer (see the hit circle below), not the padding.
        mode === "mascot"
          ? "pointer-events-none relative size-24 justify-center p-5"
          : "border border-border/20",
        probe && "pointer-events-none invisible absolute left-0 top-0",
        ghost && "pointer-events-none",
      )}
      // The shell's own background, so the shell shrinking into the pill and
      // the pill replacing it look the same. The mascot stands on its own.
      style={mode === "mascot" ? undefined : { ...style, borderRadius: 9999 }}
      onMouseEnter={() => {
        setHovering(true);
        onHoverChange?.(true);
      }}
      onMouseLeave={() => {
        setHovering(false);
        setPressed(false);
        onHoverChange?.(false);
      }}
      onMouseDown={(event) => {
        if (event.button !== 0) return;
        pressRef.current = { x: event.clientX, y: event.clientY };
        draggedRef.current = false;
        setPressed(true);
      }}
      onMouseMove={(event) => {
        const press = pressRef.current;
        if (!press || pinned) return;
        const travelled = Math.hypot(
          event.clientX - press.x,
          event.clientY - press.y,
        );
        if (travelled < COLLAPSED_DRAG_THRESHOLD) return;
        pressRef.current = null;
        draggedRef.current = true;
        setPressed(false);
        void getCurrentWindow().startDragging();
      }}
      onMouseUp={() => {
        pressRef.current = null;
        setPressed(false);
      }}
      onClick={() => {
        if (draggedRef.current) {
          draggedRef.current = false;
          return;
        }
        onExpand?.();
      }}
    >
      {mode === "mascot" ? (
        <>
          {/* Pointer events land here and bubble to the button, so hovering
            and clicking start on the moth's body rather than its box. */}
          {!probe && !ghost ? (
            <span className="pointer-events-auto absolute left-1/2 top-1/2 size-12 -translate-x-1/2 -translate-y-1/2 rounded-full" />
          ) : null}
          <MascotSprite
            style={mascotStyle}
            hovering={hovering}
            pressed={pressed}
            // The measuring copy and the fading-in copy hold still, so the real
            // one takes over from them without a jump.
            animated={mascotAnimated && !probe && !ghost}
          />
        </>
      ) : (
        <img
          src={appLogo}
          alt=""
          draggable={false}
          className={cn("shrink-0", mode === "pill" ? "size-5" : "size-6")}
        />
      )}
      {mode === "pill" ? (
        <span className="truncate text-sm font-semibold">{title}</span>
      ) : null}
    </button>
  );
};

export const WidgetScreen = ({ widgetId }: { widgetId: string }) => {
  const {
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
  } = useWidgetControls(widgetId);
  const [pinned, setPinned] = useWidgetPinned(widgetId);
  const reduceMotion = useReducedMotion();
  // Set while the widget folds or unfolds, so nothing resizes the window
  // underneath the animation.
  const [transition, setTransition] = useState<
    "none" | "collapsing" | "expanding"
  >("none");
  // Read by handlers and timers, which may hold an older render's closure;
  // updated at once so a second click can't start a second fold.
  const transitionRef = useRef(transition);
  const changeTransition = (next: typeof transition) => {
    transitionRef.current = next;
    setTransition(next);
  };
  const shellRef = useRef<HTMLElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const ghostMothRef = useRef<HTMLDivElement>(null);
  // The window always runs at the open zoom, so nothing changes size mid-fold.
  // The pill is drawn scaled by this to reach the collapsed size, and its
  // window is sized for that.
  const pillRatio = scale > 0 ? collapsedScale / scale : 1;
  const pillSizeRef = useRef({ width: 0, height: 0 });
  // Whether the window has been fitted to the pill since it last expanded.
  const fittedRef = useRef(false);
  const expandFromRef = useRef<{ width: number; height: number } | null>(null);
  // Whether the pointer is anywhere on the widget. Only times auto collapse;
  // what's drawn follows `unfolded` and the title bar.
  const [pointerOver, setPointerOver] = useState(false);
  // Set by an unfold under the pointer: the shell grew out of the pill with
  // its background, so a pinned widget keeps it while the pointer stays, and
  // goes bare like any pinned widget once it leaves.
  const [unfolded, setUnfolded] = useState(false);
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
    if (
      !content ||
      collapsed ||
      transition !== "none" ||
      !("__TAURI_INTERNALS__" in window)
    ) {
      return;
    }

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
  }, [
    collapsed,
    transition,
    sizeMetrics.cardBasis,
    sizeMetrics.edgePadding,
    widgetId,
  ]);

  // The content only mounts once the bridge has loaded, so both re-run then.
  useLayoutEffect(() => {
    syncWidgetLayout();
  }, [syncWidgetLayout, controls, hasLoaded]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => syncWidgetLayout());
    observer.observe(content);
    return () => observer.disconnect();
  }, [syncWidgetLayout, hasLoaded]);

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

  const duration = reduceMotion ? 0 : COLLAPSE_DURATION;
  const expandDuration = reduceMotion ? 0 : EXPAND_DURATION;
  // Read when a fold runs; `shellStyle` is declared further down.
  const shellRadius = () => Number(shellStyle.borderRadius ?? 0);

  // Size and corners run off one progress value so they stay in step. The
  // radius never passes half the height, so the corners stay round.
  const morphShell = (
    shell: HTMLElement,
    from: { width: number; height: number; radius: number },
    to: { width: number; height: number; radius: number },
    transition: typeof EXPAND_TRANSITION | typeof COLLAPSE_TRANSITION,
  ) =>
    animate(0, 1, {
      ...(reduceMotion ? { duration: 0 } : transition),
      onUpdate: (progress) => {
        const width = from.width + (to.width - from.width) * progress;
        const height = from.height + (to.height - from.height) * progress;
        const radius = Math.min(
          from.radius + (to.radius - from.radius) * progress,
          height / 2,
        );
        shell.style.width = `${width}px`;
        shell.style.height = `${height}px`;
        shell.style.borderRadius = `${radius}px`;
      },
    });

  // The shell shrinks into its collapse corner inside the still
  // full-size window. The window never shrinks: once the pill has taken over
  // (see `fitCollapsed`) it is clipped to the pill, so the webview never
  // shows a stale frame of a resize.
  const collapse = async () => {
    const shell = shellRef.current;
    const fade = fadeRef.current;
    const probe = probeRef.current?.firstElementChild;
    if (transitionRef.current !== "none") return;
    if (!shell || !fade || !probe) {
      setCollapsed(true);
      return;
    }
    const target = probe.getBoundingClientRect();
    const width = Math.ceil(target.width * pillRatio);
    const height = Math.ceil(target.height * pillRatio);
    changeTransition("collapsing");
    const start = shell.getBoundingClientRect();
    const ghost = ghostRef.current;
    const ghostMoth = ghostMothRef.current;
    const mascot = collapseMode === "mascot";
    const morph = morphShell(
      shell,
      { width: start.width, height: start.height, radius: shellRadius() },
      { width, height, radius: height / 2 },
      COLLAPSE_TRANSITION,
    );
    await Promise.all([
      // The cards go first and quickly for the moth, so it never shows
      // through them as it arrives.
      animate(
        fade,
        { opacity: 0 },
        {
          duration: duration * (mascot ? 0.35 : 0.5),
          ease: COLLAPSE_TRANSITION.ease,
        },
      ),
      ghost &&
        animate(
          ghost,
          { opacity: 1 },
          // The moth arrives as the shell leaves, so the corner is never
          // empty between them; the pill waits for the shell to reach it.
          mascot
            ? { duration: duration * 0.5, delay: duration * 0.25 }
            : { duration: duration * 0.5, delay: duration * 0.4 },
        ),
      // The moth has no background, so the shell leaves rather than becoming
      // it, and is gone before it is small enough to read as a disc behind it.
      // Once it's gone and the moth is in, the rest of its shrink can't be
      // seen, so the fold ends there instead of idling until it's done.
      mascot
        ? animate(
            shell,
            { opacity: 0 },
            {
              duration: duration * 0.45,
              ease: COLLAPSE_TRANSITION.ease,
            },
          )
        : morph,
      // The moth lands: it grows into place as it fades in, settling with a
      // slight overshoot, and the fold ends once it has.
      mascot &&
        ghostMoth &&
        animate(
          ghostMoth,
          { scale: [MOTH_LANDING_SCALE, 1] },
          {
            duration: duration * 0.9,
            delay: duration * 0.15,
            ease: "backOut",
          },
        ),
    ]);
    morph.stop();
    setUnfolded(false);
    setCollapsed(true);
    changeTransition("none");
  };

  // The clip comes off first (and the window moves, if it has to expand the
  // other way), and the shell then unfolds out of the pill (see the layout
  // effect below).
  const expand = async () => {
    if (transitionRef.current !== "none") return;
    changeTransition("expanding");
    setUnfolded(true);
    // The next collapse has to fit the window again, even at the same size.
    fittedRef.current = false;
    // The pill stays drawn: the window only loses its clip, unless it has to
    // move, and then the backend keeps the pill's old spot clipped away.
    try {
      // The backend picks the corner to unfold from: the preferred direction,
      // flipped on an axis with no room.
      const state = await invoke<WidgetState>("set-widget-collapsed", {
        widgetId,
        collapsed: false,
      });
      if (state?.collapseCorner) setCollapseCorner(state.collapseCorner);
    } catch {
      changeTransition("none");
      return;
    }
    const from = {
      width: pillSizeRef.current.width * pillRatio,
      height: pillSizeRef.current.height * pillRatio,
    };
    await waitForViewportWider(from.width);
    expandFromRef.current = from;
    setCollapsed(false);
  };

  useLayoutEffect(() => {
    const from = expandFromRef.current;
    const shell = shellRef.current;
    const fade = fadeRef.current;
    if (collapsed || !from) return;
    expandFromRef.current = null;
    // Left on only by an expand that had to move the window.
    void invoke("clear-widget-clip", { widgetId }).catch(() => undefined);
    if (!shell || !fade) {
      changeTransition("none");
      return;
    }
    // React owns the radius through `style`; the animation ends on the same
    // value so handing it back changes nothing.
    const radius = `${shellRadius()}px`;
    shell.style.width = `${from.width}px`;
    shell.style.height = `${from.height}px`;
    shell.style.borderRadius = `${from.height / 2}px`;
    fade.style.opacity = "0";
    const ghost = ghostRef.current;
    const mascot = collapseMode === "mascot";
    const ghostMoth = ghostMothRef.current;
    if (mascot && ghostMoth) {
      // The moth swells into the shell growing out of it as it fades.
      void animate(
        ghostMoth,
        { scale: [1, MOTH_RELEASE_SCALE] },
        { duration: expandDuration * 0.45, ease: "easeOut" },
      );
    }
    if (ghost) {
      ghost.style.opacity = "1";
      // The moth stays until the shell has faded in around it, so the two
      // overlap rather than leaving the corner empty between them.
      void animate(
        ghost,
        { opacity: 0 },
        { duration: expandDuration * (mascot ? 0.45 : 0.4) },
      );
    }
    if (mascot) {
      // Held back a moment: the shell eases out fast, so by then it has
      // grown well past the moth and never shows as a disc around it.
      shell.style.opacity = "0";
      void animate(
        shell,
        { opacity: 1 },
        { duration: expandDuration * 0.35, delay: expandDuration * 0.05 },
      ).then(() => {
        shell.style.opacity = "";
      });
    }
    void Promise.all([
      morphShell(
        shell,
        { ...from, radius: from.height / 2 },
        {
          width: window.innerWidth,
          height: window.innerHeight,
          radius: shellRadius(),
        },
        EXPAND_TRANSITION,
      ),
      // The cards rise a little as they fade in, as a Settings page does.
      animate(
        fade,
        { opacity: 1, y: [CARDS_RISE, 0] },
        // Behind the shell by a beat; for the moth, which has no pill
        // background to grow out of, only just, so the shell is never an
        // empty box.
        {
          ease: EXPAND_TRANSITION.ease,
          ...(mascot
            ? { duration: expandDuration * 0.45, delay: expandDuration * 0.15 }
            : { duration: expandDuration * 0.6, delay: expandDuration * 0.4 }),
        },
      ),
    ]).then(() => {
      shell.style.width = "";
      shell.style.height = "";
      shell.style.borderRadius = radius;
      fade.style.opacity = "";
      fade.style.transform = "";
      changeTransition("none");
    });
    // Runs on the flip to expanded only; the other values are read as they are.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed]);

  // Clips the window to the pill. Also runs for a widget that opens
  // collapsed, clipping it again at the freshly measured size.
  const fitCollapsed = useCallback(
    (width: number, height: number) => {
      // The pill reports its size on mount and again from its observer. A
      // late report landing after an expand began would shrink the window
      // back around the opened widget, so once one starts the pill is ignored;
      // and a size already sent isn't sent twice.
      if (transitionRef.current === "expanding") return;
      const last = pillSizeRef.current;
      if (fittedRef.current && last.width === width && last.height === height) {
        return;
      }
      fittedRef.current = true;
      pillSizeRef.current = { width, height };
      void invoke("set-widget-collapsed", {
        widgetId,
        collapsed: true,
        width,
        height,
      }).catch(() => undefined);
    },
    [widgetId],
  );

  // Expanded from elsewhere ("Reset position" in Settings brings a widget back
  // expanded). The widget's own folds also echo here, every target hears an
  // emit, so a change only applies while nothing is animating.
  useEffect(() => {
    const unlisten = listen<{ widgetId: string; collapsed?: boolean }>(
      "widget-settings-changed",
      (event) => {
        if (event.payload.widgetId !== widgetId) return;
        if (event.payload.collapsed !== false) return;
        if (transitionRef.current !== "none") return;
        setCollapsed(false);
      },
    );
    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, [setCollapsed, widgetId]);

  // A safety net under the folds: once nothing is animating, an opened widget
  // squeezed into a tiny window means a resize request lost a race, so the
  // right one is sent again instead of leaving it stuck. A collapsed window
  // keeps the open size and is clipped to the pill, so its size says nothing.
  const healWindowRef = useRef(() => {});
  healWindowRef.current = () => {
    if (transitionRef.current !== "none") return;
    if (!collapsed && window.innerHeight < WIDGET_MIN_HEIGHT - 8) {
      void invoke("set-widget-collapsed", { widgetId, collapsed: false }).catch(
        () => undefined,
      );
    }
  };
  useEffect(() => {
    let timer: number | undefined;
    const check = () => {
      window.clearTimeout(timer);
      // Lets an in-flight resize land before judging the size.
      timer = window.setTimeout(() => healWindowRef.current(), 250);
    };
    check();
    window.addEventListener("resize", check);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", check);
    };
  }, [collapsed, transition]);

  // Auto collapse: once the pointer has been off the open widget for the set
  // time, it folds into its pill. Coming back restarts the wait, and so does
  // a press still held (a slider dragged past the edge) until it's let go.
  const [pressing, setPressing] = useState(false);
  useEffect(() => {
    const down = () => setPressing(true);
    const up = () => setPressing(false);
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);
  const collapseRef = useRef(collapse);
  collapseRef.current = collapse;
  useEffect(() => {
    if (
      autoCollapseSeconds < 0 ||
      collapsed ||
      transition !== "none" ||
      pointerOver ||
      pressing
    ) {
      return;
    }
    const timer = window.setTimeout(
      () => void collapseRef.current(),
      autoCollapseSeconds * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [autoCollapseSeconds, collapsed, transition, pointerOver, pressing]);

  const shellStyle = useMemo(
    () =>
      ({
        ...widgetShellStyle(theme, sizeMode, cornerMode),
        // Read by the translucent tile rules in App.css.
        "--tile-opacity": `${tileOpacity}%`,
      }) as React.CSSProperties,
    [cornerMode, sizeMode, theme, tileOpacity],
  );

  // While we're still connecting to the bridge there's nothing to grab onto, so
  // keep the shell opaque (the same chrome an unpinned widget shows) instead of
  // leaving a transparent window floating with a lone line of text.
  // Folding shows the shell's background, so the shell and the pill it turns
  // into match even on a pinned widget whose chrome is hidden.
  const folding = transition !== "none";
  // A pinned widget shows it only while its title bar is hovered, or just
  // after it unfolded; the cards alone never bring it up.
  const showShell = shellRevealed || unfolded || !hasLoaded || folding;
  const pillTitle = title?.trim() || "Lights";

  if (collapsed) {
    return (
      // Held to the collapse corner, the one the window folds toward, so the
      // pill sits where the shell shrank to in both window sizes. Keyed apart
      // from the expanded shell so the animated element isn't reused.
      <main
        key="collapsed"
        className={cn(
          "flex h-screen w-screen overflow-hidden bg-transparent",
          collapseCorner.startsWith("bottom") ? "items-end" : "items-start",
          collapseCorner.endsWith("Right") ? "justify-end" : "justify-start",
        )}
      >
        <HueResourcesStoreEffects />
        <EntertainmentStoreEffects />
        {/* Scaled from its corner to the collapsed size: the window runs at the
          open zoom, and is sized for the pill at this scale. The pill measures
          its unscaled box, so the scale never feeds back into its size. */}
        <div
          style={
            pillRatio !== 1
              ? {
                  transform: `scale(${pillRatio})`,
                  transformOrigin: cornerOrigin(collapseCorner),
                }
              : undefined
          }
        >
          <CollapsedWidget
            mode={collapseMode}
            mascotStyle={mascotStyle}
            mascotAnimated={mascotAnimated}
            title={pillTitle}
            pinned={pinned}
            style={shellStyle}
            onMeasure={fitCollapsed}
            onExpand={() => void expand()}
            // The pointer is still on the widget when it opens under it.
            onHoverChange={setPointerOver}
          />
        </div>
      </main>
    );
  }

  return (
    <>
      <main
        key="expanded"
        ref={shellRef}
        className={cn(
          "group/widget absolute h-screen w-screen overflow-hidden border text-foreground transition-colors",
          cornerClasses(collapseCorner),
          showShell ? "border-border/20" : "border-transparent",
          showShell && !folding && "shadow-2xl",
          flashing && "bg-primary/35",
        )}
        data-tile-background={backgroundMode}
        style={
          showShell
            ? shellStyle
            : { ...shellStyle, backgroundColor: "transparent" }
        }
        onMouseEnter={() => setPointerOver(true)}
        onMouseLeave={() => {
          setPointerOver(false);
          setUnfolded(false);
        }}
      >
        <HueResourcesStoreEffects />
        <EntertainmentStoreEffects />
        <div ref={probeRef} aria-hidden>
          <CollapsedWidget
            mode={collapseMode}
            mascotStyle={mascotStyle}
            title={pillTitle}
            pinned={pinned}
            style={shellStyle}
            probe
          />
        </div>
        {/* Faded as one while folding. The content keeps the window's full size
          inside it, so it clips rather than reflowing as the shell shrinks. */}
        <div
          ref={fadeRef}
          className={cn(
            "absolute h-[calc(100vh-2px)] w-[calc(100vw-2px)]",
            cornerClasses(collapseCorner),
          )}
        >
          <WidgetTitleBar
            widgetId={widgetId}
            pinned={pinned}
            setPinned={setPinned}
            onOpenSettings={openSettings}
            onCollapse={collapse}
            onRevealChange={setShellRevealed}
            folding={folding}
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
              className="h-[calc(100vh-2px)] w-[calc(100vw-2px)] overflow-hidden"
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
        </div>
      </main>
      {/* The pill's icon and title, faded in where the pill will be. Outside the
        shell, so the shell's corners can't clip it. */}
      <div
        ref={ghostRef}
        aria-hidden
        className={cn(
          "pointer-events-none fixed z-10 opacity-0",
          cornerClasses(collapseCorner),
        )}
        // The theme's tokens for the title, without the shell's background;
        // scaled to the collapsed size the pill will have.
        style={{
          ...shellStyle,
          backgroundColor: "transparent",
          transform: pillRatio !== 1 ? `scale(${pillRatio})` : undefined,
          transformOrigin: cornerOrigin(collapseCorner),
        }}
      >
        {/* Scaled on its own, about the moth's middle, apart from the
          collapsed size the wrapper scales it to. */}
        <div ref={ghostMothRef}>
          <CollapsedWidget
            mode={collapseMode}
            mascotStyle={mascotStyle}
            mascotAnimated={mascotAnimated}
            title={pillTitle}
            pinned={pinned}
            style={{
              backgroundColor: "transparent",
              borderColor: "transparent",
            }}
            ghost
          />
        </div>
      </div>
    </>
  );
};
