//! Runs every automation's light changes.
//!
//! One task makes every automation write, so automations never fight over a
//! light: Windows' lock and sleep signals, PC Sync starting and stopping, and a
//! poll of microphone and camera use are handled one at a time, in the order
//! they arrived. [`Ownership`] decides what each light shows under the
//! person's priority order, and the [`Journal`] keeps what was changed so a
//! crash never strands a light.

use std::collections::{HashMap, HashSet};
use std::sync::{OnceLock, RwLock};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tokio::sync::{mpsc, Mutex};

use crate::services::entertainment::engine::{HostSyncEngine, StartSyncRequest};
use crate::services::entertainment::snapshot;
use crate::services::entitlements::Capability;
use crate::services::hue_client::{HueClient, HueLight};

use super::calendar::CalendarService;
use super::capture_use::{self, CaptureApp};
use super::focus::{self, FocusStatus, Session};
use super::journal::Journal;
use super::looks::{self, snapshot_of, Applied, Caps, Write};
use super::ownership::{ClaimedLight, LightKey, Op, Ownership, SyncHold};
use super::priority::{Holder, Ranking, Source};
use super::resolve::{resolve, ClaimSpec, Desire, Looks};
use super::settings::{
    self, effective_targets, AutomationSettings, AwayAction, OnAirMode, OnAirSettings, OnAirTrigger,
};

