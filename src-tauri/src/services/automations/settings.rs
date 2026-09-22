//! Persisted automation settings.
//!
//! Stored in their own Tauri store file, like PC Sync preferences, so they never
//! contend with the bridge session data in `hue-store.json`.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

use super::priority::{self, Source};

const STORE_FILE: &str = "automations.json";
const STORE_KEY: &str = "settings";
const MAX_IGNORED_APPS: usize = 64;
const MAX_TEXT_LEN: usize = 512;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TargetKind {
    Light,
    Room,
    Zone,
}

/// A light, or a room or zone addressed by its `grouped_light` id: the same
/// shape global shortcuts use, so both share one picker.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationTarget {
    pub kind: TargetKind,
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AutomationScene {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OnAirMode {
    #[default]
    Color,
    White,
    Scene,
}

pub fn effective_targets<'a>(
    targets: &'a [AutomationTarget],
    legacy: &'a Option<AutomationTarget>,
) -> Vec<&'a AutomationTarget> {
    if targets.is_empty() {
        legacy.iter().collect()
    } else {
        targets.iter().collect()
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OnAirTrigger {
    #[default]
    MicrophoneOrCamera,
    Microphone,
    Camera,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OnAirColor {
    #[default]
    Red,
    Orange,
    Purple,
    Blue,
}

impl OnAirColor {
    /// CIE xy. The bridge clamps it to each light's own gamut.
    pub const fn xy(self) -> [f64; 2] {
        match self {
            Self::Red => [0.675, 0.322],
            Self::Orange => [0.5614, 0.4156],
            Self::Purple => [0.2725, 0.1096],
            Self::Blue => [0.1532, 0.0475],
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct OnAirSettings {
    pub enabled: bool,
    /// The bridge `target` belongs to.
    pub bridge_id: Option<String>,
    pub target: Option<AutomationTarget>,
    pub targets: Vec<AutomationTarget>,
    pub mode: OnAirMode,
    pub xy: Option<[f64; 2]>,
    pub mirek: u16,
    pub scene: Option<AutomationScene>,
    pub trigger: OnAirTrigger,
    pub color: OnAirColor,
    /// 1-100.
    pub brightness: f64,
    /// Consent-store ids of apps that never switch the light on.
    pub ignored_apps: Vec<String>,
}

impl Default for OnAirSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            bridge_id: None,
            target: None,
            targets: Vec::new(),
            mode: OnAirMode::Color,
            xy: None,
            mirek: 366,
            scene: None,
            trigger: OnAirTrigger::default(),
            color: OnAirColor::default(),
            brightness: 100.0,
            ignored_apps: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AwayAction {
    #[default]
    Off,
    Dim,
    Scene,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AwaySettings {
    pub enabled: bool,
    /// The bridge `target` belongs to.
    pub bridge_id: Option<String>,
    pub target: Option<AutomationTarget>,
    pub targets: Vec<AutomationTarget>,
    pub scene: Option<AutomationScene>,
    pub action: AwayAction,
    /// 1-100, used by `Dim`.
    pub dim_brightness: f64,
    /// Sleep counts as stepping away, not only locking.
    pub include_sleep: bool,
    /// Put the lights back on unlock. Off leaves them as the automation set them.
    pub restore_on_return: bool,
}

impl Default for AwaySettings {
    fn default() -> Self {
        Self {
            enabled: false,
            bridge_id: None,
            target: None,
            targets: Vec::new(),
            scene: None,
            action: AwayAction::default(),
            dim_brightness: 10.0,
            include_sleep: true,
            restore_on_return: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AutomationSettings {
    pub on_air: OnAirSettings,
    pub away: AwaySettings,
    /// Highest first: which automation, or PC Sync, keeps a shared light.
    /// An entry this version does not know is dropped rather than losing every
    /// other setting.
    #[serde(deserialize_with = "known_sources")]
    pub priority: Vec<Source>,
}

fn known_sources<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Vec<Source>, D::Error> {
    let values = Vec::<serde_json::Value>::deserialize(deserializer)?;
    Ok(values
        .into_iter()
        .filter_map(|value| serde_json::from_value(value).ok())
        .collect())
}

impl Default for AutomationSettings {
    fn default() -> Self {
        Self {
            on_air: OnAirSettings::default(),
            away: AwaySettings::default(),
            priority: Source::DEFAULT_ORDER.to_vec(),
        }
    }
}

impl AutomationSettings {
    /// The priority made whole, whatever an older version or the interface
    /// saved.
    pub fn normalized(mut self) -> Self {
        self.priority = priority::normalize(&self.priority);
        self
    }

    /// Refuses what the interface should never send. Saving is not a Pro
    /// action: like a shortcut, an automation can be prepared on Free and starts
    /// working once Pro is owned.
    pub fn validate(&self) -> Result<(), String> {
        validate_target(
            "the on-air light",
            self.on_air.enabled,
            &self.on_air.bridge_id,
            &self.on_air.target,
            &self.on_air.targets,
            (self.on_air.mode == OnAirMode::Scene).then_some(self.on_air.scene.as_ref()),
        )?;
        validate_target(
            "this automation",
            self.away.enabled,
            &self.away.bridge_id,
            &self.away.target,
            &self.away.targets,
            (self.away.action == AwayAction::Scene).then_some(self.away.scene.as_ref()),
        )?;
        if self.on_air.xy.is_some_and(|xy| {
            xy.iter()
                .any(|value| !value.is_finite() || !(0.0..=1.0).contains(value))
        }) {
            return Err("Choose a valid color.".into());
        }
        if !(50..=1000).contains(&self.on_air.mirek) {
            return Err("Choose a valid white temperature.".into());
        }
        validate_level("On-air brightness", self.on_air.brightness)?;
        validate_level("The dim level", self.away.dim_brightness)?;
        if self.on_air.ignored_apps.len() > MAX_IGNORED_APPS
            || self
                .on_air
                .ignored_apps
                .iter()
                .any(|id| id.is_empty() || id.len() > MAX_TEXT_LEN)
        {
            return Err("The list of ignored apps could not be saved.".to_string());
        }
        Ok(())
    }
}

fn validate_target(
    label: &str,
    enabled: bool,
    bridge_id: &Option<String>,
    target: &Option<AutomationTarget>,
    targets: &[AutomationTarget],
    scene: Option<Option<&AutomationScene>>,
) -> Result<(), String> {
    if targets.len() > 100 {
        return Err("Choose at most 100 light targets.".into());
    }
    if let Some(scene) = scene {
        if let Some(scene) = scene {
            if scene.id.is_empty()
                || scene.id.len() > MAX_TEXT_LEN
                || scene.name.len() > MAX_TEXT_LEN
                || bridge_id.as_deref().is_none_or(str::is_empty)
            {
                return Err("Choose the scene again.".into());
            }
        } else if enabled {
            return Err("Choose a scene before turning on this automation.".into());
        }
        return Ok(());
    }
    let targets = effective_targets(targets, target);
    for target in &targets {
        if target.id.is_empty()
            || target.id.len() > MAX_TEXT_LEN
            || target.name.len() > MAX_TEXT_LEN
            || bridge_id.as_deref().is_none_or(str::is_empty)
        {
            return Err(format!("Choose the lights for {label} again."));
        }
    }
    if enabled && targets.is_empty() {
        return Err(format!("Choose lights before turning on {label}."));
    }
    Ok(())
}

fn validate_level(label: &str, level: f64) -> Result<(), String> {
    if level.is_finite() && (1.0..=100.0).contains(&level) {
        Ok(())
    } else {
        Err(format!("{label} must be between 1 and 100%."))
    }
}

pub fn load<R: Runtime>(app: &AppHandle<R>) -> AutomationSettings {
    let Ok(store) = app.store(STORE_FILE) else {
        return AutomationSettings::default();
    };
    store
        .get(STORE_KEY)
        .and_then(|value| serde_json::from_value::<AutomationSettings>(value).ok())
        .unwrap_or_default()
        .normalized()
}

pub fn save<R: Runtime>(app: &AppHandle<R>, settings: &AutomationSettings) -> Result<(), String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|_| "Failed to open automation settings.".to_string())?;
    store.set(
        STORE_KEY,
        serde_json::to_value(settings)
            .map_err(|_| "Automation settings are invalid.".to_string())?,
    );
    store
        .save()
        .map_err(|_| "Failed to save automation settings.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn target() -> AutomationTarget {
        AutomationTarget {
            kind: TargetKind::Room,
            id: "grouped-light-1".into(),
            name: "Office".into(),
        }
    }

    #[test]
    fn missing_fields_read_as_defaults() {
        let settings: AutomationSettings = serde_json::from_value(serde_json::json!({})).unwrap();
        assert_eq!(settings, AutomationSettings::default());
        assert!(settings.away.include_sleep && settings.away.restore_on_return);
        assert_eq!(settings.on_air.brightness, 100.0);
    }

    #[test]
    fn ipc_names_match_the_frontend_model() {
        let value = serde_json::to_value(AutomationSettings::default()).unwrap();
        assert_eq!(value["onAir"]["trigger"], "microphone_or_camera");
        assert_eq!(value["onAir"]["color"], "red");
        assert_eq!(value["away"]["action"], "off");
        assert!(value["away"].get("dimBrightness").is_some());
        assert_eq!(value["priority"][0], "onAir");
    }

    #[test]
    fn a_saved_priority_is_kept_and_completed() {
        let settings: AutomationSettings = serde_json::from_value(
            serde_json::json!({ "priority": ["pcSync", "sunrise", "onAir"] }),
        )
        .unwrap();
        let settings = settings.normalized();
        assert_eq!(settings.priority[0], Source::PcSync);
        assert_eq!(settings.priority.len(), Source::DEFAULT_ORDER.len());
    }

    #[test]
    fn enabling_without_lights_is_refused() {
        let mut settings = AutomationSettings::default();
        settings.on_air.enabled = true;
        assert!(settings.validate().is_err());

        settings.on_air.target = Some(target());
        settings.on_air.bridge_id = Some("bridge".into());
        assert_eq!(settings.validate(), Ok(()));
    }

    #[test]
    fn a_target_needs_its_bridge() {
        let mut settings = AutomationSettings::default();
        settings.away.target = Some(target());
        assert!(settings.validate().is_err());
    }

    #[test]
    fn levels_stay_in_range() {
        let mut settings = AutomationSettings::default();
        settings.away.dim_brightness = 0.0;
        assert!(settings.validate().is_err());
        settings.away.dim_brightness = f64::NAN;
        assert!(settings.validate().is_err());
    }

    #[test]
    fn legacy_targets_and_colors_survive_loading() {
        let settings: AutomationSettings = serde_json::from_value(serde_json::json!({
            "onAir": { "bridgeId": "bridge", "target": { "kind": "light", "id": "one", "name": "Desk" }, "color": "purple" }
        })).unwrap();
        assert_eq!(
            effective_targets(&settings.on_air.targets, &settings.on_air.target)[0].id,
            "one"
        );
        assert_eq!(
            settings
                .on_air
                .xy
                .unwrap_or_else(|| settings.on_air.color.xy()),
            [0.2725, 0.1096]
        );
    }

    #[test]
    fn multiple_targets_and_scene_rules_validate() {
        let mut settings = AutomationSettings::default();
        settings.on_air.enabled = true;
        settings.on_air.bridge_id = Some("bridge".into());
        settings.on_air.targets = vec![
            target(),
            AutomationTarget {
                kind: TargetKind::Light,
                id: "light".into(),
                name: "Desk".into(),
            },
        ];
        assert!(settings.validate().is_ok());
        settings.on_air.mode = OnAirMode::Scene;
        assert!(settings.validate().is_err());
        settings.on_air.targets.clear();
        settings.on_air.scene = Some(AutomationScene {
            id: "scene".into(),
            name: "Concentrate".into(),
        });
        assert!(settings.validate().is_ok());
        settings.on_air.xy = Some([f64::NAN, 0.2]);
        assert!(settings.validate().is_err());
    }
}
