// Shapes for the per-widget "controls" config. These mirror the camelCase
// payloads the Rust `widget` commands serialize (`StoredWidgetControl` et al.),
// so the two stores agree on the wire format.

export type ControlTargetKind = "room" | "zone" | "light";

/** The Hue resource a control controls. */
export interface ControlTarget {
  kind: ControlTargetKind;
  /** v2 resource UUID. */
  id: string;
}

export type ControlHotkeyAction = "toggle" | "scene";

/** An optional global hotkey bound to a control (wired in a later phase). */
export interface ControlHotkey {
  /** Tauri global-control accelerator, e.g. "CommandOrControl+Alt+1". */
  accelerator: string;
  action: ControlHotkeyAction;
  /** Scene to recall when `action` is "scene". */
  sceneId?: string | null;
}

/** Discriminates the two widget card shapes. Absent is treated as "control" so
 * cards stored before this field existed keep rendering as the classic tile. */
export type WidgetControlType = "control" | "toggles";

/** Fields every widget card shares regardless of its {@link WidgetControlType}. */
interface WidgetControlBase {
  id: string;
  /** Custom name; the card falls back to the resource's own name when absent. */
  label?: string | null;
  hotkey?: ControlHotkey | null;
}

/**
 * The classic single-target control card: a power toggle, an optional
 * brightness slider, and (for room/zone targets) quick scene buttons.
 */
export interface SingleWidgetControl extends WidgetControlBase {
  /** Absent for cards stored before the type discriminator existed. */
  type?: "control";
  target: ControlTarget;
  /** Whether to show a brightness slider for this control. */
  showBrightness: boolean;
  /** Ordered scene ids shown as quick buttons (room/zone targets only). */
  sceneIds: string[];
  /**
   * Compact display: hides the brightness slider and renders selected scenes
   * as pill buttons instead of full scene cards. Defaults to false when absent.
   */
  compact?: boolean;
}

/** What tapping a toggle chip does. `power` flips the target on/off; `scene`
 * activates {@link ToggleTarget.sceneId} (and tapping an active scene chip turns
 * the space off). Defaults to `power` for chips stored before actions existed. */
export type ToggleAction = "power" | "scene";

/**
 * One chip in a {@link TogglesWidgetControl}: a target plus how a tap acts on it.
 * Extends {@link ControlTarget} so existing `{ kind, id }` payloads keep parsing
 * (their `action` resolves to `power`). `scene` actions apply to room/zone
 * targets only — a single light has no scenes.
 */
export interface ToggleTarget extends ControlTarget {
  action?: ToggleAction;
  /** Scene to activate when `action` is `scene`. */
  sceneId?: string | null;
}

/**
 * A compact multi-target card: a rail of chips, one per room/zone/light. Each
 * chip is a quick power toggle or a one-tap scene launcher — no brightness.
 */
export interface TogglesWidgetControl extends WidgetControlBase {
  type: "toggles";
  /** Ordered targets, each rendered as a chip. */
  targets: ToggleTarget[];
}

/** A chip's effective action, tolerating chips stored before actions existed. */
export const toggleAction = (target: ToggleTarget): ToggleAction =>
  target.action === "scene" ? "scene" : "power";

/** One configured card on a widget. */
export type WidgetControl = SingleWidgetControl | TogglesWidgetControl;

/** Narrows a card to the multi-target toggles variant. */
export const isTogglesControl = (
  control: WidgetControl,
): control is TogglesWidgetControl => control.type === "toggles";

/** A stable de-dupe key for a target within a toggles card. */
export const controlTargetKey = (target: ControlTarget): string =>
  `${target.kind}:${target.id}`;

export type WidgetThemeMode = "light" | "dark" | "system";
export type WidgetSizeMode = "small" | "default" | "large";
/** A fixed set of corner shapes; see `WIDGET_CORNER_SCALE`. */
export type WidgetCornerMode = "square" | "soft" | "rounded" | "round";

export interface WidgetState {
  widgetId: string;
  title: string | null;
  enabled: boolean;
  pinned: boolean;
  /** Keeps the widget window floating above others (pinning also forces this). */
  alwaysOnTop: boolean;
  userSized: boolean;
  themeMode: WidgetThemeMode;
  sizeMode: WidgetSizeMode;
  cornerMode: WidgetCornerMode;
  controls: WidgetControl[];
  /**
   * Saved under Pro past the one widget Free runs. It stays saved and comes
   * back with Pro. Only `list-widgets` reports it.
   */
  locked?: boolean;
}

/** A short, collision-resistant id for a freshly created control. */
export const newControlId = (): string =>
  `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** One physical display, in the virtual-desktop coordinate space window
 * positions are reported in. Mirrors the Rust `MonitorInfo`. */
export interface MonitorInfo {
  name: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  workX: number;
  workY: number;
  workWidth: number;
  workHeight: number;
  scaleFactor: number;
  isPrimary: boolean;
}

/** A widget window's physical position and size. Mirrors `StoredWidgetBounds`. */
export interface WidgetBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The monitor layout plus the widget's current bounds, for the position
 * picker. Mirrors the Rust `WidgetPlacement`. */
export interface WidgetPlacement {
  monitors: MonitorInfo[];
  bounds: WidgetBounds | null;
}