const STATUS_EVENT: &str = "automation-status";
const FOCUS_EVENT: &str = "focus-status";
const POLL_INTERVAL: Duration = Duration::from_secs(2);
/// Idle polls before the on-air light goes back, so moving a call from one app
/// to another does not flicker it.
const IDLE_POLLS_BEFORE_OFF: u32 = 2;
/// Wait before trying again after the bridge refused or could not be reached.
const RETRY_AFTER: Duration = Duration::from_secs(10);
const RESTORE_RETRY_INTERVAL: Duration = Duration::from_secs(5);
/// About a minute of quick retries, long enough for Wi-Fi to come back after
/// the PC wakes; after that a slower retry until it lands.
const RESTORE_QUICK_ATTEMPTS: u32 = 12;
const RESTORE_SLOW_INTERVAL: Duration = Duration::from_secs(60);
/// Spacing between light writes, inside the bridge's ~10 commands/second.
const WRITE_INTERVAL: Duration = Duration::from_millis(100);
const PREVIEW_LEASE: Duration = Duration::from_secs(15);
pub const EXIT_CLEANUP_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Signal {
    Locked(bool),
    Suspended(bool),
    SettingsChanged,
    /// PC Sync is about to stream to these lights.
    SyncStarted {
        bridge_id: String,
        light_ids: Vec<String>,
    },
    /// PC Sync stopped and has put back its own snapshot.
    SyncEnded,
    /// Somebody started or stopped PC Sync themselves, so a sync paused for an
    /// automation must not come back on its own.
    SyncByUser,
    /// Resuming a paused PC Sync failed.
    SyncResumeFailed(String),
    /// A consumer (focus, calendar, presence) changed what it wants.
    Wake,
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
pub struct PcSyncCoordination {
    /// The automation PC Sync was paused for; it resumes when that ends.
    pub paused_for: Option<Source>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationStatus {
    pub on_air: OnAirStatus,
    pub away: AwayStatus,
    /// Every app capturing now, ignored ones included, so they can be ignored.
    pub capture_apps: Vec<CaptureApp>,
    pub pc_sync: PcSyncCoordination,
    /// Lights waiting to go back because the bridge could not be reached,
    /// including ones an earlier run left changed.
    pub restoring: usize,
}

#[derive(Default)]
struct FocusState {
    session: Option<Session>,
    /// Last published, to emit only real changes.
    published: FocusStatus,
}

#[derive(Default)]
pub struct AutomationRuntime {
    settings: RwLock<AutomationSettings>,
    status: RwLock<AutomationStatus>,
    focus: std::sync::Mutex<FocusState>,
    /// Set once Mote is exiting, so the task never takes a light back after
    /// the exit restore.
    closing: std::sync::atomic::AtomicBool,
    /// Lights held by something ranked above PC Sync, for its start check.
    above_sync: RwLock<Vec<(LightKey, Holder)>>,
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
        let Some(rule) = rule else {
            return self.show_preview(app, None).await;
        };
        match rule {
            PreviewRule::OnAir => settings.on_air.enabled = true,
            PreviewRule::Away => settings.away.enabled = true,
        }
        settings.validate()?;
        self.show_preview(
            app,
            Some(match rule {
                PreviewRule::OnAir => on_air_desire(&settings.on_air),
                PreviewRule::Away => away_desire(&settings),
            }),
        )
        .await
    }

    /// Shows a look on the real lights for a short lease the editor renews,
    /// above every automation, and puts them back when it ends. `None` ends it.
    pub async fn show_preview(
        &self,
        app: &AppHandle,
        desire: Option<Desire>,
    ) -> Result<(), String> {
        let mut worker = self.worker.lock().await;
        let ranking = ranking(app, &self.settings());
        let Some(mut desire) = desire else {
            worker.preview_expires = None;
            worker.drop_holder(&Holder::Preview);
            worker.settle(app, &ranking).await;
            self.publish_above_sync(&worker, &ranking);
            return Ok(());
        };
        crate::commands::entitlements::require(app, Capability::LocalAutomation)?;
        if worker.locked || worker.suspended {
            return Err("Unlock this PC to preview lighting.".into());
        }
        desire.holder = Holder::Preview;
        desire.restore = true;
        desire.transition_ms = 0;
        worker.preview_expires = Some(Instant::now() + PREVIEW_LEASE);
        if worker.specs.get(&Holder::Preview) == Some(&desire)
            && worker.owners.holds(&Holder::Preview)
        {
            return Ok(());
        }
        match resolve(app, &desire.spec).await {
            Ok(lights) => {
                worker.owners.claim(&Holder::Preview, true, 0, lights);
                worker.specs.insert(Holder::Preview, desire);
            }
            Err(error) => {
                worker.drop_holder(&Holder::Preview);
                worker.settle(app, &ranking).await;
                return Err(error);
            }
        }
        worker.settle(app, &ranking).await;
        self.publish_above_sync(&worker, &ranking);
        match worker.write_errors.get(&Holder::Preview) {
            Some(error) => Err(error.clone()),
            None => Ok(()),
        }
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

    pub fn focus_status(&self) -> FocusStatus {
        self.focus
            .lock()
            .expect("focus lock poisoned")
            .published
            .clone()
    }

    /// Runs `change` on the focus session, then tells the interface and wakes
    /// the automation task so the lights follow at once.
    pub fn with_focus<T>(
        &self,
        app: &AppHandle,
        change: impl FnOnce(&mut Option<Session>, Instant) -> Result<T, String>,
    ) -> Result<T, String> {
        let result = {
            let mut focus = self.focus.lock().expect("focus lock poisoned");
            change(&mut focus.session, Instant::now())
        };
        self.publish_focus(app, None);
        signal(Signal::Wake);
        result
    }

    /// Emits the focus status when it changed. A running clock alone is not a
    /// change: the interface counts down from `endsAt`.
    fn publish_focus(&self, app: &AppHandle, error: Option<String>) {
        let next = {
            let mut focus = self.focus.lock().expect("focus lock poisoned");
            let mut next = focus
                .session
                .as_ref()
                .map(|session| session.status(Instant::now()))
                .unwrap_or_default();
            next.error = error;
            let comparable = |status: &FocusStatus| FocusStatus {
                remaining_ms: if status.ends_at.is_some() {
                    0
                } else {
                    status.remaining_ms
                },
                ..status.clone()
            };
            if comparable(&focus.published) == comparable(&next) {
                return;
            }
            focus.published = next.clone();
            next
        };
        crate::tray::show_focus(app, &next);
        let _ = app.emit(FOCUS_EVENT, next);
    }

    /// Moves the focus clock on, announces a phase change, and returns what
    /// the lights should show.
    fn tick_focus(&self, app: &AppHandle, suspended: bool) -> Option<Desire> {
        let (desire, announcement) = {
            let mut focus = self.focus.lock().expect("focus lock poisoned");
            let now = Instant::now();
            let session = focus.session.as_mut()?;
            if suspended {
                session.pause(now, true);
            }
            let change = session.tick(now);
            let announcement = change
                .filter(|_| session.ritual().notify)
                .map(|change| focus::announce(change, session.ritual()));
            (session.desire(now), announcement)
        };
        if let Some((title, body)) = announcement {
            use tauri_plugin_notification::NotificationExt;
            let _ = app.notification().builder().title(title).body(body).show();
        }
        desire
    }

    fn publish_above_sync(&self, worker: &Worker, ranking: &Ranking) {
        *self
            .above_sync
            .write()
            .expect("automation ownership lock poisoned") = worker.owners.held_above_sync(ranking);
    }

    /// Puts back what automations are showing when Mote exits, within the
    /// timeout; whatever does not make it stays in the journal for the next
    /// start. The away automation is left as it is on purpose: a PC shutting
    /// down while locked must not switch the lights back on in an empty room.
    pub fn shutdown_blocking(&self, app: &AppHandle, timeout: Duration) {
        let ranking = ranking(app, &self.settings());
        self.closing
            .store(true, std::sync::atomic::Ordering::SeqCst);
        self.focus.lock().expect("focus lock poisoned").session = None;
        let _ = tauri::async_runtime::block_on(tokio::time::timeout(timeout, async {
            let mut worker = self.worker.lock().await;
            for holder in worker.owners.holders() {
                if holder != Holder::Away {
                    worker.drop_holder(&holder);
                }
            }
            worker.restores.clear();
            worker.write_retry.clear();
            worker.settle(app, &ranking).await;
        }));
    }
}

/// The ranking the person chose, with calendar rules in their listed order.
fn ranking<R: Runtime>(app: &AppHandle<R>, settings: &AutomationSettings) -> Ranking {
    Ranking::new(
        &settings.priority,
        app.try_state::<CalendarService>()
            .map(|calendar| calendar.rule_order())
            .unwrap_or_default(),
    )
}

/// Who holds lights above PC Sync in `light_ids`, as a sentence refusing a
/// PC Sync start, or `None` when it may start.
pub fn sync_conflict<R: Runtime>(
    app: &AppHandle<R>,
    bridge_id: &str,
    light_ids: &[String],
) -> Option<String> {
    let runtime = app.try_state::<AutomationRuntime>()?;
    let held = runtime
        .above_sync
        .read()
        .expect("automation ownership lock poisoned");
    let (_, holder) = held.iter().find(|(key, _)| {
        key.bridge_id.eq_ignore_ascii_case(bridge_id) && light_ids.contains(&key.light_id)
    })?;
    let who = holder
        .source()
        .map_or("An automation preview", |source| match source {
            Source::OnAir => "The on-air light",
            Source::Away => "The lock automation",
            Source::Focus => "A focus session",
            Source::Calendar => "A calendar automation",
            Source::Presence => "The presence automation",
            Source::PcSync => "PC Sync",
        });
    Some(format!(
        "{who} is using lights in this area. PC Sync can start once it ends, or move PC Sync above it in Automations, Priority."
    ))
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
        {
            let runtime = app.state::<AutomationRuntime>();
            let mut worker = runtime.worker.lock().await;
            worker.journal = Journal::open(&app);
            worker.recover(&app);
        }
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
            if runtime.closing.load(std::sync::atomic::Ordering::SeqCst) {
                return;
            }
            let settings = runtime.settings();
            let mut worker = runtime.worker.lock().await;
            if runtime.closing.load(std::sync::atomic::Ordering::SeqCst) {
                return;
            }
            match received {
                None => worker.poll(&settings.on_air, false),
                Some(Signal::SettingsChanged) => {
                    worker.observe(Signal::SettingsChanged);
                    // An app just ignored lets go of the light at once.
                    worker.poll(&settings.on_air, true);
                }
                Some(next) => worker.observe(next),
            }
            let ranking = ranking(&app, &settings);
            let mut extra = Vec::new();
            extra.extend(runtime.tick_focus(&app, worker.suspended));
            let calendar = app.try_state::<CalendarService>();
            if let Some(calendar) = &calendar {
                extra.extend(calendar.desires(chrono::Utc::now()));
            }
            worker.reconcile(&app, &settings, &ranking, extra).await;
            runtime.publish_above_sync(&worker, &ranking);
            let status = worker.status(&settings);
            let focus_error = worker.error(&Holder::Focus);
            if let Some(calendar) = &calendar {
                calendar.publish(
                    &app,
                    calendar.status(chrono::Utc::now(), |holder| worker.error(holder)),
                );
            }
            drop(worker);
            runtime.publish(&app, status);
            runtime.publish_focus(&app, focus_error);
        }
    });
}

