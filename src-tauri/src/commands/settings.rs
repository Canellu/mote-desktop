use tauri::AppHandle;

use serde_json::Value;

use crate::services::hue_client::{
    HueAccessoryService, HueClient, HueSettingsSummary, HueSwitchInputConfiguration,
};

#[tauri::command(rename = "get-hue-settings-summary")]
pub async fn get_hue_settings_summary(app: AppHandle) -> Result<HueSettingsSummary, String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .get_settings_summary(&stored_bridge, &application_key)
        .await
}

#[tauri::command(rename = "get-hue-home-name")]
pub async fn get_hue_home_name(app: AppHandle) -> Result<Option<String>, String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    let name = client
        .get_home_name(&stored_bridge.bridge_ip, &application_key)
        .await?;
    // Cache it so the bridge switcher can label this bridge without a fetch.
    client.cache_active_bridge_name(&app, name.as_deref());
    Ok(name)
}

#[tauri::command(rename = "rename-hue-resource")]
pub async fn rename_hue_resource(
    app: AppHandle,
    resource_type: String,
    id: String,
    name: String,
    archetype: Option<String>,
) -> Result<(), String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .rename_resource(
            &stored_bridge.bridge_ip,
            &application_key,
            &resource_type,
            &id,
            &name,
            archetype.as_deref(),
        )
        .await
}

#[tauri::command(rename = "get-hue-resource")]
pub async fn get_hue_resource(
    app: AppHandle,
    resource_type: String,
    id: Option<String>,
) -> Result<Vec<Value>, String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .get_resource(
            &stored_bridge.bridge_ip,
            &application_key,
            &resource_type,
            id.as_deref(),
        )
        .await
}

#[tauri::command(rename = "create-hue-resource")]
pub async fn create_hue_resource(
    app: AppHandle,
    resource_type: String,
    body: Value,
) -> Result<String, String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    let result = client
        .create_resource(
            &stored_bridge.bridge_ip,
            &application_key,
            &resource_type,
            body,
        )
        .await;
    if resource_type == "scene" {
        let outcome = if result.is_ok() { "created" } else { "failed" };
        crate::services::diagnostics::record("scene_create", outcome).save();
    }
    result
}

#[tauri::command(rename = "update-hue-resource")]
pub async fn update_hue_resource(
    app: AppHandle,
    resource_type: String,
    id: String,
    body: Value,
) -> Result<(), String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .update_resource(
            &stored_bridge.bridge_ip,
            &application_key,
            &resource_type,
            &id,
            body,
        )
        .await
}

#[tauri::command(rename = "delete-hue-resource")]
pub async fn delete_hue_resource(
    app: AppHandle,
    resource_type: String,
    id: String,
) -> Result<(), String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .delete_resource(
            &stored_bridge.bridge_ip,
            &application_key,
            &resource_type,
            &id,
        )
        .await
}

#[tauri::command(rename = "get-hue-accessory-services")]
pub async fn get_hue_accessory_services(
    app: AppHandle,
) -> Result<Vec<HueAccessoryService>, String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .get_accessory_services(&stored_bridge.bridge_ip, &application_key)
        .await
}

#[tauri::command(rename = "get-switch-input-configuration")]
pub async fn get_switch_input_configuration(
    app: AppHandle,
) -> Result<Vec<HueSwitchInputConfiguration>, String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .get_switch_input_configurations(&stored_bridge.bridge_ip, &application_key)
        .await
}

#[tauri::command(rename = "set-switch-input-configuration")]
pub async fn set_switch_input_configuration(
    app: AppHandle,
    id: String,
    body: Value,
) -> Result<(), String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .set_switch_input_configuration(&stored_bridge.bridge_ip, &application_key, &id, body)
        .await
}

#[tauri::command(rename = "start-hue-device-discovery")]
pub async fn start_hue_device_discovery(app: AppHandle) -> Result<(), String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .start_device_discovery(&stored_bridge.bridge_ip, &application_key)
        .await
}

#[tauri::command(rename = "start-hue-qr-device-discovery")]
pub async fn start_hue_qr_device_discovery(app: AppHandle, qr_text: String) -> Result<(), String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .start_qr_device_discovery(&stored_bridge.bridge_ip, &application_key, &qr_text)
        .await
}

#[tauri::command(rename = "start-hue-serial-light-discovery")]
pub async fn start_hue_serial_light_discovery(
    app: AppHandle,
    serial: String,
) -> Result<(), String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .start_serial_light_discovery(&stored_bridge.bridge_ip, &application_key, &serial)
        .await
}

#[tauri::command(rename = "assign-device-to-room")]
pub async fn assign_device_to_room(
    app: AppHandle,
    device_id: String,
    room_id: String,
) -> Result<(), String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .assign_device_to_room(
            &stored_bridge.bridge_ip,
            &application_key,
            &device_id,
            &room_id,
        )
        .await
}

#[tauri::command(rename = "assign-device-to-zone")]
pub async fn assign_device_to_zone(
    app: AppHandle,
    device_id: String,
    zone_id: String,
) -> Result<(), String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .assign_device_to_zone(
            &stored_bridge.bridge_ip,
            &application_key,
            &device_id,
            &zone_id,
        )
        .await
}

#[tauri::command(rename = "create-hue-room")]
pub async fn create_hue_room(
    app: AppHandle,
    name: String,
    archetype: Option<String>,
    device_ids: Vec<String>,
) -> Result<String, String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .create_room(
            &stored_bridge.bridge_ip,
            &application_key,
            &name,
            archetype.as_deref(),
            &device_ids,
        )
        .await
}
