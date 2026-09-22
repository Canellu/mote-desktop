//! What an automation wants a light to show, turned into the body for that
//! light's capabilities.
//!
//! A look is always worked out against the light's original state, never
//! against another automation's look, so dimming dims the original and "off"
//! only touches a light that was on.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::services::entertainment::snapshot::{self, LightSnapshot};
use crate::services::hue_client::HueLight;

/// What an automation wrote to a light, so a restore can tell whether anyone
/// has changed it since.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Applied {
    pub on: bool,
    pub brightness: Option<f64>,
    pub xy: Option<[f64; 2]>,
    pub mirek: Option<u16>,
}

impl Applied {
    /// What a light showing this snapshot looks like to the comparisons below.
    pub fn of(snapshot: &LightSnapshot) -> Self {
        let ct = snapshot.color_mode.as_deref() == Some("ct");
        Self {
            on: snapshot.on,
            brightness: snapshot.on.then_some(snapshot.brightness).flatten(),
            xy: (snapshot.on && !ct).then_some(snapshot.xy).flatten(),
            mirek: (snapshot.on && ct).then_some(snapshot.mirek).flatten(),
        }
    }
}

/// What a light can show.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Caps {
    pub dimmable: bool,
    pub color: bool,
    /// The white range in mireds, when it has one.
    pub ct: Option<(u16, u16)>,
}

impl Caps {
    pub fn of(light: &HueLight) -> Self {
        Self {
            dimmable: light.brightness.is_some(),
            color: light.supports_color,
            ct: light
                .supports_ct
                .then(|| (light.ct_min.unwrap_or(153), light.ct_max.unwrap_or(500))),
        }
    }

    fn clamp_mirek(self, mirek: u16) -> Option<u16> {
        self.ct.map(|(min, max)| mirek.clamp(min, max))
    }
}