fn on_air_desire(on_air: &OnAirSettings) -> Desire {
    Desire {
        holder: Holder::OnAir,
        spec: if on_air.mode == OnAirMode::Scene {
            ClaimSpec::Scene {
                bridge_id: on_air.bridge_id.clone(),
                scene_id: on_air.scene.as_ref().map(|scene| scene.id.clone()),
                scale: Some(on_air.brightness),
            }
        } else {
            ClaimSpec::Lights {
                bridge_id: on_air.bridge_id.clone(),
                targets: effective_targets(&on_air.targets, &on_air.target)
                    .into_iter()
                    .cloned()
                    .collect(),
                looks: Looks::Uniform(match on_air.mode {
                    OnAirMode::White => Write::White {
                        mirek: on_air.mirek,
                        brightness: on_air.brightness,
                    },
                    _ => Write::Color {
                        xy: on_air.xy.unwrap_or_else(|| on_air.color.xy()),
                        brightness: on_air.brightness,
                    },
                }),
            }
        },
        restore: true,
        transition_ms: 0,
    }
}

fn away_desire(settings: &AutomationSettings) -> Desire {
    let away = &settings.away;
    Desire {
        holder: Holder::Away,
        spec: if away.action == AwayAction::Scene {
            ClaimSpec::Scene {
                bridge_id: away.bridge_id.clone(),
                scene_id: away.scene.as_ref().map(|scene| scene.id.clone()),
                scale: None,
            }
        } else {
            ClaimSpec::Lights {
                bridge_id: away.bridge_id.clone(),
                targets: effective_targets(&away.targets, &away.target)
                    .into_iter()
                    .cloned()
                    .collect(),
                looks: Looks::Uniform(match away.action {
                    AwayAction::Dim => Write::Dim(away.dim_brightness),
                    _ => Write::Off,
                }),
            }
        },
        restore: away.restore_on_return,
        transition_ms: 0,
    }
}

