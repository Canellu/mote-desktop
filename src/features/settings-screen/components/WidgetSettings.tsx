import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useEntitlements } from "@/context/EntitlementContext";
import { useProUpgrade } from "@/features/pro/proUpgrade";
import { ManageControls } from "@/features/widget-screen/components/ManageControls";
import type {
  WidgetBackgroundMode,
  WidgetCollapseMode,
  WidgetCornerMode,
  WidgetThemeMode,
} from "@/features/widget-screen/types";
import {
  DEFAULT_TILE_OPACITY,
  AUTO_COLLAPSE_SECONDS,
  WIDGET_COLLAPSED_SCALE_MAX,
  WIDGET_SCALE,
  type WidgetConfigDraft,
  type WidgetSummary,
} from "@/features/widget-screen/useWidgets";
import { Pin, PinOff, RotateCcw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { AutoCollapseSetting } from "./AutoCollapseSetting";
import { DeleteResourceButton } from "./DeleteResourceButton";
import { OpenDirectionRing } from "./OpenDirectionRing";
import { ProTag } from "./ProTag";
import { MascotStylePicker } from "./MascotStylePicker";
import { SettingsReveal, SettingsRow, SettingsSection } from "./SettingsList";
import { SegmentedControl } from "./SegmentedControl";
import {
  WIDGET_BACKGROUND_OPTIONS,
  WIDGET_COLLAPSE_OPTIONS,
  WIDGET_THEME_OPTIONS,
} from "./widgetAppearanceOptions";
import { WIDGET_CORNER_OPTIONS } from "./widgetCornerOptions";
import { WidgetPositionPicker } from "./WidgetPositionPicker";

const ProTitle = ({ children }: { children: React.ReactNode }) => (
  <>
    {children}
    <ProTag />
  </>
);

/** How long a slider waits after its last step before saving. */
const SLIDER_COMMIT_DELAY_MS = 300;

/**
 * A slider's shown value, saved once it settles. Arrow keys commit on every
 * step, and each save refreshes the widget list; a refresh landing mid-burst
 * carried an older value back into the draft, so later steps started from it
 * and were lost. Steps now save once, and the draft ignores the saved value
 * until that save is sent.
 */
const useSliderDraft = (value: number, onCommit: (value: number) => void) => {
  const [draft, setDraft] = useState(value);
  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    if (timerRef.current == null) setDraft(value);
  }, [value]);
  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    },
    [],
  );
  const cancel = () => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };
  const commit = (next: number) => {
    cancel();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      onCommit(next);
    }, SLIDER_COMMIT_DELAY_MS);
  };
  const commitNow = (next: number) => {
    cancel();
    setDraft(next);
    onCommit(next);
  };
  const revert = () => {
    cancel();
    setDraft(value);
  };
  return { draft, setDraft, commit, commitNow, revert };
};

/**
 * One size slider. It resizes the widget live as it moves: at most one update
 * per frame, the latest value winning. The config is saved once it settles.
 * `collapsed` picks the collapsed scale over the open one.
 */
const WidgetScaleSetting = ({
  widgetId,
  collapsed = false,
  title,
  description,
  scale,
  hasPro,
  onProRequired,
  onCommit,
}: {
  widgetId: string;
  collapsed?: boolean;
  title: string;
  description: string;
  scale: number;
  hasPro: boolean;
  onProRequired: () => void;
  onCommit: (scale: number) => void;
}) => {
  const { draft, setDraft, commit, commitNow, revert } = useSliderDraft(
    scale,
    onCommit,
  );
  const liveRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const sendLive = (value: number) => {
    liveRef.current = value;
    if (frameRef.current != null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      void invoke("set-widget-scale", {
        widgetId,
        scale: liveRef.current,
        collapsed,
      }).catch(() => undefined);
    });
  };
  useEffect(
    () => () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">
            <ProTitle>{title}</ProTitle>
          </p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm tabular-nums text-muted-foreground">
            {draft}%{draft === WIDGET_SCALE.default ? " · Default" : null}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="rounded-lg"
            disabled={draft === WIDGET_SCALE.default}
            onClick={() => commitNow(WIDGET_SCALE.default)}
          >
            <RotateCcw />
            Reset
          </Button>
        </div>
      </div>
      <Slider
        aria-label={title}
        min={WIDGET_SCALE.min}
        max={collapsed ? WIDGET_COLLAPSED_SCALE_MAX : WIDGET_SCALE.max}
        step={WIDGET_SCALE.step}
        value={[draft]}
        onValueChange={(next) => {
          const value = Array.isArray(next) ? next[0] : next;
          setDraft(value);
          // Free can't leave 100%, so there's nothing to show live.
          if (hasPro) sendLive(value);
        }}
        onValueCommitted={(next) => {
          const value = Array.isArray(next) ? next[0] : next;
          // Free stays at 100%; offer Pro and put the slider back.
          if (value !== WIDGET_SCALE.default && !hasPro) {
            revert();
            onProRequired();
            return;
          }
          commit(value);
        }}
      />
    </div>
  );
};

