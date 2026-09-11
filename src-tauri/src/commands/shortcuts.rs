use crate::services::entitlements::Capability;
use crate::services::hue_client::{HueClient, HueLight};
use serde::Serialize;
use std::{
    collections::HashMap,
    sync::LazyLock,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LightState {
    id: String,
    on: bool,
    brightness: Option<f64>,
}

struct ToggleState {
    saved: Vec<LightState>,
    on: bool,
    written_at: Instant,
}

// Serialize shortcuts across webviews and retain pre-off levels, not fade readbacks.
static TOGGLES: LazyLock<Mutex<HashMap<(String, String), ToggleState>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn snapshot(lights: &[HueLight]) -> Vec<LightState> {
    lights
        .iter()
        .map(|light| LightState {
            id: light.id.clone(),
            on: light.is_on,
            brightness: light.brightness,
        })
        .collect()
}

fn restored_level(saved: Option<f64>, current: Option<f64>) -> Option<f64> {
    saved
        .or(current)
        .filter(|n| n.is_finite())
        .map(|n| n.clamp(0.1, 100.0))
}

fn desired_states(
    current: &[LightState],
    saved: &[LightState],
    on: bool,
    restore: bool,
    level: Option<f64>,
) -> Vec<LightState> {
    current
        .iter()
        .map(|light| {
            let old = saved.iter().find(|state| state.id == light.id);
            LightState {
                id: light.id.clone(),
                on: on
                    && (!restore
                        || !saved.iter().any(|state| state.on)
                        || old.is_none_or(|state| state.on)),
                brightness: if on {
                    level.or_else(|| {
                        restored_level(
                            if restore {
                                old.and_then(|s| s.brightness)
                            } else {
                                None
                            },
                            light.brightness,
                        )
                    })
                } else {
                    light.brightness
                },
            }
        })
        .collect()
}

/// Global shortcuts are a Pro capability, and this is where that is decided.
///
/// The gate sits on execution rather than on registering the hotkey, because
/// registration happens in the webview and a modified frontend could skip it.
/// Nothing touches a light until this check passes.
#[tauri::command(rename = "execute-shortcut")]
pub async fn execute_shortcut(
    app: AppHandle,
    bridge_id: String,
    target_kind: String,
    target_id: String,
    action: String,
    brightness: Option<f64>,
) -> Result<(), String> {
    crate::commands::entitlements::require(&app, Capability::GlobalShortcuts)?;

    let mut toggles = TOGGLES.lock().await;
    let client = HueClient::new()?;
    let bridge = client.get_stored_bridge(&app)?;
    if bridge.bridge_id != bridge_id {
        return Err("Switch to this shortcut's bridge before using it.".into());
    }
    let key = client.get_stored_application_key(&app)?;
    let ip = &bridge.bridge_ip;
    if target_kind == "scene" && action == "activate" {
        toggles.retain(|(id, _), _| id != &bridge_id);
        return client.activate_scene(ip, &key, &target_id, Some(400)).await;
    }
    let level = match action.as_str() {
        "brightness" => Some(
            brightness
                .filter(|n| n.is_finite() && *n >= 1.0 && *n <= 100.0)
                .ok_or("Brightness must be between 1 and 100%.")?,
        ),
        "on" | "off" | "toggle" => None,
        _ => return Err("Unsupported shortcut action.".into()),
    };
    let member_ids = match target_kind.as_str() {
        "light" => vec![target_id.clone()],
        "room" => client
            .get_rooms(ip, &key)
            .await?
            .into_iter()
            .find(|room| room.grouped_light_id.as_deref() == Some(&target_id))
            .map(|room| room.light_ids)
            .ok_or("Shortcut target no longer exists.")?,
        "zone" => client
            .get_zones(ip, &key)
            .await?
            .into_iter()
            .find(|zone| zone.grouped_light_id.as_deref() == Some(&target_id))
            .map(|zone| zone.light_ids)
            .ok_or("Shortcut target no longer exists.")?,
        _ => return Err("Unsupported shortcut target.".into()),
    };
    let lights: Vec<_> = client
        .get_lights(ip, &key)
        .await?
        .into_iter()
        .filter(|light| light.reachable && member_ids.contains(&light.id))
        .collect();
    if lights.is_empty() {
        return Err("No reachable lights in this shortcut's target.".into());
    }
    let cache_key = (bridge_id, target_id.clone());
    let previous = toggles.get(&cache_key);
    // Bridge reports can lag behind a successful PUT during rapid toggling.
    let was_on = previous
        .filter(|state| state.written_at.elapsed() < Duration::from_secs(3))
        .map(|state| state.on)
        .unwrap_or_else(|| lights.iter().any(|light| light.is_on));
    let on = match action.as_str() {
        "toggle" => !was_on,
        "off" => false,
        _ => true,
    };
    let saved = if !on
        && was_on
        && !previous.is_some_and(|state| state.written_at.elapsed() < Duration::from_secs(3))
    {
        snapshot(&lights)
    } else {
        previous
            .map(|state| state.saved.clone())
            .unwrap_or_else(|| snapshot(&lights))
    };
    let restore = on && action != "brightness" && previous.is_some_and(|state| !state.on);
    let desired = desired_states(&snapshot(&lights), &saved, on, restore, level);
    let result = async {
        if target_kind != "light" {
            client
                .set_grouped_light_state(ip, &key, &target_id, Some(on), level, Some(0))
                .await?;
        }
        if on || target_kind == "light" {
            for state in &desired {
                client
                    .set_light_state(
                        ip,
                        &key,
                        &state.id,
                        Some(state.on),
                        if state.on { state.brightness } else { None },
                        Some(0),
                    )
                    .await?;
                if desired.len() > 1 {
                    tokio::time::sleep(Duration::from_millis(100)).await;
                }
            }
        }
        Ok::<(), String>(())
    }
    .await;
    if let Err(error) = result {
        toggles.remove(&cache_key);
        let _ = app.emit("shortcut-state-changed", Vec::<LightState>::new());
        return Err(error);
    }
    toggles.insert(
        cache_key,
        ToggleState {
            saved: if on { desired.clone() } else { saved },
            on,
            written_at: Instant::now(),
        },
    );
    let _ = app.emit("shortcut-state-changed", desired);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{desired_states, restored_level, LightState};
    #[test]
    fn restores_individual_levels_and_mixed_power_without_touching_color() {
        let saved = vec![
            LightState {
                id: "a".into(),
                on: true,
                brightness: Some(75.0),
            },
            LightState {
                id: "b".into(),
                on: true,
                brightness: Some(20.0),
            },
            LightState {
                id: "c".into(),
                on: false,
                brightness: None,
            },
        ];
        let off = desired_states(&saved, &saved, false, false, None);
        assert!(off.iter().all(|light| !light.on));
        assert_eq!(off[0].brightness, Some(75.0));
        let faded: Vec<_> = off
            .into_iter()
            .map(|light| LightState {
                brightness: light.brightness.map(|_| 0.1),
                ..light
            })
            .collect();
        let restored = desired_states(&faded, &saved, true, true, None);
        assert!(restored[0].on && restored[1].on && !restored[2].on);
        assert_eq!(restored[0].brightness, Some(75.0));
        assert_eq!(restored[1].brightness, Some(20.0));
        assert_eq!(restored[2].brightness, None);
        let already_off = desired_states(&faded, &faded, true, true, None);
        assert!(already_off.iter().all(|light| light.on));
        let explicit = desired_states(&faded, &saved, true, false, Some(50.0));
        assert!(explicit
            .iter()
            .all(|light| light.on && light.brightness == Some(50.0)));
    }

    #[test]
    fn restores_saved_level_instead_of_off_readback() {
        assert_eq!(restored_level(Some(75.0), Some(0.1)), Some(75.0));
        assert_eq!(restored_level(Some(1.0), Some(100.0)), Some(1.0));
        assert_eq!(restored_level(None, Some(42.0)), Some(42.0));
        assert_eq!(restored_level(None, None), None);
    }
}
