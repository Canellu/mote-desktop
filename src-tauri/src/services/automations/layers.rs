//! Who owns a light when automations overlap.
//!
//! Each running automation is a layer holding what its lights looked like
//! before it changed them. When one ends it puts back only what nobody has
//! touched since. When a lower one ends while a higher one still holds the same
//! light, the original state is handed up instead, so the light finally returns
//! to how it was before either began rather than to the lower one's change.

use crate::services::entertainment::snapshot::LightSnapshot;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum LayerKind {
    OnAir,
    Away,
    Preview,
}

/// What an automation wrote to a light, so a restore can tell whether anyone
/// has changed it since.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Applied {
    pub on: bool,
    pub brightness: Option<f64>,
    pub xy: Option<[f64; 2]>,
    pub mirek: Option<u16>,
}

/// How to reach the bridge a layer changed, kept so its restore still lands
/// there after the app switches to another bridge. No `Debug`: it holds the key.
#[derive(Clone, PartialEq, Eq)]
pub struct BridgeAccess {
    pub bridge_id: String,
    pub ip: String,
    pub application_key: String,
}

#[derive(Debug, Clone)]
pub struct OwnedLight {
    pub before: LightSnapshot,
    pub applied: Applied,
}

pub struct Layer {
    pub kind: LayerKind,
    pub bridge: BridgeAccess,
    /// The settings it started with, so changing them restarts it.
    pub config: serde_json::Value,
    pub lights: Vec<OwnedLight>,
}

/// The lights an ended layer must put back.
pub struct Restore {
    pub bridge: BridgeAccess,
    pub lights: Vec<OwnedLight>,
}

#[derive(Default)]
pub struct LayerStack {
    layers: Vec<Layer>,
}

impl LayerStack {
    pub fn get_mut(&mut self, kind: LayerKind) -> Option<&mut Layer> {
        self.layers.iter_mut().find(|layer| layer.kind == kind)
    }
    pub fn get(&self, kind: LayerKind) -> Option<&Layer> {
        self.layers.iter().find(|layer| layer.kind == kind)
    }

    pub fn push(&mut self, layer: Layer) {
        debug_assert!(self.get(layer.kind).is_none());
        self.layers.push(layer);
    }

    /// Ends a layer. Lights a layer above still holds take this layer's
    /// original state with them; the rest are returned to be put back.
    pub fn remove(&mut self, kind: LayerKind) -> Option<Restore> {
        let index = self.layers.iter().position(|layer| layer.kind == kind)?;
        let layer = self.layers.remove(index);
        let mut restore = Vec::new();
        for owned in layer.lights {
            let above = self.layers[index..]
                .iter_mut()
                .filter(|upper| upper.bridge.bridge_id == layer.bridge.bridge_id)
                .find_map(|upper| {
                    upper
                        .lights
                        .iter_mut()
                        .find(|light| light.before.id == owned.before.id)
                });
            match above {
                Some(upper) => upper.before = owned.before,
                None => restore.push(owned),
            }
        }
        Some(Restore {
            bridge: layer.bridge,
            lights: restore,
        })
    }
}

/// Whether a light still shows what an automation set. Someone who changed it
/// in the meantime keeps their change.
pub fn unchanged(on: bool, brightness: Option<f64>, applied: Applied) -> bool {
    if on != applied.on {
        return false;
    }
    if !on {
        return true;
    }
    match (applied.brightness, brightness) {
        (Some(set), Some(now)) => (set - now).abs() <= 3.0,
        _ => true,
    }
}

