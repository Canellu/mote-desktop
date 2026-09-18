//! Runs the on-air light and the away automation.
//!
//! One task makes every automation's light changes, so the two can hold the
//! same lights without fighting: Windows' lock and sleep signals and a poll of
//! microphone and camera use are handled one at a time, in the order they
//! arrived. What each automation changed is kept in a [`LayerStack`].

use std::collections::HashMap;
use std::sync::{OnceLock, RwLock};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
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
    self, effective_targets, AutomationScene, AutomationSettings, AutomationTarget, AwayAction,
    OnAirMode, OnAirSettings, OnAirTrigger, TargetKind,
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

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PreviewRule {
    OnAir,
    Away,
}

impl AutomationRuntime {
    pub async fn preview(
        &self,
        app: &AppHandle,
        rule: Option<PreviewRule>,
        mut settings: AutomationSettings,
    ) -> Result<(), String> {
        let mut worker = self.worker.lock().await;
        let Some(rule) = rule else {
            worker.preview_expires = None;
            if let Some(restore) = worker.stack.remove(LayerKind::Preview) {
                worker.restore_or_retry(restore).await;
            }
            worker.reconcile(app, &self.settings()).await;
            return Ok(());
        };
        match rule {
            PreviewRule::OnAir => settings.on_air.enabled = true,
            PreviewRule::Away => settings.away.enabled = true,
        }
        settings.validate()?;
        crate::commands::entitlements::require(app, Capability::LocalAutomation)?;
        if worker.locked || worker.suspended {
            return Err("Unlock this PC to preview lighting.".into());
        }
        let [on_air, away] = worker.plans(&settings);
        let mut plan = match rule {
            PreviewRule::OnAir => on_air,
            PreviewRule::Away => away,
        };
        plan.kind = LayerKind::Preview;
        plan.config = json!([
            match rule {
                PreviewRule::OnAir => "onAir",
                PreviewRule::Away => "away",
            },
            plan.config
        ]);
        plan.wanted = true;
        plan.restore = true;
        worker.preview_expires = Some(Instant::now() + Duration::from_secs(15));
        if worker
            .stack
            .get(LayerKind::Preview)
            .is_some_and(|layer| layer.config == plan.config)
        {
            return Ok(());
        }
        let previous = worker.stack.remove(LayerKind::Preview);
        let result = worker.start_layer(app, &plan, previous.as_ref()).await;
        if let Some(mut previous) = previous {
            if let Some(next) = worker.stack.get_mut(LayerKind::Preview) {
                carry_preview_snapshots(&mut previous, next);
            }
            worker.restore_or_retry(previous).await;
        }
        result
    }
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
            if let Some(restore) = worker.stack.remove(LayerKind::Preview) {
                let _ = write_restore(&restore).await;
            }
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
    White { mirek: u16, brightness: f64 },
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
                        xy: light.supports_color.then_some(xy),
                        mirek: None,
                    },
                ))
            }
            Self::White { mirek, brightness } => {
                let mut body = json!({ "on": { "on": true } });
                if dimmable {
                    body["dimming"] = json!({ "brightness": brightness });
                }
                let mirek = light
                    .supports_ct
                    .then(|| mirek.clamp(light.ct_min.unwrap_or(153), light.ct_max.unwrap_or(500)));
                if let Some(mirek) = mirek {
                    body["color_temperature"] = json!({ "mirek": mirek });
                }
                Some((
                    body,
                    Applied {
                        on: true,
                        brightness: dimmable.then_some(brightness),
                        xy: None,
                        mirek,
                    },
                ))
            }
            Self::Off => light.is_on.then(|| {
                (
                    json!({ "on": { "on": false } }),
                    Applied {
                        on: false,
                        brightness: None,
                        xy: None,
                        mirek: None,
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
                            xy: None,
                            mirek: None,
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
    targets: Vec<AutomationTarget>,
    scene: Option<AutomationScene>,
    scene_brightness: Option<f64>,
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
    preview_expires: Option<Instant>,
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
        if self.stack.get(LayerKind::Preview).is_some() {
            if !self.locked
                && !self.suspended
                && self.preview_expires.is_some_and(|at| Instant::now() < at)
            {
                return;
            }
            if let Some(restore) = self.stack.remove(LayerKind::Preview) {
                self.restore_or_retry(restore).await;
            }
        }
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
                    on_air.targets,
                    on_air.mode,
                    on_air.color,
                    on_air.xy,
                    on_air.mirek,
                    on_air.scene,
                    on_air.brightness
                ]),
                bridge_id: on_air.bridge_id.clone(),
                targets: effective_targets(&on_air.targets, &on_air.target)
                    .into_iter()
                    .cloned()
                    .collect(),
                scene: (on_air.mode == OnAirMode::Scene)
                    .then(|| on_air.scene.clone())
                    .flatten(),
                scene_brightness: Some(on_air.brightness),
                write: match on_air.mode {
                    OnAirMode::White => Write::White {
                        mirek: on_air.mirek,
                        brightness: on_air.brightness,
                    },
                    _ => Write::Color {
                        xy: on_air.xy.unwrap_or_else(|| on_air.color.xy()),
                        brightness: on_air.brightness,
                    },
                },
                restore: true,
            },
            Plan {
                kind: LayerKind::Away,
                wanted: away.enabled && (self.locked || (away.include_sleep && self.suspended)),
                config: json!([
                    away.bridge_id,
                    away.target,
                    away.targets,
                    away.action,
                    away.scene,
                    away.dim_brightness
                ]),
                bridge_id: away.bridge_id.clone(),
                targets: effective_targets(&away.targets, &away.target)
                    .into_iter()
                    .cloned()
                    .collect(),
                scene: (away.action == AwayAction::Scene)
                    .then(|| away.scene.clone())
                    .flatten(),
                scene_brightness: None,
                write: match away.action {
                    AwayAction::Off | AwayAction::Scene => Write::Off,
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

        match self.start_layer(app, &plan, None).await {
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

    async fn start_layer(
        &mut self,
        app: &AppHandle,
        plan: &Plan,
        preview_base: Option<&Restore>,
    ) -> Result<(), String> {
        let Some(bridge_id) = &plan.bridge_id else {
            return Err("Choose lights for this automation.".to_string());
        };
        let client = HueClient::new()?;
        let bridge = client.get_stored_bridge(app)?;
        if &bridge.bridge_id != bridge_id {
            return Err("Switch to the bridge this automation was set up on.".to_string());
        }
        let application_key = client.get_stored_application_key(app)?;
        let ip = bridge.bridge_ip;

        let mut members = Vec::new();
        let mut scene_actions = HashMap::new();
        if let Some(scene) = &plan.scene {
            let resource = client
                .get_resource(&ip, &application_key, "scene", Some(&scene.id))
                .await?
                .into_iter()
                .next()
                .ok_or("This scene no longer exists on the bridge.")?;
            if let Some(actions) = resource["actions"].as_array() {
                for entry in actions {
                    if entry["target"]["rtype"] == "light" {
                        if let Some(id) = entry["target"]["rid"].as_str() {
                            members.push(id.to_string());
                            scene_actions.insert(id.to_string(), entry["action"].clone());
                        }
                    }
                }
            }
        } else {
            for target in &plan.targets {
                members.extend(member_light_ids(&client, &ip, &application_key, target).await?);
            }
        }
        let lights: Vec<HueLight> = client
            .get_lights(&ip, &application_key)
            .await?
            .into_iter()
            .filter(|light| light.reachable && members.contains(&light.id))
            .collect();
        if lights.is_empty() {
            return Err("None of the selected lights can be reached.".into());
        }

        let mut owned = Vec::new();
        let mut failures = 0usize;
        for light in &lights {
            let write = match scene_actions.get(&light.id) {
                Some(action) => scene_body_for(action, light, plan.scene_brightness),
                None if plan.kind == LayerKind::Preview => {
                    preview_body_for(plan.write, light, preview_base)
                }
                None => plan.write.body_for(light),
            };
            let Some((mut body, applied)) = write else {
                continue;
            };
            if !owned.is_empty() || failures > 0 {
                tokio::time::sleep(WRITE_INTERVAL).await;
            }
            body["dynamics"] = json!({ "duration": 0 });
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
            return Err("The selected lights could not be changed.".into());
        }

        // Read the bridge's clamped values before comparing later external edits.
        if let Ok(current) = client.get_lights(&ip, &application_key).await {
            for owned in &mut owned {
                if let Some(now) = current.iter().find(|light| light.id == owned.before.id) {
                    if owned.applied.on {
                        // Restoring brightness also restores color, so protect
                        // manual color changes even for a dim-only automation.
                        owned.applied.xy = (now.color_mode.as_deref() != Some("ct"))
                            .then_some(now.xy)
                            .flatten();
                        owned.applied.mirek = (now.color_mode.as_deref() == Some("ct"))
                            .then_some(now.ct)
                            .flatten();
                    }
                }
            }
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
                "{failures} of the selected lights could not be changed."
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

fn preview_body_for(
    write: Write,
    light: &HueLight,
    previous: Option<&Restore>,
) -> Option<(Value, Applied)> {
    let baseline = previous
        .and_then(|restore| {
            restore.lights.iter().find(|owned| {
                owned.before.id == light.id
                    && layers::unchanged(light.is_on, light.brightness, owned.applied)
                    && (!light.is_on
                        || layers::unchanged_color(
                            light.xy,
                            light.ct,
                            light.color_mode.as_deref(),
                            owned.applied,
                        ))
            })
        })
        .map(|owned| &owned.before);
    match write {
        Write::Off => Some((
            json!({ "on": { "on": false } }),
            Applied {
                on: false,
                brightness: None,
                xy: None,
                mirek: None,
            },
        )),
        Write::Dim(level) => {
            let on = baseline.map_or(light.is_on, |before| before.on);
            let brightness = baseline
                .map_or(light.brightness, |before| before.brightness)
                .map(|value| value.min(level));
            let mut body = json!({ "on": { "on": on } });
            if let Some(brightness) = brightness {
                body["dimming"] = json!({ "brightness": brightness });
            }
            // A different preview may have colored this light. Dim the
            // original look, preserving whichever color mode was active.
            let mirek = baseline
                .filter(|before| light.supports_ct && before.color_mode.as_deref() == Some("ct"))
                .and_then(|before| before.mirek);
            let xy = baseline
                .filter(|before| light.supports_color && before.color_mode.as_deref() != Some("ct"))
                .and_then(|before| before.xy);
            if let Some(mirek) = mirek {
                body["color_temperature"] = json!({ "mirek": mirek });
            }
            if let Some(xy) = xy {
                body["color"] = json!({ "xy": { "x": xy[0], "y": xy[1] } });
            }
            Some((
                body,
                Applied {
                    on,
                    brightness,
                    xy,
                    mirek,
                },
            ))
        }
        _ => write.body_for(light),
    }
}

fn carry_preview_snapshots(previous: &mut Restore, next: &mut Layer) {
    if previous.bridge.bridge_id != next.bridge.bridge_id {
        return;
    }
    previous.lights.retain(|old| {
        let Some(new) = next
            .lights
            .iter_mut()
            .find(|light| light.before.id == old.before.id)
        else {
            return true;
        };
        if layers::unchanged(new.before.on, new.before.brightness, old.applied)
            && (!new.before.on
                || layers::unchanged_color(
                    new.before.xy,
                    new.before.mirek,
                    new.before.color_mode.as_deref(),
                    old.applied,
                ))
        {
            new.before = old.before.clone();
        }
        false
    });
}

/// Only reversible static scene properties; effects/gradients need richer snapshots.
fn scene_body_for(
    action: &Value,
    light: &HueLight,
    brightness_scale: Option<f64>,
) -> Option<(Value, Applied)> {
    let mut body = json!({});
    let on = action["on"]["on"].as_bool().unwrap_or(light.is_on);
    body["on"] = json!({ "on": on });
    let brightness = light
        .brightness
        .and_then(|_| action["dimming"]["brightness"].as_f64())
        .map(|level| (level * brightness_scale.unwrap_or(100.0) / 100.0).clamp(0.0, 100.0));
    if let Some(brightness) = brightness {
        body["dimming"] = json!({ "brightness": brightness });
    }
    let mirek = light
        .supports_ct
        .then(|| action["color_temperature"]["mirek"].as_u64())
        .flatten()
        .map(|value| {
            (value.min(1000) as u16).clamp(light.ct_min.unwrap_or(153), light.ct_max.unwrap_or(500))
        });
    let xy = if light.supports_color && mirek.is_none() {
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
    if let Some(xy) = xy {
        body["color"] = json!({ "xy": { "x": xy[0], "y": xy[1] } });
    }
    Some((
        body,
        Applied {
            on,
            brightness,
            xy,
            mirek,
        },
    ))
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
                    && (!light.is_on
                        || layers::unchanged_color(
                            light.xy,
                            light.ct,
                            light.color_mode.as_deref(),
                            owned.applied,
                        ))
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

    #[test]
    fn white_obeys_fixture_temperature_range() {
        let mut fixture = light(false, Some(20.0), true);
        fixture.supports_ct = true;
        fixture.ct_min = Some(153);
        fixture.ct_max = Some(454);
        let (body, applied) = Write::White {
            mirek: 500,
            brightness: 65.0,
        }
        .body_for(&fixture)
        .unwrap();
        assert_eq!(body["color_temperature"]["mirek"], 454);
        assert_eq!(applied.mirek, Some(454));
    }

    #[test]
    fn scene_uses_static_action_and_scales_brightness() {
        let action = json!({ "on": { "on": true }, "dimming": { "brightness": 80 }, "color": { "xy": { "x": 0.3, "y": 0.4 } }, "effects": { "effect": "candle" } });
        let (body, applied) =
            scene_body_for(&action, &light(false, Some(20.0), true), Some(50.0)).unwrap();
        assert_eq!(body["dimming"]["brightness"], 40.0);
        assert_eq!(applied.xy, Some([0.3, 0.4]));
        assert!(body.get("effects").is_none());
    }

    #[test]
    fn preview_changes_keep_original_and_allow_dim_to_increase() {
        let before = snapshot_of(&light(true, Some(80.0), true));
        let bridge = BridgeAccess {
            bridge_id: "bridge".into(),
            ip: "ip".into(),
            application_key: "key".into(),
        };
        let applied = Applied {
            on: true,
            brightness: Some(10.0),
            xy: None,
            mirek: None,
        };
        let mut previous = Restore {
            bridge: bridge.clone(),
            lights: vec![OwnedLight {
                before: before.clone(),
                applied,
            }],
        };
        let current = light(true, Some(10.0), true);
        let (_, next_applied) =
            preview_body_for(Write::Dim(40.0), &current, Some(&previous)).unwrap();
        assert_eq!(next_applied.brightness, Some(40.0));
        let mut next = Layer {
            kind: LayerKind::Preview,
            bridge,
            config: Value::Null,
            lights: vec![OwnedLight {
                before: snapshot_of(&current),
                applied: next_applied,
            }],
        };
        carry_preview_snapshots(&mut previous, &mut next);
        assert!(previous.lights.is_empty());
        assert_eq!(next.lights[0].before.brightness, Some(80.0));
    }

    #[test]
    fn manual_color_edits_are_not_restored_over() {
        let applied = Applied {
            on: true,
            brightness: Some(50.0),
            xy: Some([0.3, 0.4]),
            mirek: None,
        };
        assert!(layers::unchanged_color(
            Some([0.301, 0.399]),
            None,
            Some("xy"),
            applied
        ));
        assert!(!layers::unchanged_color(
            Some([0.6, 0.3]),
            None,
            Some("xy"),
            applied
        ));
        assert!(!layers::unchanged_color(
            Some([0.3, 0.4]),
            Some(366),
            Some("ct"),
            applied
        ));
    }

    #[test]
    fn dim_preview_restores_original_color_or_white_after_color_preview() {
        for mode in ["xy", "ct"] {
            let mut original = light(true, Some(80.0), true);
            original.supports_ct = true;
            original.color_mode = Some(mode.into());
            original.xy = Some([0.3, 0.4]);
            original.ct = Some(366);
            let mut current = original.clone();
            current.color_mode = Some("xy".into());
            current.xy = Some([0.675, 0.322]);
            current.ct = None;
            current.brightness = Some(100.0);
            let previous = Restore {
                bridge: BridgeAccess {
                    bridge_id: "bridge".into(),
                    ip: "ip".into(),
                    application_key: "key".into(),
                },
                lights: vec![OwnedLight {
                    before: snapshot_of(&original),
                    applied: Applied {
                        on: true,
                        brightness: Some(100.0),
                        xy: current.xy,
                        mirek: None,
                    },
                }],
            };
            let (body, applied) =
                preview_body_for(Write::Dim(30.0), &current, Some(&previous)).unwrap();
            assert_eq!(body["dimming"]["brightness"], 30.0);
            if mode == "ct" {
                assert_eq!(body["color_temperature"]["mirek"], 366);
                assert!(body.get("color").is_none());
                assert_eq!(applied.mirek, Some(366));
            } else {
                assert_eq!(body["color"]["xy"], json!({ "x": 0.3, "y": 0.4 }));
                assert!(body.get("color_temperature").is_none());
                assert_eq!(applied.xy, original.xy);
            }
        }
    }
}