struct RestoreRetry {
    attempts: u32,
    next_at: Instant,
}

/// A PC Sync session an automation paused, to start again once no automation
/// ranked above it needs its lights.
struct PausedSync {
    /// `None` for the color test, which is stopped but never resumed.
    request: Option<StartSyncRequest>,
    area: SyncHold,
    holder: Option<Holder>,
}

#[derive(Default)]
struct Worker {
    owners: Ownership,
    journal: Journal,
    /// What each holder last claimed with.
    specs: HashMap<Holder, Desire>,
    start_errors: HashMap<Holder, String>,
    write_errors: HashMap<Holder, String>,
    retry_at: HashMap<Holder, Instant>,
    write_retry: HashMap<LightKey, Instant>,
    restores: HashMap<LightKey, RestoreRetry>,
    capture_apps: Vec<CaptureApp>,
    calling_apps: Vec<String>,
    on_call: bool,
    idle_polls: u32,
    locked: bool,
    suspended: bool,
    preview_expires: Option<Instant>,
    paused_sync: Option<PausedSync>,
    sync_error: Option<String>,
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
            Signal::SyncStarted {
                bridge_id,
                light_ids,
            } => {
                self.sync_error = None;
                self.owners.set_sync(Some(SyncHold {
                    bridge_id,
                    light_ids: light_ids.into_iter().collect(),
                }));
            }
            Signal::SyncEnded => self.owners.set_sync(None),
            Signal::SyncByUser => {
                self.paused_sync = None;
                self.sync_error = None;
            }
            Signal::SyncResumeFailed(error) => self.sync_error = Some(error),
            Signal::Wake => {}
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

    /// Takes back the lights an earlier run left changed. Away's are dropped,
    /// as on exit, and so are lights on a bridge that is no longer paired.
    fn recover<R: Runtime>(&mut self, app: &AppHandle<R>) {
        let Ok(client) = HueClient::new() else {
            return;
        };
        let mut paired: HashMap<String, bool> = HashMap::new();
        for entry in self.journal.load() {
            if entry.holder == Holder::Away {
                continue;
            }
            let known = *paired
                .entry(entry.key.bridge_id.to_uppercase())
                .or_insert_with(|| {
                    client
                        .paired_bridge_access(app, &entry.key.bridge_id)
                        .is_ok_and(|access| access.is_some())
                });
            if known {
                self.owners.adopt(
                    entry,
                    Caps {
                        dimmable: true,
                        color: true,
                        ct: None,
                    },
                );
            }
        }
        self.save_journal();
    }

    fn save_journal(&mut self) {
        let entries = self.owners.journal();
        // A journal that cannot be written still leaves the lights in memory
        // to put back; only a crash would lose them.
        let _ = self.journal.save(entries);
    }

