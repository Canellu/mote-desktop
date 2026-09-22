//! Presence: the household's phones on the home Wi-Fi decide when everyone
//! has left and when someone is back.
//!
//! Every 30 seconds each phone the person added is asked whether it is there
//! (see [`presence_probe`]). A phone is known by its Wi-Fi hardware address,
//! so when the router gives it a new IP it is found again on the network and
//! followed (see [`presence_scan`]). The household counts
//! as away once no phone has answered for ten uninterrupted minutes, and as
//! back after two answers in a row. Leaving turns off the lights chosen for it;
//! coming back sets a scene. Both are one-time changes handed to the runtime
//! as `Presence`, so they respect the priority order like every automation.
//!
//! Sleep, a lost network, or a long pause in polling never counts as absence:
//! they start a fresh grace period instead. The Hue Bridge doubles as the
//! control: if it does not answer either, the network is down, not the phones.

use std::net::Ipv4Addr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_store::StoreExt;
use tokio::sync::Notify;

use crate::services::entitlements::Capability;
use crate::services::hue_client::HueClient;

use super::looks::Write;
use super::presence_probe::{self, normalize_mac, parse_private_ipv4, Evidence};
use super::presence_scan;
use super::priority::Source;
use super::resolve::{resolve, ClaimSpec, Looks};
use super::runtime;
use super::settings::{AutomationScene, AutomationTarget};

const STORE_FILE: &str = "presence.json";
const SETTINGS_KEY: &str = "settings";
const STATE_KEY: &str = "state";
const STATUS_EVENT: &str = "presence-status";
const SETTINGS_EVENT: &str = "presence-settings";
/// At most this often the whole network is asked where a missing phone went.
const SWEEP_EVERY: Duration = Duration::from_secs(120);
pub const POLL_INTERVAL: Duration = Duration::from_secs(30);
pub const AWAY_AFTER: Duration = Duration::from_secs(600);
/// Answers in a row before a return counts, so one stray reply does not.
const ARRIVAL_CONFIRMATIONS: u32 = 2;
/// Polls further apart than this mean the PC slept or stalled.
const GAP: Duration = Duration::from_secs(90);
const DEPARTURE_RETRY: Duration = Duration::from_secs(60);
const ARRIVAL_RETRY_WINDOW: Duration = Duration::from_secs(120);
const ARRIVAL_RETRY: Duration = Duration::from_secs(20);
const MAX_DEVICES: usize = 10;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PresenceDevice {
    pub id: String,
    pub name: String,
    /// A fixed private IPv4 address, reserved for the phone on the router.
    pub ip: String,
    /// The phone's Wi-Fi address on this network, to be sure it is that phone.
    pub mac: Option<String>,
    pub enabled: bool,
}

