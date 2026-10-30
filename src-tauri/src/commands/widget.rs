use crate::services::entitlements::Capability;
use std::{
    collections::HashSet,
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
    thread,
    time::Duration,
    time::{Instant, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{
    Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

const WIDGET_LABEL_PREFIX: &str = "widget-";
const LEGACY_WIDGET_ID: &str = "main";
const WIDGET_SETTINGS_FILE_NAME: &str = "widget-settings.json";
const DEFAULT_WIDGET_WIDTH: f64 = 360.0;
const DEFAULT_WIDGET_HEIGHT: f64 = 136.0;
const MIN_WIDGET_WIDTH: u32 = 360;
const MIN_WIDGET_HEIGHT: u32 = 136;
/// How long a widget must sit still after moving before its spot is saved.
const MOVE_SAVE_DELAY: Duration = Duration::from_millis(400);

/// The kinds of Hue resource a control can target.
const CONTROL_TARGET_KINDS: [&str; 3] = ["room", "zone", "light"];
/// The actions a control's global hotkey can perform.
const CONTROL_HOTKEY_ACTIONS: [&str; 2] = ["toggle", "scene"];

/// Emitted to a widget window when its controls are changed elsewhere (e.g.
/// from the Settings tab) so the live window updates without being reopened.
const WIDGET_CONTROLS_EVENT: &str = "widget-controls-changed";
const WIDGET_SETTINGS_CHANGED_EVENT: &str = "widget-settings-changed";
const OPEN_WIDGET_SETTINGS_EVENT: &str = "open-widget-settings";
/// Emitted to the main window when a widget control card is double-clicked, so
/// the app opens the Space screen for the control's targeted room/zone.
const OPEN_WIDGET_TARGET_EVENT: &str = "open-widget-target";
/// Emitted to the main window while a widget window is dragged/moved on screen,
/// so the Settings "Position" preview tracks the real widget live (two-way sync).
const WIDGET_MOVED_EVENT: &str = "widget-moved";

fn default_true() -> bool {
    true
}

fn default_control_type() -> String {
    "control".to_string()
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredWidgetBounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

/// The Hue resource a control manages.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredControlTarget {
    /// One of "room", "zone", or "light".
    kind: String,
    /// v2 resource UUID.
    id: String,
    /// For a toggles-card chip: "power" (flip on/off) or "scene" (activate
    /// `scene_id`). Absent on single-control targets and on chips stored before
    /// per-chip actions existed, both of which behave as "power".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    action: Option<String>,
    /// The scene a "scene" chip activates. Only meaningful for room/zone chips.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    scene_id: Option<String>,
}

/// An optional global hotkey bound to a control.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredControlHotkey {
    /// A Tauri global-control accelerator, e.g. "CommandOrControl+Alt+1".
    accelerator: String,
    /// "toggle" the target, or recall a "scene".
    action: String,
    /// The scene to recall when `action` is "scene".
    #[serde(default)]
    scene_id: Option<String>,
}

/// One configured card on a widget. A `control` card wraps a single Hue target
/// (power toggle, optional brightness, quick scenes); a `toggles` card is a rail
/// of on/off chips over `targets`. Persisted per widget so a widget reopens with
/// its cards intact.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredWidgetControl {
    id: String,
    /// "control" (single target) or "toggles" (multiple targets). Defaults to
    /// "control" for cards stored before this discriminator existed.
    #[serde(rename = "type", default = "default_control_type")]
    control_type: String,
    /// The single target for a "control" card. Absent for a "toggles" card.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    target: Option<StoredControlTarget>,
    /// The targets for a "toggles" card, each rendered as a chip. Empty for a
    /// "control" card. Always serialized (even when empty) so the renderer can
    /// rely on `targets` being an array on every card.
    #[serde(default)]
    targets: Vec<StoredControlTarget>,
    /// Custom display name; the renderer falls back to the resource's own name
    /// when this is absent.
    #[serde(default)]
    label: Option<String>,
    /// Whether to show a brightness slider (auto-defaulted from dimmability when
    /// the control is created).
    #[serde(default = "default_true")]
    show_brightness: bool,
    /// Ordered scene ids to expose as quick buttons (room/zone targets only).
    #[serde(default)]
    scene_ids: Vec<String>,
    /// Toggle-only display: hides the brightness slider and scene pills. Defaults
    /// to false (full) for controls stored before this field existed.
    #[serde(default)]
    compact: bool,
    #[serde(default)]
    hotkey: Option<StoredControlHotkey>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WidgetThemeMode {
    Light,
    Dark,
    System,
}

impl Default for WidgetThemeMode {
    fn default() -> Self {
        Self::System
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WidgetSizeMode {
    Small,
    Default,
    Large,
}

impl Default for WidgetSizeMode {
    fn default() -> Self {
        Self::Default
    }
}

/// How rounded a widget's corners are. A fixed set of steps rather than a
/// number, so every widget stays one of a few shapes that were designed.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WidgetCornerMode {
    Square,
    Soft,
    Rounded,
    Round,
}

impl Default for WidgetCornerMode {
    fn default() -> Self {
        Self::Rounded
    }
}

/// What a widget turns into when collapsed: a slim pill with its title, a
/// round icon bubble, or the moth mascot on its own.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WidgetCollapseMode {
    Pill,
    Bubble,
    Mascot,
}

/// Which drawing of the moth the `Mascot` collapse mode shows.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WidgetMascotStyle {
    #[default]
    CelShaded,
    LowPoly,
    PixelArt,
    PaperCutout,
    Watercolor,
}

/// How a widget folds into its collapsed look and unfolds out of it: the
/// panel fading into it, or the cards stacking into it one by one.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WidgetFoldAnimation {
    Fade,
    #[default]
    Stack,
}

impl Default for WidgetCollapseMode {
    fn default() -> Self {
        Self::Mascot
    }
}

/// The corner a widget folds into and unfolds from. It follows where the pill
/// was last expanded from, so the widget always opens away from the screen
/// edges it sits against.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WidgetCollapseCorner {
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight,
}

impl Default for WidgetCollapseCorner {
    fn default() -> Self {
        Self::TopLeft
    }
}

impl WidgetCollapseCorner {
    fn from_sides(right: bool, bottom: bool) -> Self {
        match (right, bottom) {
            (false, false) => Self::TopLeft,
            (true, false) => Self::TopRight,
            (false, true) => Self::BottomLeft,
            (true, true) => Self::BottomRight,
        }
    }

    fn is_right(&self) -> bool {
        matches!(self, Self::TopRight | Self::BottomRight)
    }

    fn is_bottom(&self) -> bool {
        matches!(self, Self::BottomLeft | Self::BottomRight)
    }
}

/// Which way a collapsed widget prefers to open, vertically. A preference, not
/// a rule: with no room that way, it opens the other way.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WidgetExpandVertical {
    Up,
    Down,
}

impl Default for WidgetExpandVertical {
    fn default() -> Self {
        Self::Up
    }
}

/// Which way a collapsed widget prefers to open, horizontally. Falls back the
/// same way as [`WidgetExpandVertical`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WidgetExpandHorizontal {
    Left,
    Right,
}

impl Default for WidgetExpandHorizontal {
    fn default() -> Self {
        Self::Right
    }
}

/// Whether to grow toward the preferred side along one axis: yes when the
/// widget fits there, and also when it fits neither way but the preferred side
/// still has the more room.
fn prefer_side(preferred_room: i32, other_room: i32, size: i32) -> bool {
    preferred_room >= size || (other_room < size && preferred_room >= other_room)
}

/// Where a collapsed widget sits. The position is physical, like
/// `StoredWidgetBounds`; the size is logical, because the frontend measures it
/// in CSS pixels and it has to stay the same on any display scale.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredCollapsedBounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    /// The pill's size as measured, before the zoom. A new scale sizes the
    /// window from these: scaling the rounded logical size step by step
    /// rounded a small pill back to where it was, so it fell behind the zoom
    /// and was cut off. Zero for a pill stored before they existed.
    #[serde(default)]
    css_width: u32,
    #[serde(default)]
    css_height: u32,
}

/// What the widget's tiles are painted on. `Translucent` lets the desktop show
/// through them.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WidgetBackgroundMode {
    Translucent,
    /// Also what any unknown stored value (such as the dropped `frosted`) reads as.
    #[serde(other)]
    Solid,
}

impl Default for WidgetBackgroundMode {
    fn default() -> Self {
        Self::Solid
    }
}

/// How opaque translucent tiles are, in percent. Kept within a range where the
/// tiles stay readable and still let something through.
const MIN_TILE_OPACITY: u8 = 10;
const MAX_TILE_OPACITY: u8 = 90;

fn default_tile_opacity() -> u8 {
    40
}

fn clamp_tile_opacity(value: u8) -> u8 {
    value.clamp(MIN_TILE_OPACITY, MAX_TILE_OPACITY)
}

/// How large the whole widget is drawn, in percent, applied as the window's
/// webview zoom so every part scales together.
const DEFAULT_WIDGET_SCALE: u16 = 100;
const MIN_WIDGET_SCALE: u16 = 70;
const MAX_WIDGET_SCALE: u16 = 130;
/// Collapsed, the widget is a single pill or moth, so it may grow much further.
const MAX_COLLAPSED_WIDGET_SCALE: u16 = 300;
const WIDGET_SCALE_STEP: u16 = 1;

fn default_widget_scale() -> u16 {
    DEFAULT_WIDGET_SCALE
}

fn default_mascot_animated() -> bool {
    true
}

/// How long an open widget waits, with the pointer off it, before collapsing
/// on its own. Zero collapses it as soon as the pointer leaves. Seconds, not
/// minutes: a widget meant to get out of the way should do it soon after it
/// was last used.
const MAX_AUTO_COLLAPSE_SECONDS: u16 = 30;

/// The delay as the frontend sends it: a negative number turns auto collapse
/// off, anything else is the delay in seconds.
fn auto_collapse_from(value: i32) -> Option<u16> {
    (value >= 0).then(|| value.min(MAX_AUTO_COLLAPSE_SECONDS as i32) as u16)
}

/// Snaps to the nearest step within the open range.
fn clamp_widget_scale(value: u16) -> u16 {
    snap_widget_scale(value, MAX_WIDGET_SCALE)
}

/// Snaps to the nearest step within the collapsed range.
fn clamp_collapsed_widget_scale(value: u16) -> u16 {
    snap_widget_scale(value, MAX_COLLAPSED_WIDGET_SCALE)
}

fn snap_widget_scale(value: u16, max: u16) -> u16 {
    // Snapped while wide, so a value near u16::MAX can't overflow.
    let step = WIDGET_SCALE_STEP as u32;
    let snapped = (value as u32 + step / 2) / step * step;
    snapped.clamp(MIN_WIDGET_SCALE as u32, max as u32) as u16
}

