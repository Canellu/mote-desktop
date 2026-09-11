use tauri::{AppHandle, Manager};

use crate::commands::events::EventStreamState;
use crate::services::entitlements::Capability;
use crate::services::entertainment;
use crate::services::hue_client::{DiscoveredBridge, HueClient, HueSession};

#[tauri::command(rename = "discover-bridges")]
pub async fn discover_bridges() -> Result<Vec<DiscoveredBridge>, String> {
    HueClient::new()?.discover_bridges().await
}

/// Pairing the first bridge is free; keeping a second saved alongside it is the
/// paid capability.
///
/// The check is on what is already stored rather than on the pairing itself, so
/// a Free customer can always pair, re-pair, and recover their one bridge. Only
/// growing the collection needs Pro.
#[tauri::command(rename = "pair-bridge")]
pub async fn pair_bridge(app: AppHandle, ip: String) -> Result<HueSession, String> {
    if !crate::commands::bridges::list_hue_bridges(app.clone())
        .unwrap_or_default()
        .is_empty()
    {
        crate::commands::entitlements::require(&app, Capability::MultipleBridges)?;
    }

    let client = HueClient::new()?;
    let paired = client.pair_bridge(&ip).await?;
    // New pairings carry the entertainment clientkey alongside the normal app
    // credential; keep it (per bridge) for PC sync so no second link-button flow
    // is needed.
    if let Some(client_key) = &paired.client_key {
        if let Err(_error) =
            entertainment::credentials::save_client_key(&paired.bridge.bridge_id, client_key)
        {
            #[cfg(debug_assertions)]
            eprintln!("failed to save entertainment client key: {_error}");
        }
    }
    client
        .save_session(&app, &paired.bridge, &paired.application_key)
        .await
}

#[tauri::command(rename = "get-hue-session")]
pub async fn get_hue_session(app: AppHandle) -> Result<HueSession, String> {
    HueClient::new()?.restore_session(&app).await
}

#[tauri::command(rename = "reset-hue-session")]
pub fn reset_hue_session(app: AppHandle) -> Result<(), String> {
    if let Some(state) = app.try_state::<EventStreamState>() {
        state.stop();
    }
    HueClient::new()?.clear_session(&app)
}
