use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::commands::events::EventStreamState;
use crate::services::hue_client::{HueClient, HueSession};

/// One entry in the bridge switcher. `name` is the cached user-given bridge
/// name (filled in the first time that bridge's home name is read); the UI
/// falls back to a derived label until then.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeListItem {
    pub bridge_id: String,
    pub bridge_ip: String,
    pub name: Option<String>,
    pub active: bool,
}

/// Every paired bridge plus which one is active, for the switcher UI.
#[tauri::command(rename = "list-hue-bridges")]
pub fn list_hue_bridges(app: AppHandle) -> Result<Vec<BridgeListItem>, String> {
    let store = HueClient::new()?.list_bridges(&app)?;
    let active = store.active_bridge_id.clone();
    Ok(store
        .bridges
        .into_iter()
        .map(|bridge| BridgeListItem {
            active: active
                .as_deref()
                .map(|id| id.eq_ignore_ascii_case(&bridge.bridge_id))
                .unwrap_or(false),
            bridge_id: bridge.bridge_id,
            bridge_ip: bridge.bridge_ip,
            name: bridge.name,
        })
        .collect())
}

/// Switches the active bridge. Stops the current event stream so the caller can
/// reload resources and restart streaming for the newly active bridge.
#[tauri::command(rename = "set-active-hue-bridge")]
pub async fn set_active_hue_bridge(
    app: AppHandle,
    bridge_id: String,
) -> Result<HueSession, String> {
    let client = HueClient::new()?;

    // Free keeps whichever bridge is active; moving to another saved one is the
    // multiple-bridges capability. Removing a bridge is never gated, so somebody
    // back on Free can always tidy away bridges saved under Pro.
    let already_active = client
        .list_bridges(&app)?
        .active_bridge_id
        .is_some_and(|active| active.eq_ignore_ascii_case(&bridge_id));
    if !already_active {
        crate::commands::entitlements::require(
            &app,
            crate::services::entitlements::Capability::MultipleBridges,
        )?;
    }

    if let Some(state) = app.try_state::<EventStreamState>() {
        state.stop();
    }
    client.set_active_bridge(&app, &bridge_id).await
}

/// Removes one bridge and its secrets. Returns the resulting session: the next
/// paired bridge becomes active, or a disconnected session when none remain.
#[tauri::command(rename = "remove-hue-bridge")]
pub async fn remove_hue_bridge(app: AppHandle, bridge_id: String) -> Result<HueSession, String> {
    if let Some(state) = app.try_state::<EventStreamState>() {
        state.stop();
    }
    HueClient::new()?.remove_bridge(&app, &bridge_id).await
}

/// Renames the active bridge on the bridge itself (syncs to the official Hue
/// app). Returns the new name and refreshes the cached label.
#[tauri::command(rename = "rename-hue-bridge")]
pub async fn rename_hue_bridge(app: AppHandle, name: String) -> Result<String, String> {
    let client = HueClient::new()?;
    let bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    let renamed = client
        .rename_bridge(&bridge.bridge_ip, &application_key, &name)
        .await?;
    client.cache_active_bridge_name(&app, Some(&renamed));
    Ok(renamed)
}