/// Free draws the widget at its standard size; any other scale is Pro.
fn exceeds_free_scale(scale: u16) -> bool {
    scale != DEFAULT_WIDGET_SCALE
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredWidget {
    id: String,
    #[serde(default)]
    title: Option<String>,
    enabled: bool,
    pinned: bool,
    bounds: Option<StoredWidgetBounds>,
    #[serde(default)]
    user_sized: bool,
    #[serde(default)]
    theme_mode: WidgetThemeMode,
    #[serde(default)]
    size_mode: WidgetSizeMode,
    #[serde(default)]
    corner_mode: WidgetCornerMode,
    #[serde(default)]
    background_mode: WidgetBackgroundMode,
    #[serde(default = "default_tile_opacity")]
    tile_opacity: u8,
    #[serde(default = "default_widget_scale")]
    scale: u16,
    /// The scale while collapsed, sized apart from the open widget. Zero in a
    /// widget stored before it existed, which takes `scale` on load.
    #[serde(default)]
    collapsed_scale: u16,
    /// Keeps the widget window floating above other windows. Fully independent
    /// of `pinned`: pinning only locks the widget's position, it does not affect
    /// stacking, and a widget can be on-top without being pinned.
    #[serde(default)]
    always_on_top: bool,
    #[serde(default)]
    collapse_mode: WidgetCollapseMode,
    #[serde(default)]
    mascot_style: WidgetMascotStyle,
    #[serde(default)]
    fold_animation: WidgetFoldAnimation,
    /// Plays the mascot's sprite animations. Off holds it still.
    #[serde(default = "default_mascot_animated")]
    mascot_animated: bool,
    #[serde(default)]
    expand_vertical: WidgetExpandVertical,
    #[serde(default)]
    expand_horizontal: WidgetExpandHorizontal,
    /// Off when unset. See [`auto_collapse_from`].
    #[serde(default)]
    auto_collapse_after: Option<u16>,
    #[serde(default)]
    collapse_corner: WidgetCollapseCorner,
    /// Set while the widget is collapsed. `bounds` keeps the expanded window's
    /// size meanwhile, so expanding brings it back as it was.
    #[serde(default)]
    collapsed: Option<StoredCollapsedBounds>,
    #[serde(default)]
    controls: Vec<StoredWidgetControl>,
}

/// Set while Pro has gone for certain: nothing bought, and no trial running.
///
/// Widgets keep everything configured under Pro. This only limits what they do
/// with it, so buying or restoring Pro brings each widget back exactly as it was.
/// A flag rather than a question to the entitlement runtime, because the reads
/// below happen in places with no app handle to ask through.
static FREE_LIMITS: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

fn free_limits() -> bool {
    FREE_LIMITS.load(std::sync::atomic::Ordering::Relaxed)
}

impl StoredWidget {
    /// Whether the window should float above others. Driven solely by the
    /// `always_on_top` toggle; pinning a widget locks its position but leaves
    /// stacking untouched. A widget under the Free limits never floats.
    fn keeps_on_top(&self) -> bool {
        self.always_on_top && !free_limits()
    }

    /// The widget as it may run right now. Nothing here is written back.
    fn in_effect(&self) -> Self {
        let mut widget = self.clone();
        if free_limits() {
            widget.pinned = false;
            widget.always_on_top = false;
            widget.theme_mode = WidgetThemeMode::System;
            widget.size_mode = WidgetSizeMode::Default;
            widget.corner_mode = WidgetCornerMode::Rounded;
            widget.background_mode = WidgetBackgroundMode::Solid;
            widget.scale = DEFAULT_WIDGET_SCALE;
            widget.collapsed_scale = DEFAULT_WIDGET_SCALE;
            widget.controls = free_composition(&self.controls);
        }
        widget
    }
}

/// The Free allowance applied to a composition saved under Pro: its first
/// control, and on that control its first target.
fn free_composition(controls: &[StoredWidgetControl]) -> Vec<StoredWidgetControl> {
    controls
        .iter()
        .take(1)
        .cloned()
        .map(|mut control| {
            control.targets.truncate(1);
            control
        })
        .collect()
}

/// Applies the Free limits, or lifts them, and brings open widget windows in line
/// so a trial ending or a purchase landing shows without reopening anything.
pub fn set_free_limits(app: &tauri::AppHandle, limited: bool) {
    if FREE_LIMITS.swap(limited, std::sync::atomic::Ordering::Relaxed) == limited {
        return;
    }

    let Ok(settings) = read_widget_settings(app) else {
        return;
    };
    let main_open = app.get_webview_window("main").is_some();

    for widget in &settings.widgets {
        let state = settings.state_of(widget);
        let label = widget_label(&widget.id);

        if !settings.within_free_count(&widget.id) {
            // Widgets past the Free allowance leave the desktop while it applies
            // and come back when it lifts. Their saved `enabled` is untouched, so
            // each returns exactly as it was left.
            if limited {
                if let Some(window) = app.get_webview_window(&label) {
                    let _ = window.hide();
                }
            } else if widget.enabled {
                // Often called from a sync command, so on the main thread; see
                // `show_widget_window_later`.
                show_widget_window_later(app, widget.clone(), false);
            }
        }

        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.set_always_on_top(widget.keeps_on_top());
            let _ = app.emit_to(&label, WIDGET_SETTINGS_CHANGED_EVENT, &state);
            let _ = app.emit_to(&label, WIDGET_CONTROLS_EVENT, &state);
        }
        if main_open {
            let _ = app.emit_to("main", WIDGET_SETTINGS_CHANGED_EVENT, &state);
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredWidgetSettings {
    #[serde(default)]
    widgets: Vec<StoredWidget>,
}

impl StoredWidgetSettings {
    /// Free runs one widget: the first saved. Any later ones were made under Pro
    /// and are kept exactly as they are, but only run while Pro does.
    fn within_free_count(&self, widget_id: &str) -> bool {
        self.widgets
            .first()
            .is_some_and(|widget| widget.id == widget_id)
    }

    /// Whether a widget may be on the desktop right now.
    fn may_run(&self, widget_id: &str) -> bool {
        !free_limits() || self.within_free_count(widget_id)
    }

    /// A widget as the Settings tab should list it. One held back by the Free
    /// allowance reads as closed and locked, whatever was saved for it.
    fn state_of(&self, widget: &StoredWidget) -> WidgetState {
        let mut state = WidgetState::from_stored(widget);
        if !self.may_run(&widget.id) {
            state.enabled = false;
            state.locked = true;
        }
        state
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenWidgetResult {
    widget_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetState {
    widget_id: String,
    title: Option<String>,
    pinned: bool,
    always_on_top: bool,
    enabled: bool,
    user_sized: bool,
    theme_mode: WidgetThemeMode,
    size_mode: WidgetSizeMode,
    corner_mode: WidgetCornerMode,
    background_mode: WidgetBackgroundMode,
    tile_opacity: u8,
    scale: u16,
    collapsed_scale: u16,
    collapse_mode: WidgetCollapseMode,
    mascot_style: WidgetMascotStyle,
    fold_animation: WidgetFoldAnimation,
    mascot_animated: bool,
    expand_vertical: WidgetExpandVertical,
    expand_horizontal: WidgetExpandHorizontal,
    /// Null while auto collapse is off.
    auto_collapse_seconds: Option<u16>,
    collapse_corner: WidgetCollapseCorner,
    collapsed: bool,
    controls: Vec<StoredWidgetControl>,
    /// Held back by the Free allowance of one widget. Only the Settings list
    /// reports it, through `StoredWidgetSettings::state_of`.
    locked: bool,
}

impl WidgetState {
    fn from_stored(widget: &StoredWidget) -> Self {
        // A window shows what the widget may do now, not everything saved.
        let widget = &widget.in_effect();
        Self {
            widget_id: widget.id.clone(),
            title: widget.title.clone(),
            pinned: widget.pinned,
            always_on_top: widget.always_on_top,
            enabled: widget.enabled,
            user_sized: widget.user_sized,
            theme_mode: widget.theme_mode.clone(),
            size_mode: widget.size_mode.clone(),
            corner_mode: widget.corner_mode.clone(),
            background_mode: widget.background_mode.clone(),
            tile_opacity: widget.tile_opacity,
            scale: widget.scale,
            collapsed_scale: widget.collapsed_scale,
            collapse_mode: widget.collapse_mode.clone(),
            mascot_style: widget.mascot_style.clone(),
            fold_animation: widget.fold_animation,
            mascot_animated: widget.mascot_animated,
            expand_vertical: widget.expand_vertical,
            expand_horizontal: widget.expand_horizontal,
            auto_collapse_seconds: widget.auto_collapse_after,
            collapse_corner: widget.collapse_corner.clone(),
            collapsed: widget.collapsed.is_some(),
            controls: widget.controls.clone(),
            locked: false,
        }
    }

    /// What a window asking after a widget that no longer exists is told.
    fn missing(widget_id: String) -> Self {
        Self {
            widget_id,
            title: None,
            pinned: false,
            always_on_top: false,
            enabled: false,
            user_sized: false,
            theme_mode: WidgetThemeMode::default(),
            size_mode: WidgetSizeMode::default(),
            corner_mode: WidgetCornerMode::default(),
            background_mode: WidgetBackgroundMode::default(),
            tile_opacity: default_tile_opacity(),
            scale: DEFAULT_WIDGET_SCALE,
            collapsed_scale: DEFAULT_WIDGET_SCALE,
            collapse_mode: WidgetCollapseMode::default(),
            mascot_style: WidgetMascotStyle::default(),
            fold_animation: WidgetFoldAnimation::default(),
            mascot_animated: default_mascot_animated(),
            expand_vertical: WidgetExpandVertical::default(),
            expand_horizontal: WidgetExpandHorizontal::default(),
            auto_collapse_seconds: None,
            collapse_corner: WidgetCollapseCorner::default(),
            collapsed: false,
            controls: Vec::new(),
            locked: false,
        }
    }
}

#[tauri::command(rename = "open-widget-window")]
pub fn open_widget_window(
    app: tauri::AppHandle,
    widget_id: Option<String>,
    title: Option<String>,
    controls: Option<Vec<StoredWidgetControl>>,
    theme_mode: Option<WidgetThemeMode>,
    size_mode: Option<WidgetSizeMode>,
    corner_mode: Option<WidgetCornerMode>,
    background_mode: Option<WidgetBackgroundMode>,
    tile_opacity: Option<u8>,
    scale: Option<u16>,
    collapsed_scale: Option<u16>,
    collapse_mode: Option<WidgetCollapseMode>,
    mascot_style: Option<WidgetMascotStyle>,
    fold_animation: Option<WidgetFoldAnimation>,
    mascot_animated: Option<bool>,
    expand_vertical: Option<WidgetExpandVertical>,
    expand_horizontal: Option<WidgetExpandHorizontal>,
    auto_collapse_seconds: Option<i32>,
) -> Result<OpenWidgetResult, String> {
    let mut settings = read_widget_settings(&app)?;
    let sanitized_controls = controls.map(sanitize_controls);

    // Reopening a known (closed) widget reuses its id, bounds, and controls;
    // otherwise this spawns a brand-new widget with no controls configured yet.
    let reopen_id = widget_id
        .filter(|id| is_valid_widget_id(id))
        .filter(|id| settings.widgets.iter().any(|widget| &widget.id == id));

    let widget = if let Some(id) = reopen_id {
        // Free runs its one widget. Bringing back any other is Pro.
        if !settings.within_free_count(&id) {
            crate::commands::entitlements::require(&app, Capability::AdvancedWidgets)?;
        }
        let widget = settings
            .widgets
            .iter_mut()
            .find(|widget| widget.id == id)
            .expect("widget existence checked above");
        widget.enabled = true;
        widget.clone()
    } else {
        if let Some(controls) = &sanitized_controls {
            if let Some(existing) = find_widget_with_same_composition(&settings, controls) {
                let label = widget_label(&existing.id);
                if let Some(window) = app.get_webview_window(&label) {
                    let _ = window.show();
                    let _ = window.set_focus();
                    let _ = app.emit_to(&label, "widget-flash", ());
                    return Ok(OpenWidgetResult {
                        widget_id: existing.id.clone(),
                    });
                }
            }
        }
        let theme_mode = theme_mode.unwrap_or_default();
        let size_mode = size_mode.unwrap_or_default();
        let corner_mode = corner_mode.unwrap_or_default();
        let background_mode = background_mode.unwrap_or_default();
        let controls = sanitized_controls.unwrap_or_default();
        let scale = scale.map(clamp_widget_scale).unwrap_or(DEFAULT_WIDGET_SCALE);
        let collapsed_scale = collapsed_scale.map(clamp_collapsed_widget_scale).unwrap_or(scale);
        // Free holds one widget, built within the Free composition and
        // appearance. A second widget, or one built past either, is Pro.
        if !settings.widgets.is_empty()
            || exceeds_free_composition(&controls)
            || exceeds_free_appearance(&theme_mode, &size_mode, &corner_mode)
            || exceeds_free_background(&background_mode)
            || exceeds_free_scale(scale)
            || exceeds_free_scale(collapsed_scale)
        {
            crate::commands::entitlements::require(&app, Capability::AdvancedWidgets)?;
        }
        let widget = StoredWidget {
            id: next_widget_id(&settings),
            enabled: true,
            title: sanitize_widget_title(title),
            pinned: false,
            bounds: None,
            user_sized: false,
            theme_mode,
            size_mode,
            corner_mode,
            background_mode,
            tile_opacity: tile_opacity
                .map(clamp_tile_opacity)
                .unwrap_or_else(default_tile_opacity),
            scale,
            collapsed_scale,
            always_on_top: false,
            // Not gated, as in set-widget-config.
            collapse_mode: collapse_mode.unwrap_or_default(),
            mascot_style: mascot_style.unwrap_or_default(),
            fold_animation: fold_animation.unwrap_or_default(),
            mascot_animated: mascot_animated.unwrap_or_else(default_mascot_animated),
            expand_vertical: expand_vertical.unwrap_or_default(),
            expand_horizontal: expand_horizontal.unwrap_or_default(),
            auto_collapse_after: auto_collapse_seconds.and_then(auto_collapse_from),
            collapse_corner: WidgetCollapseCorner::default(),
            collapsed: None,
            controls,
        };
        settings.widgets.push(widget.clone());
        widget
    };
    let widget_id = widget.id.clone();

    write_widget_settings(&app, &settings)?;

    show_widget_window_later(&app, widget, true);

    Ok(OpenWidgetResult { widget_id })
}

/// Shows a widget window once the caller has returned.
///
/// Called from the main thread, `run_on_main_thread` runs its task on the spot,
/// and building a webview there on Windows deadlocks the event loop. A sync
/// command runs on the main thread, so the task is posted from a thread of its
/// own and the command finishes first.
fn show_widget_window_later(app: &tauri::AppHandle, widget: StoredWidget, focus: bool) {
    let app = app.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(25));
        let app_for_window = app.clone();
        let _ = app.run_on_main_thread(move || {
            if let Err(_error) = show_widget_window(&app_for_window, &widget, focus) {
                #[cfg(debug_assertions)]
                eprintln!("failed to open widget window: {_error}");
            }
        });
    });
}

#[tauri::command(rename = "list-widgets")]
pub fn list_widgets(app: tauri::AppHandle) -> Result<Vec<WidgetState>, String> {
    let settings = read_widget_settings(&app)?;
    // Every persisted widget is returned, open or closed, so the Settings tab
    // can list closed widgets with a Reopen action instead of losing track of
    // them. The `enabled` flag tells the two apart.
    Ok(settings
        .widgets
        .iter()
        .map(|widget| settings.state_of(widget))
        .collect())
}

#[tauri::command(rename = "get-widget-state")]
pub fn get_widget_state(
    app: tauri::AppHandle,
    widget_id: Option<String>,
) -> Result<WidgetState, String> {
    let settings = read_widget_settings(&app)?;
    let widget_id = resolve_widget_id(&app, widget_id)?;

    Ok(settings
        .widgets
        .iter()
        .find(|widget| widget.id == widget_id)
        .map(|widget| settings.state_of(widget))
        .unwrap_or_else(|| WidgetState::missing(widget_id)))
}

#[tauri::command(rename = "close-widget-window")]
pub fn close_widget_window(app: tauri::AppHandle, widget_id: Option<String>) -> Result<(), String> {
    let target_ids = resolve_target_widget_ids(&app, widget_id)?;
    let mut settings = read_widget_settings(&app)?;

    for target_id in target_ids {
        let label = widget_label(&target_id);
        if let Some(window) = app.get_webview_window(&label) {
            mark_widget_closed(&mut settings, &target_id, &window);
            let _ = window.hide();
        } else if let Some(widget) = settings
            .widgets
            .iter_mut()
            .find(|widget| widget.id == target_id)
        {
            widget.enabled = false;
        }
    }

    write_widget_settings(&app, &settings)
}

#[tauri::command(rename = "save-widget-bounds")]
pub fn save_widget_bounds(
    app: tauri::AppHandle,
    widget_id: Option<String>,
    user_sized: Option<bool>,
) -> Result<(), String> {
    let target_ids = resolve_target_widget_ids(&app, widget_id)?;
    let mut settings = read_widget_settings(&app)?;

    for target_id in target_ids {
        let label = widget_label(&target_id);
        let Some(window) = app.get_webview_window(&label) else {
            continue;
        };
        if let Some(widget) = settings
            .widgets
            .iter_mut()
            .find(|widget| widget.id == target_id)
        {
            // The window is the pill or bubble; `bounds` holds the expanded size.
            if widget.collapsed.is_some() {
                continue;
            }
            widget.bounds = read_window_bounds(&window).or(widget.bounds);
            if let Some(user_sized) = user_sized {
                widget.user_sized = user_sized;
            }
        }
    }

    write_widget_settings(&app, &settings)
}

#[tauri::command(rename = "sync-widget-layout")]
pub fn sync_widget_layout(
    app: tauri::AppHandle,
    widget_id: Option<String>,
    min_width: u32,
    min_height: u32,
    auto_fit: bool,
) -> Result<WidgetState, String> {
    let widget_id = resolve_widget_id(&app, widget_id)?;
    let label = widget_label(&widget_id);
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| "Widget window is not available.".to_string())?;

    let stored = read_widget_settings(&app)?;
    let stored = stored.widgets.iter().find(|widget| widget.id == widget_id);
    // Sizing a collapsed window to the controls would undo the collapse.
    if let Some(widget) = stored.filter(|widget| widget.collapsed.is_some()) {
        return Ok(WidgetState::from_stored(widget));
    }
    // The frontend measures in CSS pixels; the zoom turns them into the
    // window's logical pixels.
    let zoom = stored.map(widget_zoom).unwrap_or(1.0);

    let min_width = (min_width.max(MIN_WIDGET_WIDTH) as f64 * zoom).ceil();
    let min_height = (min_height.max(MIN_WIDGET_HEIGHT) as f64 * zoom).ceil();
    let min_size = LogicalSize::new(min_width, min_height);
    window
        .set_min_size(Some(min_size))
        .map_err(|error| error.to_string())?;
    // The height follows the content, so dragging only changes the width.
    let _ = window.set_max_size(Some(LogicalSize::new(100_000.0, min_height)));

    let mut settings = read_widget_settings(&app)?;
    let widget = settings
        .widgets
        .iter_mut()
        .find(|widget| widget.id == widget_id)
        .ok_or_else(|| "Widget settings are not available.".to_string())?;

    let clamped_size = clamped_widget_size(&window, min_width, min_height);
    let target_size = if auto_fit && !widget.user_sized {
        Some(min_size)
    } else {
        clamped_size
    };

    if let Some(target_size) = target_size {
        let _ = window.set_size(target_size);
        widget.bounds = read_window_bounds(&window).or(Some(StoredWidgetBounds {
            x: widget.bounds.map(|bounds| bounds.x).unwrap_or_default(),
            y: widget.bounds.map(|bounds| bounds.y).unwrap_or_default(),
            width: target_size.width.round() as u32,
            height: target_size.height.round() as u32,
        }));
    } else if let Some(bounds) = read_window_bounds(&window) {
        widget.bounds = Some(bounds);
    }

    let next_state = WidgetState::from_stored(widget);
    write_widget_settings(&app, &settings)?;
    Ok(next_state)
}

#[tauri::command(rename = "widget-frontend-ready")]
pub fn widget_frontend_ready(
    app: tauri::AppHandle,
    widget_id: Option<String>,
) -> Result<WidgetState, String> {
    let widget_id = resolve_widget_id(&app, widget_id)?;
    let settings = read_widget_settings(&app)?;
    let Some(widget) = settings
        .widgets
        .iter()
        .find(|widget| widget.id == widget_id)
        .cloned()
    else {
        return Ok(WidgetState::missing(widget_id));
    };

    let label = widget_label(&widget.id);
    let Some(window) = app.get_webview_window(&label) else {
        return Ok(WidgetState::from_stored(&widget));
    };

    apply_widget_zoom(&window, &widget);
    apply_widget_bounds(&window, &widget);
    let _ = window.set_always_on_top(widget.keeps_on_top());
    if (widget.enabled || widget.pinned) && settings.may_run(&widget.id) {
        let _ = window.show();
    }

    Ok(WidgetState::from_stored(&widget))
}

pub fn restore_widget_window(app: &tauri::AppHandle) -> Result<(), String> {
    let mut settings = read_widget_settings(app)?;
    let mut restored_widgets = Vec::new();
    let mut changed = false;

    for widget in &mut settings.widgets {
        if widget.pinned && !widget.enabled {
            widget.enabled = true;
            changed = true;
        }
        if widget.enabled {
            restored_widgets.push(widget.clone());
        }
    }

    if changed {
        write_widget_settings(app, &settings)?;
    }

    for widget in restored_widgets {
        // Widgets past the Free allowance wait for Pro; `set_free_limits` opens
        // them if it comes back while Mote is running.
        if settings.may_run(&widget.id) {
            show_widget_window(app, &widget, false)?;
        }
    }

    Ok(())
}

fn show_widget_window(
    app: &tauri::AppHandle,
    widget: &StoredWidget,
    focus: bool,
) -> Result<(), String> {
    let label = widget_label(&widget.id);

    if let Some(window) = app.get_webview_window(&label) {
        apply_widget_zoom(&window, widget);
        apply_widget_bounds(&window, widget);
        let _ = window.set_always_on_top(widget.keeps_on_top());
        let _ = window.show();
        if focus {
            let _ = window.set_focus();
        }
        return Ok(());
    }

    let widget_url = format!(
        "index.html?window=widget&widgetId={}&v={}",
        widget.id,
        widget_url_cache_buster()
    );
    let mut builder =
        WebviewWindowBuilder::new(app, label.clone(), WebviewUrl::App(widget_url.into()))
            .title("Hue Widget")
            .inner_size(DEFAULT_WIDGET_WIDTH, DEFAULT_WIDGET_HEIGHT)
            .min_inner_size(
                MIN_WIDGET_WIDTH as f64 * open_zoom(widget),
                MIN_WIDGET_HEIGHT as f64 * open_zoom(widget),
            )
            .decorations(false)
            .resizable(true)
            .always_on_top(widget.keeps_on_top())
            .transparent(true)
            .skip_taskbar(true)
            // Let the webview receive HTML5 drag-and-drop so the settings panel
            // can accept dropped image files; the OS handler would swallow them.
            .disable_drag_drop_handler();

    // The builder takes logical units but stored bounds are physical, so a
    // placed widget opened at the wrong spot and size on a scaled display.
    // Build it hidden instead, then place it in physical units before showing.
    let placed =
        widget.collapsed.is_some() || widget.bounds.is_some_and(|bounds| valid_bounds(&bounds));
    builder = builder.visible(!placed);

    let window = builder
        .build()
        .map_err(|error| format!("failed to build widget window: {error}"))?;
    apply_widget_zoom(&window, widget);
    if placed {
        apply_widget_bounds(&window, widget);
        let _ = window.show();
    }
    install_widget_close_handler(&window, app.clone(), widget.id.clone());

    // The widget window is transparent so its content shell can render rounded
    // corners; a native rectangular shadow would frame the invisible corners, so
    // it stays off. Windows 11 also paints a 1px DWM frame border (a faint
    // rounded outline) on undecorated windows — strip it so only the CSS shell is
    // visible. Both apply to the window itself, so they run now (the HWND exists
    // as soon as `build` returns) rather than waiting on the webview.
    let _ = window.set_shadow(false);
    remove_window_border(&window);
    suppress_classic_frame(&window);

    if focus {
        let _ = window.set_focus();
    }

    Ok(())
}

#[tauri::command(rename = "set-widget-pinned")]
pub fn set_widget_pinned(
    app: tauri::AppHandle,
    widget_id: Option<String>,
    pinned: bool,
) -> Result<(), String> {
    // Only switching it on is gated. Turning it off must always work, or a
    // lapsed purchase would strand a widget pinned to a spot forever.
    if pinned {
        crate::commands::entitlements::require(&app, Capability::AdvancedWidgets)?;
    }

    let widget_id = resolve_widget_id(&app, widget_id)?;
    let mut settings = read_widget_settings(&app)?;
    let widget = settings
        .widgets
        .iter_mut()
        .find(|widget| widget.id == widget_id)
        .ok_or_else(|| "Widget settings are not available.".to_string())?;

    let label = widget_label(&widget_id);
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| "Widget window is not available.".to_string())?;

    widget.enabled = true;
    widget.pinned = pinned;
    // Pinning locks the widget to its current spot so it reopens there on the
    // next launch; unpinning forgets that spot and frees the window to move.
    // Stacking is left to the independent always-on-top toggle.
    // A collapsed widget keeps them either way: its window is sized from them.
    widget.bounds = if widget.collapsed.is_some() {
        widget.bounds
    } else if !pinned {
        None
    } else {
        read_window_bounds(&window).or(widget.bounds)
    };
    let next_state = WidgetState::from_stored(widget);
    write_widget_settings(&app, &settings)?;

    // Broadcast so the other window's pin control stays in sync: the widget's own
    // title bar (when toggled from the Settings tab) and the Settings tab's list
    // (when toggled from the widget) both react to this.
    let _ = app.emit_to(&label, WIDGET_SETTINGS_CHANGED_EVENT, &next_state);
    if app.get_webview_window("main").is_some() {
        let _ = app.emit_to("main", WIDGET_SETTINGS_CHANGED_EVENT, &next_state);
    }

    Ok(())
}

#[tauri::command(rename = "set-widget-always-on-top")]
pub fn set_widget_always_on_top(
    app: tauri::AppHandle,
    widget_id: Option<String>,
    always_on_top: bool,
) -> Result<(), String> {
    // As with pinning, only raising the window is paid. Lowering it again is
    // always allowed so nothing can be left stuck above everything else.
    if always_on_top {
        crate::commands::entitlements::require(&app, Capability::AdvancedWidgets)?;
    }

    let widget_id = resolve_widget_id(&app, widget_id)?;
    let mut settings = read_widget_settings(&app)?;
    let widget = settings
        .widgets
        .iter_mut()
        .find(|widget| widget.id == widget_id)
        .ok_or_else(|| "Widget settings are not available.".to_string())?;
    widget.always_on_top = always_on_top;
    let keeps_on_top = widget.keeps_on_top();
    write_widget_settings(&app, &settings)?;

    // Apply live when the window is open; closed widgets pick it up on reopen.
    let label = widget_label(&widget_id);
    if let Some(window) = app.get_webview_window(&label) {
        window
            .set_always_on_top(keeps_on_top)
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command(rename = "get-widget-controls")]
pub fn get_widget_controls(
    app: tauri::AppHandle,
    widget_id: Option<String>,
) -> Result<Vec<StoredWidgetControl>, String> {
    let widget_id = resolve_widget_id(&app, widget_id)?;
    let settings = read_widget_settings(&app)?;
    Ok(settings
        .widgets
        .iter()
        .find(|widget| widget.id == widget_id)
        .map(|widget| widget.in_effect().controls)
        .unwrap_or_default())
}

/// The Free composition allowance, in one place: a widget may hold one control,
/// and that control may point at one thing.
///
/// A room, zone, or light each count as one target, so "the living room" is
/// within it. What is paid is holding more than one control, or a card that
/// acts on several targets at once. Deliberately lenient at the edge — a toggle
/// card with a single target is treated as free, because the matrix describes
/// the paid case as a *multi-target* toggle group.
fn exceeds_free_composition(controls: &[StoredWidgetControl]) -> bool {
    controls.len() > 1 || controls.iter().any(|control| control.targets.len() > 1)
}

/// The Free appearance: the system theme at the standard size, with the standard
/// corners. Choosing anything else is Pro; going back to them never is.
fn exceeds_free_appearance(
    theme_mode: &WidgetThemeMode,
    size_mode: &WidgetSizeMode,
    corner_mode: &WidgetCornerMode,
) -> bool {
    !matches!(theme_mode, WidgetThemeMode::System)
        || !matches!(size_mode, WidgetSizeMode::Default)
        || !matches!(corner_mode, WidgetCornerMode::Rounded)
}

/// Free tiles are solid. A translucent background is Pro.
fn exceeds_free_background(background_mode: &WidgetBackgroundMode) -> bool {
    !matches!(background_mode, WidgetBackgroundMode::Solid)
}

#[tauri::command(rename = "set-widget-controls")]
pub fn set_widget_controls(
    app: tauri::AppHandle,
    widget_id: Option<String>,
    controls: Vec<StoredWidgetControl>,
) -> Result<(), String> {
    let widget_id = resolve_widget_id(&app, widget_id)?;
    let controls = sanitize_controls(controls);

    // Checked after sanitizing, so the count reflects what would actually be
    // stored rather than whatever the caller sent.
    if exceeds_free_composition(&controls) {
        crate::commands::entitlements::require(&app, Capability::AdvancedWidgets)?;
    }

    let mut settings = read_widget_settings(&app)?;
    let widget = settings
        .widgets
        .iter_mut()
        .find(|widget| widget.id == widget_id)
        .ok_or_else(|| "Widget settings are not available.".to_string())?;
    widget.controls = controls.clone();
    let next_state = WidgetState::from_stored(widget);
    write_widget_settings(&app, &settings)?;

    // If the widget is open, push the change so it updates live; edits made from
    // the Settings tab would otherwise only apply on the next open.
    let label = widget_label(&widget_id);
    if app.get_webview_window(&label).is_some() {
        let _ = app.emit_to(&label, WIDGET_CONTROLS_EVENT, &next_state);
    }

    Ok(())
}

#[tauri::command(rename = "preview-widget-config")]
pub fn preview_widget_config(
    app: tauri::AppHandle,
    widget_id: Option<String>,
    controls: Vec<StoredWidgetControl>,
    theme_mode: WidgetThemeMode,
    size_mode: WidgetSizeMode,
    corner_mode: Option<WidgetCornerMode>,
    background_mode: Option<WidgetBackgroundMode>,
    tile_opacity: Option<u8>,
    scale: Option<u16>,
    collapsed_scale: Option<u16>,
    collapse_mode: Option<WidgetCollapseMode>,
    mascot_style: Option<WidgetMascotStyle>,
    fold_animation: Option<WidgetFoldAnimation>,
    mascot_animated: Option<bool>,
    expand_vertical: Option<WidgetExpandVertical>,
    expand_horizontal: Option<WidgetExpandHorizontal>,
    auto_collapse_seconds: Option<i32>,
) -> Result<(), String> {
    let widget_id = resolve_widget_id(&app, widget_id)?;
    let settings = read_widget_settings(&app)?;
    let widget = settings
        .widgets
        .iter()
        .find(|widget| widget.id == widget_id)
        .ok_or_else(|| "Widget settings are not available.".to_string())?;
    let mut preview = widget.clone();
    preview.controls = sanitize_controls(controls);
    preview.theme_mode = theme_mode;
    preview.size_mode = size_mode;
    if let Some(corner_mode) = corner_mode {
        preview.corner_mode = corner_mode;
    }
    if let Some(background_mode) = background_mode {
        preview.background_mode = background_mode;
    }
    if let Some(tile_opacity) = tile_opacity {
        preview.tile_opacity = clamp_tile_opacity(tile_opacity);
    }
    if let Some(scale) = scale {
        preview.scale = clamp_widget_scale(scale);
    }
    if let Some(collapsed_scale) = collapsed_scale {
        preview.collapsed_scale = clamp_collapsed_widget_scale(collapsed_scale);
    }
    if let Some(collapse_mode) = collapse_mode {
        preview.collapse_mode = collapse_mode;
    }
    if let Some(mascot_style) = mascot_style {
        preview.mascot_style = mascot_style;
    }
    if let Some(fold_animation) = fold_animation {
        preview.fold_animation = fold_animation;
    }
    if let Some(mascot_animated) = mascot_animated {
        preview.mascot_animated = mascot_animated;
    }
    if let Some(expand_vertical) = expand_vertical {
        preview.expand_vertical = expand_vertical;
    }
    if let Some(expand_horizontal) = expand_horizontal {
        preview.expand_horizontal = expand_horizontal;
    }
    if let Some(seconds) = auto_collapse_seconds {
        preview.auto_collapse_after = auto_collapse_from(seconds);
    }
    let next_state = WidgetState::from_stored(&preview);

    let label = widget_label(&widget_id);
    if app.get_webview_window(&label).is_some() {
        let _ = app.emit_to(&label, WIDGET_SETTINGS_CHANGED_EVENT, &next_state);
    }

    Ok(())
}

/// Saves the parts of a widget's setup that were sent; anything left out stays
/// as it is.
///
/// Partial on purpose. Under Free, the settings page sees each widget as it
/// may run (its first control, the standard look), and sending that whole view
/// back with every change wrote it over the setup saved under Pro, losing
/// controls for good. Only what changed is sent now, and only that is checked
/// against the Free allowance, so changing one Free setting is never refused
/// over a Pro one left untouched.
#[tauri::command(rename = "set-widget-config")]
pub fn set_widget_config(
    app: tauri::AppHandle,
    widget_id: Option<String>,
    controls: Option<Vec<StoredWidgetControl>>,
    theme_mode: Option<WidgetThemeMode>,
    size_mode: Option<WidgetSizeMode>,
    corner_mode: Option<WidgetCornerMode>,
    background_mode: Option<WidgetBackgroundMode>,
    tile_opacity: Option<u8>,
    scale: Option<u16>,
    collapsed_scale: Option<u16>,
    // Not gated: collapsing is how a widget gets out of the way, Free or Pro.
    collapse_mode: Option<WidgetCollapseMode>,
    mascot_style: Option<WidgetMascotStyle>,
    fold_animation: Option<WidgetFoldAnimation>,
    mascot_animated: Option<bool>,
    expand_vertical: Option<WidgetExpandVertical>,
    expand_horizontal: Option<WidgetExpandHorizontal>,
    auto_collapse_seconds: Option<i32>,
) -> Result<(), String> {
    let widget_id = resolve_widget_id(&app, widget_id)?;
    let mut settings = read_widget_settings(&app)?;
    let widget = settings
        .widgets
        .iter_mut()
        .find(|widget| widget.id == widget_id)
        .ok_or_else(|| "Widget settings are not available.".to_string())?;
    let controls = controls.map(sanitize_controls);
    let scale = scale.map(clamp_widget_scale);
    let collapsed_scale = collapsed_scale.map(clamp_collapsed_widget_scale);
    // The same gates as everywhere else, on what was sent. A field left out
    // reads as its Free value here, so it never trips the check by itself.
    let sent_appearance = theme_mode.is_some() || size_mode.is_some() || corner_mode.is_some();
    if controls.as_deref().is_some_and(exceeds_free_composition)
        || (sent_appearance
            && exceeds_free_appearance(
                theme_mode.as_ref().unwrap_or(&WidgetThemeMode::System),
                size_mode.as_ref().unwrap_or(&WidgetSizeMode::Default),
                corner_mode.as_ref().unwrap_or(&WidgetCornerMode::Rounded),
            ))
        || background_mode.as_ref().is_some_and(exceeds_free_background)
        || scale.is_some_and(exceeds_free_scale)
        || collapsed_scale.is_some_and(exceeds_free_scale)
    {
        crate::commands::entitlements::require(&app, Capability::AdvancedWidgets)?;
    }
    if let Some(controls) = controls {
        widget.controls = controls;
    }
    if let Some(theme_mode) = theme_mode {
        widget.theme_mode = theme_mode;
    }
    if let Some(size_mode) = size_mode {
        widget.size_mode = size_mode;
    }
    if let Some(corner_mode) = corner_mode {
        widget.corner_mode = corner_mode;
    }
    if let Some(background_mode) = background_mode {
        widget.background_mode = background_mode;
    }
    if let Some(tile_opacity) = tile_opacity {
        widget.tile_opacity = clamp_tile_opacity(tile_opacity);
    }
    let previous = WidgetZooms::of(widget);
    if let Some(scale) = scale {
        widget.scale = scale;
    }
    if let Some(collapsed_scale) = collapsed_scale {
        widget.collapsed_scale = collapsed_scale;
    }
    if let Some(collapse_mode) = collapse_mode {
        widget.collapse_mode = collapse_mode;
    }
    if let Some(mascot_style) = mascot_style {
        widget.mascot_style = mascot_style;
    }
    if let Some(fold_animation) = fold_animation {
        widget.fold_animation = fold_animation;
    }
    if let Some(mascot_animated) = mascot_animated {
        widget.mascot_animated = mascot_animated;
    }
    if let Some(expand_vertical) = expand_vertical {
        widget.expand_vertical = expand_vertical;
    }
    if let Some(expand_horizontal) = expand_horizontal {
        widget.expand_horizontal = expand_horizontal;
    }
    if let Some(seconds) = auto_collapse_seconds {
        widget.auto_collapse_after = auto_collapse_from(seconds);
    }
    let label = widget_label(&widget_id);
    if let Some(window) = app.get_webview_window(&label) {
        rescale_widget_window(&window, widget, previous);
    }
    let next_state = WidgetState::from_stored(widget);
    write_widget_settings(&app, &settings)?;

    if app.get_webview_window(&label).is_some() {
        let _ = app.emit_to(&label, WIDGET_SETTINGS_CHANGED_EVENT, &next_state);
    }

    Ok(())
}

/// Sets just one scale, for a size slider to call while it is dragged, so the
/// widget resizes live. Lighter than `set-widget-config`: nothing else is sent,
/// and no settings-changed event goes out on every step. `collapsed` picks the
/// collapsed scale over the open one.
#[tauri::command(rename = "set-widget-scale")]
pub fn set_widget_scale(
    app: tauri::AppHandle,
    widget_id: Option<String>,
    scale: u16,
    collapsed: Option<bool>,
) -> Result<(), String> {
    let widget_id = resolve_widget_id(&app, widget_id)?;
    let collapsed = collapsed.unwrap_or(false);
    let scale = if collapsed {
        clamp_collapsed_widget_scale(scale)
    } else {
        clamp_widget_scale(scale)
    };
    if exceeds_free_scale(scale) {
        crate::commands::entitlements::require(&app, Capability::AdvancedWidgets)?;
    }
    let mut settings = read_widget_settings(&app)?;
    let widget = settings
        .widgets
        .iter_mut()
        .find(|widget| widget.id == widget_id)
        .ok_or_else(|| "Widget settings are not available.".to_string())?;
    let previous = WidgetZooms::of(widget);
    let target = if collapsed {
        &mut widget.collapsed_scale
    } else {
        &mut widget.scale
    };
    if *target == scale {
        return Ok(());
    }
    *target = scale;
    let label = widget_label(&widget_id);
    if let Some(window) = app.get_webview_window(&label) {
        rescale_widget_window(&window, widget, previous);
    }
    let next_state = WidgetState::from_stored(widget);
    write_widget_settings(&app, &settings)?;
    // Only to the widget itself, not the main window: the widget draws its pill
    // at collapsed over open, so it needs each step to keep the pill filling
    // its window while the slider moves.
    let _ = app.emit_to(&label, WIDGET_SETTINGS_CHANGED_EVENT, &next_state);
    Ok(())
}

#[tauri::command(rename = "open-widget-settings")]
pub fn open_widget_settings(
    app: tauri::AppHandle,
    widget_id: Option<String>,
) -> Result<(), String> {
    let widget_id = resolve_widget_id(&app, widget_id)?;
    crate::commands::app_settings::show_main_window(&app)?;
    if app.get_webview_window("main").is_some() {
        let _ = app.emit_to(
            "main",
            OPEN_WIDGET_SETTINGS_EVENT,
            serde_json::json!({ "widgetId": widget_id }),
        );
    }
    Ok(())
}

#[tauri::command(rename = "open-widget-target")]
pub fn open_widget_target(app: tauri::AppHandle, kind: String, id: String) -> Result<(), String> {
    // Only room/zone targets have a Space screen to open; the widget only sends
    // those here, but guard so a stray call can't ask the app to navigate to a
    // route that doesn't exist.
    if kind != "room" && kind != "zone" {
        return Err(format!("Cannot open a Space for target kind '{kind}'."));
    }
    crate::commands::app_settings::show_main_window(&app)?;
    if app.get_webview_window("main").is_some() {
        let _ = app.emit_to(
            "main",
            OPEN_WIDGET_TARGET_EVENT,
            serde_json::json!({ "kind": kind, "id": id }),
        );
    }
    Ok(())
}

#[tauri::command(rename = "remove-widget")]
pub fn remove_widget(app: tauri::AppHandle, widget_id: Option<String>) -> Result<(), String> {
    let widget_id = resolve_widget_id(&app, widget_id)?;

    // Destroy (not close) any live window so the close handler — which only
    // hides and re-marks the widget — can't resurrect the entry we're deleting.
    if let Some(window) = app.get_webview_window(&widget_label(&widget_id)) {
        let _ = window.destroy();
    }

    let mut settings = read_widget_settings(&app)?;
    settings.widgets.retain(|widget| widget.id != widget_id);
    write_widget_settings(&app, &settings)
}

#[tauri::command(rename = "set-widget-acrylic")]
pub fn set_widget_acrylic(
    app: tauri::AppHandle,
    widget_id: Option<String>,
    enabled: bool,
    radius: Option<f64>,
    color: Option<[u8; 4]>,
) -> Result<(), String> {
    let widget_id = resolve_widget_id(&app, widget_id)?;
    let label = widget_label(&widget_id);
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| "Widget window is not available.".to_string())?;

    apply_acrylic_effect(&window, enabled, radius, color);
    Ok(())
}

/// Applies a native Acrylic (frosted) effect to the widget window. CSS
/// `backdrop-filter` cannot blur the desktop behind a transparent window on
/// Windows, so the real frosted look — and the antialiased rounded corners via
/// `radius` — come from the platform compositor here. `color` is an RGBA tint.
fn apply_acrylic_effect(
    window: &WebviewWindow,
    enabled: bool,
    radius: Option<f64>,
    color: Option<[u8; 4]>,
) {
    #[cfg(target_os = "windows")]
    {
        use tauri::utils::config::{Color, WindowEffectsConfig};
        use tauri::window::Effect;

        let effects = enabled.then(|| WindowEffectsConfig {
            effects: vec![Effect::Acrylic],
            radius,
            color: color.map(|[r, g, b, a]| Color(r, g, b, a)),
            ..Default::default()
        });
        let _ = window.set_effects(effects);
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (window, enabled, radius, color);
    }
}

/// Removes the native Windows 11 DWM frame border from a window. On undecorated
/// windows DWM still draws a thin rounded outline; setting `DWMWA_BORDER_COLOR`
/// to `DWMWA_COLOR_NONE` hides it so only the transparent CSS shell shows.
#[cfg(target_os = "windows")]
fn remove_window_border(window: &WebviewWindow) {
    use windows_sys::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_BORDER_COLOR};

    // `DWMWA_COLOR_NONE` (0xFFFFFFFE) tells DWM to skip painting the border.
    const DWMWA_COLOR_NONE: u32 = 0xFFFF_FFFE;

    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    let color: u32 = DWMWA_COLOR_NONE;
    unsafe {
        DwmSetWindowAttribute(
            hwnd.0 as _,
            DWMWA_BORDER_COLOR as u32,
            &color as *const u32 as *const core::ffi::c_void,
            std::mem::size_of::<u32>() as u32,
        );
    }
}