pub fn snapshot_of(light: &HueLight) -> LightSnapshot {
    LightSnapshot {
        id: light.id.clone(),
        on: light.is_on,
        brightness: light.brightness,
        color_mode: light.color_mode.clone(),
        xy: light.xy,
        mirek: light.ct,
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Write {
    Color {
        xy: [f64; 2],
        brightness: f64,
    },
    White {
        mirek: u16,
        brightness: f64,
    },
    /// Keeps whatever color the light had, at this level.
    Brightness(f64),
    /// A color where the light has color, the nearest white where it only has
    /// whites, and just the level on a plain dimmer.
    Tint {
        xy: [f64; 2],
        mirek: u16,
        brightness: f64,
    },
    Off,
    /// Lowers a light that is brighter than the level; leaves the rest.
    Dim(f64),
}

#[derive(Debug, Clone, PartialEq)]
pub enum Intent {
    Look(Write),
    /// One light's static action from a scene, scaled by a brightness percent.
    Scene {
        action: Value,
        scale: Option<f64>,
    },
}

/// The body to send, if the light needs one, and what it shows afterwards.
#[derive(Debug, Clone, PartialEq)]
pub struct Want {
    pub body: Option<Value>,
    pub applied: Applied,
}

impl Intent {
    /// `fresh` says the light still shows `before`; otherwise another
    /// automation's look is on it and must be replaced in full.
    pub fn want(&self, caps: Caps, before: &LightSnapshot, fresh: bool) -> Want {
        match self {
            Self::Scene { action, scale } => scene_want(action, caps, *scale),
            Self::Look(write) => look_want(*write, caps, before, fresh),
        }
    }

    /// How the light looks once this is on it, as a snapshot to return to.
    pub fn result(&self, caps: Caps, before: &LightSnapshot) -> LightSnapshot {
        let applied = self.want(caps, before, true).applied;
        LightSnapshot {
            id: before.id.clone(),
            on: applied.on,
            brightness: applied.brightness.or(before.brightness),
            color_mode: if applied.mirek.is_some() {
                Some("ct".into())
            } else if applied.xy.is_some() {
                Some("xy".into())
            } else {
                before.color_mode.clone()
            },
            xy: applied.xy.or(before.xy),
            mirek: applied.mirek.or(before.mirek),
        }
    }
}

/// The light as it was, or nothing to send when it already is.
fn original(before: &LightSnapshot, fresh: bool) -> Want {
    Want {
        body: (!fresh).then(|| snapshot::restore_body(before)),
        applied: Applied::of(before),
    }
}

fn look_want(write: Write, caps: Caps, before: &LightSnapshot, fresh: bool) -> Want {
    match write {
        Write::Color { xy, brightness } => {
            let mut body = json!({ "on": { "on": true } });
            let brightness = caps.dimmable.then_some(brightness);
            if let Some(level) = brightness {
                body["dimming"] = json!({ "brightness": level });
            }
            let xy = caps.color.then_some(xy);
            if let Some([x, y]) = xy {
                body["color"] = json!({ "xy": { "x": x, "y": y } });
            }
            Want {
                body: Some(body),
                applied: Applied {
                    on: true,
                    brightness,
                    xy,
                    mirek: None,
                },
            }
        }
        Write::White { mirek, brightness } => {
            let mut body = json!({ "on": { "on": true } });
            let brightness = caps.dimmable.then_some(brightness);
            if let Some(level) = brightness {
                body["dimming"] = json!({ "brightness": level });
            }
            let mirek = caps.clamp_mirek(mirek);
            if let Some(mirek) = mirek {
                body["color_temperature"] = json!({ "mirek": mirek });
            }
            Want {
                body: Some(body),
                applied: Applied {
                    on: true,
                    brightness,
                    xy: None,
                    mirek,
                },
            }
        }
        Write::Tint {
            xy,
            mirek,
            brightness,
        } => {
            if caps.color {
                look_want(Write::Color { xy, brightness }, caps, before, fresh)
            } else {
                look_want(Write::White { mirek, brightness }, caps, before, fresh)
            }
        }
        Write::Brightness(level) => {
            let mut look = before.clone();
            look.on = true;
            if caps.dimmable {
                look.brightness = Some(level);
            }
            let mut body = if fresh {
                json!({ "on": { "on": true } })
            } else {
                snapshot::restore_body(&look)
            };
            if caps.dimmable {
                body["dimming"] = json!({ "brightness": level });
            }
            Want {
                body: Some(body),
                applied: Applied::of(&look),
            }
        }
        Write::Off => {
            if !before.on {
                return original(before, fresh);
            }
            Want {
                body: Some(json!({ "on": { "on": false } })),
                applied: Applied {
                    on: false,
                    brightness: None,
                    xy: None,
                    mirek: None,
                },
            }
        }
        Write::Dim(level) => {
            if !(caps.dimmable && before.on && before.brightness.is_some_and(|now| now > level)) {
                return original(before, fresh);
            }
            let mut look = before.clone();
            look.brightness = Some(level);
            Want {
                // Only the level when the light still shows its own color, so
                // a gradient or effect survives; the whole original look when
                // another automation's color is on it.
                body: Some(if fresh {
                    json!({ "dimming": { "brightness": level } })
                } else {
                    snapshot::restore_body(&look)
                }),
                applied: Applied::of(&look),
            }
        }
    }
}

/// The white nearest a color, in mireds, by McCamy's approximation of its
/// correlated color temperature, kept inside what Hue whites can show.
pub fn mirek_for_xy([x, y]: [f64; 2]) -> u16 {
    let n = (x - 0.3320) / (0.1858 - y);
    let kelvin = 449.0 * n.powi(3) + 3525.0 * n.powi(2) + 6823.3 * n + 5520.33;
    if !kelvin.is_finite() || kelvin <= 0.0 {
        return 366;
    }
    (1_000_000.0 / kelvin).round().clamp(153.0, 500.0) as u16
}

/// Only reversible static scene properties; effects and gradients would need
/// richer snapshots.
fn scene_want(action: &Value, caps: Caps, scale: Option<f64>) -> Want {
    let on = action["on"]["on"].as_bool().unwrap_or(true);
    let mut body = json!({ "on": { "on": on } });
    let brightness = caps
        .dimmable
        .then(|| action["dimming"]["brightness"].as_f64())
        .flatten()
        .map(|level| (level * scale.unwrap_or(100.0) / 100.0).clamp(0.0, 100.0));
    if let Some(level) = brightness {
        body["dimming"] = json!({ "brightness": level });
    }
    let mirek = action["color_temperature"]["mirek"]
        .as_u64()
        .and_then(|value| caps.clamp_mirek(value.min(1000) as u16));
    let xy = if caps.color && mirek.is_none() {
        action["color"]["xy"]["x"]
            .as_f64()
            .zip(action["color"]["xy"]["y"].as_f64())
            .map(|(x, y)| [x, y])
    } else {
        None
    };
    if let Some(mirek) = mirek {
        body["color_temperature"] = json!({ "mirek": mirek });
    }
    if let Some([x, y]) = xy {
        body["color"] = json!({ "xy": { "x": x, "y": y } });
    }
    Want {
        body: Some(body),
        applied: Applied {
            on,
            brightness: on.then_some(brightness).flatten(),
            xy: on.then_some(xy).flatten(),
            mirek: on.then_some(mirek).flatten(),
        },
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

/// Color is read back after the write, so gamut clamping does not look like an
/// edit.
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

/// Both checks against a light as the bridge reports it now.
pub fn still_shows(light: &HueLight, applied: Applied) -> bool {
    unchanged(light.is_on, light.brightness, applied)
        && (!light.is_on
            || unchanged_color(light.xy, light.ct, light.color_mode.as_deref(), applied))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn caps(dimmable: bool, color: bool) -> Caps {
        Caps {
            dimmable,
            color,
            ct: None,
        }
    }

    fn before(on: bool, brightness: f64) -> LightSnapshot {
        LightSnapshot {
            id: "light-1".into(),
            on,
            brightness: Some(brightness),
            color_mode: Some("xy".into()),
            xy: Some([0.3, 0.4]),
            mirek: None,
        }
    }

    const RED: Write = Write::Color {
        xy: [0.675, 0.322],
        brightness: 100.0,
    };

    #[test]
    fn color_is_sent_only_to_what_can_show_it() {
        let want = Intent::Look(RED).want(caps(true, true), &before(false, 20.0), true);
        assert_eq!(
            want.body.unwrap(),
            json!({
                "on": { "on": true },
                "dimming": { "brightness": 100.0 },
                "color": { "xy": { "x": 0.675, "y": 0.322 } }
            })
        );
        let white = Intent::Look(RED).want(caps(true, false), &before(true, 20.0), true);
        assert!(white.body.unwrap().get("color").is_none());
        let plug = Intent::Look(RED).want(caps(false, false), &before(false, 20.0), true);
        assert_eq!(plug.body.unwrap(), json!({ "on": { "on": true } }));
        assert_eq!(plug.applied.brightness, None);
    }

    #[test]
    fn off_and_dim_leave_alone_what_needs_nothing() {
        let off = Intent::Look(Write::Off);
        assert!(off
            .want(caps(true, true), &before(false, 50.0), true)
            .body
            .is_none());
        assert!(off
            .want(caps(true, true), &before(true, 50.0), true)
            .body
            .is_some());

        let dim = Intent::Look(Write::Dim(10.0));
        assert!(dim
            .want(caps(true, true), &before(true, 5.0), true)
            .body
            .is_none());
        assert!(dim
            .want(caps(true, true), &before(false, 80.0), true)
            .body
            .is_none());
        assert!(dim
            .want(caps(false, false), &before(true, 80.0), true)
            .body
            .is_none());
        assert_eq!(
            dim.want(caps(true, true), &before(true, 80.0), true)
                .body
                .unwrap(),
            json!({ "dimming": { "brightness": 10.0 } })
        );
    }

    #[test]
    fn replacing_another_look_brings_back_the_original_color() {
        // Dimming after the on-air color: the original color comes back, dimmer.
        let dim = Intent::Look(Write::Dim(30.0)).want(caps(true, true), &before(true, 80.0), false);
        assert_eq!(
            dim.body.unwrap(),
            json!({
                "on": { "on": true },
                "dimming": { "brightness": 30.0 },
                "color": { "xy": { "x": 0.3, "y": 0.4 } }
            })
        );
        // Nothing to dim, but another look is on it: the original is written.
        let nothing =
            Intent::Look(Write::Dim(90.0)).want(caps(true, true), &before(true, 80.0), false);
        assert_eq!(nothing.body.unwrap()["dimming"]["brightness"], 80.0);
    }

    #[test]
    fn white_obeys_the_fixture_range() {
        let fixture = Caps {
            dimmable: true,
            color: true,
            ct: Some((153, 454)),
        };
        let want = Intent::Look(Write::White {
            mirek: 500,
            brightness: 65.0,
        })
        .want(fixture, &before(false, 20.0), true);
        assert_eq!(want.body.unwrap()["color_temperature"]["mirek"], 454);
        assert_eq!(want.applied.mirek, Some(454));
    }

    #[test]
    fn scenes_use_static_actions_scaled() {
        let action = json!({ "on": { "on": true }, "dimming": { "brightness": 80 }, "color": { "xy": { "x": 0.3, "y": 0.4 } }, "effects": { "effect": "candle" } });
        let want = Intent::Scene {
            action,
            scale: Some(50.0),
        }
        .want(caps(true, true), &before(false, 20.0), true);
        let body = want.body.unwrap();
        assert_eq!(body["dimming"]["brightness"], 40.0);
        assert!(body.get("effects").is_none());
        assert_eq!(want.applied.xy, Some([0.3, 0.4]));
    }

    #[test]
    fn a_tint_falls_back_to_white_then_to_level() {
        let tint = Intent::Look(Write::Tint {
            xy: [0.46, 0.41],
            mirek: 370,
            brightness: 60.0,
        });
        let white_only = Caps {
            dimmable: true,
            color: false,
            ct: Some((153, 454)),
        };
        let body = tint
            .want(white_only, &before(true, 20.0), true)
            .body
            .unwrap();
        assert_eq!(body["color_temperature"]["mirek"], 370);
        assert!(body.get("color").is_none());
        let dimmer = tint
            .want(caps(true, false), &before(true, 20.0), true)
            .body
            .unwrap();
        assert_eq!(
            dimmer,
            json!({ "on": { "on": true }, "dimming": { "brightness": 60.0 } })
        );
    }

    #[test]
    fn whites_follow_the_warmth_of_a_color() {
        // Warm amber lands near 2200 K, a cool blue-white near the cool end.
        assert!(mirek_for_xy([0.5268, 0.4133]) > 420);
        assert!(mirek_for_xy([0.2800, 0.2900]) < 200);
        assert_eq!(mirek_for_xy([0.3127, 0.3290]), 154);
    }

    #[test]
    fn a_result_is_the_look_to_come_back_to() {
        let result = Intent::Look(RED).result(caps(true, true), &before(false, 20.0));
        assert!(result.on);
        assert_eq!(result.color_mode.as_deref(), Some("xy"));
        assert_eq!(result.xy, Some([0.675, 0.322]));
    }

    #[test]
    fn manual_color_edits_are_not_restored_over() {
        let applied = Applied {
            on: true,
            brightness: Some(50.0),
            xy: Some([0.3, 0.4]),
            mirek: None,
        };
        assert!(unchanged_color(
            Some([0.301, 0.399]),
            None,
            Some("xy"),
            applied
        ));
        assert!(!unchanged_color(
            Some([0.6, 0.3]),
            None,
            Some("xy"),
            applied
        ));
        assert!(!unchanged_color(
            Some([0.3, 0.4]),
            Some(366),
            Some("ct"),
            applied
        ));
        assert!(unchanged(
            true,
            Some(98.4),
            Applied {
                brightness: Some(100.0),
                ..applied
            }
        ));
        assert!(!unchanged(false, None, applied));
    }
}