    fn drop_holder(&mut self, holder: &Holder) {
        self.owners.release(holder);
        self.specs.remove(holder);
        self.start_errors.remove(holder);
        self.write_errors.remove(holder);
        self.retry_at.remove(holder);
    }

    fn desires(&self, settings: &AutomationSettings) -> Vec<Desire> {
        let mut desires = Vec::new();
        if settings.on_air.enabled && self.on_call {
            desires.push(on_air_desire(&settings.on_air));
        }
        let away = &settings.away;
        if away.enabled && (self.locked || (away.include_sleep && self.suspended)) {
            desires.push(away_desire(settings));
        }
        desires
    }

    async fn reconcile(
        &mut self,
        app: &AppHandle,
        settings: &AutomationSettings,
        ranking: &Ranking,
        extra: Vec<Desire>,
    ) {
        let preview_over = self.locked
            || self.suspended
            || self.preview_expires.is_none_or(|at| Instant::now() >= at);
        if preview_over && self.specs.contains_key(&Holder::Preview) {
            self.preview_expires = None;
            self.drop_holder(&Holder::Preview);
        }

        let mut desires = self.desires(settings);
        desires.extend(extra);
        let stale: Vec<Holder> = self
            .specs
            .keys()
            .filter(|holder| **holder != Holder::Preview)
            .filter(|holder| !desires.iter().any(|desire| &desire.holder == *holder))
            .cloned()
            .collect();
        for holder in stale {
            self.drop_holder(&holder);
        }
        // Errors of automations that are no longer wanted are not news.
        self.start_errors.retain(|holder, _| {
            *holder == Holder::Preview || desires.iter().any(|d| &d.holder == holder)
        });

        for desire in desires {
            self.take(app, desire).await;
        }
        self.settle(app, ranking).await;
        self.resume_sync(app, ranking);
    }

    /// Claims the lights one automation wants, if that changed since last time.
    async fn take(&mut self, app: &AppHandle, desire: Desire) {
        let holding = self.owners.holds(&desire.holder);
        if holding && self.specs.get(&desire.holder) == Some(&desire) {
            return;
        }
        if self
            .retry_at
            .get(&desire.holder)
            .is_some_and(|at| Instant::now() < *at)
        {
            return;
        }
        // Asked on every start rather than remembered, so buying Pro mid-call
        // lights the light straight away. Only starting is gated: whatever is
        // already showing is always put back, and a running look may change.
        if !holding {
            if let Err(refusal) =
                crate::commands::entitlements::require(app, Capability::LocalAutomation)
            {
                self.start_errors.insert(desire.holder.clone(), refusal);
                return;
            }
        }
        match resolve(app, &desire.spec).await {
            Ok(lights) => {
                self.owners
                    .claim(&desire.holder, desire.restore, desire.transition_ms, lights);
                self.start_errors.remove(&desire.holder);
                self.retry_at.remove(&desire.holder);
                self.specs.insert(desire.holder.clone(), desire);
            }
            Err(error) => {
                self.start_errors.insert(desire.holder.clone(), error);
                self.retry_at
                    .insert(desire.holder.clone(), Instant::now() + RETRY_AFTER);
            }
        }
    }

