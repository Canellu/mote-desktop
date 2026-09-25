use serde_json::Value;
use tauri::{AppHandle, State};

use crate::services::entitlements::Capability;
use crate::services::sync_box_client::{
    DiscoveredSyncBox, SyncBoxClient, SyncBoxSession, SyncBoxState,
};

#[tauri::command(rename = "discover-sync-boxes")]
pub async fn discover_sync_boxes(
    client: State<'_, SyncBoxClient>,
) -> Result<Vec<DiscoveredSyncBox>, String> {
    client.discover().await
}

/// Pairs a box and makes it the active one. A second box is Mote Pro; pairing
/// one that is already saved again is not, so a lost token can always be fixed.
#[tauri::command(rename = "pair-sync-box")]
pub async fn pair_sync_box(
    app: AppHandle,
    client: State<'_, SyncBoxClient>,
    ip_address: String,
    port: u16,
) -> Result<SyncBoxSession, String> {
    let (sync_box, access_token) = client.register(&ip_address, port).await?;
    if client.saved_count(&app)? > 0 && !client.is_saved(&app, &sync_box.unique_id)? {
        crate::commands::entitlements::require(&app, Capability::MultipleSyncBoxes)?;
    }
    client.save_session(&app, sync_box, &access_token).await
}

#[tauri::command(rename = "get-sync-box-session")]
pub async fn get_sync_box_session(
    app: AppHandle,
    client: State<'_, SyncBoxClient>,
) -> Result<SyncBoxSession, String> {
    client.restore_session(&app).await
}

/// Free keeps whichever box is active, as with bridges; moving to another saved
/// box is Pro. Removing a box is never gated.
#[tauri::command(rename = "set-active-sync-box")]
pub async fn set_active_sync_box(
    app: AppHandle,
    client: State<'_, SyncBoxClient>,
    unique_id: String,
) -> Result<SyncBoxSession, String> {
    if !client.is_active(&app, &unique_id)? {
        crate::commands::entitlements::require(&app, Capability::MultipleSyncBoxes)?;
    }
    client.set_active(&app, &unique_id).await
}

#[tauri::command(rename = "remove-sync-box")]
pub async fn remove_sync_box(
    app: AppHandle,
    client: State<'_, SyncBoxClient>,
    unique_id: String,
) -> Result<SyncBoxSession, String> {
    client.remove(&app, &unique_id).await
}

#[tauri::command(rename = "get-sync-box-state")]
pub async fn get_sync_box_state(
    app: AppHandle,
    client: State<'_, SyncBoxClient>,
) -> Result<SyncBoxState, String> {
    client.get_saved_state(&app).await
}

#[tauri::command(rename = "set-sync-box-execution")]
pub async fn set_sync_box_execution(
    app: AppHandle,
    client: State<'_, SyncBoxClient>,
    update: Value,
) -> Result<SyncBoxState, String> {
    client.update_saved_execution(&app, update).await
}

#[tauri::command(rename = "set-sync-box-source-mode")]
pub async fn set_sync_box_source_mode(
    app: AppHandle,
    client: State<'_, SyncBoxClient>,
    source: String,
    mode: String,
) -> Result<SyncBoxState, String> {
    client.update_saved_source_mode(&app, &source, &mode).await
}