#[cfg(not(target_os = "windows"))]
fn remove_window_border(_window: &WebviewWindow) {}

/// Tells this subclass apart from tao's own on the same window.
#[cfg(target_os = "windows")]
const NO_FRAME_SUBCLASS_ID: usize = 0x4D4F_5446;

/// Keeps Windows from painting a frame on a widget. A collapsed widget is
/// clipped to its pill, and Windows stops composing a clipped window's frame,
/// for good: lifting the clip doesn't bring it back. It paints the old,
/// unthemed frame itself instead, a light blue caption with a red close
/// button, whenever the window is activated, hovered or redrawn, and it
/// showed through wherever the widget is transparent, as mid-fold. Worse,
/// tao sizes the frame away for only one form of `WM_NCCALCSIZE`, so the
/// other could give the widget a real title bar that pushed the cards down.
/// The widget never has a frame, so it gets no room for one and none is
/// painted at all.
#[cfg(target_os = "windows")]
fn suppress_classic_frame(window: &WebviewWindow) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Shell::SetWindowSubclass;

    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    let hwnd = hwnd.0 as isize;
    // A window can only be subclassed from the thread that owns it.
    let _ = window.run_on_main_thread(move || {
        // Safety: the callback is a plain function with no reference data,
        // and Windows removes the subclass when the window is destroyed.
        unsafe {
            let _ = SetWindowSubclass(
                HWND(hwnd as _),
                Some(no_frame_proc),
                NO_FRAME_SUBCLASS_ID,
                0,
            );
        }
    });
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn no_frame_proc(
    hwnd: windows::Win32::Foundation::HWND,
    message: u32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
    _subclass_id: usize,
    _reference_data: usize,
) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::Foundation::LRESULT;
    use windows::Win32::UI::Shell::DefSubclassProc;
    use windows_sys::Win32::UI::WindowsAndMessaging::{WM_NCACTIVATE, WM_NCCALCSIZE, WM_NCPAINT};

    // Undocumented: sent to draw the caption and the frame of a window whose
    // frame Windows doesn't compose, which a clip leaves it as for good.
    const WM_NCUAHDRAWCAPTION: u32 = 0x00AE;
    const WM_NCUAHDRAWFRAME: u32 = 0x00AF;

    match message {
        // The whole window is client area, in both forms of the question.
        // tao answers only the one with a wParam, and hands the other to
        // the default handler, which gave the widget a full standard frame:
        // a title bar that pushed the cards down, drawn unthemed.
        WM_NCCALCSIZE => LRESULT(0),
        WM_NCPAINT | WM_NCUAHDRAWCAPTION | WM_NCUAHDRAWFRAME => LRESULT(0),
        // Accepted here and never passed on: the default handler draws the
        // caption for it, over the widget when it loses focus, even when
        // told not to repaint. Focus itself travels on WM_ACTIVATE.
        WM_NCACTIVATE => LRESULT(1),
        _ => unsafe { DefSubclassProc(hwnd, message, wparam, lparam) },
    }
}

