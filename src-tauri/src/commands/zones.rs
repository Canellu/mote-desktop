use tauri::AppHandle;

use crate::services::hue_client::{HueClient, HueZone};

#[tauri::command(rename = "get-hue-zones")]
pub async fn get_hue_zones(app: AppHandle) -> Result<Vec<HueZone>, String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .get_zones(&stored_bridge.bridge_ip, &application_key)
        .await
}

#[tauri::command(rename = "create-hue-zone")]
pub async fn create_hue_zone(
    app: AppHandle,
    name: String,
    archetype: Option<String>,
    light_ids: Vec<String>,
) -> Result<String, String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .create_zone(
            &stored_bridge.bridge_ip,
            &application_key,
            &name,
            archetype.as_deref(),
            light_ids,
        )
        .await
}

#[tauri::command(rename = "update-zone-members")]
pub async fn update_zone_members(
    app: AppHandle,
    zone_id: String,
    light_ids: Vec<String>,
) -> Result<(), String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .update_zone_members(
            &stored_bridge.bridge_ip,
            &application_key,
            &zone_id,
            light_ids,
        )
        .await
}
