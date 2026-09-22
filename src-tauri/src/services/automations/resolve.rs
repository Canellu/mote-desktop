//! Turns what an automation asks for — lights, rooms, zones, or a scene — into
//! the reachable lights it would change, each with its look.

use std::collections::HashMap;

use serde_json::Value;
use tauri::{AppHandle, Runtime};

use crate::services::hue_client::{HueClient, HueLight};

use super::looks::{snapshot_of, Caps, Intent, Write};
use super::ownership::{ClaimedLight, LightKey};
use super::priority::Holder;
use super::settings::{AutomationTarget, TargetKind};

/// How the looks spread over the lights, in the order they were chosen.
#[derive(Debug, Clone, PartialEq)]
pub enum Looks {
    Uniform(Write),
    /// Stops across the lights, first to last, like a gradient.
    Spread(Vec<Write>),
    /// The first `fraction` of the lights show `done`, the rest `todo`.
    Progress {
        done: Write,
        todo: Write,
        fraction: f64,
    },
}

impl Looks {
    pub fn at(&self, index: usize, count: usize) -> Write {
        match self {
            Self::Uniform(write) => *write,
            Self::Spread(stops) => match stops.len() {
                0 => Write::Off,
                1 => stops[0],
                len => stops[(index * len / count.max(1)).min(len - 1)],
            },
            Self::Progress {
                done,
                todo,
                fraction,
            } => {
                if ((index + 1) as f64) <= fraction * count as f64 + 1e-9 {
                    *done
                } else {
                    *todo
                }
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum ClaimSpec {
    Lights {
        bridge_id: Option<String>,
        targets: Vec<AutomationTarget>,
        looks: Looks,
    },
    Scene {
        bridge_id: Option<String>,
        scene_id: Option<String>,
        /// Brightness percent applied to the scene's own levels.
        scale: Option<f64>,
    },
}

impl ClaimSpec {
    fn bridge_id(&self) -> Option<&str> {
        match self {
            Self::Lights { bridge_id, .. } | Self::Scene { bridge_id, .. } => bridge_id.as_deref(),
        }
    }
}

/// One automation's wish for this pass.
#[derive(Debug, Clone, PartialEq)]
pub struct Desire {
    pub holder: Holder,
    pub spec: ClaimSpec,
    pub restore: bool,
    pub transition_ms: u32,
}

/// The lights `spec` changes on the active bridge, reachable ones only.
pub async fn resolve<R: Runtime>(
    app: &AppHandle<R>,
    spec: &ClaimSpec,
) -> Result<Vec<ClaimedLight>, String> {
    let Some(bridge_id) = spec.bridge_id() else {
        return Err("Choose lights for this automation.".to_string());
    };
    let client = HueClient::new()?;
    let bridge = client.get_stored_bridge(app)?;
    if !bridge.bridge_id.eq_ignore_ascii_case(bridge_id) {
        return Err("Switch to the bridge this automation was set up on.".to_string());
    }
    let key = client.get_stored_application_key(app)?;
    let ip = bridge.bridge_ip;

    let mut members: Vec<String> = Vec::new();
    let mut actions: HashMap<String, Value> = HashMap::new();
    let mut scale = None;
    match spec {
        ClaimSpec::Scene {
            scene_id, scale: s, ..
        } => {
            let Some(scene_id) = scene_id else {
                return Err("Choose a scene before turning on this automation.".into());
            };
            scale = *s;
            let resource = client
                .get_resource(&ip, &key, "scene", Some(scene_id))
                .await?
                .into_iter()
                .next()
                .ok_or("This scene no longer exists on the bridge.")?;
            for entry in resource["actions"].as_array().into_iter().flatten() {
                if entry["target"]["rtype"] == "light" {
                    if let Some(id) = entry["target"]["rid"].as_str() {
                        members.push(id.to_string());
                        actions.insert(id.to_string(), entry["action"].clone());
                    }
                }
            }
        }
        ClaimSpec::Lights { targets, .. } => {
            if targets.is_empty() {
                return Err("Choose lights for this automation.".to_string());
            }
            for target in targets {
                members.extend(member_light_ids(&client, &ip, &key, target).await?);
            }
        }
    }
    let mut seen = std::collections::HashSet::new();
    members.retain(|id| seen.insert(id.clone()));

    let all = client.get_lights(&ip, &key).await?;
    let lights: Vec<&HueLight> = members
        .iter()
        .filter_map(|id| all.iter().find(|light| &light.id == id && light.reachable))
        .collect();
    if lights.is_empty() {
        return Err("None of the selected lights can be reached.".into());
    }
    let count = lights.len();
    Ok(lights
        .into_iter()
        .enumerate()
        .map(|(index, light)| ClaimedLight {
            key: LightKey {
                bridge_id: bridge.bridge_id.clone(),
                light_id: light.id.clone(),
            },
            caps: Caps::of(light),
            current: snapshot_of(light),
            intent: match (spec, actions.get(&light.id)) {
                (ClaimSpec::Lights { looks, .. }, _) => Intent::Look(looks.at(index, count)),
                (ClaimSpec::Scene { .. }, action) => Intent::Scene {
                    action: action.cloned().unwrap_or(Value::Null),
                    scale,
                },
            },
        })
        .collect())
}

async fn member_light_ids(
    client: &HueClient,
    ip: &str,
    application_key: &str,
    target: &AutomationTarget,
) -> Result<Vec<String>, String> {
    let missing = || format!("{} no longer exists on this bridge.", target.name);
    match target.kind {
        TargetKind::Light => Ok(vec![target.id.clone()]),
        TargetKind::Room => client
            .get_rooms(ip, application_key)
            .await?
            .into_iter()
            .find(|room| room.grouped_light_id.as_deref() == Some(&target.id))
            .map(|room| room.light_ids)
            .ok_or_else(missing),
        TargetKind::Zone => client
            .get_zones(ip, application_key)
            .await?
            .into_iter()
            .find(|zone| zone.grouped_light_id.as_deref() == Some(&target.id))
            .map(|zone| zone.light_ids)
            .ok_or_else(missing),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const A: Write = Write::Off;
    const B: Write = Write::Dim(10.0);
    const C: Write = Write::Brightness(50.0);

    #[test]
    fn a_spread_walks_the_stops_across_the_lights() {
        let looks = Looks::Spread(vec![A, B, C]);
        let picked: Vec<Write> = (0..6).map(|index| looks.at(index, 6)).collect();
        assert_eq!(picked, vec![A, A, B, B, C, C]);
        assert_eq!(looks.at(0, 1), A);
    }

    #[test]
    fn progress_fills_lights_in_order() {
        let looks = |fraction| Looks::Progress {
            done: A,
            todo: B,
            fraction,
        };
        let picked = |fraction: f64| -> Vec<Write> {
            (0..4).map(|index| looks(fraction).at(index, 4)).collect()
        };
        assert_eq!(picked(0.0), vec![B, B, B, B]);
        assert_eq!(picked(0.5), vec![A, A, B, B]);
        assert_eq!(picked(1.0), vec![A, A, A, A]);
    }
}
