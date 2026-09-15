//! Runs the on-air light and the away automation.
//!
//! One task makes every automation's light changes, so the two can hold the
//! same lights without fighting: Windows' lock and sleep signals and a poll of
//! microphone and camera use are handled one at a time, in the order they
//! arrived. What each automation changed is kept in a [`LayerStack`].

use std::collections::HashMap;
use std::sync::{OnceLock, RwLock};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{mpsc, Mutex};

use crate::services::entertainment::snapshot::{self, LightSnapshot};
use crate::services::entitlements::Capability;
use crate::services::hue_client::{HueClient, HueLight};

use super::capture_use::{self, CaptureApp};
use super::layers::{
    self, Applied, BridgeAccess, Layer, LayerKind, LayerStack, OwnedLight, Restore,
};
use super::settings::{
    self, AutomationSettings, AutomationTarget, AwayAction, OnAirSettings, OnAirTrigger, TargetKind,
};

const STATUS_EVENT: &str = "automation-status";
const POLL_INTERVAL: Duration = Duration::from_secs(2);
/// Idle polls before the on-air light goes back, so moving a call from one app
/// to another does not flicker it.
const IDLE_POLLS_BEFORE_OFF: u32 = 2;
/// Wait before trying again after the bridge refused or could not be reached.
const RETRY_AFTER: Duration = Duration::from_secs(10);
const RESTORE_RETRY_INTERVAL: Duration = Duration::from_secs(5);
/// About a minute: long enough for Wi-Fi to come back after the PC wakes.
const RESTORE_ATTEMPTS: u32 = 12;
/// Spacing between light writes, inside the bridge's ~10 commands/second.
const WRITE_INTERVAL: Duration = Duration::from_millis(100);
pub const EXIT_CLEANUP_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Signal {
    Locked(bool),
    Suspended(bool),
    SettingsChanged,
}

static SIGNALS: OnceLock<mpsc::UnboundedSender<Signal>> = OnceLock::new();