#[cfg(not(target_os = "windows"))]
fn suppress_classic_frame(_window: &WebviewWindow) {}

fn install_widget_close_handler(window: &WebviewWindow, app: tauri::AppHandle, widget_id: String) {
    let window_for_handler = window.clone();
    let pending_save = Arc::new(Mutex::new(PendingBoundsSave::default()));
    window.on_window_event(move |event| match event {
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            if let Ok(mut settings) = read_widget_settings(&app) {
                mark_widget_closed(&mut settings, &widget_id, &window_for_handler);
                let _ = write_widget_settings(&app, &settings);
            }
            let _ = window_for_handler.hide();
        }
        // While the user drags the widget around the desktop, mirror its new spot
        // into the Settings "Position" preview live. We read the full bounds (not
        // just the event's position) so the preview rectangle stays the right
        // size, and only emit when the main window is around to receive it.
        //
        // The spot is also persisted here, once the moves settle. The frontend
        // can't do it: on Windows `startDragging` resolves as the drag begins,
        // so anything it saves afterwards is the pre-drag position.
        WindowEvent::Moved(_) => {
            schedule_bounds_save(&app, &widget_id, &window_for_handler, &pending_save);
            emit_widget_moved(&app, &widget_id, &window_for_handler);
        }
        // Collapsing and expanding resize the window, often without moving
        // it, and the preview has to change shape with it.
        WindowEvent::Resized(_) => emit_widget_moved(&app, &widget_id, &window_for_handler),
        _ => {}
    });
}

