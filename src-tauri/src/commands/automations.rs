use tauri::{AppHandle, Manager};

use crate::services::automations::runtime::{self, AutomationRuntime, AutomationStatus, Signal};
use crate::services::automations::settings::{
    load as load_settings, save as save_settings, AutomationSettings,
};

#[tauri::command(rename = "get-automation-settings")]
pub fn get_automation_settings(app: AppHandle) -> AutomationSettings {
    app.try_state::<AutomationRuntime>()
        .map(|runtime| runtime.settings())
        .unwrap_or_else(|| load_settings(&app))
}

/// Saving is free on purpose, like shortcuts: an automation can be set up
/// before Pro is owned. Running one is what `local_automation` gates, in the
/// runtime, so a modified frontend cannot skip it.
#[tauri::command(rename = "set-automation-settings")]
pub fn set_automation_settings(
    app: AppHandle,
    settings: AutomationSettings,
) -> Result<AutomationSettings, String> {
    settings.validate()?;
    save_settings(&app, &settings)?;
    if let Some(runtime) = app.try_state::<AutomationRuntime>() {
        runtime.set_settings(settings.clone());
    }
    runtime::signal(Signal::SettingsChanged);
    Ok(settings)
}

#[tauri::command(rename = "get-automation-status")]
pub fn get_automation_status(app: AppHandle) -> AutomationStatus {
    app.try_state::<AutomationRuntime>()
        .map(|runtime| runtime.status())
        .unwrap_or_default()
}

#[tauri::command(rename = "preview-automation")]
pub async fn preview_automation(
    app: AppHandle,
    rule: Option<runtime::PreviewRule>,
    settings: AutomationSettings,
) -> Result<(), String> {
    let runtime = app
        .try_state::<AutomationRuntime>()
        .ok_or("Automations are not ready yet.")?;
    runtime.preview(&app, rule, settings).await
}
