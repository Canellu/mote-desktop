use serde::Serialize;
use tauri::{AppHandle, State};

use crate::services::automations::runtime as automations;
use crate::services::entitlements::Capability;
use crate::services::entertainment::credentials::{self, EntertainmentCredentialStatus};
use crate::services::entertainment::displays::{self, DisplayInfo};
use crate::services::entertainment::engine::{
    resolve_streaming_rest_key, ColorTestRequest, HostSyncEngine, HostSyncStatus, StartSyncRequest,
    UpdateSyncRequest,
};
use crate::services::entertainment::preferences::{self, HostSyncPreferences};
use crate::services::hue_client::{HueClient, HueEntertainmentArea};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioOutputInfo {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostSyncOverview {
    pub bridge_configured: bool,
    pub credentials: EntertainmentCredentialStatus,
    /// Display/audio capture is Windows-only for now; streaming itself is not.
    pub capture_supported: bool,
    /// Current monitor topology; empty on non-Windows platforms.
    pub displays: Vec<DisplayInfo>,
    /// Current render endpoints; empty on non-Windows platforms.
    pub audio_outputs: Vec<AudioOutputInfo>,
    pub preferences: HostSyncPreferences,
    pub areas: Vec<HueEntertainmentArea>,
    /// Set when the bridge is paired but the area list could not be fetched.
    pub areas_error: Option<String>,
    pub status: HostSyncStatus,
}

#[tauri::command(rename = "get-host-sync-overview")]
pub async fn get_host_sync_overview(
    app: AppHandle,
    engine: State<'_, HostSyncEngine>,
) -> Result<HostSyncOverview, String> {
    let status = engine.status();
    let capture_supported = cfg!(windows);
    let displays = displays::enumerate_displays().unwrap_or_default();
    #[cfg(windows)]
    let audio_outputs = crate::services::entertainment::audio::enumerate_audio_outputs()
        .unwrap_or_default()
        .into_iter()
        .map(|device| AudioOutputInfo {
            id: device.id,
            name: device.name,
            is_default: device.is_default,
        })
        .collect();
    #[cfg(not(windows))]
    let audio_outputs = Vec::new();
    let prefs = preferences::load(&app);

    let client = HueClient::new()?;
    let Ok(bridge) = client.get_stored_bridge(&app) else {
        return Ok(HostSyncOverview {
            bridge_configured: false,
            credentials: credentials::empty_credential_status(),
            capture_supported,
            displays,
            audio_outputs,
            preferences: prefs,
            areas: Vec::new(),
            areas_error: None,
            status,
        });
    };
    // Credentials are scoped to the active bridge.
    let credential_status = credentials::credential_status(&bridge.bridge_id);

    let (areas, areas_error) = match resolve_streaming_rest_key(&app, &client, &bridge.bridge_id) {
        Ok(rest_key) => match client
            .get_entertainment_areas(&bridge.bridge_ip, &rest_key)
            .await
        {
            Ok(areas) => (areas, None),
            Err(error) => (Vec::new(), Some(error)),
        },
        Err(error) => (Vec::new(), Some(error)),
    };

    Ok(HostSyncOverview {
        bridge_configured: true,
        credentials: credential_status,
        capture_supported,
        displays,
        audio_outputs,
        preferences: prefs,
        areas,
        areas_error,
        status,
    })
}

#[tauri::command(rename = "get-host-sync-preferences")]
pub fn get_host_sync_preferences(app: AppHandle) -> HostSyncPreferences {
    preferences::load(&app)
}

#[tauri::command(rename = "set-host-sync-preferences")]
pub fn set_host_sync_preferences(
    app: AppHandle,
    preferences: HostSyncPreferences,
) -> Result<HostSyncPreferences, String> {
    preferences::save(&app, &preferences)?;
    Ok(preferences)
}

/// Starts capture-driven sync (Video/Games/Music). Drives physical lights — the UI
/// must only call this from an explicit user action.
///
/// This is also the paywall for PC Sync, and the only one. Everything leading up
/// to it — creating an entertainment area, positioning it, running the colour
/// test — stays free, so a customer can find out whether their hardware works
/// before being asked to pay. Once a session is authorized it runs without
/// meeting another gate.
#[tauri::command(rename = "start-host-sync")]
pub async fn start_host_sync(
    app: AppHandle,
    engine: State<'_, HostSyncEngine>,
    request: StartSyncRequest,
) -> Result<HostSyncStatus, String> {
    crate::commands::entitlements::require(&app, Capability::PcSync)?;
    automations::signal(automations::Signal::SyncByUser);
    engine.start_sync(&app, request).await
}

/// Link-button flow that provisions a dedicated entertainment credential for
/// installations whose main pairing predates clientkey capture. The user must
/// press the bridge button first.
#[tauri::command(rename = "provision-host-sync-credentials")]
pub async fn provision_host_sync_credentials(
    app: AppHandle,
) -> Result<EntertainmentCredentialStatus, String> {
    let client = HueClient::new()?;
    let bridge = client.get_stored_bridge(&app)?;
    let (application_key, client_key) = client
        .pair_entertainment_credential(&bridge.bridge_ip)
        .await?;
    credentials::save_application_key(&bridge.bridge_id, &application_key)?;
    credentials::save_client_key(&bridge.bridge_id, &client_key)?;
    Ok(credentials::credential_status(&bridge.bridge_id))
}

/// Streaming spike: solid color to every channel of an area. Drives physical
/// lights — the UI must only call this after explicit user confirmation.
#[tauri::command(rename = "start-host-sync-color-test")]
pub async fn start_host_sync_color_test(
    app: AppHandle,
    engine: State<'_, HostSyncEngine>,
    request: ColorTestRequest,
) -> Result<HostSyncStatus, String> {
    automations::signal(automations::Signal::SyncByUser);
    engine.start_color_test(&app, request).await
}

/// Applies live brightness/intensity changes to the active session without
/// restarting it. Mode, palette, and display changes go through stop/start.
#[tauri::command(rename = "update-host-sync")]
pub fn update_host_sync(
    engine: State<'_, HostSyncEngine>,
    request: UpdateSyncRequest,
) -> Result<HostSyncStatus, String> {
    engine.update_sync(request)
}

#[tauri::command(rename = "stop-host-sync")]
pub fn stop_host_sync(app: AppHandle, engine: State<'_, HostSyncEngine>) -> HostSyncStatus {
    automations::signal(automations::Signal::SyncByUser);
    engine.stop(&app)
}

#[tauri::command(rename = "get-host-sync-status")]
pub fn get_host_sync_status(engine: State<'_, HostSyncEngine>) -> HostSyncStatus {
    engine.status()
}