fn emit_widget_moved(app: &tauri::AppHandle, widget_id: &str, window: &WebviewWindow) {
    if app.get_webview_window("main").is_none() {
        return;
    }
    if let Some(bounds) = read_window_rect(window) {
        let _ = app.emit_to(
            "main",
            WIDGET_MOVED_EVENT,
            WidgetMovedEvent {
                widget_id: widget_id.to_string(),
                bounds,
            },
        );
    }
}

/// Tracks a widget's in-flight move so a drag persists once, after it settles,
/// instead of on every `Moved` event.
#[derive(Default)]
struct PendingBoundsSave {
    last_move: Option<Instant>,
    scheduled: bool,
}

fn schedule_bounds_save(
    app: &tauri::AppHandle,
    widget_id: &str,
    window: &WebviewWindow,
    pending: &Arc<Mutex<PendingBoundsSave>>,
) {
    let Ok(mut state) = pending.lock() else {
        return;
    };
    state.last_move = Some(Instant::now());
    if state.scheduled {
        return;
    }
    state.scheduled = true;
    drop(state);

    let app = app.clone();
    let widget_id = widget_id.to_string();
    let window = window.clone();
    let pending = Arc::clone(pending);
    thread::spawn(move || {
        loop {
            thread::sleep(MOVE_SAVE_DELAY);
            let Ok(mut state) = pending.lock() else {
                return;
            };
            if state
                .last_move
                .is_some_and(|moved| moved.elapsed() >= MOVE_SAVE_DELAY)
            {
                state.scheduled = false;
                break;
            }
        }
        // Commands that write the settings file run on the main thread, so the
        // save goes there too rather than racing them from this one.
        let app_for_save = app.clone();
        let _ = app.run_on_main_thread(move || {
            if !window.is_visible().unwrap_or(false) {
                return;
            }
            let Ok(mut settings) = read_widget_settings(&app_for_save) else {
                return;
            };
            let Some(widget) = settings
                .widgets
                .iter_mut()
                .find(|widget| widget.id == widget_id)
            else {
                return;
            };
            if let Some(pill) = widget.collapsed {
                if window.is_minimized().unwrap_or(false) {
                    return;
                }
                let Ok(PhysicalPosition { x, y }) = window.outer_position() else {
                    return;
                };
                // The window is the open widget's frame; the pill sits in
                // its corner.
                let frame = collapsed_frame(&window, widget, &pill);
                if let Some(collapsed) = widget.collapsed.as_mut() {
                    collapsed.x = x + (pill.x - frame.x);
                    collapsed.y = y + (pill.y - frame.y);
                }
            } else {
                let Some(bounds) = read_window_bounds(&window) else {
                    return;
                };
                widget.bounds = Some(bounds);
            }
            let _ = write_widget_settings(&app_for_save, &settings);
        });
    });
}

fn mark_widget_closed(
    settings: &mut StoredWidgetSettings,
    widget_id: &str,
    window: &WebviewWindow,
) {
    if let Some(widget) = settings
        .widgets
        .iter_mut()
        .find(|widget| widget.id == widget_id)
    {
        widget.enabled = false;
        if widget.collapsed.is_none() {
            widget.bounds = read_window_bounds(window).or(widget.bounds);
        }
    }
}

fn read_window_bounds(window: &WebviewWindow) -> Option<StoredWidgetBounds> {
    read_window_rect(window).filter(valid_bounds)
}

/// Where the window is on screen right now, whatever it shows: the widget,
/// or its pill while collapsed. For showing where it is, not for storing as
/// the widget's size.
fn read_window_rect(window: &WebviewWindow) -> Option<StoredWidgetBounds> {
    // A minimized window reports Windows' parking spot (-32000, -32000), which
    // would restore the widget off-screen.
    if window.is_minimized().unwrap_or(false) {
        return None;
    }
    let PhysicalPosition { x, y } = window.outer_position().ok()?;
    let PhysicalSize { width, height } = window.inner_size().ok()?;
    Some(StoredWidgetBounds {
        x,
        y,
        width,
        height,
    })
}

/// Rules out sizes no widget can have. Only a sanity floor: a widget drawn
/// at 70% is smaller than the 100% minimum, and pills are kept apart by
/// checking `collapsed`, not by size.
fn valid_bounds(bounds: &StoredWidgetBounds) -> bool {
    bounds.width >= MIN_WIDGET_WIDTH / 2 && bounds.height >= MIN_WIDGET_HEIGHT / 2
}

/// The webview zoom a widget runs at: its open scale, or 100% while Free
/// applies. It never changes on collapse: a zoom switch mid-fold drew a frame
/// at the wrong size. The collapsed scale sizes the pill's window instead, and
/// the frontend draws the pill scaled to fill it.
fn open_zoom(widget: &StoredWidget) -> f64 {
    widget.in_effect().scale as f64 / 100.0
}

/// How large the pill is drawn, as a zoom: the collapsed scale.
fn collapsed_zoom(widget: &StoredWidget) -> f64 {
    widget.in_effect().collapsed_scale as f64 / 100.0
}

fn widget_zoom(widget: &StoredWidget) -> f64 {
    open_zoom(widget)
}

fn apply_widget_zoom(window: &WebviewWindow, widget: &StoredWidget) {
    let _ = window.set_zoom(widget_zoom(widget));
}

/// Both zooms, taken before a scale changes.
#[derive(Clone, Copy)]
struct WidgetZooms {
    open: f64,
    collapsed: f64,
}

impl WidgetZooms {
    fn of(widget: &StoredWidget) -> Self {
        Self {
            open: open_zoom(widget),
            collapsed: collapsed_zoom(widget),
        }
    }
}

fn changed(next: f64, previous: f64) -> bool {
    previous > 0.0 && (next - previous).abs() >= f64::EPSILON
}

/// Applies new scales to a widget.
///
/// Open, a new open scale grows or shrinks the window by the same ratio as
/// the zoom, so the widget scales as a whole rather than its controls
/// reflowing inside an unchanged frame. A new collapsed scale waits for the
/// next collapse, which measures the pill afresh.
///
/// Collapsed, a new collapsed scale resizes the pill's window in place, and a
/// new open scale changes the zoom and the stored open bounds with it; the
/// pill keeps its size, since the frontend draws it at collapsed over open.
fn rescale_widget_window(window: &WebviewWindow, widget: &mut StoredWidget, previous: WidgetZooms) {
    let next = WidgetZooms::of(widget);
    if let Some(collapsed) = widget.collapsed.as_mut() {
        if changed(next.collapsed, previous.collapsed) {
            if collapsed.css_width > 0 && collapsed.css_height > 0 {
                collapsed.width = (collapsed.css_width as f64 * next.collapsed).round() as u32;
                collapsed.height = (collapsed.css_height as f64 * next.collapsed).round() as u32;
            } else {
                let ratio = next.collapsed / previous.collapsed;
                collapsed.width = (collapsed.width as f64 * ratio).round() as u32;
                collapsed.height = (collapsed.height as f64 * ratio).round() as u32;
            }
        }
        if changed(next.open, previous.open) {
            let ratio = next.open / previous.open;
            if let Some(bounds) = widget.bounds.as_mut() {
                bounds.width = (bounds.width as f64 * ratio).round() as u32;
                bounds.height = (bounds.height as f64 * ratio).round() as u32;
            }
        }
        apply_widget_zoom(window, widget);
        // The window keeps the open size around the pill, so either scale
        // moves the window or its clip.
        if let Some(pill) = widget.collapsed {
            apply_collapsed_bounds(window, widget, &pill);
        }
        return;
    }
    if !changed(next.open, previous.open) {
        apply_widget_zoom(window, widget);
        return;
    }
    let ratio = next.open / previous.open;
    // Growing, the window grows before the content does; shrinking, the
    // content shrinks first. Either way no frame draws the content larger
    // than its window, which showed as the controls cut off.
    let growing = ratio > 1.0;
    if !growing {
        apply_widget_zoom(window, widget);
    }
    if let Ok(size) = window.inner_size() {
        let width = (size.width as f64 * ratio).round() as u32;
        let height = (size.height as f64 * ratio).round() as u32;
        // Lift the old limits first, or they refuse the new size; the
        // frontend's next layout sync sets them again for the new zoom.
        let _ = window.set_max_size(None::<LogicalSize<f64>>);
        let _ = window.set_min_size(None::<LogicalSize<f64>>);
        let _ = window.set_size(PhysicalSize::new(width, height));
        if let Some(bounds) = widget.bounds.as_mut() {
            bounds.width = width;
            bounds.height = height;
        }
    }
    if growing {
        apply_widget_zoom(window, widget);
    }
}

fn apply_widget_bounds(window: &WebviewWindow, widget: &StoredWidget) {
    if let Some(collapsed) = widget.collapsed {
        apply_collapsed_bounds(window, widget, &collapsed);
        return;
    }
    if let Some(bounds) = widget.bounds.filter(valid_bounds) {
        set_window_bounds(window, bounds.x, bounds.y, bounds.width, bounds.height);
    }
}

/// Moves and resizes a window in one step. Two calls paint a frame in between,
/// which shows as a jump when a widget collapses or expands.
#[cfg(target_os = "windows")]
fn set_window_bounds(window: &WebviewWindow, x: i32, y: i32, width: u32, height: u32) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, SWP_NOACTIVATE, SWP_NOOWNERZORDER, SWP_NOZORDER,
    };

    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    unsafe {
        SetWindowPos(
            hwnd.0 as _,
            std::ptr::null_mut(),
            x,
            y,
            width as i32,
            height as i32,
            SWP_NOZORDER | SWP_NOOWNERZORDER | SWP_NOACTIVATE,
        );
    }
}

#[cfg(not(target_os = "windows"))]
fn set_window_bounds(window: &WebviewWindow, x: i32, y: i32, width: u32, height: u32) {
    let _ = window.set_position(PhysicalPosition::new(x, y));
    let _ = window.set_size(PhysicalSize::new(width, height));
}

/// The collapsed window's size bounds, in logical pixels. The frontend measures
/// the pill or bubble; these only keep a bad measurement from making it vanish
/// or sprawl.
const MIN_COLLAPSED_SIZE: u32 = 32;
const MAX_COLLAPSED_WIDTH: u32 = 360;
const MAX_COLLAPSED_HEIGHT: u32 = 96;

/// Where a collapsed widget's window sits, in physical pixels: at the open
/// widget's size, placed so the pill is in its collapse corner.
///
/// A collapsed window keeps its open size and is clipped to the pill rather
/// than shrunk to it. Shrinking it showed the webview's last frame pinned to
/// the window's top-left for a frame, so a pill in any other corner blinked
/// out as it landed; a clip changes nothing the webview draws.
fn collapsed_frame(
    window: &WebviewWindow,
    widget: &StoredWidget,
    pill: &StoredCollapsedBounds,
) -> StoredWidgetBounds {
    let (pill_width, pill_height) = collapsed_physical_size(window, pill);
    let (width, height) = widget
        .bounds
        .filter(valid_bounds)
        .map(|bounds| (bounds.width, bounds.height))
        .or_else(|| window.inner_size().ok().map(|size| (size.width, size.height)))
        .unwrap_or((pill_width as u32, pill_height as u32));
    let width = width.max(pill_width as u32);
    let height = height.max(pill_height as u32);
    let corner = &widget.collapse_corner;
    StoredWidgetBounds {
        x: if corner.is_right() {
            pill.x + pill_width - width as i32
        } else {
            pill.x
        },
        y: if corner.is_bottom() {
            pill.y + pill_height - height as i32
        } else {
            pill.y
        },
        width,
        height,
    }
}

