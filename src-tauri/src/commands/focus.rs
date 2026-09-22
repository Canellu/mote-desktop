use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::services::automations::focus::{self, FocusRitual, FocusStatus, Session};
use crate::services::automations::looks::{mirek_for_xy, Write};
use crate::services::automations::priority::Holder;
use crate::services::automations::resolve::{ClaimSpec, Desire, Looks};
use crate::services::automations::runtime::AutomationRuntime;
use crate::services::entitlements::Capability;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusData {
    pub rituals: Vec<FocusRitual>,
    pub last_ritual_id: Option<String>,
    pub status: FocusStatus,
}

fn runtime(app: &AppHandle) -> Result<State<'_, AutomationRuntime>, String> {
    app.try_state::<AutomationRuntime>()
        .ok_or_else(|| "Automations are not ready yet.".to_string())
}

fn data(app: &AppHandle) -> FocusData {
    let store = focus::load(app);
    FocusData {
        rituals: store.rituals,
        last_ritual_id: store.last_ritual_id,
        status: app
            .try_state::<AutomationRuntime>()
            .map(|runtime| runtime.focus_status())
            .unwrap_or_default(),
    }
}

#[tauri::command(rename = "get-focus-data")]
pub fn get_focus_data(app: AppHandle) -> FocusData {
    data(&app)
}

/// Saving is free, like every automation: a ritual can be prepared before Pro
/// is owned, and starting it is what `local_automation` gates.
#[tauri::command(rename = "save-focus-ritual")]
pub fn save_focus_ritual(app: AppHandle, ritual: FocusRitual) -> Result<FocusData, String> {
    ritual.validate()?;
    let mut store = focus::load(&app);
    match store.rituals.iter_mut().find(|saved| saved.id == ritual.id) {
        Some(saved) => *saved = ritual,
        None => store.rituals.push(ritual),
    }
    focus::save(&app, &store)?;
    Ok(data(&app))
}

#[tauri::command(rename = "delete-focus-ritual")]
pub fn delete_focus_ritual(app: AppHandle, id: String) -> Result<FocusData, String> {
    let mut store = focus::load(&app);
    store.rituals.retain(|ritual| ritual.id != id);
    if store.last_ritual_id.as_deref() == Some(&id) {
        store.last_ritual_id = None;
    }
    focus::save(&app, &store)?;
    Ok(data(&app))
}

#[tauri::command(rename = "start-focus")]
pub fn start_focus(app: AppHandle, ritual_id: String) -> Result<FocusStatus, String> {
    let mut store = focus::load(&app);
    let ritual = store
        .rituals
        .iter()
        .find(|ritual| ritual.id == ritual_id)
        .cloned()
        .ok_or("This routine no longer exists.")?;
    ritual.validate()?;
    if ritual.targets.is_empty() {
        return Err("Choose lights for this routine first.".into());
    }
    crate::commands::entitlements::require(&app, Capability::LocalAutomation)?;
    let runtime = runtime(&app)?;
    runtime.with_focus(&app, |session, now| {
        if session.as_ref().is_some_and(|session| !session.finished()) {
            return Err("A focus session is already running.".to_string());
        }
        *session = Some(Session::start(ritual, now));
        Ok(())
    })?;
    store.last_ritual_id = Some(ritual_id);
    // The session runs whether or not this remembers it.
    let _ = focus::save(&app, &store);
    Ok(runtime.focus_status())
}

fn change(
    app: &AppHandle,
    action: impl FnOnce(&mut Session, std::time::Instant),
) -> Result<FocusStatus, String> {
    let runtime = runtime(app)?;
    runtime.with_focus(app, |session, now| {
        let session = session.as_mut().ok_or("No focus session is running.")?;
        action(session, now);
        Ok(())
    })?;
    Ok(runtime.focus_status())
}

pub fn pause(app: &AppHandle) -> Result<FocusStatus, String> {
    change(app, |session, now| session.pause(now, false))
}

pub fn resume(app: &AppHandle) -> Result<FocusStatus, String> {
    change(app, |session, now| session.resume(now))
}

pub fn skip(app: &AppHandle) -> Result<FocusStatus, String> {
    change(app, |session, now| {
        session.skip(now);
    })
}

/// Ends the session; the runtime puts the lights back.
pub fn stop(app: &AppHandle) -> Result<FocusStatus, String> {
    let runtime = runtime(app)?;
    runtime.with_focus(app, |session, _| {
        *session = None;
        Ok(())
    })?;
    Ok(runtime.focus_status())
}

#[tauri::command(rename = "pause-focus")]
pub fn pause_focus(app: AppHandle) -> Result<FocusStatus, String> {
    pause(&app)
}

#[tauri::command(rename = "resume-focus")]
pub fn resume_focus(app: AppHandle) -> Result<FocusStatus, String> {
    resume(&app)
}

/// Skips the rest of this phase, or of the intermission ("Start now").
#[tauri::command(rename = "skip-focus-phase")]
pub fn skip_focus_phase(app: AppHandle) -> Result<FocusStatus, String> {
    skip(&app)
}

/// Five more minutes of focus or two of a break ("Add time").
#[tauri::command(rename = "extend-focus-phase")]
pub fn extend_focus_phase(app: AppHandle) -> Result<FocusStatus, String> {
    change(&app, |session, now| session.extend(now))
}

#[tauri::command(rename = "stop-focus")]
pub fn stop_focus(app: AppHandle) -> Result<FocusStatus, String> {
    stop(&app)
}

/// Clears a completed session's summary.
#[tauri::command(rename = "dismiss-focus")]
pub fn dismiss_focus(app: AppHandle) -> Result<FocusStatus, String> {
    let runtime = runtime(&app)?;
    runtime.with_focus(&app, |session, _| {
        if session.as_ref().is_some_and(Session::finished) {
            *session = None;
        }
        Ok(())
    })?;
    Ok(runtime.focus_status())
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FocusLook {
    Focus,
    Warning,
    Break,
}

/// Shows one of a ritual's looks on its lights while the editor renews the
/// preview; `None` ends it and the lights go back.
#[tauri::command(rename = "preview-focus-look")]
pub async fn preview_focus_look(
    app: AppHandle,
    ritual: Option<FocusRitual>,
    look: Option<FocusLook>,
) -> Result<(), String> {
    let runtime = runtime(&app)?;
    let (Some(ritual), Some(look)) = (ritual, look) else {
        return runtime.show_preview(&app, None).await;
    };
    let (xy, brightness) = match look {
        FocusLook::Focus => (ritual.focus_xy, ritual.focus_brightness),
        FocusLook::Warning => (ritual.warning_xy, ritual.focus_brightness),
        FocusLook::Break => (ritual.break_xy, ritual.break_brightness),
    };
    runtime
        .show_preview(
            &app,
            Some(Desire {
                holder: Holder::Preview,
                spec: ClaimSpec::Lights {
                    bridge_id: ritual.bridge_id,
                    targets: ritual.targets,
                    looks: Looks::Uniform(Write::Tint {
                        xy,
                        mirek: mirek_for_xy(xy),
                        brightness,
                    }),
                },
                restore: true,
                transition_ms: 0,
            }),
        )
        .await
}