    /// Makes every light show its top claim, or go back, as far as the bridge
    /// lets it right now.
    async fn settle<R: Runtime>(&mut self, app: &AppHandle<R>, ranking: &Ranking) {
        let Ok(client) = HueClient::new() else {
            return;
        };
        let mut access: HashMap<String, Option<(String, String)>> = HashMap::new();
        let mut reach = |bridge_id: &str| -> Option<(String, String)> {
            access
                .entry(bridge_id.to_uppercase())
                .or_insert_with(|| client.paired_bridge_access(app, bridge_id).ok().flatten())
                .clone()
        };

        // Lights claimed while PC Sync streamed to them: their state now is
        // the one to return to.
        let unknown = self.owners.needs_before();
        let bridges: HashSet<String> = unknown.iter().map(|key| key.bridge_id.clone()).collect();
        for bridge_id in bridges {
            let Some((ip, key)) = reach(&bridge_id) else {
                continue;
            };
            if let Ok(lights) = client.get_lights(&ip, &key).await {
                for wanted in unknown.iter().filter(|key| key.bridge_id == bridge_id) {
                    if let Some(light) = lights.iter().find(|light| light.id == wanted.light_id) {
                        self.owners.fill_before(wanted, snapshot_of(light));
                    }
                }
            }
        }

        let plan = self.owners.plan(ranking);
        if plan.pause_sync {
            self.pause_sync(app, ranking);
        }

        let now = Instant::now();
        let mut writes = Vec::new();
        let mut restores = Vec::new();
        for op in plan.ops {
            match op {
                Op::Write {
                    key,
                    holder,
                    intent,
                    body: None,
                    ..
                } => self.owners.wrote(&key, &holder, &intent, None),
                Op::Write { ref key, .. }
                    if self.write_retry.get(key).is_some_and(|at| now < *at) => {}
                Op::Write {
                    key,
                    holder,
                    intent,
                    body: Some(body),
                    applied,
                    transition_ms,
                } => {
                    // Recorded before the write so the journal on disk already
                    // knows about it if Mote dies halfway.
                    let previous = self.owners.state(&key);
                    self.owners.wrote(&key, &holder, &intent, Some(applied));
                    writes.push((key, holder, body, transition_ms, previous));
                }
                Op::Restore { ref key, .. }
                    if self
                        .restores
                        .get(key)
                        .is_some_and(|retry| now < retry.next_at) => {}
                Op::Restore {
                    key,
                    before,
                    expect,
                } => restores.push((key, before, expect)),
                Op::Forget { key } => {
                    self.owners.settled(&key);
                    self.restores.remove(&key);
                    self.write_retry.remove(&key);
                }
            }
        }
        if writes.is_empty() && restores.is_empty() {
            self.save_journal();
            return;
        }
        self.save_journal();

        let mut attempted: HashMap<Holder, usize> = HashMap::new();
        let mut failed: HashMap<Holder, usize> = HashMap::new();
        let mut landed: Vec<LightKey> = Vec::new();
        let mut first = true;
        for (key, holder, mut body, transition_ms, previous) in writes {
            *attempted.entry(holder.clone()).or_default() += 1;
            let result = match reach(&key.bridge_id) {
                Some((ip, application_key)) => {
                    if !first {
                        tokio::time::sleep(WRITE_INTERVAL).await;
                    }
                    first = false;
                    body["dynamics"] = json!({ "duration": transition_ms });
                    client
                        .update_resource(&ip, &application_key, "light", &key.light_id, body)
                        .await
                }
                None => Err("This bridge is no longer paired.".into()),
            };
            match result {
                Ok(()) => {
                    self.write_retry.remove(&key);
                    landed.push(key);
                }
                Err(_) => {
                    if let Some(previous) = previous {
                        self.owners.revert(&key, previous);
                    }
                    self.write_retry.insert(key, Instant::now() + RETRY_AFTER);
                    *failed.entry(holder).or_default() += 1;
                }
            }
        }
        for (holder, count) in attempted {
            match failed.get(&holder) {
                Some(failures) => {
                    let message = if *failures == count {
                        "The selected lights could not be changed.".to_string()
                    } else {
                        format!("{failures} of the selected lights could not be changed.")
                    };
                    self.write_errors.insert(holder, message);
                }
                None => {
                    self.write_errors.remove(&holder);
                }
            }
        }

        // Read the bridge's clamped values before comparing later external edits.
        let bridges: HashSet<String> = landed.iter().map(|key| key.bridge_id.clone()).collect();
        for bridge_id in bridges {
            let Some((ip, key)) = reach(&bridge_id) else {
                continue;
            };
            let Ok(current) = client.get_lights(&ip, &key).await else {
                continue;
            };
            for written in landed.iter().filter(|key| key.bridge_id == bridge_id) {
                let Some(applied) = self.owners.applied(written) else {
                    continue;
                };
                if let Some(now) = current.iter().find(|light| light.id == written.light_id) {
                    self.owners.read_back(written, read_back(applied, now));
                }
            }
        }

        let mut current: HashMap<String, Option<Vec<HueLight>>> = HashMap::new();
        for (key, before, expect) in restores {
            let Some((ip, application_key)) = reach(&key.bridge_id) else {
                // Unpaired: nothing can reach it anymore.
                self.owners.settled(&key);
                self.restores.remove(&key);
                continue;
            };
            let lights = match current.get(&key.bridge_id) {
                Some(lights) => lights.clone(),
                None => {
                    let lights = client.get_lights(&ip, &application_key).await.ok();
                    current.insert(key.bridge_id.clone(), lights.clone());
                    lights
                }
            };
            let outcome = match &lights {
                None => Err(()),
                Some(lights) => match lights.iter().find(|light| light.id == key.light_id) {
                    // Gone, switched off at the wall, or changed by somebody
                    // since: nothing to put back over.
                    None => Ok(()),
                    Some(light) if !light.reachable || !looks::still_shows(light, expect) => Ok(()),
                    Some(_) => {
                        if !first {
                            tokio::time::sleep(WRITE_INTERVAL).await;
                        }
                        first = false;
                        snapshot::restore(
                            &client,
                            &ip,
                            &application_key,
                            std::slice::from_ref(&before),
                        )
                        .await
                        .map_err(|_| ())
                    }
                },
            };
            match outcome {
                Ok(()) => {
                    self.owners.settled(&key);
                    self.restores.remove(&key);
                }
                Err(()) => {
                    let retry = self.restores.entry(key).or_insert(RestoreRetry {
                        attempts: 0,
                        next_at: Instant::now(),
                    });
                    retry.attempts += 1;
                    retry.next_at = Instant::now()
                        + if retry.attempts < RESTORE_QUICK_ATTEMPTS {
                            RESTORE_RETRY_INTERVAL
                        } else {
                            RESTORE_SLOW_INTERVAL
                        };
                }
            }
        }
        self.save_journal();
    }