fn apply_collapsed_bounds(
    window: &WebviewWindow,
    widget: &StoredWidget,
    pill: &StoredCollapsedBounds,
) {
    let frame = collapsed_frame(window, widget, pill);
    let current = read_window_rect(window);
    // Collapsing in place leaves the window where it is; it only moves when
    // the pill was placed somewhere else, as on launch.
    if current.is_none_or(|current| {
        (current.x, current.y, current.width, current.height)
            != (frame.x, frame.y, frame.width, frame.height)
    }) {
        let _ = window.set_max_size(None::<LogicalSize<f64>>);
        let _ = window.set_min_size(None::<LogicalSize<f64>>);
        set_window_bounds(window, frame.x, frame.y, frame.width, frame.height);
    }
    // Its edges are clipped away, so they mustn't offer resize cursors
    // either. Set before the clip: Windows draws a clipped window's frame the
    // old, unthemed way, so a style change under a clip flashed one.
    let _ = window.set_resizable(false);
    let (pill_width, pill_height) = collapsed_physical_size(window, pill);
    set_window_region(
        window,
        Some((pill.x - frame.x, pill.y - frame.y, pill_width, pill_height)),
    );
}

/// Clips the window to a rectangle in its own physical pixels, or lifts the
/// clip. Outside it nothing is drawn and the pointer reaches what's behind.
#[cfg(target_os = "windows")]
fn set_window_region(window: &WebviewWindow, rect: Option<(i32, i32, i32, i32)>) {
    use windows_sys::Win32::Graphics::Gdi::{CreateRectRgn, SetWindowRgn};

    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    unsafe {
        // The window owns the region once set, so it isn't freed here.
        let region = match rect {
            Some((x, y, width, height)) => CreateRectRgn(x, y, x + width, y + height),
            None => std::ptr::null_mut(),
        };
        SetWindowRgn(hwnd.0 as _, region, 1);
    }
}

#[cfg(not(target_os = "windows"))]
fn set_window_region(_window: &WebviewWindow, _rect: Option<(i32, i32, i32, i32)>) {}

fn collapsed_physical_size(window: &WebviewWindow, collapsed: &StoredCollapsedBounds) -> (i32, i32) {
    let scale_factor = window.scale_factor().unwrap_or(1.0);
    (
        (collapsed.width as f64 * scale_factor).round() as i32,
        (collapsed.height as f64 * scale_factor).round() as i32,
    )
}

/// Collapses a widget to its pill or bubble, or expands it back.
///
/// Both directions keep one corner where it is: the widget's `collapse_corner`.
/// Expanding picks it from where the pill sits on its monitor, so a pill
/// dragged to the bottom of the screen unfolds upwards and one at the right
/// unfolds leftwards, and collapsing folds back into the same corner, so the
/// pill returns to where it was. The frontend animates toward and away from
/// that corner around the window resize.
/// Lifts a widget's clip as its unfold starts. Only an expand that had to move
/// the window leaves one; see [`set_widget_collapsed`].
#[tauri::command(rename = "clear-widget-clip")]
pub fn clear_widget_clip(app: tauri::AppHandle, widget_id: Option<String>) -> Result<(), String> {
    let widget_id = resolve_widget_id(&app, widget_id)?;
    if let Some(window) = app.get_webview_window(&widget_label(&widget_id)) {
        set_window_region(&window, None);
        // Resizable again only now the clip is off: a frame drawn under a
        // clip is the old, unthemed kind.
        let _ = window.set_resizable(true);
    }
    Ok(())
}

#[tauri::command(rename = "set-widget-collapsed")]
pub fn set_widget_collapsed(
    app: tauri::AppHandle,
    widget_id: Option<String>,
    collapsed: bool,
    width: Option<u32>,
    height: Option<u32>,
) -> Result<WidgetState, String> {
    let widget_id = resolve_widget_id(&app, widget_id)?;
    let window = app
        .get_webview_window(&widget_label(&widget_id))
        .ok_or_else(|| "Widget window is not available.".to_string())?;
    let monitors = if collapsed {
        Vec::new()
    } else {
        collect_monitors(&app).unwrap_or_default()
    };
    let mut settings = read_widget_settings(&app)?;
    let widget = settings
        .widgets
        .iter_mut()
        .find(|widget| widget.id == widget_id)
        .ok_or_else(|| "Widget settings are not available.".to_string())?;

    // A drag stores the pill's spot only once it has settled, so a click
    // straight after one would expand from, or re-fit to, where it was.
    // Where the window is now is where the pill is.
    if let Some(pill) = widget.collapsed {
        if let Some(current) = read_window_rect(&window) {
            let frame = collapsed_frame(&window, widget, &pill);
            if let Some(stored) = widget.collapsed.as_mut() {
                stored.x = current.x + (pill.x - frame.x);
                stored.y = current.y + (pill.y - frame.y);
            }
        }
    }

    if collapsed {
        let zoom = collapsed_zoom(widget);
        // Measured in CSS pixels; stored and applied in logical ones.
        let css_width = width
            .unwrap_or(MIN_COLLAPSED_SIZE)
            .clamp(MIN_COLLAPSED_SIZE, MAX_COLLAPSED_WIDTH);
        let css_height = height
            .unwrap_or(MIN_COLLAPSED_SIZE)
            .clamp(MIN_COLLAPSED_SIZE, MAX_COLLAPSED_HEIGHT);
        let width = (css_width as f64 * zoom).round() as u32;
        let height = (css_height as f64 * zoom).round() as u32;
        let scale_factor = window.scale_factor().unwrap_or(1.0);
        let pill_width = (width as f64 * scale_factor).round() as i32;
        let pill_height = (height as f64 * scale_factor).round() as i32;
        // The rectangle the pill is fitted into, at the anchored corner: the
        // expanded window, or the pill itself when it re-measures (its title or
        // style changed), so it stays put.
        let frame = match widget.collapsed {
            Some(previous) => {
                let (previous_width, previous_height) =
                    collapsed_physical_size(&window, &previous);
                Some((previous.x, previous.y, previous_width, previous_height))
            }
            None => {
                widget.bounds = read_window_bounds(&window).or(widget.bounds);
                widget.bounds.map(|bounds| {
                    (bounds.x, bounds.y, bounds.width as i32, bounds.height as i32)
                })
            }
        };
        let (x, y) = match frame {
            Some((frame_x, frame_y, frame_width, frame_height)) => {
                let corner = &widget.collapse_corner;
                (
                    if corner.is_right() {
                        frame_x + frame_width - pill_width
                    } else {
                        frame_x
                    },
                    if corner.is_bottom() {
                        frame_y + frame_height - pill_height
                    } else {
                        frame_y
                    },
                )
            }
            None => window
                .outer_position()
                .map(|position| (position.x, position.y))
                .unwrap_or_default(),
        };
        let next = StoredCollapsedBounds {
            x,
            y,
            width,
            height,
            css_width,
            css_height,
        };
        widget.collapsed = Some(next);
        apply_collapsed_bounds(&window, widget, &next);
    } else if let Some(previous) = widget.collapsed.take() {
        let zoom = open_zoom(widget);
        if let Some(bounds) = widget.bounds.as_mut() {
            let (pill_width, pill_height) = collapsed_physical_size(&window, &previous);
            let center_x = previous.x + pill_width / 2;
            let center_y = previous.y + pill_height / 2;
            let monitor = monitors
                .iter()
                .find(|monitor| {
                    center_x >= monitor.x
                        && center_x < monitor.x + monitor.width as i32
                        && center_y >= monitor.y
                        && center_y < monitor.y + monitor.height as i32
                })
                .or_else(|| monitors.iter().find(|monitor| monitor.is_primary));
            // Open toward the preferred sides, each axis flipping on its own
            // when there is no room that way. The pill holds the opposite
            // corner: growing up and left keeps it at the bottom right.
            let mut grow_up = widget.expand_vertical == WidgetExpandVertical::Up;
            let mut grow_left = widget.expand_horizontal == WidgetExpandHorizontal::Left;
            if let Some(monitor) = monitor {
                let work_right = monitor.work_x + monitor.work_width as i32;
                let work_bottom = monitor.work_y + monitor.work_height as i32;
                let room_up = previous.y + pill_height - monitor.work_y;
                let room_down = work_bottom - previous.y;
                let room_left = previous.x + pill_width - monitor.work_x;
                let room_right = work_right - previous.x;
                let height = bounds.height as i32;
                let width = bounds.width as i32;
                grow_up = if grow_up {
                    prefer_side(room_up, room_down, height)
                } else {
                    !prefer_side(room_down, room_up, height)
                };
                grow_left = if grow_left {
                    prefer_side(room_left, room_right, width)
                } else {
                    !prefer_side(room_right, room_left, width)
                };
            }
            widget.collapse_corner = WidgetCollapseCorner::from_sides(grow_left, grow_up);
            let corner = &widget.collapse_corner;
            let mut x = if corner.is_right() {
                previous.x + pill_width - bounds.width as i32
            } else {
                previous.x
            };
            let mut y = if corner.is_bottom() {
                previous.y + pill_height - bounds.height as i32
            } else {
                previous.y
            };
            if let Some(monitor) = monitor {
                let max_x = monitor.work_x + monitor.work_width as i32 - bounds.width as i32;
                let max_y = monitor.work_y + monitor.work_height as i32 - bounds.height as i32;
                x = x.min(max_x).max(monitor.work_x);
                y = y.min(max_y).max(monitor.work_y);
            }
            bounds.x = x;
            bounds.y = y;
        }
        // Lift the pill's fixed size in the same order as collapsing, mirrored.
        // The frontend's next layout sync sets the real limits for the controls.
        let _ = window.set_max_size(None::<LogicalSize<f64>>);
        // Expanding toward the same corner leaves the window where it is, so
        // the clip just comes off and the pill stays drawn throughout. When
        // it has to expand the other way the window moves, and the pill,
        // still drawn at the old corner, would show in the wrong spot until
        // the frontend catches up; so the window is clipped to nothing while
        // it moves, then to the pill's own spot, which the old corner falls
        // outside of. The frontend lifts that clip as it starts to unfold.
        let target = widget.bounds.filter(valid_bounds);
        let moving = target.is_some_and(|target| {
            read_window_rect(&window).is_none_or(|current| {
                (current.x, current.y, current.width, current.height)
                    != (target.x, target.y, target.width, target.height)
            })
        });
        if moving {
            set_window_region(&window, Some((0, 0, 0, 0)));
        }
        apply_widget_bounds(&window, widget);
        match target.filter(|_| moving) {
            Some(target) => {
                let (pill_width, pill_height) = collapsed_physical_size(&window, &previous);
                set_window_region(
                    &window,
                    Some((
                        previous.x - target.x,
                        previous.y - target.y,
                        pill_width,
                        pill_height,
                    )),
                );
            }
            None => set_window_region(&window, None),
        }
        // Only once no clip is left (see `apply_collapsed_bounds`); an expand
        // that moved the window keeps a clip until the frontend lifts it.
        if !moving {
            let _ = window.set_resizable(true);
        }
        let _ = window.set_min_size(Some(LogicalSize::new(
            MIN_WIDGET_WIDTH as f64 * zoom,
            MIN_WIDGET_HEIGHT as f64 * zoom,
        )));
    }

    let next_state = WidgetState::from_stored(widget);
    write_widget_settings(&app, &settings)?;
    if app.get_webview_window("main").is_some() {
        let _ = app.emit_to("main", WIDGET_SETTINGS_CHANGED_EVENT, &next_state);
    }
    Ok(next_state)
}

/// Keeps the user's width (never below the minimum) and fits the height to the
/// content, so a widget that loses controls shrinks instead of leaving empty
/// glass below them.
fn clamped_widget_size(
    window: &WebviewWindow,
    min_width: f64,
    content_height: f64,
) -> Option<LogicalSize<f64>> {
    let scale_factor = window.scale_factor().ok()?;
    let current = window.inner_size().ok()?.to_logical::<f64>(scale_factor);
    let width = current.width.max(min_width).ceil();
    let height = content_height.ceil();

    // A pixel of rounding either way is not worth a resize.
    (width > current.width || (height - current.height).abs() > 1.0)
        .then_some(LogicalSize::new(width, height))
}

fn resolve_widget_id(app: &tauri::AppHandle, widget_id: Option<String>) -> Result<String, String> {
    if let Some(widget_id) = widget_id.filter(|id| is_valid_widget_id(id)) {
        return Ok(widget_id);
    }

    app.webview_windows()
        .keys()
        .find_map(|label| widget_id_from_label(label))
        .ok_or_else(|| "Widget id is not available.".to_string())
}

fn resolve_target_widget_ids(
    app: &tauri::AppHandle,
    widget_id: Option<String>,
) -> Result<Vec<String>, String> {
    if let Some(widget_id) = widget_id.filter(|id| is_valid_widget_id(id)) {
        return Ok(vec![widget_id]);
    }

    let ids = app
        .webview_windows()
        .keys()
        .filter_map(|label| widget_id_from_label(label))
        .collect::<Vec<_>>();

    if ids.is_empty() {
        Err("Widget id is not available.".to_string())
    } else {
        Ok(ids)
    }
}

fn widget_label(widget_id: &str) -> String {
    format!("{WIDGET_LABEL_PREFIX}{widget_id}")
}

fn widget_id_from_label(label: &str) -> Option<String> {
    let widget_id = label.strip_prefix(WIDGET_LABEL_PREFIX)?;
    is_valid_widget_id(widget_id).then(|| widget_id.to_string())
}

fn next_widget_id(settings: &StoredWidgetSettings) -> String {
    let existing_ids = settings
        .widgets
        .iter()
        .map(|widget| widget.id.as_str())
        .collect::<HashSet<_>>();
    let base = widget_url_cache_buster();

    for suffix in 0..1000 {
        let candidate = format!("w{}", base + suffix);
        if !existing_ids.contains(candidate.as_str()) {
            return candidate;
        }
    }

    format!("w{base}")
}

fn is_valid_widget_id(widget_id: &str) -> bool {
    !widget_id.is_empty()
        && widget_id.len() <= 64
        && widget_id.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '-' || character == '_'
        })
}

