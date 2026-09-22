//! Pre-stream light snapshots and paced restore.
//!
//! The bridge does not restore light state when an entertainment stream
//! ends — lights simply hold the last streamed color. The engine therefore
//! captures each member light's state before claiming the area and reapplies
//! it after release, throttled to stay inside the bridge's ~10 light
//! commands/second budget.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

use crate::services::hue_client::HueClient;

/// Spacing between restore writes (~10 commands/second).
const RESTORE_WRITE_INTERVAL: Duration = Duration::from_millis(100);

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LightSnapshot {
    pub id: String,
    pub on: bool,
    pub brightness: Option<f64>,
    /// "ct" when the light was on a valid color temperature, else "xy".
    pub color_mode: Option<String>,
    pub xy: Option<[f64; 2]>,
    pub mirek: Option<u16>,
}

/// Captures the current state of the given (deduplicated) member lights.
pub async fn capture(
    client: &HueClient,
    ip: &str,
    application_key: &str,
    light_ids: &[String],
) -> Result<Vec<LightSnapshot>, String> {
    let lights = client.get_lights(ip, application_key).await?;
    Ok(lights
        .into_iter()
        .filter(|light| light_ids.contains(&light.id))
        .map(|light| LightSnapshot {
            id: light.id,
            on: light.is_on,
            brightness: light.brightness,
            color_mode: light.color_mode,
            xy: light.xy,
            mirek: light.ct,
        })
        .collect())
}

/// Reapplies snapshots with paced writes. Per-light failures don't abort the
/// remaining lights; all failures are reported together.
pub async fn restore(
    client: &HueClient,
    ip: &str,
    application_key: &str,
    snapshots: &[LightSnapshot],
) -> Result<(), String> {
    let mut failure_count = 0usize;
    for (index, snapshot) in snapshots.iter().enumerate() {
        if index > 0 {
            tokio::time::sleep(RESTORE_WRITE_INTERVAL).await;
        }
        let body = restore_body(snapshot);
        if client
            .update_resource(ip, application_key, "light", &snapshot.id, body)
            .await
            .is_err()
        {
            failure_count += 1;
        }
    }
    if failure_count == 0 {
        Ok(())
    } else {
        Err(format!("Failed to restore {failure_count} light(s)."))
    }
}

/// Turns every snapshotted light off (the "turn off" stop behavior).
pub async fn turn_off(
    client: &HueClient,
    ip: &str,
    application_key: &str,
    snapshots: &[LightSnapshot],
) -> Result<(), String> {
    let mut failure_count = 0usize;
    for (index, snapshot) in snapshots.iter().enumerate() {
        if index > 0 {
            tokio::time::sleep(RESTORE_WRITE_INTERVAL).await;
        }
        if client
            .update_resource(
                ip,
                application_key,
                "light",
                &snapshot.id,
                json!({ "on": { "on": false } }),
            )
            .await
            .is_err()
        {
            failure_count += 1;
        }
    }
    if failure_count == 0 {
        Ok(())
    } else {
        Err(format!("Failed to turn off {failure_count} light(s)."))
    }
}

/// A light that was off is restored with a single `on: false` write; sending
/// color to an off bulb would flash it awake.
pub fn restore_body(snapshot: &LightSnapshot) -> Value {
    let mut body = Map::new();
    body.insert("on".to_string(), json!({ "on": snapshot.on }));
    if !snapshot.on {
        return Value::Object(body);
    }
    if let Some(brightness) = snapshot.brightness {
        body.insert("dimming".to_string(), json!({ "brightness": brightness }));
    }
    match (snapshot.color_mode.as_deref(), snapshot.mirek, snapshot.xy) {
        (Some("ct"), Some(mirek), _) => {
            body.insert("color_temperature".to_string(), json!({ "mirek": mirek }));
        }
        (_, _, Some([x, y])) => {
            body.insert("color".to_string(), json!({ "xy": { "x": x, "y": y } }));
        }
        (_, Some(mirek), None) => {
            body.insert("color_temperature".to_string(), json!({ "mirek": mirek }));
        }
        _ => {}
    }
    Value::Object(body)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snapshot(on: bool) -> LightSnapshot {
        LightSnapshot {
            id: "light-1".to_string(),
            on,
            brightness: Some(63.5),
            color_mode: Some("xy".to_string()),
            xy: Some([0.4573, 0.41]),
            mirek: Some(366),
        }
    }

    #[test]
    fn off_lights_restore_with_only_the_power_state() {
        assert_eq!(
            restore_body(&snapshot(false)),
            json!({ "on": { "on": false } })
        );
    }

    #[test]
    fn xy_mode_restores_chromaticity_not_mirek() {
        assert_eq!(
            restore_body(&snapshot(true)),
            json!({
                "on": { "on": true },
                "dimming": { "brightness": 63.5 },
                "color": { "xy": { "x": 0.4573, "y": 0.41 } }
            })
        );
    }

    #[test]
    fn ct_mode_restores_mirek() {
        let mut light = snapshot(true);
        light.color_mode = Some("ct".to_string());
        assert_eq!(
            restore_body(&light),
            json!({
                "on": { "on": true },
                "dimming": { "brightness": 63.5 },
                "color_temperature": { "mirek": 366 }
            })
        );
    }

    #[test]
    fn dimming_only_lights_restore_without_color_fields() {
        let mut light = snapshot(true);
        light.color_mode = None;
        light.xy = None;
        light.mirek = None;
        assert_eq!(
            restore_body(&light),
            json!({
                "on": { "on": true },
                "dimming": { "brightness": 63.5 }
            })
        );
    }
}