    /// Stops PC Sync for a claim ranked above it, remembering the session so it
    /// can start again once that claim is over.
    fn pause_sync<R: Runtime>(&mut self, app: &AppHandle<R>, ranking: &Ranking) {
        if self.paused_sync.is_some() {
            return;
        }
        let Some(area) = self.owners.sync().cloned() else {
            return;
        };
        let Some(engine) = app.try_state::<HostSyncEngine>() else {
            return;
        };
        let holder = self
            .owners
            .held_above_sync(ranking)
            .into_iter()
            .find(|(key, _)| area.covers(key))
            .map(|(_, holder)| holder);
        let request = engine.resumable_request();
        engine.stop(app);
        self.paused_sync = Some(PausedSync {
            request,
            area,
            holder,
        });
    }

    /// Starts a paused PC Sync again once nothing ranked above it needs its
    /// lights and its stop has finished.
    fn resume_sync(&mut self, app: &AppHandle, ranking: &Ranking) {
        let Some(paused) = &self.paused_sync else {
            return;
        };
        if self.owners.sync().is_some() || self.owners.wants_area_above_sync(ranking, &paused.area)
        {
            return;
        }
        let Some(paused) = self.paused_sync.take() else {
            return;
        };
        let Some(request) = paused.request else {
            return;
        };
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            let result = match crate::commands::entitlements::require(&app, Capability::PcSync) {
                Ok(()) => {
                    let engine = app.state::<HostSyncEngine>();
                    engine.start_sync(&app, request).await.map(|_| ())
                }
                Err(refusal) => Err(refusal),
            };
            if let Err(error) = result {
                signal(Signal::SyncResumeFailed(error));
            }
        });
    }

    fn error(&self, holder: &Holder) -> Option<String> {
        self.start_errors
            .get(holder)
            .or_else(|| self.write_errors.get(holder))
            .cloned()
    }

    fn status(&self, settings: &AutomationSettings) -> AutomationStatus {
        let error = |holder: &Holder| self.error(holder);
        AutomationStatus {
            on_air: OnAirStatus {
                active: self.owners.holds(&Holder::OnAir),
                apps: if settings.on_air.enabled {
                    self.calling_apps.clone()
                } else {
                    Vec::new()
                },
                error: error(&Holder::OnAir),
            },
            away: AwayStatus {
                active: self.owners.holds(&Holder::Away),
                error: error(&Holder::Away),
            },
            capture_apps: self.capture_apps.clone(),
            pc_sync: PcSyncCoordination {
                paused_for: self
                    .paused_sync
                    .as_ref()
                    .and_then(|paused| paused.holder.as_ref())
                    .and_then(Holder::source),
                error: self.sync_error.clone(),
            },
            restoring: self
                .owners
                .entries()
                .iter()
                .filter(|entry| entry.claims.is_empty() && entry.applied.is_some() && entry.restore)
                .count(),
        }
    }
}