fn widget_url_cache_buster() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn widget_settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| private_error("Failed to locate widget settings.", error))?;
    fs::create_dir_all(&dir)
        .map_err(|error| private_error("Failed to create the widget settings folder.", error))?;
    Ok(dir.join(WIDGET_SETTINGS_FILE_NAME))
}

fn read_widget_settings(app: &tauri::AppHandle) -> Result<StoredWidgetSettings, String> {
    let path = widget_settings_path(app)?;
    let contents = match fs::read_to_string(&path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(StoredWidgetSettings::default());
        }
        Err(error) => return Err(private_error("Failed to read widget settings.", error)),
    };

    let contents_without_bom = contents.trim_start_matches('\u{feff}');
    let value = match serde_json::from_str::<Value>(contents_without_bom) {
        Ok(value) => value,
        Err(_error) => {
            #[cfg(debug_assertions)]
            eprintln!(
                "failed to parse widget settings at {} ({} bytes): {_error}; using defaults",
                path.display(),
                contents.len()
            );
            return Ok(StoredWidgetSettings::default());
        }
    };

    if value.get("widgets").is_some() {
        let settings = serde_json::from_value::<StoredWidgetSettings>(value)
            .map_err(|error| private_error("Widget settings are invalid.", error))?;
        return Ok(sanitize_widget_settings(settings));
    }

    Ok(legacy_widget_settings_from_value(&value))
}

fn write_widget_settings(
    app: &tauri::AppHandle,
    settings: &StoredWidgetSettings,
) -> Result<(), String> {
    let path = widget_settings_path(app)?;
    let settings = sanitize_widget_settings(settings.clone());
    let contents = serde_json::to_string_pretty(&settings)
        .map_err(|error| private_error("Failed to prepare widget settings.", error))?;
    fs::write(path, contents)
        .map_err(|error| private_error("Failed to save widget settings.", error))
}

fn private_error(public_message: &str, error: impl std::fmt::Display) -> String {
    #[cfg(debug_assertions)]
    {
        return format!("{public_message} {error}");
    }
    #[cfg(not(debug_assertions))]
    {
        let _ = error;
        public_message.to_string()
    }
}

fn sanitize_widget_settings(mut settings: StoredWidgetSettings) -> StoredWidgetSettings {
    let mut seen_ids = HashSet::new();

    settings.widgets.retain_mut(|widget| {
        if !is_valid_widget_id(&widget.id) || !seen_ids.insert(widget.id.clone()) {
            return false;
        }
        if !widget.bounds.is_some_and(|bounds| valid_bounds(&bounds)) {
            widget.bounds = None;
        }
        // Small and Large were the size setting before the scale slider; each
        // becomes the step nearest the size it drew at.
        match widget.size_mode {
            WidgetSizeMode::Small if widget.scale == DEFAULT_WIDGET_SCALE => {
                widget.scale = 90;
            }
            WidgetSizeMode::Large if widget.scale == DEFAULT_WIDGET_SCALE => {
                widget.scale = 110;
            }
            _ => {}
        }
        widget.size_mode = WidgetSizeMode::Default;
        widget.scale = clamp_widget_scale(widget.scale);
        if widget.collapsed_scale == 0 {
            widget.collapsed_scale = widget.scale;
        }
        widget.collapsed_scale = clamp_collapsed_widget_scale(widget.collapsed_scale);
        widget.title = sanitize_widget_title(widget.title.clone());
        widget.controls = sanitize_controls(widget.controls.clone());
        true
    });

    settings
}

fn sanitize_widget_title(title: Option<String>) -> Option<String> {
    title
        .map(|title| title.trim().chars().take(64).collect::<String>())
        .filter(|title| !title.is_empty())
}

fn control_composition_key(controls: &[StoredWidgetControl]) -> Vec<String> {
    let mut key = controls
        .iter()
        .flat_map(|control| {
            if control.control_type == "toggles" {
                control
                    .targets
                    .iter()
                    .map(|target| format!("toggle:{}:{}", target.kind, target.id))
                    .collect::<Vec<_>>()
            } else if let Some(target) = &control.target {
                vec![format!("{}:{}", target.kind, target.id)]
            } else {
                Vec::new()
            }
        })
        .collect::<Vec<_>>();
    key.sort();
    key.dedup();
    key
}

fn find_widget_with_same_composition<'a>(
    settings: &'a StoredWidgetSettings,
    controls: &[StoredWidgetControl],
) -> Option<&'a StoredWidget> {
    if controls.is_empty() {
        return None;
    }
    let target_key = control_composition_key(controls);
    settings
        .widgets
        .iter()
        .filter(|widget| widget.enabled)
        .find(|widget| control_composition_key(&widget.controls) == target_key)
}

/// Drops cards a hand-edited or stale settings file can't render: unknown target
/// kinds, duplicate ids, over-long scene lists, and malformed hotkeys. Also
/// normalizes each card's fields to its `type` so a "control" never carries stray
/// `targets` and a "toggles" never carries a stray single target.
fn sanitize_controls(controls: Vec<StoredWidgetControl>) -> Vec<StoredWidgetControl> {
    let mut seen_ids = HashSet::new();
    controls
        .into_iter()
        .filter_map(|mut control| {
            if control.id.trim().is_empty() || !seen_ids.insert(control.id.clone()) {
                return None;
            }

            if control.control_type == "toggles" {
                // A toggles card is a list of quick on/off targets; it carries no
                // single target, brightness, or scenes.
                control.target = None;
                control.scene_ids.clear();
                let mut seen_targets = HashSet::new();
                control.targets.retain(|target| {
                    CONTROL_TARGET_KINDS.contains(&target.kind.as_str())
                        && !target.id.trim().is_empty()
                        && seen_targets.insert(format!("{}:{}", target.kind, target.id))
                });
                // Normalize each chip's action: a "scene" chip needs a real scene
                // and a group target; anything else collapses back to "power".
                for target in control.targets.iter_mut() {
                    let scene_action = target.action.as_deref() == Some("scene")
                        && target.kind != "light"
                        && target
                            .scene_id
                            .as_deref()
                            .is_some_and(|id| !id.trim().is_empty());
                    if scene_action {
                        target.action = Some("scene".to_string());
                    } else {
                        target.action = None;
                        target.scene_id = None;
                    }
                }
                // An empty toggles card is kept (the user may be mid-config); the
                // renderer shows an "add toggles" hint rather than dropping it.
            } else {
                // Normalize any non-"toggles" value back to a single control.
                control.control_type = "control".to_string();
                control.targets.clear();
                let valid_target = control.target.as_ref().is_some_and(|target| {
                    CONTROL_TARGET_KINDS.contains(&target.kind.as_str())
                        && !target.id.trim().is_empty()
                });
                if !valid_target {
                    return None;
                }
                // Scenes only make sense for a group target.
                let is_light = control
                    .target
                    .as_ref()
                    .is_some_and(|target| target.kind == "light");
                if is_light {
                    control.scene_ids.clear();
                }
            }

            if let Some(hotkey) = &control.hotkey {
                let valid = !hotkey.accelerator.trim().is_empty()
                    && CONTROL_HOTKEY_ACTIONS.contains(&hotkey.action.as_str())
                    && (hotkey.action != "scene" || hotkey.scene_id.is_some());
                if !valid {
                    control.hotkey = None;
                }
            }
            Some(control)
        })
        .collect()
}

fn legacy_widget_settings_from_value(value: &Value) -> StoredWidgetSettings {
    let enabled = value
        .get("enabled")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let pinned = value
        .get("pinned")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let bounds = widget_bounds_from_value(value);

    if !enabled && !pinned && bounds.is_none() {
        return StoredWidgetSettings::default();
    }

    StoredWidgetSettings {
        widgets: vec![StoredWidget {
            id: LEGACY_WIDGET_ID.to_string(),
            title: None,
            enabled,
            pinned,
            bounds,
            user_sized: false,
            theme_mode: WidgetThemeMode::default(),
            size_mode: WidgetSizeMode::default(),
            corner_mode: WidgetCornerMode::default(),
            background_mode: WidgetBackgroundMode::default(),
            tile_opacity: default_tile_opacity(),
            scale: DEFAULT_WIDGET_SCALE,
            collapsed_scale: DEFAULT_WIDGET_SCALE,
            always_on_top: false,
            collapse_mode: WidgetCollapseMode::default(),
            mascot_style: WidgetMascotStyle::default(),
            fold_animation: WidgetFoldAnimation::default(),
            mascot_animated: default_mascot_animated(),
            expand_vertical: WidgetExpandVertical::default(),
            expand_horizontal: WidgetExpandHorizontal::default(),
            auto_collapse_after: None,
            collapse_corner: WidgetCollapseCorner::default(),
            collapsed: None,
            controls: Vec::new(),
        }],
    }
}

fn widget_bounds_from_value(value: &Value) -> Option<StoredWidgetBounds> {
    let source = value.get("bounds").unwrap_or(value);
    let bounds = StoredWidgetBounds {
        x: value_as_i32(source.get("x")?)?,
        y: value_as_i32(source.get("y")?)?,
        width: value_as_u32(source.get("width")?)?,
        height: value_as_u32(source.get("height")?)?,
    };

    valid_bounds(&bounds).then_some(bounds)
}

fn value_as_i32(value: &Value) -> Option<i32> {
    if let Some(value) = value.as_i64() {
        return i32::try_from(value).ok();
    }
    value.as_f64().and_then(|value| {
        value
            .is_finite()
            .then_some(value.round())
            .and_then(|value| i32::try_from(value as i64).ok())
    })
}

fn value_as_u32(value: &Value) -> Option<u32> {
    if let Some(value) = value.as_u64() {
        return u32::try_from(value).ok();
    }
    value.as_f64().and_then(|value| {
        value
            .is_finite()
            .then_some(value.round())
            .and_then(|value| u32::try_from(value as i64).ok())
    })
}

/// One physical display, in the virtual-desktop coordinate space Tauri reports
/// window positions in. The Settings "Position" picker arranges these to scale
/// so the user can click a region to move the widget onto it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    name: Option<String>,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    work_x: i32,
    work_y: i32,
    work_width: u32,
    work_height: u32,
    scale_factor: f64,
    is_primary: bool,
}

/// Everything the position picker needs to draw: every monitor plus the widget's
/// current physical bounds (the live window's if open, otherwise the persisted
/// bounds). `bounds` is `None` for a closed widget that has never been placed.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetPlacement {
    monitors: Vec<MonitorInfo>,
    bounds: Option<StoredWidgetBounds>,
}

/// Payload for [`WIDGET_MOVED_EVENT`]: which widget moved and its new bounds, so
/// the position preview can update the matching rectangle without a round-trip.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WidgetMovedEvent {
    widget_id: String,
    bounds: StoredWidgetBounds,
}

/// Any window we can query the monitor layout through. Monitor enumeration is a
/// window method in Tauri; the main Settings window is the obvious source, but
/// fall back to any open window (e.g. a widget) so this still works if the main
/// window has been hidden to the tray.
fn monitor_query_window(app: &tauri::AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
        .or_else(|| app.webview_windows().into_values().next())
}

#[cfg(windows)]
fn monitor_work_area(x: i32, y: i32, width: u32, height: u32) -> (i32, i32, u32, u32) {
    use std::mem::{size_of, zeroed};
    use windows_sys::Win32::{
        Foundation::POINT,
        Graphics::Gdi::{GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST},
    };

    let center = POINT {
        x: x.saturating_add(i32::try_from(width / 2).unwrap_or(i32::MAX)),
        y: y.saturating_add(i32::try_from(height / 2).unwrap_or(i32::MAX)),
    };
    let handle = unsafe { MonitorFromPoint(center, MONITOR_DEFAULTTONEAREST) };
    let mut info: MONITORINFO = unsafe { zeroed() };
    info.cbSize = size_of::<MONITORINFO>() as u32;

    let succeeded = unsafe { GetMonitorInfoW(handle, &mut info) };
    let work = info.rcWork;
    if succeeded == 0 || work.right <= work.left || work.bottom <= work.top {
        return (x, y, width, height);
    }

    (
        work.left,
        work.top,
        (work.right - work.left) as u32,
        (work.bottom - work.top) as u32,
    )
}

#[cfg(not(windows))]
fn monitor_work_area(x: i32, y: i32, width: u32, height: u32) -> (i32, i32, u32, u32) {
    (x, y, width, height)
}

fn collect_monitors(app: &tauri::AppHandle) -> Result<Vec<MonitorInfo>, String> {
    let window = monitor_query_window(app)
        .ok_or_else(|| "No window is available to read the monitor layout.".to_string())?;
    let monitors = window
        .available_monitors()
        .map_err(|error| error.to_string())?;
    // Match the primary by its top-left corner; `Monitor` isn't comparable, but
    // two displays can't share an origin in the virtual desktop.
    let primary_origin = window
        .primary_monitor()
        .ok()
        .flatten()
        .map(|monitor| (monitor.position().x, monitor.position().y));

    Ok(monitors
        .iter()
        .map(|monitor| {
            let position = monitor.position();
            let size = monitor.size();
            let (work_x, work_y, work_width, work_height) =
                monitor_work_area(position.x, position.y, size.width, size.height);
            MonitorInfo {
                name: monitor.name().cloned(),
                x: position.x,
                y: position.y,
                width: size.width,
                height: size.height,
                work_x,
                work_y,
                work_width,
                work_height,
                scale_factor: monitor.scale_factor(),
                is_primary: primary_origin == Some((position.x, position.y)),
            }
        })
        .collect())
}

/// The widget's current physical bounds: the live window's when it's open,
/// otherwise the persisted bounds (which may be `None`).
fn current_widget_bounds(
    app: &tauri::AppHandle,
    widget_id: &str,
) -> Result<Option<StoredWidgetBounds>, String> {
    // The live window as it is, so a collapsed widget shows as its pill.
    if let Some(window) = app.get_webview_window(&widget_label(widget_id)) {
        if let Some(bounds) = read_window_rect(&window) {
            return Ok(Some(bounds));
        }
    }
    let settings = read_widget_settings(app)?;
    let Some(widget) = settings.widgets.iter().find(|widget| widget.id == widget_id) else {
        return Ok(None);
    };
    // A closed collapsed widget reopens as its pill. Its size is stored in
    // logical pixels, near enough for the preview with no window to ask.
    Ok(match widget.collapsed {
        Some(collapsed) => Some(StoredWidgetBounds {
            x: collapsed.x,
            y: collapsed.y,
            width: collapsed.width,
            height: collapsed.height,
        }),
        None => widget.bounds,
    })
}