/// Hands a signal to the automation task. Never blocks, so a window procedure
/// may call it.
pub fn signal(next: Signal) {
    if let Some(sender) = SIGNALS.get() {
        let _ = sender.send(next);
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnAirStatus {
    pub active: bool,
    /// The apps keeping it on.
    pub apps: Vec<String>,
    /// Plain text, or a serialized `AuthorizationError` when Pro refused.
    pub error: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AwayStatus {
    pub active: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationStatus {
    pub on_air: OnAirStatus,
    pub away: AwayStatus,
    /// Every app capturing now, ignored ones included, so they can be ignored.
    pub capture_apps: Vec<CaptureApp>,
}

#[derive(Default)]
pub struct AutomationRuntime {
    settings: RwLock<AutomationSettings>,
    status: RwLock<AutomationStatus>,
    worker: Mutex<Worker>,
}

impl AutomationRuntime {
    pub fn settings(&self) -> AutomationSettings {
        self.settings
            .read()
            .expect("automation settings lock poisoned")
            .clone()
    }

    pub fn set_settings(&self, next: AutomationSettings) {
        *self
            .settings
            .write()
            .expect("automation settings lock poisoned") = next;
    }

    pub fn status(&self) -> AutomationStatus {
        self.status
            .read()
            .expect("automation status lock poisoned")
            .clone()
    }

    fn publish(&self, app: &AppHandle, next: AutomationStatus) {
        {
            let mut status = self
                .status
                .write()
                .expect("automation status lock poisoned");
            if *status == next {
                return;
            }
            *status = next.clone();
        }
        let _ = app.emit(STATUS_EVENT, next);
    }

    /// Puts back an on-air light still showing when Mote exits. The away
    /// automation is left as it is on purpose: a PC shutting down while locked
    /// must not switch the lights back on in an empty room.
    pub fn shutdown_blocking(&self, timeout: Duration) {
        let _ = tauri::async_runtime::block_on(tokio::time::timeout(timeout, async {
            let mut worker = self.worker.lock().await;
            if let Some(restore) = worker.stack.remove(LayerKind::OnAir) {
                let _ = write_restore(&restore).await;
            }
        }));
    }
}

/// Loads the saved settings and starts the automation task.
pub fn start(app: &AppHandle) {
    let Some(runtime) = app.try_state::<AutomationRuntime>() else {
        return;
    };
    runtime.set_settings(settings::load(app));

    let (sender, mut receiver) = mpsc::unbounded_channel();
    if SIGNALS.set(sender).is_err() {
        return;
    }

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut poll = tokio::time::interval(POLL_INTERVAL);
        poll.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

        loop {
            let received = tokio::select! {
                _ = poll.tick() => None,
                received = receiver.recv() => match received {
                    Some(next) => Some(next),
                    None => return,
                },
            };

            let runtime = app.state::<AutomationRuntime>();
            let settings = runtime.settings();
            let mut worker = runtime.worker.lock().await;
            match received {
                None => worker.poll(&settings.on_air, false),
                Some(Signal::SettingsChanged) => {
                    worker.observe(Signal::SettingsChanged);
                    // An app just ignored lets go of the light at once.
                    worker.poll(&settings.on_air, true);
                }
                Some(next) => worker.observe(next),
            }
            worker.reconcile(&app, &settings).await;
            let status = worker.status(&settings);
            drop(worker);
            runtime.publish(&app, status);
        }
    });
}

#[derive(Clone, Copy)]
enum Write {
    Color { xy: [f64; 2], brightness: f64 },
    Off,
    Dim(f64),
}

impl Write {
    /// The body for one light, or `None` when it needs nothing: an off light
    /// stays off, and a light already dimmer than the level is not brightened.
    fn body_for(self, light: &HueLight) -> Option<(Value, Applied)> {
        let dimmable = light.brightness.is_some();
        match self {
            Self::Color { xy, brightness } => {
                let mut body = json!({ "on": { "on": true } });
                if dimmable {
                    body["dimming"] = json!({ "brightness": brightness });
                }
                if light.supports_color {
                    body["color"] = json!({ "xy": { "x": xy[0], "y": xy[1] } });
                }
                Some((
                    body,
                    Applied {
                        on: true,
                        brightness: dimmable.then_some(brightness),
                    },
                ))
            }
            Self::Off => light.is_on.then(|| {
                (
                    json!({ "on": { "on": false } }),
                    Applied {
                        on: false,
                        brightness: None,
                    },
                )
            }),
            Self::Dim(level) => (light.is_on && light.brightness.is_some_and(|now| now > level))
                .then(|| {
                    (
                        json!({ "dimming": { "brightness": level } }),
                        Applied {
                            on: true,
                            brightness: Some(level),
                        },
                    )
                }),
        }
    }
}

/// One automation's wish for this pass.
struct Plan {
    kind: LayerKind,
    wanted: bool,
    config: Value,
    bridge_id: Option<String>,
    target: Option<AutomationTarget>,
    write: Write,
    restore: bool,
}

struct PendingRestore {
    restore: Restore,
    attempts: u32,
    next_at: Instant,
}

#[derive(Default)]
struct Worker {
    stack: LayerStack,
    capture_apps: Vec<CaptureApp>,
    calling_apps: Vec<String>,
    on_call: bool,
    idle_polls: u32,
    locked: bool,
    suspended: bool,
    errors: HashMap<LayerKind, String>,
    retry_at: HashMap<LayerKind, Instant>,
    pending: Vec<PendingRestore>,
}

impl Worker {
    fn observe(&mut self, next: Signal) {
        match next {
            Signal::Locked(locked) => {
                self.locked = locked;
                // Unlocking proves someone is back, even if the wake before it
                // was never reported.
                if !locked {
                    self.suspended = false;
                }
            }
            Signal::Suspended(suspended) => self.suspended = suspended,
            Signal::SettingsChanged => self.retry_at.clear(),
        }
    }

    fn poll(&mut self, on_air: &OnAirSettings, immediate: bool) {
        let apps = capture_use::active_apps();
        let calling = calling_apps(&apps, on_air);
        if calling.is_empty() {
            self.idle_polls = self.idle_polls.saturating_add(1);
            if immediate || self.idle_polls >= IDLE_POLLS_BEFORE_OFF {
                self.on_call = false;
                self.calling_apps.clear();
            }
        } else {
            self.idle_polls = 0;
            self.on_call = true;
            self.calling_apps = calling;
        }
        self.capture_apps = apps;
    }

    async fn reconcile(&mut self, app: &AppHandle, settings: &AutomationSettings) {
        self.retry_restores().await;
        for plan in self.plans(settings) {
            self.drive(app, plan).await;
        }
    }

    fn plans(&self, settings: &AutomationSettings) -> [Plan; 2] {
        let on_air = &settings.on_air;
        let away = &settings.away;
        [
            Plan {
                kind: LayerKind::OnAir,
                wanted: on_air.enabled && self.on_call,
                config: json!([
                    on_air.bridge_id,
                    on_air.target,
                    on_air.color,
                    on_air.brightness
                ]),
                bridge_id: on_air.bridge_id.clone(),
                target: on_air.target.clone(),
                write: Write::Color {
                    xy: on_air.color.xy(),
                    brightness: on_air.brightness,
                },
                restore: true,
            },
            Plan {
                kind: LayerKind::Away,
                wanted: away.enabled && (self.locked || (away.include_sleep && self.suspended)),
                config: json!([
                    away.bridge_id,
                    away.target,
                    away.action,
                    away.dim_brightness
                ]),
                bridge_id: away.bridge_id.clone(),
                target: away.target.clone(),
                write: match away.action {
                    AwayAction::Off => Write::Off,
                    AwayAction::Dim => Write::Dim(away.dim_brightness),
                },
                restore: away.restore_on_return,
            },
        ]
    }

    async fn drive(&mut self, app: &AppHandle, plan: Plan) {
        let same_config = self
            .stack
            .get(plan.kind)
            .map(|layer| layer.config == plan.config);
        // Ended, or started with settings that have since changed.
        if same_config.is_some_and(|same| !plan.wanted || !same) {
            if let Some(restore) = self.stack.remove(plan.kind) {
                if plan.restore {
                    self.restore_or_retry(restore).await;
                }
            }
        }

        if !plan.wanted {
            self.errors.remove(&plan.kind);
            self.retry_at.remove(&plan.kind);
            return;
        }
        if self.stack.get(plan.kind).is_some()
            || self
                .retry_at
                .get(&plan.kind)
                .is_some_and(|at| Instant::now() < *at)
        {
            return;
        }

        // Asked on every attempt rather than remembered, so buying Pro mid-call
        // lights the light straight away. Only starting is gated: whatever is
        // already showing is always put back.
        if let Err(refusal) =
            crate::commands::entitlements::require(app, Capability::LocalAutomation)
        {
            self.errors.insert(plan.kind, refusal);
            return;
        }

        match self.start_layer(app, &plan).await {
            Ok(()) => {
                self.errors.remove(&plan.kind);
                self.retry_at.remove(&plan.kind);
            }
            Err(error) => {
                self.errors.insert(plan.kind, error);
                self.retry_at
                    .insert(plan.kind, Instant::now() + RETRY_AFTER);
            }
        }
    }

    async fn start_layer(&mut self, app: &AppHandle, plan: &Plan) -> Result<(), String> {
        let (Some(bridge_id), Some(target)) = (&plan.bridge_id, &plan.target) else {
            return Err("Choose lights for this automation.".to_string());
        };
        let client = HueClient::new()?;
        let bridge = client.get_stored_bridge(app)?;
        if &bridge.bridge_id != bridge_id {
            return Err("Switch to the bridge this automation was set up on.".to_string());
        }
        let application_key = client.get_stored_application_key(app)?;
        let ip = bridge.bridge_ip;

        let members = member_light_ids(&client, &ip, &application_key, target).await?;
        let lights: Vec<HueLight> = client
            .get_lights(&ip, &application_key)
            .await?
            .into_iter()
            .filter(|light| light.reachable && members.contains(&light.id))
            .collect();
        if lights.is_empty() {
            return Err(format!("No lights in {} can be reached.", target.name));
        }

        let mut owned = Vec::new();
        let mut failures = 0usize;
        for light in &lights {
            let Some((body, applied)) = plan.write.body_for(light) else {
                continue;
            };
            if !owned.is_empty() || failures > 0 {
                tokio::time::sleep(WRITE_INTERVAL).await;
            }
            match client
                .update_resource(&ip, &application_key, "light", &light.id, body)
                .await
            {
                Ok(()) => owned.push(OwnedLight {
                    before: snapshot_of(light),
                    applied,
                }),
                Err(_) => failures += 1,
            }
        }
        if owned.is_empty() && failures > 0 {
            return Err(format!(
                "The lights in {} could not be changed.",
                target.name
            ));
        }

        self.adopt_pending_restores(bridge_id, &mut owned);
        // Recorded even when some writes failed, so what did change goes back.
        self.stack.push(Layer {
            kind: plan.kind,
            bridge: BridgeAccess {
                bridge_id: bridge_id.clone(),
                ip,
                application_key,
            },
            config: plan.config.clone(),
            lights: owned,
        });
        if failures > 0 {
            Err(format!(
                "{failures} of the lights in {} could not be changed.",
                target.name
            ))
        } else {
            Ok(())
        }
    }

    /// A restore still waiting for the bridge would put these lights back
    /// underneath the automation now holding them. Its original state moves into
    /// the new layer instead.
    fn adopt_pending_restores(&mut self, bridge_id: &str, owned: &mut [OwnedLight]) {
        for pending in &mut self.pending {
            if pending.restore.bridge.bridge_id != bridge_id {
                continue;
            }
            pending.restore.lights.retain(|waiting| {
                match owned
                    .iter_mut()
                    .find(|light| light.before.id == waiting.before.id)
                {
                    Some(light) => {
                        light.before = waiting.before.clone();
                        false
                    }
                    None => true,
                }
            });
        }
        self.pending
            .retain(|pending| !pending.restore.lights.is_empty());
    }

    async fn restore_or_retry(&mut self, restore: Restore) {
        if restore.lights.is_empty() {
            return;
        }
        if write_restore(&restore).await.is_err() {
            self.pending.push(PendingRestore {
                restore,
                attempts: 1,
                next_at: Instant::now() + RESTORE_RETRY_INTERVAL,
            });
        }
    }

    async fn retry_restores(&mut self) {
        let mut waiting = Vec::new();
        for mut pending in std::mem::take(&mut self.pending) {
            if Instant::now() < pending.next_at {
                waiting.push(pending);
                continue;
            }
            if write_restore(&pending.restore).await.is_ok() {
                continue;
            }
            pending.attempts += 1;
            if pending.attempts < RESTORE_ATTEMPTS {
                pending.next_at = Instant::now() + RESTORE_RETRY_INTERVAL;
                waiting.push(pending);
            }
        }
        self.pending = waiting;
    }

    fn status(&self, settings: &AutomationSettings) -> AutomationStatus {
        AutomationStatus {
            on_air: OnAirStatus {
                active: self.stack.get(LayerKind::OnAir).is_some(),
                apps: if settings.on_air.enabled {
                    self.calling_apps.clone()
                } else {
                    Vec::new()
                },
                error: self.errors.get(&LayerKind::OnAir).cloned(),
            },
            away: AwayStatus {
                active: self.stack.get(LayerKind::Away).is_some(),
                error: self.errors.get(&LayerKind::Away).cloned(),
            },
            capture_apps: self.capture_apps.clone(),
        }
    }
}

/// The names of apps that count as a call under these settings.
fn calling_apps(apps: &[CaptureApp], on_air: &OnAirSettings) -> Vec<String> {
    let mut names: Vec<String> = apps
        .iter()
        .filter(|app| !on_air.ignored_apps.contains(&app.id))
        .filter(|app| match on_air.trigger {
            OnAirTrigger::MicrophoneOrCamera => app.microphone || app.camera,
            OnAirTrigger::Microphone => app.microphone,
            OnAirTrigger::Camera => app.camera,
        })
        .map(|app| app.name.clone())
        .collect();
    names.sort();
    names.dedup();
    names
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

fn snapshot_of(light: &HueLight) -> LightSnapshot {
    LightSnapshot {
        id: light.id.clone(),
        on: light.is_on,
        brightness: light.brightness,
        color_mode: light.color_mode.clone(),
        xy: light.xy,
        mirek: light.ct,
    }
}

/// Puts back the lights nobody has changed since, with paced writes.
async fn write_restore(restore: &Restore) -> Result<(), String> {
    let client = HueClient::new()?;
    let BridgeAccess {
        ip,
        application_key,
        ..
    } = &restore.bridge;
    let current = client.get_lights(ip, application_key).await?;
    let untouched: Vec<LightSnapshot> = restore
        .lights
        .iter()
        .filter(|owned| {
            current.iter().any(|light| {
                light.id == owned.before.id
                    && light.reachable
                    && layers::unchanged(light.is_on, light.brightness, owned.applied)
            })
        })
        .map(|owned| owned.before.clone())
        .collect();
    snapshot::restore(&client, ip, application_key, &untouched).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn light(is_on: bool, brightness: Option<f64>, supports_color: bool) -> HueLight {
        HueLight {
            id: "light-1".into(),
            device_id: None,
            device_name: None,
            name: "Desk".into(),
            is_on,
            brightness,
            reachable: true,
            color_mode: None,
            xy: None,
            ct: None,
            effect: None,
            effects: Vec::new(),
            effect_v2: None,
            effects_v2: Vec::new(),
            supports_color,
            supports_ct: false,
            ct_min: None,
            ct_max: None,
            gamut: None,
            model_id: None,
            product_name: None,
            type_name: None,
            sw_version: None,
            unique_id: None,
            function: None,
            powerup: None,
        }
    }

    fn app(id: &str, microphone: bool, camera: bool) -> CaptureApp {
        CaptureApp {
            id: id.into(),
            name: id.into(),
            microphone,
            camera,
        }
    }

    const RED: Write = Write::Color {
        xy: [0.675, 0.322],
        brightness: 100.0,
    };

    #[test]
    fn on_air_colours_what_can_show_colour() {
        let (body, applied) = RED.body_for(&light(false, Some(20.0), true)).unwrap();
        assert_eq!(
            body,
            json!({
                "on": { "on": true },
                "dimming": { "brightness": 100.0 },
                "color": { "xy": { "x": 0.675, "y": 0.322 } }
            })
        );
        assert_eq!(applied.brightness, Some(100.0));

        let (white, _) = RED.body_for(&light(true, Some(20.0), false)).unwrap();
        assert!(white.get("color").is_none());

        let (plug, applied) = RED.body_for(&light(false, None, false)).unwrap();
        assert_eq!(plug, json!({ "on": { "on": true } }));
        assert_eq!(applied.brightness, None);
    }

    #[test]
    fn away_leaves_alone_what_needs_nothing() {
        assert!(Write::Off
            .body_for(&light(false, Some(50.0), true))
            .is_none());
        assert!(Write::Off
            .body_for(&light(true, Some(50.0), true))
            .is_some());

        assert!(Write::Dim(10.0)
            .body_for(&light(true, Some(5.0), true))
            .is_none());
        assert!(Write::Dim(10.0)
            .body_for(&light(false, Some(80.0), true))
            .is_none());
        assert!(Write::Dim(10.0)
            .body_for(&light(true, None, false))
            .is_none());
        let (body, _) = Write::Dim(10.0)
            .body_for(&light(true, Some(80.0), true))
            .unwrap();
        assert_eq!(body, json!({ "dimming": { "brightness": 10.0 } }));
    }

    #[test]
    fn ignored_apps_and_the_trigger_decide_what_counts_as_a_call() {
        let apps = [
            app("Zoom", true, true),
            app("OBS", true, false),
            app("Camera", false, true),
        ];
        let mut on_air = OnAirSettings::default();
        assert_eq!(calling_apps(&apps, &on_air), ["Camera", "OBS", "Zoom"]);

        on_air.ignored_apps = vec!["OBS".into()];
        assert_eq!(calling_apps(&apps, &on_air), ["Camera", "Zoom"]);

        on_air.trigger = OnAirTrigger::Microphone;
        assert_eq!(calling_apps(&apps, &on_air), ["Zoom"]);

        on_air.trigger = OnAirTrigger::Camera;
        assert_eq!(calling_apps(&apps, &on_air), ["Camera", "Zoom"]);
    }

    #[test]
    fn unlocking_ends_a_sleep_that_never_reported_waking() {
        let mut worker = Worker::default();
        worker.observe(Signal::Suspended(true));
        worker.observe(Signal::Locked(true));
        worker.observe(Signal::Locked(false));
        assert!(!worker.locked && !worker.suspended);
    }
}