export const WidgetSettings = ({
  widget,
  onReopen,
  onClose,
  onRemove,
  onSetPinned,
  onSetAlwaysOnTop,
  onSetConfig,
}: {
  widget: WidgetSummary;
  onReopen: (id: string) => void;
  onClose: (id: string) => void;
  onRemove: (id: string) => Promise<void>;
  onSetPinned: (id: string, pinned: boolean) => void;
  onSetAlwaysOnTop: (id: string, alwaysOnTop: boolean) => void;
  onSetConfig: (id: string, config: Partial<WidgetConfigDraft>) => void;
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
    scale,
    collapsedScale,
    collapseMode,
    mascotStyle,
    mascotAnimated,
    expandVertical,
    expandHorizontal,
    autoCollapseSeconds,
    controls,
    locked,
  } = widget;
  const { hasPro } = useEntitlements();
  const { requestPro } = useProUpgrade();
  const upgrade = () => requestPro("advanced_widgets");

  // Only what changed. Sending the whole widget as shown wrote the Free view
  // (one control, the standard look) over a setup saved under Pro.
  const updateConfig = (next: Partial<WidgetConfigDraft>) =>
    onSetConfig(widgetId, next);
  // Follows the slider while dragging; saved once it settles.
  const opacity = useSliderDraft(tileOpacity, (value) =>
    updateConfig({ tileOpacity: value }),
  );

  // Free is one widget at the system theme, standard size and corners, neither
  // pinned nor on top. Reaching past that offers Pro; stepping back inside it never does,
  // so nothing can be left stuck where a lapsed purchase put it.
  const activate = () => (locked ? upgrade() : onReopen(widgetId));

  return (
    <>
      <SettingsSection title="Window">
        <SettingsRow
          title="Active"
          description={
            locked && !enabled
              ? "Needs Mote Pro to show this widget."
              : "Show this widget on your desktop."
          }
          keepControlInline
        >
          <Switch
            checked={enabled}
            onCheckedChange={(checked) =>
              checked ? activate() : onClose(widgetId)
            }
            aria-label="Active"
          />
        </SettingsRow>
        <SettingsRow
          title={<ProTitle>Pinned</ProTitle>}
          description="Lock this widget to its current position."
          keepControlInline
        >
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="rounded-lg"
            aria-label={pinned ? "Unpin widget" : "Pin widget"}
            onClick={() =>
              !pinned && !hasPro ? upgrade() : onSetPinned(widgetId, !pinned)
            }
          >
            {pinned ? <PinOff /> : <Pin />}
            {pinned ? "Unpin" : "Pin"}
          </Button>
        </SettingsRow>
        <SettingsRow
          title={<ProTitle>Always on top</ProTitle>}
          description="Keep this widget floating above other windows."
          keepControlInline
        >
          <Switch
            checked={alwaysOnTop}
            onCheckedChange={(checked) =>
              checked && !hasPro
                ? upgrade()
                : onSetAlwaysOnTop(widgetId, checked)
            }
            aria-label="Always on top"
          />
        </SettingsRow>
        <WidgetPositionPicker
          widgetId={widgetId}
          onProRequired={hasPro ? undefined : upgrade}
        />
      </SettingsSection>

      <SettingsSection title="Appearance">
        <SettingsRow
          title={<ProTitle>Theme</ProTitle>}
          description="Choose the widget's light or dark appearance."
        >
          <SegmentedControl
            value={themeMode}
            onValueChange={(value) =>
              value !== "system" && !hasPro
                ? upgrade()
                : updateConfig({ themeMode: value as WidgetThemeMode })
            }
            ariaLabel="Widget theme"
            options={WIDGET_THEME_OPTIONS}
            layoutId={`widget-theme-mode-pill-${widgetId}`}
          />
        </SettingsRow>
        <SettingsRow
          title={<ProTitle>Corners</ProTitle>}
          description="Round the widget and its cards more or less."
        >
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
        </SettingsRow>
        <div className="grid min-w-0">
          <SettingsRow
            title={<ProTitle>Tile background</ProTitle>}
            description="Let the desktop show through the tiles."
          >
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
              options={WIDGET_BACKGROUND_OPTIONS}
              layoutId={`widget-background-mode-pill-${widgetId}`}
            />
          </SettingsRow>
          <SettingsReveal open={backgroundMode === "translucent"}>
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Tile opacity</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {opacity.draft}%
                    {opacity.draft === DEFAULT_TILE_OPACITY
                      ? " · Default"
                      : null}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="rounded-lg"
                    disabled={opacity.draft === DEFAULT_TILE_OPACITY}
                    onClick={() => opacity.commitNow(DEFAULT_TILE_OPACITY)}
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
                value={[opacity.draft]}
                onValueChange={(next) =>
                  opacity.setDraft(Array.isArray(next) ? next[0] : next)
                }
                onValueCommitted={(next) =>
                  opacity.commit(Array.isArray(next) ? next[0] : next)
                }
              />
            </div>
          </SettingsReveal>
        </div>
        <WidgetScaleSetting
          widgetId={widgetId}
          title="Open size"
          description="How large the widget is drawn while open."
          scale={scale}
          hasPro={hasPro}
          onProRequired={upgrade}
          onCommit={(value) => updateConfig({ scale: value })}
        />
        <WidgetScaleSetting
          widgetId={widgetId}
          collapsed
          title="Collapsed size"
          description="How large the widget is drawn while collapsed."
          scale={collapsedScale}
          hasPro={hasPro}
          onProRequired={upgrade}
          onCommit={(value) => updateConfig({ collapsedScale: value })}
        />
        <div className="grid min-w-0">
          <SettingsRow
            title="Collapsed look"
            description="What the widget folds into when you collapse it."
          >
            <SegmentedControl
              value={collapseMode}
              onValueChange={(value) =>
                updateConfig({ collapseMode: value as WidgetCollapseMode })
              }
              ariaLabel="Collapsed widget look"
              options={WIDGET_COLLAPSE_OPTIONS}
              layoutId={`widget-collapse-mode-pill-${widgetId}`}
            />
          </SettingsRow>
          <SettingsReveal open={collapseMode === "mascot"}>
            <SettingsRow
              title="Mascot style"
              description="How the moth is drawn while the widget is collapsed."
            >
              <MascotStylePicker
                value={mascotStyle}
                onValueChange={(value) => updateConfig({ mascotStyle: value })}
              />
            </SettingsRow>
            <SettingsRow
              title="Animate mascot"
              description="Let the moth idle, blink, glow and flutter. Off holds it still."
              keepControlInline
            >
              <Switch
                checked={mascotAnimated}
                onCheckedChange={(checked) =>
                  updateConfig({ mascotAnimated: checked })
                }
                aria-label="Animate mascot"
              />
            </SettingsRow>
          </SettingsReveal>
        </div>
        <SettingsRow
          title="Expand direction"
          description="The corner the widget prefers to expand toward. If there isn't room that way, it expands the other way."
        >
          <OpenDirectionRing
            vertical={expandVertical}
            horizontal={expandHorizontal}
            onChange={(vertical, horizontal) =>
              updateConfig({
                expandVertical: vertical,
                expandHorizontal: horizontal,
              })
            }
          />
        </SettingsRow>
        <AutoCollapseSetting
          seconds={autoCollapseSeconds ?? AUTO_COLLAPSE_SECONDS.off}
          onChange={(seconds) => updateConfig({ autoCollapseSeconds: seconds })}
        />
      </SettingsSection>

      <ManageControls
        controls={controls}
        onChange={(controls) => updateConfig({ controls })}
        onProRequired={hasPro ? undefined : upgrade}
        appearance={{ themeMode, sizeMode, cornerMode }}
      />

      <SettingsSection title="Remove">
        <SettingsRow
          title="Delete widget"
          description="Removes the widget and its saved controls. This can't be undone."
          keepControlInline
        >
          <DeleteResourceButton
            label="widget"
            description="This permanently removes the widget and its saved controls. This can't be undone."
            tooltip="Delete widget"
            triggerLabel="Delete"
            onDelete={() => onRemove(widgetId)}
          />
        </SettingsRow>
      </SettingsSection>
    </>
  );
};