impl Default for PresenceDevice {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            ip: String::new(),
            mac: None,
            enabled: true,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PresenceSettings {
    pub enabled: bool,
    /// The bridge the scene and lights belong to.
    pub bridge_id: Option<String>,
    pub devices: Vec<PresenceDevice>,
    /// Set when the first phone comes back.
    pub arrival_scene: Option<AutomationScene>,
    /// Turned off when the last phone leaves.
    pub departure_targets: Vec<AutomationTarget>,
}

impl PresenceSettings {
    /// Refuses what the interface should never send, and tidies addresses.
    /// Saving is free; the actions are what `local_automation` gates.
    pub fn normalized(mut self) -> Result<Self, String> {
        if self.devices.len() > MAX_DEVICES {
            return Err(format!("Add at most {MAX_DEVICES} phones."));
        }
        for device in &mut self.devices {
            device.name = device.name.trim().to_string();
            if device.id.is_empty() || device.id.len() > 120 {
                return Err("This phone could not be saved.".into());
            }
            if device.name.is_empty() || device.name.len() > 60 {
                return Err("Give each phone a name.".into());
            }
            let ip = parse_private_ipv4(&device.ip).ok_or_else(|| {
                format!(
                    "{}: enter the phone's home network address, like 192.168.1.42.",
                    device.name
                )
            })?;
            device.ip = ip.to_string();
            device.mac = match device.mac.as_deref().map(str::trim) {
                None | Some("") => None,
                Some(mac) => Some(normalize_mac(mac).ok_or_else(|| {
                    format!(
                        "{}: enter the Wi-Fi address like aa:bb:cc:dd:ee:ff, or leave it empty.",
                        device.name
                    )
                })?),
            };
        }
        if self.departure_targets.len() > 100
            || self.departure_targets.iter().any(|target| {
                target.id.is_empty() || target.id.len() > 512 || target.name.len() > 512
            })
        {
            return Err("Choose the lights to turn off again.".into());
        }
        let has_action = self.arrival_scene.is_some() || !self.departure_targets.is_empty();
        if has_action && self.bridge_id.as_deref().is_none_or(str::is_empty) {
            return Err("Choose the scene and lights again.".into());
        }
        if self.enabled {
            if !self.devices.iter().any(|device| device.enabled) {
                return Err("Add a phone before turning on presence.".into());
            }
            if !has_action {
                return Err(
                    "Choose a scene for coming home or lights to turn off when everyone leaves."
                        .into(),
                );
            }
        }
        Ok(self)
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Occupancy {
    /// Just started, or just enabled: not yet sure either way.
    #[default]
    Unknown,
    Home,
    Away,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Transition {
    Arrived,
    Left,
}

/// Decides home and away from poll results. Pure, so it runs on a fake clock.
#[derive(Debug, Clone, Default)]
pub struct Detector {
    pub occupancy: Occupancy,
    absent_since: Option<Instant>,
    positives: u32,
    last_poll: Option<Instant>,
}

impl Detector {
    /// Starts from the last settled state, so a restart repeats nothing.
    pub fn new(occupancy: Occupancy) -> Self {
        Self {
            occupancy,
            ..Self::default()
        }
    }

    /// Sleep, a lost network, or a stalled poll: absence counts from now.
    pub fn restart_grace(&mut self, now: Instant) {
        if self.absent_since.is_some() {
            self.absent_since = Some(now);
        }
        self.positives = 0;
    }

    /// When the household will count as away if nobody answers before then.
    pub fn away_at(&self) -> Option<Instant> {
        match self.occupancy {
            Occupancy::Away => None,
            _ => self.absent_since.map(|since| since + AWAY_AFTER),
        }
    }

    /// One poll: whether any phone answered, and whether a phone answered
    /// with somebody else's hardware address, which pauses leaving.
    pub fn observe(&mut self, now: Instant, seen: bool, conflict: bool) -> Option<Transition> {
        if self
            .last_poll
            .is_some_and(|last| now.saturating_duration_since(last) > GAP)
        {
            self.restart_grace(now);
        }
        self.last_poll = Some(now);
        if conflict {
            self.absent_since = None;
            self.positives = 0;
            return None;
        }
        match self.occupancy {
            Occupancy::Unknown | Occupancy::Home if seen => {
                // First sight after starting is not a return: nothing ran to
                // undo, so no scene is set.
                self.occupancy = Occupancy::Home;
                self.absent_since = None;
                None
            }
            Occupancy::Unknown | Occupancy::Home => {
                let since = *self.absent_since.get_or_insert(now);
                if now.saturating_duration_since(since) >= AWAY_AFTER {
                    self.occupancy = Occupancy::Away;
                    self.absent_since = None;
                    Some(Transition::Left)
                } else {
                    None
                }
            }
            Occupancy::Away if seen => {
                self.positives += 1;
                if self.positives >= ARRIVAL_CONFIRMATIONS {
                    self.occupancy = Occupancy::Home;
                    self.positives = 0;
                    Some(Transition::Arrived)
                } else {
                    None
                }
            }
            Occupancy::Away => {
                self.positives = 0;
                None
            }
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceStatus {
    pub id: String,
    pub seen: bool,
    /// "neighbor" or "ping".
    pub evidence: Option<&'static str>,
    pub last_seen_at: Option<u64>,
    /// It answered with a different Wi-Fi address than the one entered.
    pub conflict: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ActionKind {
    Arrival,
    Departure,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionRecord {
    pub kind: ActionKind,
    pub at: u64,
    /// Lights that could not be changed.
    pub failed: usize,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresenceStatus {
    pub running: bool,
    pub occupancy: Occupancy,
    pub devices: Vec<DeviceStatus>,
    /// Wall-clock milliseconds at which the household counts as away if no
    /// phone answers first.
    pub away_at: Option<u64>,
    /// False while the Hue Bridge does not answer either: the network is down,
    /// so nobody is counted as gone.
    pub network: bool,
    pub last_action: Option<ActionRecord>,
}

fn epoch_ms(at: SystemTime) -> u64 {
    at.duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn load_settings<R: Runtime>(app: &AppHandle<R>) -> PresenceSettings {
    app.store(STORE_FILE)
        .ok()
        .and_then(|store| store.get(SETTINGS_KEY))
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default()
}

pub fn save_settings<R: Runtime>(
    app: &AppHandle<R>,
    settings: &PresenceSettings,
) -> Result<(), String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|_| "Failed to open presence settings.".to_string())?;
    store.set(
        SETTINGS_KEY,
        serde_json::to_value(settings).map_err(|_| "Presence settings are invalid.".to_string())?,
    );
    store
        .save()
        .map_err(|_| "Failed to save presence settings.".to_string())
}

fn load_occupancy<R: Runtime>(app: &AppHandle<R>) -> Occupancy {
    app.store(STORE_FILE)
        .ok()
        .and_then(|store| store.get(STATE_KEY))
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default()
}

fn save_occupancy<R: Runtime>(app: &AppHandle<R>, occupancy: Occupancy) {
    if let Ok(store) = app.store(STORE_FILE) {
        if let Ok(value) = serde_json::to_value(occupancy) {
            store.set(STATE_KEY, value);
            let _ = store.save();
        }
    }
}

/// The presence task's shared state.
#[derive(Default)]
pub struct PresenceService {
    settings: Mutex<PresenceSettings>,
    status: Mutex<PresenceStatus>,
    wake: Notify,
}

static SUSPENDED: AtomicBool = AtomicBool::new(false);
static STARTED: OnceLock<()> = OnceLock::new();

/// Sleep and wake, from the window that hears them. Never blocks.
pub fn set_suspended(suspended: bool) {
    SUSPENDED.store(suspended, Ordering::SeqCst);
}

impl PresenceService {
    pub fn settings(&self) -> PresenceSettings {
        self.settings
            .lock()
            .expect("presence lock poisoned")
            .clone()
    }

    pub fn status(&self) -> PresenceStatus {
        self.status.lock().expect("presence lock poisoned").clone()
    }

    pub fn set_settings(&self, settings: PresenceSettings) {
        *self.settings.lock().expect("presence lock poisoned") = settings;
        self.wake.notify_one();
    }

    fn publish<R: Runtime>(&self, app: &AppHandle<R>, next: PresenceStatus) {
        {
            let mut status = self.status.lock().expect("presence lock poisoned");
            if *status == next {
                return;
            }
            *status = next.clone();
        }
        let _ = app.emit(STATUS_EVENT, next);
    }
}

/// Probes one address off the async runtime.
pub async fn probe(ip: Ipv4Addr) -> presence_probe::Probe {
    tauri::async_runtime::spawn_blocking(move || presence_probe::probe(ip))
        .await
        .unwrap_or(presence_probe::Probe {
            seen: None,
            mac: None,
        })
}

/// Runs the departure or arrival action now. Returns the lights that could
/// not be changed.
pub async fn run_action(
    app: &AppHandle,
    settings: &PresenceSettings,
    kind: &ActionKind,
) -> Result<usize, String> {
    crate::commands::entitlements::require(app, Capability::LocalAutomation)?;
    let spec = match kind {
        ActionKind::Departure => {
            if settings.departure_targets.is_empty() {
                return Ok(0);
            }
            ClaimSpec::Lights {
                bridge_id: settings.bridge_id.clone(),
                targets: settings.departure_targets.clone(),
                looks: Looks::Uniform(Write::Off),
            }
        }
        ActionKind::Arrival => {
            let Some(scene) = &settings.arrival_scene else {
                return Ok(0);
            };
            ClaimSpec::Scene {
                bridge_id: settings.bridge_id.clone(),
                scene_id: Some(scene.id.clone()),
                scale: None,
            }
        }
    };
    let lights = resolve(app, &spec).await?;
    runtime::one_shot(app, Source::Presence, lights).await
}

/// Remembers the new addresses of phones found elsewhere on the network, and
/// tells the interface.
fn follow(app: &AppHandle, moved: &[(String, Ipv4Addr)]) {
    let Some(service) = app.try_state::<PresenceService>() else {
        return;
    };
    let mut settings = service.settings();
    for device in &mut settings.devices {
        if let Some((_, ip)) = moved.iter().find(|(id, _)| id == &device.id) {
            device.ip = ip.to_string();
        }
    }
    if save_settings(app, &settings).is_ok() {
        *service.settings.lock().expect("presence lock poisoned") = settings.clone();
        let _ = app.emit(SETTINGS_EVENT, settings);
    }
}

/// Everything on the home network, for picking phones from.
pub async fn scan<R: Runtime>(app: &AppHandle<R>) -> Vec<presence_scan::FoundDevice> {
    let bridge_ip = HueClient::new()
        .ok()
        .and_then(|client| client.get_stored_bridge(app).ok())
        .and_then(|bridge| bridge.bridge_ip.parse::<Ipv4Addr>().ok());
    tauri::async_runtime::spawn_blocking(move || presence_scan::scan(bridge_ip))
        .await
        .unwrap_or_default()
}

/// Loads the saved settings and starts the presence task.
pub fn start(app: &AppHandle) {
    let Some(service) = app.try_state::<PresenceService>() else {
        return;
    };
    if STARTED.set(()).is_err() {
        return;
    }
    *service.settings.lock().expect("presence lock poisoned") = load_settings(app);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut detector = Detector::new(load_occupancy(&app));
        let mut last_seen: Vec<(String, u64)> = Vec::new();
        let mut last_action: Option<ActionRecord> = None;
        // A failed action and when to try it again.
        let mut retry: Option<(ActionKind, Instant, Instant)> = None;
        let mut was_suspended = false;
        let mut last_sweep: Option<Instant> = None;
        let mut last_wall = SystemTime::now();
        loop {
            let service = app.state::<PresenceService>();
            let settings = service.settings();
            let enabled_devices: Vec<PresenceDevice> = settings
                .devices
                .iter()
                .filter(|device| device.enabled)
                .cloned()
                .collect();
            if !settings.enabled || enabled_devices.is_empty() {
                detector = Detector::new(Occupancy::Unknown);
                retry = None;
                service.publish(
                    &app,
                    PresenceStatus {
                        last_action: last_action.clone(),
                        network: true,
                        ..PresenceStatus::default()
                    },
                );
                service.wake.notified().await;
                continue;
            }

            let now = Instant::now();
            let suspended = SUSPENDED.load(Ordering::SeqCst);
            // A wall clock that jumped further than the monotonic one means the
            // PC slept without saying so.
            let wall_gap = SystemTime::now()
                .duration_since(last_wall)
                .unwrap_or_default();
            last_wall = SystemTime::now();
            if suspended || was_suspended || wall_gap > GAP {
                detector.restart_grace(now);
            }
            was_suspended = suspended;

            let mut devices = Vec::new();
            let mut network = true;
            if !suspended {
                // The bridge is always home: if it is silent, so is the network.
                if let Some(bridge_ip) = HueClient::new()
                    .ok()
                    .and_then(|client| client.get_stored_bridge(&app).ok())
                    .and_then(|bridge| bridge.bridge_ip.parse::<Ipv4Addr>().ok())
                {
                    network = probe(bridge_ip).await.seen.is_some();
                }
                let mut results = Vec::new();
                for device in &enabled_devices {
                    let Ok(ip) = device.ip.parse::<Ipv4Addr>() else {
                        continue;
                    };
                    results.push((device, probe(ip).await));
                }
                // A phone known by its Wi-Fi address that did not answer where
                // it was, or something else answered there, is looked for: the
                // router may have given it a new address.
                let lost: Vec<String> = results
                    .iter()
                    .filter_map(|(device, result)| {
                        let mac = device.mac.as_ref()?;
                        (result.seen.is_none()
                            || result.mac.as_ref().is_some_and(|found| found != mac))
                        .then(|| mac.clone())
                    })
                    .collect();
                let mut moved: Vec<(String, Ipv4Addr)> = Vec::new();
                if !lost.is_empty() {
                    let sweep_network =
                        last_sweep.is_none_or(|at: Instant| at.elapsed() >= SWEEP_EVERY);
                    if sweep_network {
                        last_sweep = Some(Instant::now());
                    }
                    let found = tauri::async_runtime::spawn_blocking(move || {
                        presence_scan::locate_all(&lost, sweep_network)
                    })
                    .await
                    .unwrap_or_default();
                    for (device, result) in &mut results {
                        let Some(mac) = &device.mac else {
                            continue;
                        };
                        if let Some(ip) = found.get(mac) {
                            if device.ip != ip.to_string() {
                                moved.push((device.id.clone(), *ip));
                            }
                            *result = presence_probe::Probe {
                                seen: Some(Evidence::Neighbor),
                                mac: Some(mac.clone()),
                            };
                        }
                    }
                }
                if !moved.is_empty() {
                    follow(&app, &moved);
                }
                for (device, result) in results {
                    let conflict = matches!(
                        (&device.mac, &result.mac),
                        (Some(expected), Some(found)) if expected != found
                    );
                    let seen = result.seen.is_some() && !conflict;
                    if seen {
                        let at = epoch_ms(SystemTime::now());
                        match last_seen.iter_mut().find(|(id, _)| id == &device.id) {
                            Some(entry) => entry.1 = at,
                            None => last_seen.push((device.id.clone(), at)),
                        }
                    }
                    devices.push(DeviceStatus {
                        id: device.id.clone(),
                        seen,
                        evidence: result.seen.map(|evidence| match evidence {
                            Evidence::Neighbor => "neighbor",
                            Evidence::Ping => "ping",
                        }),
                        last_seen_at: last_seen
                            .iter()
                            .find(|(id, _)| id == &device.id)
                            .map(|(_, at)| *at),
                        conflict,
                    });
                }
            }

            let now = Instant::now();
            let transition = if suspended {
                None
            } else if !network {
                detector.restart_grace(now);
                None
            } else {
                let seen = devices.iter().any(|device| device.seen);
                let conflict = devices.iter().any(|device| device.conflict);
                detector.observe(now, seen, conflict)
            };
            if let Some(transition) = transition {
                save_occupancy(&app, detector.occupancy);
                let kind = match transition {
                    Transition::Arrived => ActionKind::Arrival,
                    Transition::Left => ActionKind::Departure,
                };
                retry = Some((kind, now, now));
            }
            // A pending action runs now or on its retry, until it lands, the
            // household changes its mind, or an arrival's window closes.
            if let Some((kind, started, at)) = retry.clone() {
                let still = match kind {
                    ActionKind::Departure => detector.occupancy == Occupancy::Away,
                    ActionKind::Arrival => {
                        detector.occupancy == Occupancy::Home
                            && now.saturating_duration_since(started) <= ARRIVAL_RETRY_WINDOW
                    }
                };
                if !still {
                    retry = None;
                } else if now >= at {
                    let outcome = run_action(&app, &settings, &kind).await;
                    let (failed, error) = match &outcome {
                        Ok(failed) => (*failed, None),
                        Err(error) => (0, Some(error.clone())),
                    };
                    let refused = error
                        .as_deref()
                        .is_some_and(|error| error.trim_start().starts_with('{'));
                    last_action = Some(ActionRecord {
                        kind: kind.clone(),
                        at: epoch_ms(SystemTime::now()),
                        failed,
                        error,
                    });
                    retry = if (failed > 0 || outcome.is_err()) && !refused {
                        let wait = match kind {
                            ActionKind::Departure => DEPARTURE_RETRY,
                            ActionKind::Arrival => ARRIVAL_RETRY,
                        };
                        Some((kind, started, now + wait))
                    } else {
                        None
                    };
                }
            }

            let wall = SystemTime::now();
            service.publish(
                &app,
                PresenceStatus {
                    running: true,
                    occupancy: detector.occupancy,
                    devices,
                    away_at: detector
                        .away_at()
                        .map(|at| epoch_ms(wall + at.saturating_duration_since(Instant::now()))),
                    network,
                    last_action: last_action.clone(),
                },
            );

            let wait = retry
                .as_ref()
                .map(|(_, _, at)| at.saturating_duration_since(Instant::now()))
                .unwrap_or(POLL_INTERVAL)
                .min(POLL_INTERVAL);
            tokio::select! {
                _ = tokio::time::sleep(wait) => {}
                _ = service.wake.notified() => {}
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::automations::settings::TargetKind;

    const POLL: Duration = POLL_INTERVAL;

    /// Polls every 30 s from `start`, returning what each poll decided.
    fn run(detector: &mut Detector, start: Instant, answers: &[bool]) -> Vec<Option<Transition>> {
        answers
            .iter()
            .enumerate()
            .map(|(index, seen)| detector.observe(start + POLL * index as u32, *seen, false))
            .collect()
    }

    #[test]
    fn everyone_leaves_after_ten_quiet_minutes() {
        let start = Instant::now();
        let mut detector = Detector::new(Occupancy::Home);
        let mut answers = vec![false; 20];
        answers.push(false);
        let decided = run(&mut detector, start, &answers);
        // Absent from the first poll; ten minutes later is the 21st poll.
        assert_eq!(decided[19], None);
        assert_eq!(decided[20], Some(Transition::Left));
        assert_eq!(detector.occupancy, Occupancy::Away);
    }

    #[test]
    fn a_single_answer_resets_the_countdown() {
        let start = Instant::now();
        let mut detector = Detector::new(Occupancy::Home);
        let mut answers = vec![false; 15];
        answers.push(true);
        answers.extend(vec![false; 15]);
        assert!(run(&mut detector, start, &answers)
            .iter()
            .all(Option::is_none));
        assert_eq!(detector.occupancy, Occupancy::Home);
    }

    #[test]
    fn coming_back_takes_two_answers_in_a_row() {
        let start = Instant::now();
        let mut detector = Detector::new(Occupancy::Away);
        let decided = run(&mut detector, start, &[true, false, true, true]);
        assert_eq!(decided, vec![None, None, None, Some(Transition::Arrived)]);
    }

    #[test]
    fn the_first_sighting_after_starting_sets_no_scene() {
        let start = Instant::now();
        let mut detector = Detector::new(Occupancy::Unknown);
        assert_eq!(run(&mut detector, start, &[true, true]), vec![None, None]);
        assert_eq!(detector.occupancy, Occupancy::Home);
    }

    #[test]
    fn a_long_gap_starts_a_fresh_grace_period() {
        let start = Instant::now();
        let mut detector = Detector::new(Occupancy::Home);
        run(&mut detector, start, &[false; 19]);
        // The PC slept for an hour: absence counts again from here.
        let back = start + POLL * 18 + Duration::from_secs(3600);
        assert_eq!(detector.observe(back, false, false), None);
        assert_eq!(detector.observe(back + POLL, false, false), None);
        assert_eq!(detector.occupancy, Occupancy::Home);
        assert!(detector.away_at().is_some_and(|at| at > back + POLL));
    }

    #[test]
    fn a_hardware_address_conflict_pauses_leaving() {
        let start = Instant::now();
        let mut detector = Detector::new(Occupancy::Home);
        for index in 0..40 {
            assert_eq!(
                detector.observe(start + POLL * index, false, index % 2 == 0),
                None
            );
        }
    }

    #[test]
    fn settings_are_tidied_and_checked() {
        let mut settings = PresenceSettings {
            enabled: true,
            bridge_id: Some("BRIDGE".into()),
            devices: vec![PresenceDevice {
                id: "phone".into(),
                name: " Alex's phone ".into(),
                ip: "192.168.1.42".into(),
                mac: Some("AA-BB-CC-DD-EE-FF".into()),
                enabled: true,
            }],
            arrival_scene: None,
            departure_targets: vec![AutomationTarget {
                kind: TargetKind::Room,
                id: "living".into(),
                name: "Living room".into(),
            }],
        };
        let tidy = settings.clone().normalized().unwrap();
        assert_eq!(tidy.devices[0].name, "Alex's phone");
        assert_eq!(tidy.devices[0].mac.as_deref(), Some("aa:bb:cc:dd:ee:ff"));

        settings.devices[0].ip = "8.8.8.8".into();
        assert!(settings.clone().normalized().is_err());
        settings.devices[0].ip = "192.168.1.42".into();
        settings.departure_targets.clear();
        assert!(settings.clone().normalized().is_err());
        settings.enabled = false;
        assert!(settings.normalized().is_ok());
    }

    #[test]
    fn ipc_names_are_camel_case() {
        let value = serde_json::to_value(PresenceSettings::default()).unwrap();
        assert!(value.get("departureTargets").is_some());
        assert!(value.get("arrivalScene").is_some());
        assert_eq!(serde_json::to_value(Occupancy::Away).unwrap(), "away");
    }
}