/// What the bridge reports for a light just written, in the terms the restore
/// check compares. Restoring brightness also restores color, so a manual
/// color change is protected even after a dim-only write.
fn read_back(applied: Applied, now: &HueLight) -> Applied {
    if !applied.on {
        return applied;
    }
    let ct = now.color_mode.as_deref() == Some("ct");
    Applied {
        xy: (!ct).then_some(now.xy).flatten(),
        mirek: ct.then_some(now.ct).flatten(),
        ..applied
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

/// Claims `lights` for a one-time change, such as a presence scene, ranked as
/// `source`, and writes what nothing higher holds. Returns how many lights
/// could not be changed.
pub async fn one_shot<R: Runtime>(
    app: &AppHandle<R>,
    source: Source,
    lights: Vec<ClaimedLight>,
) -> Result<usize, String> {
    let runtime = app
        .try_state::<AutomationRuntime>()
        .ok_or("Automations are not ready yet.")?;
    let ranking = ranking(app, &runtime.settings());
    let mut worker = runtime.worker.lock().await;
    let now = worker
        .owners
        .one_shot(&ranking, ranking.source(source), lights);
    let journal = worker.owners.journal();
    let _ = worker.journal.save(journal);
    drop(worker);
    let client = HueClient::new()?;
    let mut failures = 0usize;
    for (index, light) in now.iter().enumerate() {
        if index > 0 {
            tokio::time::sleep(WRITE_INTERVAL).await;
        }
        let Some((ip, key)) = client.paired_bridge_access(app, &light.key.bridge_id)? else {
            failures += 1;
            continue;
        };
        let want = light.intent.want(light.caps, &light.current, true);
        let Some(mut body) = want.body else {
            continue;
        };
        body["dynamics"] = json!({ "duration": 400 });
        if client
            .update_resource(&ip, &key, "light", &light.key.light_id, body)
            .await
            .is_err()
        {
            failures += 1;
        }
    }
    Ok(failures)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn app(id: &str, microphone: bool, camera: bool) -> CaptureApp {
        CaptureApp {
            id: id.into(),
            name: id.into(),
            microphone,
            camera,
        }
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
    fn the_locked_pc_and_a_call_decide_what_is_wanted() {
        let mut settings = AutomationSettings::default();
        settings.on_air.enabled = true;
        settings.away.enabled = true;
        let mut worker = Worker::default();
        assert!(worker.desires(&settings).is_empty());
        worker.on_call = true;
        worker.observe(Signal::Suspended(true));
        let holders: Vec<Holder> = worker
            .desires(&settings)
            .into_iter()
            .map(|d| d.holder)
            .collect();
        assert_eq!(holders, [Holder::OnAir, Holder::Away]);
        settings.away.include_sleep = false;
        assert_eq!(worker.desires(&settings).len(), 1);
    }

    #[test]
    fn away_scene_and_dim_become_the_right_claims() {
        let mut settings = AutomationSettings::default();
        settings.away.action = AwayAction::Dim;
        settings.away.dim_brightness = 15.0;
        settings.away.restore_on_return = false;
        let desire = away_desire(&settings);
        assert!(!desire.restore);
        assert!(matches!(
            desire.spec,
            ClaimSpec::Lights {
                looks: Looks::Uniform(Write::Dim(level)),
                ..
            } if level == 15.0
        ));
        settings.away.action = AwayAction::Scene;
        assert!(matches!(
            away_desire(&settings).spec,
            ClaimSpec::Scene { scale: None, .. }
        ));
    }

    #[test]
    fn a_dim_write_protects_the_color_the_bridge_reports() {
        let mut light = HueLight {
            id: "desk".into(),
            device_id: None,
            device_name: None,
            name: "Desk".into(),
            is_on: true,
            brightness: Some(10.0),
            reachable: true,
            color_mode: Some("ct".into()),
            xy: Some([0.4, 0.4]),
            ct: Some(366),
            effect: None,
            effects: Vec::new(),
            effect_v2: None,
            effects_v2: Vec::new(),
            supports_color: true,
            supports_ct: true,
            ct_min: Some(153),
            ct_max: Some(500),
            gamut: None,
            model_id: None,
            product_name: None,
            type_name: None,
            sw_version: None,
            unique_id: None,
            function: None,
            powerup: None,
        };
        let dimmed = Applied {
            on: true,
            brightness: Some(10.0),
            xy: None,
            mirek: None,
        };
        assert_eq!(read_back(dimmed, &light).mirek, Some(366));
        light.color_mode = Some("xy".into());
        assert_eq!(read_back(dimmed, &light).xy, Some([0.4, 0.4]));
    }
}
