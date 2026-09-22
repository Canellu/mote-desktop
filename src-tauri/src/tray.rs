//! The notification-area icon: show and quit, plus a running focus session's
//! phase and controls, so a session can be paused or ended while Mote stays in
//! the tray.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::AppHandle;

use crate::commands;
use crate::services::automations::focus::{FocusStatus, Lifecycle, Phase};

const TRAY_ID: &str = "main";
const TOOLTIP: &str = "Mote Desktop";

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png"))?;
    tauri::tray::TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .tooltip(TOOLTIP)
        .menu(&menu(app, &FocusStatus::default())?)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => {
                let _ = commands::app_settings::show_main_window(app);
            }
            "quit" => app.exit(0),
            "focus-pause" => {
                let _ = commands::focus::pause(app);
            }
            "focus-resume" => {
                let _ = commands::focus::resume(app);
            }
            "focus-skip" => {
                let _ = commands::focus::skip(app);
            }
            "focus-stop" => {
                let _ = commands::focus::stop(app);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| match event {
            tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                ..
            }
            | tauri::tray::TrayIconEvent::DoubleClick {
                button: tauri::tray::MouseButton::Left,
                ..
            } => {
                let _ = commands::app_settings::show_main_window(tray.app_handle());
            }
            _ => {}
        })
        .build(app)?;
    Ok(())
}

fn phase_name(phase: Option<Phase>) -> &'static str {
    match phase {
        Some(Phase::Focus) | None => "Focus",
        Some(Phase::Break) => "Break",
        Some(Phase::LongBreak) => "Long break",
    }
}

fn menu(app: &AppHandle, focus: &FocusStatus) -> tauri::Result<Menu<tauri::Wry>> {
    let show = MenuItem::with_id(app, "show", "Show Mote Desktop", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let active = matches!(
        focus.lifecycle,
        Lifecycle::Running | Lifecycle::Paused | Lifecycle::Intermission
    );
    if !active {
        return Menu::with_items(app, &[&show, &quit]);
    }
    let paused = focus.lifecycle == Lifecycle::Paused;
    let toggle = if paused {
        MenuItem::with_id(
            app,
            "focus-resume",
            "Resume focus session",
            true,
            None::<&str>,
        )?
    } else {
        MenuItem::with_id(
            app,
            "focus-pause",
            "Pause focus session",
            true,
            None::<&str>,
        )?
    };
    let skip = MenuItem::with_id(
        app,
        "focus-skip",
        if focus.intermission {
            "Start next phase now"
        } else {
            "Skip to next phase"
        },
        true,
        None::<&str>,
    )?;
    let stop = MenuItem::with_id(app, "focus-stop", "End focus session", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let second = PredefinedMenuItem::separator(app)?;
    Menu::with_items(
        app,
        &[&show, &separator, &toggle, &skip, &stop, &second, &quit],
    )
}

/// The tooltip line for a focus session, e.g. "Focus · round 2 of 4 · ends 14:05".
fn tooltip(focus: &FocusStatus) -> String {
    match focus.lifecycle {
        Lifecycle::Running | Lifecycle::Intermission => {
            let phase = if focus.intermission {
                format!("{} next", phase_name(focus.next_phase))
            } else {
                phase_name(focus.phase).to_string()
            };
            // The time it ends stays true between status changes; a count of
            // minutes left would not.
            let ends = focus
                .ends_at
                .and_then(|at| chrono::DateTime::from_timestamp_millis(at as i64))
                .map(|at| at.with_timezone(&chrono::Local).format("%H:%M").to_string());
            let round = format!("round {} of {}", focus.round, focus.rounds);
            match ends {
                Some(ends) => format!("{TOOLTIP}\n{phase} until {ends} · {round}"),
                None => format!("{TOOLTIP}\n{phase} · {round}"),
            }
        }
        Lifecycle::Paused => format!("{TOOLTIP}\nFocus session paused"),
        _ => TOOLTIP.to_string(),
    }
}

/// Follows a focus session's changes. Called only when its status changes.
pub fn show_focus(app: &AppHandle, focus: &FocusStatus) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    let _ = tray.set_tooltip(Some(tooltip(focus)));
    if let Ok(menu) = menu(app, focus) {
        let _ = tray.set_menu(Some(menu));
    }
}