#[tauri::command(rename = "get-widget-placement")]
pub fn get_widget_placement(
    app: tauri::AppHandle,
    widget_id: Option<String>,
) -> Result<WidgetPlacement, String> {
    let widget_id = resolve_widget_id(&app, widget_id)?;
    Ok(WidgetPlacement {
        monitors: collect_monitors(&app)?,
        bounds: current_widget_bounds(&app, &widget_id)?,
    })
}

/// Moves the widget's top-left corner to an absolute virtual-desktop position.
/// When the window is open it moves live; either way the new spot is persisted so
/// the widget reopens there. Closed widgets keep their stored size (or fall back
/// to the default) since there's no live window to measure.
#[tauri::command(rename = "set-widget-position")]
pub fn set_widget_position(
    app: tauri::AppHandle,
    widget_id: Option<String>,
    x: i32,
    y: i32,
) -> Result<(), String> {
    // Placing a widget by coordinates is Pro. Dragging the window itself is
    // ordinary window behaviour and stays free, and so does
    // `reset-widget-position`, which is recovery rather than placement.
    crate::commands::entitlements::require(&app, Capability::AdvancedWidgets)?;

    let widget_id = resolve_widget_id(&app, widget_id)?;
    let mut settings = read_widget_settings(&app)?;

    if let Some(window) = app.get_webview_window(&widget_label(&widget_id)) {
        window
            .set_position(PhysicalPosition::new(x, y))
            .map_err(|error| error.to_string())?;
        if let Some(widget) = settings
            .widgets
            .iter_mut()
            .find(|widget| widget.id == widget_id)
        {
            // Placed while collapsed, it's the pill that moved; the widget
            // opens from there when expanded.
            match widget.collapsed.as_mut() {
                Some(collapsed) => {
                    collapsed.x = x;
                    collapsed.y = y;
                }
                None => widget.bounds = read_window_bounds(&window).or(widget.bounds),
            }
        }
    } else if let Some(widget) = settings
        .widgets
        .iter_mut()
        .find(|widget| widget.id == widget_id)
    {
        if let Some(collapsed) = widget.collapsed.as_mut() {
            collapsed.x = x;
            collapsed.y = y;
            return write_widget_settings(&app, &settings);
        }
        let (width, height) = widget
            .bounds
            .map(|bounds| (bounds.width, bounds.height))
            .unwrap_or((DEFAULT_WIDGET_WIDTH as u32, DEFAULT_WIDGET_HEIGHT as u32));
        widget.bounds = Some(StoredWidgetBounds {
            x,
            y,
            width,
            height,
        });
    }

    write_widget_settings(&app, &settings)
}

/// Recovers a widget that's been dragged or resized off-screen: clamps its size
/// to fit the primary monitor and re-centres it there. Works whether the widget
/// is open (moves and resizes live) or closed (rewrites its persisted bounds).
#[tauri::command(rename = "reset-widget-position")]
pub fn reset_widget_position(
    app: tauri::AppHandle,
    widget_id: Option<String>,
) -> Result<(), String> {
    let widget_id = resolve_widget_id(&app, widget_id)?;
    let monitors = collect_monitors(&app)?;
    let primary = monitors
        .iter()
        .find(|monitor| monitor.is_primary)
        .or_else(|| monitors.first())
        .ok_or_else(|| "No monitor is available.".to_string())?;

    // Keep recovered widgets inside the usable desktop, excluding the taskbar.
    let max_width = (((primary.work_width as f64) * 0.9) as u32).max(MIN_WIDGET_WIDTH);
    let max_height = (((primary.work_height as f64) * 0.9) as u32).max(MIN_WIDGET_HEIGHT);

    let mut settings = read_widget_settings(&app)?;

    // Recovery always brings the widget back expanded, at its expanded size.
    let expanded_size = settings
        .widgets
        .iter_mut()
        .find(|widget| widget.id == widget_id)
        .and_then(|widget| widget.collapsed.take().and(widget.bounds))
        .map(|bounds| PhysicalSize::new(bounds.width, bounds.height));

    if let Some(window) = app.get_webview_window(&widget_label(&widget_id)) {
        set_window_region(&window, None);
        if expanded_size.is_some() {
            let _ = window.set_max_size(None::<LogicalSize<f64>>);
            let _ = window.set_resizable(true);
        }
        let size = match expanded_size {
            Some(size) => size,
            None => window.inner_size().map_err(|error| error.to_string())?,
        };
        let width = size.width.clamp(MIN_WIDGET_WIDTH, max_width);
        let height = size.height.clamp(MIN_WIDGET_HEIGHT, max_height);
        // The layout synchronizer normally prevents the window from becoming
        // shorter than its content. Recovery must relax that constraint first,
        // otherwise Windows rejects the taskbar-safe size.
        window
            .set_min_size(Some(PhysicalSize::new(
                MIN_WIDGET_WIDTH.min(width),
                MIN_WIDGET_HEIGHT.min(height),
            )))
            .map_err(|error| error.to_string())?;
        if expanded_size.is_some() || width != size.width || height != size.height {
            window
                .set_size(PhysicalSize::new(width, height))
                .map_err(|error| error.to_string())?;
        }
        let x = primary.work_x + (primary.work_width.saturating_sub(width) / 2) as i32;
        let y = primary.work_y + (primary.work_height.saturating_sub(height) / 2) as i32;
        window
            .set_position(PhysicalPosition::new(x, y))
            .map_err(|error| error.to_string())?;
        if let Some(widget) = settings
            .widgets
            .iter_mut()
            .find(|widget| widget.id == widget_id)
        {
            // Window mutations are asynchronous on Windows; persist the target
            // instead of immediately reading back the stale pre-reset bounds.
            widget.bounds = Some(StoredWidgetBounds {
                x,
                y,
                width,
                height,
            });
        }
    } else if let Some(widget) = settings
        .widgets
        .iter_mut()
        .find(|widget| widget.id == widget_id)
    {
        let (width, height) = widget
            .bounds
            .map(|bounds| {
                (
                    bounds.width.clamp(MIN_WIDGET_WIDTH, max_width),
                    bounds.height.clamp(MIN_WIDGET_HEIGHT, max_height),
                )
            })
            .unwrap_or((DEFAULT_WIDGET_WIDTH as u32, DEFAULT_WIDGET_HEIGHT as u32));
        let x = primary.work_x + (primary.work_width.saturating_sub(width) / 2) as i32;
        let y = primary.work_y + (primary.work_height.saturating_sub(height) / 2) as i32;
        widget.bounds = Some(StoredWidgetBounds {
            x,
            y,
            width,
            height,
        });
    }

    let next_state = settings
        .widgets
        .iter_mut()
        .find(|widget| widget.id == widget_id)
        .map(|widget| {
            widget.pinned = false;
            WidgetState::from_stored(widget)
        });
    write_widget_settings(&app, &settings)?;

    if let Some(next_state) = next_state {
        let label = widget_label(&widget_id);
        let _ = app.emit_to(&label, WIDGET_SETTINGS_CHANGED_EVENT, &next_state);
        if app.get_webview_window("main").is_some() {
            let _ = app.emit_to("main", WIDGET_SETTINGS_CHANGED_EVENT, &next_state);
        }
    }

    Ok(())
}

#[cfg(test)]
mod free_limit_tests {
    use super::*;

    fn toggles(id: &str, targets: &[&str]) -> StoredWidgetControl {
        let targets: Vec<Value> = targets
            .iter()
            .map(|target| serde_json::json!({ "kind": "room", "id": target }))
            .collect();

        serde_json::from_value(serde_json::json!({
            "id": id,
            "type": "toggles",
            "targets": targets,
        }))
        .unwrap()
    }

    #[test]
    fn a_pro_composition_is_cut_to_what_free_allows() {
        let saved = vec![toggles("a", &["r1", "r2"]), toggles("b", &["r3"])];
        assert!(exceeds_free_composition(&saved));

        let limited = free_composition(&saved);

        assert!(!exceeds_free_composition(&limited));
        assert_eq!(limited.len(), 1);
        assert_eq!(limited[0].id, "a");
        assert_eq!(limited[0].targets.len(), 1);
        assert_eq!(limited[0].targets[0].id, "r1");
    }

    #[test]
    fn a_free_composition_is_left_as_it_is() {
        let saved = vec![toggles("a", &["r1"])];

        let limited = free_composition(&saved);

        assert_eq!(limited.len(), 1);
        assert_eq!(limited[0].targets[0].id, "r1");
    }

    #[test]
    fn only_the_standard_appearance_is_free() {
        use WidgetCornerMode::{Round, Rounded, Soft, Square};
        use WidgetSizeMode::{Default, Large, Small};
        use WidgetThemeMode::{Dark, Light, System};

        assert!(!exceeds_free_appearance(&System, &Default, &Rounded));
        assert!(exceeds_free_appearance(&Light, &Default, &Rounded));
        assert!(exceeds_free_appearance(&Dark, &Default, &Rounded));
        assert!(exceeds_free_appearance(&System, &Small, &Rounded));
        assert!(exceeds_free_appearance(&System, &Large, &Rounded));
        assert!(exceeds_free_appearance(&System, &Default, &Square));
        assert!(exceeds_free_appearance(&System, &Default, &Soft));
        assert!(exceeds_free_appearance(&System, &Default, &Round));
    }

    #[test]
    fn a_widget_saved_before_corners_existed_keeps_the_standard_ones() {
        let widget: StoredWidget = serde_json::from_value(serde_json::json!({
            "id": "old", "enabled": true, "pinned": false, "bounds": null
        }))
        .unwrap();

        assert!(matches!(widget.corner_mode, WidgetCornerMode::Rounded));
        assert!(matches!(
            widget.background_mode,
            WidgetBackgroundMode::Solid
        ));
        assert_eq!(widget.tile_opacity, default_tile_opacity());
    }

    #[test]
    fn auto_collapse_is_off_or_within_its_range() {
        assert_eq!(auto_collapse_from(-1), None);
        assert_eq!(auto_collapse_from(0), Some(0));
        assert_eq!(auto_collapse_from(12), Some(12));
        assert_eq!(auto_collapse_from(9_000), Some(MAX_AUTO_COLLAPSE_SECONDS));
    }

    #[test]
    fn a_scale_snaps_to_a_step_within_the_range() {
        assert_eq!(clamp_widget_scale(100), 100);
        assert_eq!(clamp_widget_scale(73), 73);
        assert_eq!(clamp_widget_scale(125), 125);
        assert_eq!(clamp_widget_scale(69), MIN_WIDGET_SCALE);
        assert_eq!(clamp_widget_scale(0), MIN_WIDGET_SCALE);
        assert_eq!(clamp_widget_scale(255), MAX_WIDGET_SCALE);
        assert_eq!(clamp_collapsed_widget_scale(250), 250);
        assert_eq!(clamp_collapsed_widget_scale(300), MAX_COLLAPSED_WIDGET_SCALE);
        assert_eq!(clamp_collapsed_widget_scale(u16::MAX), MAX_COLLAPSED_WIDGET_SCALE);
        assert!(!exceeds_free_scale(100));
        assert!(exceeds_free_scale(90));
    }

    #[test]
    fn small_and_large_widgets_become_a_scale() {
        let settings: StoredWidgetSettings = serde_json::from_value(serde_json::json!({
            "widgets": [
                { "id": "small", "enabled": true, "pinned": false, "bounds": null, "sizeMode": "small" },
                { "id": "large", "enabled": true, "pinned": false, "bounds": null, "sizeMode": "large" },
                { "id": "plain", "enabled": true, "pinned": false, "bounds": null }
            ]
        }))
        .unwrap();
        let settings = sanitize_widget_settings(settings);
        let scale_of = |id: &str| {
            let widget = settings.widgets.iter().find(|w| w.id == id).unwrap();
            assert!(matches!(widget.size_mode, WidgetSizeMode::Default));
            widget.scale
        };
        assert_eq!(scale_of("small"), 90);
        assert_eq!(scale_of("large"), 110);
        assert_eq!(scale_of("plain"), DEFAULT_WIDGET_SCALE);
    }

    #[test]
    fn a_widget_opens_the_preferred_way_unless_there_is_no_room() {
        // Fits the preferred way.
        assert!(prefer_side(500, 100, 300));
        // No room that way, room the other: flip.
        assert!(!prefer_side(100, 500, 300));
        // Room neither way: the side with more room wins.
        assert!(prefer_side(250, 200, 300));
        assert!(!prefer_side(150, 200, 300));
    }

    #[test]
    fn tile_opacity_stays_within_its_range() {
        assert_eq!(clamp_tile_opacity(0), MIN_TILE_OPACITY);
        assert_eq!(clamp_tile_opacity(55), 55);
        assert_eq!(clamp_tile_opacity(100), MAX_TILE_OPACITY);
    }

    #[test]
    fn only_a_solid_background_is_free() {
        assert!(!exceeds_free_background(&WidgetBackgroundMode::Solid));
        assert!(exceeds_free_background(&WidgetBackgroundMode::Translucent));
    }

    #[test]
    fn an_unknown_background_reads_as_solid() {
        let mode: WidgetBackgroundMode =
            serde_json::from_value(serde_json::json!("frosted")).unwrap();
        assert!(matches!(mode, WidgetBackgroundMode::Solid));
    }

    #[test]
    fn free_runs_the_first_saved_widget_only() {
        let settings: StoredWidgetSettings = serde_json::from_value(serde_json::json!({
            "widgets": [
                { "id": "first", "enabled": true, "pinned": false, "bounds": null },
                { "id": "second", "enabled": true, "pinned": false, "bounds": null },
            ]
        }))
        .unwrap();

        assert!(settings.within_free_count("first"));
        assert!(!settings.within_free_count("second"));
        assert!(!settings.within_free_count("unknown"));
        assert!(!StoredWidgetSettings::default().within_free_count("first"));
    }
}
