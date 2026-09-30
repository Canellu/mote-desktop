use tauri::{AppHandle, Manager};

use crate::commands::events::EventStreamState;
use crate::services::entertainment;
use crate::services::entitlements::Capability;
use crate::services::hue_client::{DiscoveredBridge, HueClient, HueSession};

#[tauri::command(rename = "discover-bridges")]
pub async fn discover_bridges() -> Result<Vec<DiscoveredBridge>, String> {
    HueClient::new()?.discover_bridges().await
}

/// Opens Windows' "Allow apps to communicate through Windows Defender
/// Firewall" page, where a blocked Mote Desktop can be allowed again.
#[tauri::command(rename = "open-firewall-settings")]
pub fn open_firewall_settings() -> Result<(), String> {
    #[cfg(windows)]
    {
        std::process::Command::new("control.exe")
            .args([
                "/name",
                "Microsoft.WindowsFirewall",
                "/page",
                "pageConfigureApps",
            ])
            .spawn()
            .map(|_| ())
            .map_err(|_| "Windows Firewall settings could not be opened.".to_string())
    }
    #[cfg(not(windows))]
    {
        Err("Firewall settings are only available on Windows.".to_string())
    }
}

#[tauri::command(rename = "lookup-bridge")]
pub async fn lookup_bridge(ip: String) -> Result<DiscoveredBridge, String> {
    HueClient::new()?.lookup_bridge(&ip).await
}

/// Pairing the first bridge is free; keeping a second saved alongside it is the
/// paid capability.
///
/// The check is on what is already stored rather than on the pairing itself, so
/// a Free customer can always pair, re-pair, and recover their one bridge. Only
/// growing the collection needs Pro.
#[tauri::command(rename = "pair-bridge")]
pub async fn pair_bridge(app: AppHandle, ip: String) -> Result<HueSession, String> {
    let client = HueClient::new()?;
    let saved_bridges = crate::commands::bridges::list_hue_bridges(app.clone()).unwrap_or_default();
    if !saved_bridges.is_empty() {
        // Re-pairing a bridge that is already saved (its key was revoked) adds
        // nothing, so it stays free. The public config names the bridge without
        // a key; if it can't be read, treat the pairing as a new bridge.
        let repairing = match client.public_bridge_id(&ip).await {
            Some(bridge_id) => saved_bridges
                .iter()
                .any(|saved| saved.bridge_id.eq_ignore_ascii_case(&bridge_id)),
            None => false,
        };
        if !repairing {
            crate::commands::entitlements::require(&app, Capability::MultipleBridges)?;
        }
    }

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
    let session = client
        .save_session(&app, &paired.bridge, &paired.application_key)
        .await?;

    // The trial runs from the first bridge this installation pairs.
    crate::commands::entitlements::start_trial_if_paired(&app);

    Ok(session)
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
