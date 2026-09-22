use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::services::automations::presence::{
    self, ActionKind, PresenceService, PresenceSettings, PresenceStatus,
};
use crate::services::automations::presence_probe::{normalize_mac, parse_private_ipv4, Evidence};
use crate::services::automations::presence_scan::FoundDevice;

#[tauri::command(rename = "get-presence-settings")]
pub fn get_presence_settings(app: AppHandle) -> PresenceSettings {
    app.try_state::<PresenceService>()
        .map(|service| service.settings())
        .unwrap_or_else(|| presence::load_settings(&app))
}

/// Saving is free; running the actions is what `local_automation` gates.
#[tauri::command(rename = "set-presence-settings")]
pub fn set_presence_settings(
    app: AppHandle,
    settings: PresenceSettings,
) -> Result<PresenceSettings, String> {
    let settings = settings.normalized()?;
    presence::save_settings(&app, &settings)?;
    if let Some(service) = app.try_state::<PresenceService>() {
        service.set_settings(settings.clone());
    }
    Ok(settings)
}

#[tauri::command(rename = "get-presence-status")]
pub fn get_presence_status(app: AppHandle) -> PresenceStatus {
    app.try_state::<PresenceService>()
        .map(|service| service.status())
        .unwrap_or_default()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    pub seen: bool,
    /// "neighbor" or "ping".
    pub evidence: Option<&'static str>,
    pub mac: Option<String>,
    /// Whether the address that answered is the one entered, when one was.
    pub mac_matches: Option<bool>,
}

/// Tries a phone before it is saved. Only the address given is asked.
#[tauri::command(rename = "probe-presence-device")]
pub async fn probe_presence_device(ip: String, mac: Option<String>) -> Result<ProbeResult, String> {
    let address = parse_private_ipv4(&ip)
        .ok_or("Enter the phone's home network address, like 192.168.1.42.")?;
    let expected = match mac.as_deref().map(str::trim) {
        None | Some("") => None,
        Some(mac) => {
            Some(normalize_mac(mac).ok_or("Enter the Wi-Fi address like aa:bb:cc:dd:ee:ff.")?)
        }
    };
    let result = presence::probe(address).await;
    Ok(ProbeResult {
        seen: result.seen.is_some(),
        evidence: result.seen.map(|evidence| match evidence {
            Evidence::Neighbor => "neighbor",
            Evidence::Ping => "ping",
        }),
        mac_matches: expected
            .as_ref()
            .zip(result.mac.as_ref())
            .map(|(expected, found)| expected == found),
        mac: result.mac,
    })
}

/// Every device answering on the home network now, likely phones first, for
/// picking which phones stand for the household. Takes about ten seconds.
#[tauri::command(rename = "scan-presence-devices")]
pub async fn scan_presence_devices(app: AppHandle) -> Vec<FoundDevice> {
    presence::scan(&app).await
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PresenceActionKind {
    Arrival,
    Departure,
}

/// Runs the arrival scene or the departure action now, from the settings
/// being edited. Returns how many lights could not be changed.
#[tauri::command(rename = "test-presence-action")]
pub async fn test_presence_action(
    app: AppHandle,
    kind: PresenceActionKind,
    settings: PresenceSettings,
) -> Result<usize, String> {
    let settings = PresenceSettings {
        enabled: false,
        ..settings
    }
    .normalized()?;
    presence::run_action(
        &app,
        &settings,
        &match kind {
            PresenceActionKind::Arrival => ActionKind::Arrival,
            PresenceActionKind::Departure => ActionKind::Departure,
        },
    )
    .await
}