/// Color is captured after the write so gamut clamping does not look like an edit.
pub fn unchanged_color(
    xy: Option<[f64; 2]>,
    mirek: Option<u16>,
    mode: Option<&str>,
    applied: Applied,
) -> bool {
    if let Some(set) = applied.mirek {
        return mode == Some("ct") && mirek.is_some_and(|now| set.abs_diff(now) <= 2);
    }
    if let Some(set) = applied.xy {
        return mode != Some("ct")
            && xy.is_some_and(|now| {
                (now[0] - set[0]).abs() < 0.005 && (now[1] - set[1]).abs() < 0.005
            });
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snapshot(id: &str, on: bool, brightness: f64) -> LightSnapshot {
        LightSnapshot {
            id: id.into(),
            on,
            brightness: Some(brightness),
            color_mode: None,
            xy: None,
            mirek: None,
        }
    }

    fn access(bridge_id: &str) -> BridgeAccess {
        BridgeAccess {
            bridge_id: bridge_id.into(),
            ip: "192.0.2.1".into(),
            application_key: "key".into(),
        }
    }

    fn layer(kind: LayerKind, bridge_id: &str, lights: Vec<OwnedLight>) -> Layer {
        Layer {
            kind,
            bridge: access(bridge_id),
            config: serde_json::Value::Null,
            lights,
        }
    }

    const OFF: Applied = Applied {
        on: false,
        brightness: None,
        xy: None,
        mirek: None,
    };
    const RED: Applied = Applied {
        on: true,
        brightness: Some(100.0),
        xy: None,
        mirek: None,
    };

    #[test]
    fn ending_the_top_layer_puts_its_lights_back() {
        let mut stack = LayerStack::default();
        stack.push(layer(
            LayerKind::OnAir,
            "bridge",
            vec![OwnedLight {
                before: snapshot("desk", true, 40.0),
                applied: RED,
            }],
        ));

        let restore = stack.remove(LayerKind::OnAir).unwrap();

        assert_eq!(restore.lights.len(), 1);
        assert_eq!(restore.lights[0].before.brightness, Some(40.0));
        assert!(stack.get(LayerKind::OnAir).is_none());
    }

    #[test]
    fn ending_a_lower_layer_hands_the_original_state_up() {
        let mut stack = LayerStack::default();
        // Locked: the desk lamp was on at 80% and went off.
        stack.push(layer(
            LayerKind::Away,
            "bridge",
            vec![
                OwnedLight {
                    before: snapshot("desk", true, 80.0),
                    applied: OFF,
                },
                OwnedLight {
                    before: snapshot("hall", true, 60.0),
                    applied: OFF,
                },
            ],
        ));
        // A call starts while locked, and on air captures the lamp as off.
        stack.push(layer(
            LayerKind::OnAir,
            "bridge",
            vec![OwnedLight {
                before: snapshot("desk", false, 80.0),
                applied: RED,
            }],
        ));

        // Unlocked mid-call: only the hall light is free to go back.
        let away = stack.remove(LayerKind::Away).unwrap();
        assert_eq!(away.lights.len(), 1);
        assert_eq!(away.lights[0].before.id, "hall");

        // The call ends: the lamp returns to how it was before locking.
        let on_air = stack.remove(LayerKind::OnAir).unwrap();
        assert_eq!(on_air.lights.len(), 1);
        assert!(on_air.lights[0].before.on);
        assert_eq!(on_air.lights[0].before.brightness, Some(80.0));
    }

    #[test]
    fn a_layer_on_another_bridge_takes_nothing() {
        let mut stack = LayerStack::default();
        stack.push(layer(
            LayerKind::Away,
            "first",
            vec![OwnedLight {
                before: snapshot("light", true, 50.0),
                applied: OFF,
            }],
        ));
        stack.push(layer(
            LayerKind::OnAir,
            "second",
            vec![OwnedLight {
                before: snapshot("light", false, 50.0),
                applied: RED,
            }],
        ));

        assert_eq!(stack.remove(LayerKind::Away).unwrap().lights.len(), 1);
    }

    #[test]
    fn a_light_someone_changed_is_left_alone() {
        assert!(unchanged(false, Some(80.0), OFF));
        assert!(!unchanged(true, Some(80.0), OFF));
        assert!(unchanged(true, Some(98.4), RED));
        assert!(!unchanged(true, Some(50.0), RED));
        assert!(!unchanged(false, None, RED));
        // A light without dimming has only its power to compare.
        assert!(unchanged(true, None, RED));
    }
}
