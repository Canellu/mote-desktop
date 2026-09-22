//! Host-side entertainment streaming engine.
//!
//! Exactly one session may be active. Lifecycle: `idle → starting → running
//! → stopping → idle`, with `error` as a terminal state that the next start
//! clears. The engine snapshots member lights, claims area ownership over
//! CLIP v2, streams HueStream frames over DTLS, monitors ownership while
//! running, and on stop releases the area and restores the snapshot.
//!
//! Two session kinds share that plumbing:
//! - the solid-color test (hardware validation spike), and
//! - capture-driven sync: per-display Windows Graphics Capture sessions feed
//!   a latest-value color board that the stream loop reads at the intensity's
//!   tick rate.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::watch;

use crate::services::hue_client::{HueClient, HueEntertainmentArea};

use super::analysis::{SyncIntensity, SyncMode};
use super::credentials;
use super::dtls::EntertainmentTransport;
use super::preferences::StopBehavior;
use super::protocol::{self, ChannelColor};
use super::snapshot::{self, LightSnapshot};

#[cfg(windows)]
use super::analysis::{self, ChannelSmoother};
#[cfg(windows)]
use super::audio::{self, AudioBoard, AudioRig, EnergyBoard};
#[cfg(windows)]
use super::capture::{CaptureRig, ColorBoard};
#[cfg(windows)]
use super::displays::{self, DisplayInfo};
#[cfg(windows)]
use super::music::{self, MusicChannel, MusicPaletteChoice, ResolvedPalette};
#[cfg(windows)]
use super::preferences;

/// Event emitted on lifecycle, warning, and error changes (never per-frame).
const STATUS_EVENT: &str = "host-sync-status";

/// Static content is resent so the bridge's ~10s inactivity timeout never
/// fires; the plan calls for a 500ms cadence.
const STATIC_RESEND_INTERVAL: Duration = Duration::from_millis(500);

/// How often area ownership is re-checked while streaming.
const OWNERSHIP_POLL_INTERVAL: Duration = Duration::from_secs(2);

/// Consecutive ownership-poll failures treated as bridge loss.
const BRIDGE_LOSS_THRESHOLD: u32 = 3;

/// Bound for the best-effort cleanup on application exit.
pub const EXIT_CLEANUP_TIMEOUT: Duration = Duration::from_secs(5);

/// Brightness multiplier at silence when audio-reactive Video is active; the
/// loudness envelope sweeps the rest of the range up to 1.
#[cfg(windows)]
const AUDIO_REACTIVE_FLOOR: f64 = 0.4;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum HostSyncLifecycle {
    Idle,
    Starting,
    Running,
    Stopping,
    Error,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostSyncStatus {
    pub state: HostSyncLifecycle,
    pub area_id: Option<String>,
    pub error: Option<String>,
    /// Non-fatal degradation while running, e.g. audio enhancement lost.
    pub warning: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelColorOverride {
    pub channel_id: u8,
    /// 8-bit sRGB color for this channel.
    pub rgb: [u8; 3],
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColorTestRequest {
    pub area_id: String,
    /// 8-bit sRGB test color applied to every channel without an override.
    pub rgb: [u8; 3],
    /// Per-channel colors for placement checks: each light can show a
    /// distinct color, or one light can be flashed while the rest stay dim.
    #[serde(default)]
    pub channel_colors: Option<Vec<ChannelColorOverride>>,
    /// Required when another application currently owns the area.
    #[serde(default)]
    pub confirm_takeover: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartSyncRequest {
    pub area_id: String,
    /// Overrides for the persisted preferences; `None` uses the stored value.
    #[serde(default)]
    pub mode: Option<SyncMode>,
    #[serde(default)]
    pub intensity: Option<SyncIntensity>,
    #[serde(default)]
    pub brightness: Option<f64>,
    #[serde(default)]
    pub audio_reactive: Option<bool>,
    #[serde(default)]
    pub confirm_takeover: bool,
}

/// Live adjustments applied to the active session without restarting it.
/// Mode, palette, and display changes still require a stop/start.
#[derive(Debug, Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSyncRequest {
    #[serde(default)]
    pub brightness: Option<f64>,
    #[serde(default)]
    pub intensity: Option<SyncIntensity>,
}

#[derive(Default)]
pub struct HostSyncEngine {
    inner: Arc<Mutex<EngineInner>>,
}

struct EngineInner {
    lifecycle: HostSyncLifecycle,
    area_id: Option<String>,
    error: Option<String>,
    warning: Option<String>,
    stop_tx: Option<watch::Sender<bool>>,
    live_tx: Option<watch::Sender<UpdateSyncRequest>>,
    /// Streaming task handle, joined by the bounded exit cleanup.
    task: Option<tauri::async_runtime::JoinHandle<()>>,
    /// The sync session being run, so an automation that pauses it can start
    /// the same one again. `None` for the color test.
    request: Option<StartSyncRequest>,
}

impl Default for EngineInner {
    fn default() -> Self {
        Self {
            lifecycle: HostSyncLifecycle::Idle,
            area_id: None,
            error: None,
            warning: None,
            stop_tx: None,
            live_tx: None,
            task: None,
            request: None,
        }
    }
}

impl EngineInner {
    fn snapshot(&self) -> HostSyncStatus {
        HostSyncStatus {
            state: self.lifecycle,
            area_id: self.area_id.clone(),
            error: self.error.clone(),
            warning: self.warning.clone(),
        }
    }
}

/// Channels and status handed out by `begin_session`.
#[derive(Debug)]
struct SessionHandles {
    stop_rx: watch::Receiver<bool>,
    live_rx: watch::Receiver<UpdateSyncRequest>,
    status: HostSyncStatus,
}

/// Everything a claimed, connected session needs to stream and clean up.
struct PreparedSession {
    bridge: HueSessionBridge,
    application_id: String,
    area: HueEntertainmentArea,
    transport: EntertainmentTransport,
}

trait SessionBridge: Send + Sync {
    async fn get_area(&self, area_id: &str) -> Result<HueEntertainmentArea, String>;
    async fn claim(&self, area_id: &str) -> Result<(), String>;
    async fn release(&self, area_id: &str) -> Result<(), String>;
    async fn restore(&self) -> Result<(), String>;
    async fn turn_off(&self) -> Result<(), String>;
}

trait SessionTransport: Send + Sync {
    async fn send(&self, frame: &[u8]) -> Result<(), String>;
    async fn close(&self);
}

trait SessionTransportFactory {
    type Transport: SessionTransport;

    async fn connect(
        &self,
        bridge_ip: &str,
        application_id: &str,
        psk: [u8; 16],
    ) -> Result<Self::Transport, String>;
}

struct HueSessionBridge {
    client: HueClient,
    bridge_ip: String,
    rest_key: String,
    light_snapshots: Vec<LightSnapshot>,
}

impl SessionBridge for HueSessionBridge {
    async fn get_area(&self, area_id: &str) -> Result<HueEntertainmentArea, String> {
        self.client
            .get_entertainment_area(&self.bridge_ip, &self.rest_key, area_id)
            .await
    }

    async fn claim(&self, area_id: &str) -> Result<(), String> {
        self.client
            .set_entertainment_action(&self.bridge_ip, &self.rest_key, area_id, "start")
            .await
    }

    async fn release(&self, area_id: &str) -> Result<(), String> {
        self.client
            .set_entertainment_action(&self.bridge_ip, &self.rest_key, area_id, "stop")
            .await
    }

    async fn restore(&self) -> Result<(), String> {
        snapshot::restore(
            &self.client,
            &self.bridge_ip,
            &self.rest_key,
            &self.light_snapshots,
        )
        .await
    }

    async fn turn_off(&self) -> Result<(), String> {
        snapshot::turn_off(
            &self.client,
            &self.bridge_ip,
            &self.rest_key,
            &self.light_snapshots,
        )
        .await
    }
}

impl SessionTransport for EntertainmentTransport {
    async fn send(&self, frame: &[u8]) -> Result<(), String> {
        EntertainmentTransport::send(self, frame).await
    }

    async fn close(&self) {
        EntertainmentTransport::close(self).await;
    }
}

struct DtlsTransportFactory;

impl SessionTransportFactory for DtlsTransportFactory {
    type Transport = EntertainmentTransport;

    async fn connect(
        &self,
        bridge_ip: &str,
        application_id: &str,
        psk: [u8; 16],
    ) -> Result<Self::Transport, String> {
        EntertainmentTransport::connect(bridge_ip, application_id, psk).await
    }
}

#[derive(Clone, Copy)]
struct StreamTiming {
    frame: Duration,
    ownership_poll: Duration,
}

impl StreamTiming {
    fn production(frame: Duration) -> Self {
        Self {
            frame,
            ownership_poll: OWNERSHIP_POLL_INTERVAL,
        }
    }
}

/// Optional loudness-envelope worker attached to Video capture for
/// audio-driven brightness emphasis.
#[cfg(windows)]
struct VideoAudio {
    board: Arc<EnergyBoard>,
    rig: AudioRig,
}

/// Where the per-tick channel colors come from.
enum ColorSource {
    /// Fixed colors, resent on the keepalive cadence (color test).
    Static(Vec<ChannelColor>),
    /// Colors sampled from display capture, smoothed per tick.
    #[cfg(windows)]
    Capture {
        board: Arc<ColorBoard>,
        rig: CaptureRig,
        smoother: ChannelSmoother,
        channel_ids: Vec<u8>,
        mode: SyncMode,
        brightness: f64,
        /// Present while audio-reactive Video enhancement is healthy; dropped
        /// (with a warning) when the audio worker fails, per the plan.
        audio: Option<VideoAudio>,
    },
    /// Colors produced by WASAPI loopback music analysis.
    #[cfg(windows)]
    Music {
        board: Arc<AudioBoard>,
        rig: AudioRig,
        smoother: ChannelSmoother,
        channel_ids: Vec<u8>,
        mode: SyncMode,
        brightness: f64,
    },
}

impl ColorSource {
    /// Produces this tick's colors plus an optional one-shot warning, or an
    /// error that ends the stream.
    fn next_colors(&mut self) -> Result<(Vec<ChannelColor>, Option<String>), String> {
        match self {
            Self::Static(colors) => Ok((colors.clone(), None)),
            #[cfg(windows)]
            Self::Capture {
                board,
                rig,
                smoother,
                channel_ids,
                mode,
                brightness,
                audio,
            } => {
                if let Some(error) = board.error() {
                    return Err(error);
                }
                if rig.any_session_dead() {
                    return Err("Display capture stopped unexpectedly.".to_string());
                }
                // Audio enhancement failure degrades Video, never ends it.
                let mut warning = None;
                let mut level = 1.0f64;
                if let Some(active) = audio.as_ref() {
                    if let Some(error) = active.board.error() {
                        warning = Some(format!(
                            "Audio-driven brightness was disabled: {error} Video sync continues without it."
                        ));
                    } else if active.rig.is_finished() {
                        warning = Some(
                            "Audio-driven brightness was disabled: audio capture stopped unexpectedly. Video sync continues without it."
                                .to_string(),
                        );
                    } else {
                        level = AUDIO_REACTIVE_FLOOR
                            + (1.0 - AUDIO_REACTIVE_FLOOR) * f64::from(active.board.envelope());
                    }
                }
                if warning.is_some() {
                    if let Some(mut lost) = audio.take() {
                        // The worker already exited; the join is immediate.
                        lost.rig.stop();
                    }
                }
                let targets = board.snapshot();
                let smoothed = smoother.step(&targets);
                Ok((
                    analysis::to_wire_colors(
                        smoothed,
                        channel_ids,
                        mode.saturation_boost(),
                        *brightness * level,
                    ),
                    warning,
                ))
            }
            #[cfg(windows)]
            Self::Music {
                board,
                rig,
                smoother,
                channel_ids,
                mode,
                brightness,
            } => {
                if let Some(error) = board.error() {
                    return Err(error);
                }
                if rig.is_finished() {
                    return Err("Audio capture stopped unexpectedly.".to_string());
                }
                let targets = board.snapshot();
                let smoothed = smoother.step(&targets);
                Ok((
                    analysis::to_wire_colors(
                        smoothed,
                        channel_ids,
                        mode.saturation_boost(),
                        *brightness,
                    ),
                    None,
                ))
            }
        }
    }

    /// Applies live setting changes; the static color test ignores them.
    fn apply(&mut self, update: UpdateSyncRequest) {
        match self {
            Self::Static(_) => {}
            #[cfg(windows)]
            Self::Capture {
                smoother,
                mode,
                brightness,
                ..
            }
            | Self::Music {
                smoother,
                mode,
                brightness,
                ..
            } => {
                if let Some(new_brightness) = update.brightness {
                    *brightness = new_brightness.clamp(0.0, 100.0);
                }
                if let Some(intensity) = update.intensity {
                    smoother.set_alpha(intensity, *mode);
                }
            }
        }
    }

    /// Stops capture workers (blocking joins) before the DTLS teardown, per
    /// the plan's stop order.
    async fn shutdown(self) {
        match self {
            Self::Static(_) => {}
            #[cfg(windows)]
            Self::Capture { mut rig, audio, .. } => {
                let _ = tauri::async_runtime::spawn_blocking(move || {
                    rig.stop();
                    if let Some(mut audio) = audio {
                        audio.rig.stop();
                    }
                })
                .await;
            }
            #[cfg(windows)]
            Self::Music { mut rig, .. } => {
                let _ = tauri::async_runtime::spawn_blocking(move || rig.stop()).await;
            }
        }
    }
}

/// How a streaming session ended; decides the cleanup performed.
enum StreamEnd {
    /// Explicit stop: release the area and restore the snapshot.
    Stopped,
    /// Another application owns the area now. Neither `action: stop` nor a
    /// snapshot restore may be issued — both would fight the new owner.
    OwnershipLost,
    /// Transport/bridge/capture failure: best-effort release and restore.
    Failed(String),
}

async fn claim_and_connect<B, F>(
    bridge: &B,
    factory: &F,
    bridge_ip: &str,
    area_id: &str,
    application_id: &str,
    psk: [u8; 16],
) -> Result<F::Transport, String>
where
    B: SessionBridge,
    F: SessionTransportFactory,
{
    bridge.claim(area_id).await?;
    match factory.connect(bridge_ip, application_id, psk).await {
        Ok(transport) => Ok(transport),
        Err(error) => {
            let _ = bridge.release(area_id).await;
            let _ = bridge.restore().await;
            Err(error)
        }
    }
}

/// The REST credential whose `hue-application-id` owns the stream: the
/// dedicated entertainment key when provisioned for this bridge, otherwise the
/// main pairing.
pub fn resolve_streaming_rest_key<R: Runtime>(
    app: &AppHandle<R>,
    client: &HueClient,
    bridge_id: &str,
) -> Result<String, String> {
    if let Some(key) = credentials::load_application_key(bridge_id)? {
        return Ok(key);
    }
    client.get_stored_application_key(app)
}

/// True when a start must be confirmed because another application is
/// actively streaming to the area.
fn takeover_blocked(
    area: &HueEntertainmentArea,
    our_application_id: &str,
    confirmed: bool,
) -> bool {
    area.status == "active"
        && area.active_streamer_id.as_deref() != Some(our_application_id)
        && !confirmed
}

/// True when the bridge no longer reports us as the active streamer.
fn ownership_lost(area: &HueEntertainmentArea, our_application_id: &str) -> bool {
    area.status != "active" || area.active_streamer_id.as_deref() != Some(our_application_id)
}

impl HostSyncEngine {
    pub fn status(&self) -> HostSyncStatus {
        self.inner.lock().unwrap().snapshot()
    }

    /// The running sync session's request, to start it again after an
    /// automation paused it. `None` when idle or running the color test.
    pub fn resumable_request(&self) -> Option<StartSyncRequest> {
        let inner = self.inner.lock().unwrap();
        matches!(
            inner.lifecycle,
            HostSyncLifecycle::Starting | HostSyncLifecycle::Running
        )
        .then(|| inner.request.clone())
        .flatten()
    }

    /// Requests a stop. Returns immediately; the streaming task performs the
    /// capture/DTLS shutdown, area release, and snapshot restore, then
    /// settles at `idle`. Idempotent.
    pub fn stop<R: Runtime>(&self, app: &AppHandle<R>) -> HostSyncStatus {
        match self.request_stop() {
            Some(status) => {
                emit_status(app, &status);
                status
            }
            None => self.status(),
        }
    }

    /// Lifecycle-only stop transition; `None` when there is nothing to stop.
    /// Split from `stop` so it is testable without a Tauri runtime.
    fn request_stop(&self) -> Option<HostSyncStatus> {
        let mut inner = self.inner.lock().unwrap();
        match inner.lifecycle {
            HostSyncLifecycle::Starting | HostSyncLifecycle::Running => {
                inner.lifecycle = HostSyncLifecycle::Stopping;
                if let Some(stop_tx) = &inner.stop_tx {
                    let _ = stop_tx.send(true);
                }
                Some(inner.snapshot())
            }
            _ => None,
        }
    }

    /// Bounded best-effort cleanup for application exit: signals the session
    /// to stop and waits for its cleanup (release + restore) up to `timeout`.
    /// Safe to call when idle.
    pub fn shutdown_blocking(&self, timeout: Duration) {
        let task = {
            let mut inner = self.inner.lock().unwrap();
            let active = matches!(
                inner.lifecycle,
                HostSyncLifecycle::Starting
                    | HostSyncLifecycle::Running
                    | HostSyncLifecycle::Stopping
            );
            if !active {
                return;
            }
            inner.lifecycle = HostSyncLifecycle::Stopping;
            if let Some(stop_tx) = &inner.stop_tx {
                let _ = stop_tx.send(true);
            }
            inner.task.take()
        };
        if let Some(task) = task {
            let _ =
                tauri::async_runtime::block_on(
                    async move { tokio::time::timeout(timeout, task).await },
                );
        }
    }

    /// Starts capture-driven sync (Video/Games/Music) using persisted preferences,
    /// with optional per-request overrides.
    pub async fn start_sync<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        request: StartSyncRequest,
    ) -> Result<HostSyncStatus, String> {
        #[cfg(not(windows))]
        {
            let _ = (app, request);
            Err("PC sync display capture is only available on Windows.".to_string())
        }
        #[cfg(windows)]
        {
            let handles = self.begin_session(&request.area_id)?;
            self.inner.lock().unwrap().request = Some(StartSyncRequest {
                confirm_takeover: false,
                ..request.clone()
            });
            emit_status(app, &handles.status);

            match self.start_sync_inner(app, &request, handles).await {
                Ok(status) => Ok(status),
                Err(error) => {
                    self.fail(app, &error);
                    Err(error)
                }
            }
        }
    }

    #[cfg(windows)]
    async fn start_sync_inner<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        request: &StartSyncRequest,
        handles: SessionHandles,
    ) -> Result<HostSyncStatus, String> {
        let SessionHandles {
            stop_rx, live_rx, ..
        } = handles;
        let prefs = preferences::load(app);
        let mode = request.mode.unwrap_or(prefs.mode);
        let intensity = request.intensity.unwrap_or(prefs.intensity);
        let brightness = request.brightness.unwrap_or(prefs.brightness);
        let tick = Duration::from_secs_f64(1.0 / f64::from(intensity.tick_hz()));

        if mode == SyncMode::Music {
            let outputs = audio::enumerate_audio_outputs()?;
            if outputs.is_empty() {
                return Err("No audio output is available for Music sync.".to_string());
            }
            if let Some(selected_id) = prefs.audio_device_id.as_deref() {
                if !outputs.iter().any(|output| output.id == selected_id) {
                    return Err("The selected audio output is unavailable.".to_string());
                }
            }
            // Resolve the palette before touching the bridge so a missing
            // scene fails fast without claiming anything.
            let palette = resolve_music_palette(app, &prefs.music_palette).await?;

            let prepared = self
                .prepare_session(app, &request.area_id, request.confirm_takeover)
                .await?;
            let channel_ids: Vec<u8> = prepared
                .area
                .channels
                .iter()
                .map(|channel| channel.channel_id)
                .collect();
            let music_channels: Vec<MusicChannel> = prepared
                .area
                .channels
                .iter()
                .map(|channel| MusicChannel {
                    channel_id: channel.channel_id,
                    x: channel.x as f32,
                })
                .collect();
            let board = AudioBoard::new(music_channels.len());
            let rig = match AudioRig::start_music(
                prefs.audio_device_id.clone(),
                music_channels,
                palette,
                prefs.music_channel_count,
                &board,
            ) {
                Ok(rig) => rig,
                Err(error) => {
                    prepared.transport.close().await;
                    let _ = prepared.bridge.release(&request.area_id).await;
                    let _ = prepared.bridge.restore().await;
                    return Err(error);
                }
            };
            let source = ColorSource::Music {
                board,
                rig,
                smoother: ChannelSmoother::new(channel_ids.len(), intensity, mode),
                channel_ids,
                mode,
                brightness,
            };
            return Ok(self.launch_stream(
                app,
                prepared,
                source,
                tick,
                prefs.stop_behavior,
                stop_rx,
                live_rx,
            ));
        }

        // Resolve displays before touching the bridge so a topology problem
        // fails fast without claiming anything.
        let all_displays = displays::enumerate_displays()?;
        let selected =
            displays::resolve_selected(&all_displays, prefs.automatic_display, &prefs.display_ids)?;

        let prepared = self
            .prepare_session(app, &request.area_id, request.confirm_takeover)
            .await?;

        let bounds: Vec<_> = selected.iter().map(DisplayInfo::bounds).collect();
        let frame = analysis::ScreenFrame::from_configuration_type(
            prepared.area.configuration_type.as_deref(),
        );
        let tiles = analysis::map_channels_to_tiles(&prepared.area.channels, &bounds, frame);
        let board = ColorBoard::new(prepared.area.channels.len());
        let rig = match CaptureRig::start(&selected, &tiles, &board, tick) {
            Ok(rig) => rig,
            Err(error) => {
                prepared.transport.close().await;
                let _ = prepared.bridge.release(&request.area_id).await;
                let _ = prepared.bridge.restore().await;
                return Err(error);
            }
        };

        // Audio-driven brightness emphasis is a Video-only enhancement; per
        // the plan its failure degrades the session instead of ending it.
        let mut start_warning = None;
        let audio = if mode == SyncMode::Video
            && request.audio_reactive.unwrap_or(prefs.video_audio_reactive)
        {
            let board = EnergyBoard::new();
            match AudioRig::start_energy(prefs.audio_device_id.clone(), &board) {
                Ok(rig) => Some(VideoAudio { board, rig }),
                Err(error) => {
                    start_warning = Some(format!(
                        "Audio-driven brightness is unavailable: {error} Video sync continues without it."
                    ));
                    None
                }
            }
        } else {
            None
        };

        let channel_ids: Vec<u8> = prepared
            .area
            .channels
            .iter()
            .map(|channel| channel.channel_id)
            .collect();
        let source = ColorSource::Capture {
            board,
            rig,
            smoother: ChannelSmoother::new(channel_ids.len(), intensity, mode),
            channel_ids,
            mode,
            brightness,
            audio,
        };

        let status = self.launch_stream(
            app,
            prepared,
            source,
            tick,
            prefs.stop_behavior,
            stop_rx,
            live_rx,
        );
        match start_warning {
            Some(warning) => Ok(self.warn(app, warning)),
            None => Ok(status),
        }
    }

    /// Hardware-gated spike: claims the area and streams one solid color to
    /// every channel until stopped. Talks to physical lights — only invoke
    /// with explicit user confirmation.
    pub async fn start_color_test<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        request: ColorTestRequest,
    ) -> Result<HostSyncStatus, String> {
        let handles = self.begin_session(&request.area_id)?;
        emit_status(app, &handles.status);

        match self.start_color_test_inner(app, &request, handles).await {
            Ok(status) => Ok(status),
            Err(error) => {
                // The status event carries the same message for passive
                // listeners; the caller gets it as the command error.
                self.fail(app, &error);
                Err(error)
            }
        }
    }

    async fn start_color_test_inner<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        request: &ColorTestRequest,
        handles: SessionHandles,
    ) -> Result<HostSyncStatus, String> {
        let prepared = self
            .prepare_session(app, &request.area_id, request.confirm_takeover)
            .await?;

        let colors: Vec<ChannelColor> = prepared
            .area
            .channels
            .iter()
            .map(|channel| {
                let rgb = request
                    .channel_colors
                    .as_deref()
                    .and_then(|overrides| {
                        overrides
                            .iter()
                            .find(|entry| entry.channel_id == channel.channel_id)
                    })
                    .map(|entry| entry.rgb)
                    .unwrap_or(request.rgb);
                ChannelColor::from_rgb8(channel.channel_id, rgb)
            })
            .collect();

        Ok(self.launch_stream(
            app,
            prepared,
            ColorSource::Static(colors),
            STATIC_RESEND_INTERVAL,
            // The color test always restores; it is a hardware validation
            // tool, not a sync session.
            StopBehavior::Restore,
            handles.stop_rx,
            handles.live_rx,
        ))
    }

    /// Applies live brightness/intensity changes to the active session
    /// without restarting it.
    pub fn update_sync(&self, request: UpdateSyncRequest) -> Result<HostSyncStatus, String> {
        if let Some(brightness) = request.brightness {
            if !(0.0..=100.0).contains(&brightness) {
                return Err("Brightness must be between 0 and 100.".to_string());
            }
        }
        let inner = self.inner.lock().unwrap();
        if !matches!(
            inner.lifecycle,
            HostSyncLifecycle::Starting | HostSyncLifecycle::Running
        ) {
            return Err("No active PC sync session to update.".to_string());
        }
        if let Some(live_tx) = &inner.live_tx {
            let _ = live_tx.send(request);
        }
        Ok(inner.snapshot())
    }

    /// Single-session guard and transition to `starting`. Split from the
    /// start methods so it is testable without a Tauri runtime.
    fn begin_session(&self, area_id: &str) -> Result<SessionHandles, String> {
        let mut inner = self.inner.lock().unwrap();
        if matches!(
            inner.lifecycle,
            HostSyncLifecycle::Starting | HostSyncLifecycle::Running | HostSyncLifecycle::Stopping
        ) {
            return Err("A PC sync session is already active.".to_string());
        }
        // The engine keeps the senders so a stop or settings update issued
        // during `starting` is already observable by the eventual task.
        let (stop_tx, stop_rx) = watch::channel(false);
        let (live_tx, live_rx) = watch::channel(UpdateSyncRequest::default());
        inner.lifecycle = HostSyncLifecycle::Starting;
        inner.area_id = Some(area_id.to_string());
        inner.error = None;
        inner.warning = None;
        inner.stop_tx = Some(stop_tx);
        inner.live_tx = Some(live_tx);
        inner.request = None;
        Ok(SessionHandles {
            stop_rx,
            live_rx,
            status: inner.snapshot(),
        })
    }

    /// Resolves credentials, checks the takeover gate, snapshots member
    /// lights, claims the area, and connects DTLS — rolling the claim back
    /// when the handshake fails.
    async fn prepare_session<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        area_id: &str,
        confirm_takeover: bool,
    ) -> Result<PreparedSession, String> {
        let client = HueClient::new()?;
        let bridge = client.get_stored_bridge(app)?;
        let rest_key = resolve_streaming_rest_key(app, &client, &bridge.bridge_id)?;
        let client_key = credentials::load_client_key(&bridge.bridge_id)?.ok_or_else(|| {
            "No entertainment clientkey stored. Enable PC Sync in connection settings first."
                .to_string()
        })?;
        let psk = credentials::decode_client_key(&client_key)?;
        let application_id = client
            .fetch_application_id(&bridge.bridge_ip, &rest_key)
            .await?;

        let area = client
            .get_entertainment_area(&bridge.bridge_ip, &rest_key, area_id)
            .await?;
        if area.channels.is_empty() {
            return Err("The selected entertainment area has no channels.".to_string());
        }
        if takeover_blocked(&area, &application_id, confirm_takeover) {
            return Err(
                "Another application is streaming to this entertainment area. Confirm takeover to continue."
                    .to_string(),
            );
        }

        // An automation ranked above PC Sync keeps its lights: refuse rather
        // than start a stream it would pause straight away.
        if let Some(conflict) = crate::services::automations::runtime::sync_conflict(
            app,
            &bridge.bridge_id,
            &area.light_ids,
        ) {
            return Err(conflict);
        }
        // Before the snapshot, so no automation writes to these lights while
        // it is taken; the runtime hears the end from `emit_status`.
        crate::services::automations::runtime::signal(
            crate::services::automations::runtime::Signal::SyncStarted {
                bridge_id: bridge.bridge_id.clone(),
                light_ids: area.light_ids.clone(),
            },
        );

        // Snapshot member lights before claiming: the bridge does not restore
        // state when a stream ends, so this is the only path back.
        let light_snapshots =
            snapshot::capture(&client, &bridge.bridge_ip, &rest_key, &area.light_ids).await?;

        let session_bridge = HueSessionBridge {
            client,
            bridge_ip: bridge.bridge_ip,
            rest_key,
            light_snapshots,
        };
        let transport = claim_and_connect(
            &session_bridge,
            &DtlsTransportFactory,
            &session_bridge.bridge_ip,
            area_id,
            &application_id,
            psk,
        )
        .await?;

        Ok(PreparedSession {
            bridge: session_bridge,
            application_id,
            area,
            transport,
        })
    }

    /// Marks the session running and spawns the streaming task, which owns
    /// the entire teardown: capture workers first, then DTLS, then the area
    /// release, then the stop behavior.
    #[allow(clippy::too_many_arguments)]
    fn launch_stream<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        prepared: PreparedSession,
        source: ColorSource,
        tick: Duration,
        stop_behavior: StopBehavior,
        stop_rx: watch::Receiver<bool>,
        live_rx: watch::Receiver<UpdateSyncRequest>,
    ) -> HostSyncStatus {
        let status = {
            let mut inner = self.inner.lock().unwrap();
            // Stop may have been requested while we were connecting; let the
            // streaming task notice via the watch channel and unwind cleanly.
            if inner.lifecycle == HostSyncLifecycle::Starting {
                inner.lifecycle = HostSyncLifecycle::Running;
            }
            inner.snapshot()
        };
        emit_status(app, &status);

        let engine = self.inner.clone();
        let app = app.clone();
        let area_id = prepared.area.id.clone();
        let task = tauri::async_runtime::spawn(async move {
            let PreparedSession {
                bridge,
                application_id,
                transport,
                ..
            } = prepared;

            let warning_engine = engine.clone();
            let warning_app = app.clone();
            let on_warning = move |warning: String| {
                let status = {
                    let mut inner = warning_engine.lock().unwrap();
                    inner.warning = Some(warning);
                    inner.snapshot()
                };
                emit_status(&warning_app, &status);
            };

            let error = run_session(
                &transport,
                &bridge,
                &area_id,
                &application_id,
                source,
                StreamTiming::production(tick),
                stop_behavior,
                stop_rx,
                live_rx,
                &on_warning,
            )
            .await;

            let final_status = {
                let mut inner = engine.lock().unwrap();
                inner.stop_tx = None;
                inner.live_tx = None;
                inner.area_id = None;
                inner.warning = None;
                match error {
                    None => {
                        inner.lifecycle = HostSyncLifecycle::Idle;
                        inner.error = None;
                    }
                    Some(error) => {
                        inner.lifecycle = HostSyncLifecycle::Error;
                        inner.error = Some(error);
                    }
                }
                inner.snapshot()
            };
            emit_status(&app, &final_status);
        });
        self.inner.lock().unwrap().task = Some(task);

        status
    }

    fn fail<R: Runtime>(&self, app: &AppHandle<R>, error: &str) -> HostSyncStatus {
        let status = {
            let mut inner = self.inner.lock().unwrap();
            inner.lifecycle = HostSyncLifecycle::Error;
            inner.error = Some(error.to_string());
            inner.area_id = None;
            inner.stop_tx = None;
            inner.live_tx = None;
            inner.snapshot()
        };
        emit_status(app, &status);
        status
    }

    /// Records a non-fatal degradation on the current session.
    #[cfg(windows)]
    fn warn<R: Runtime>(&self, app: &AppHandle<R>, warning: String) -> HostSyncStatus {
        let status = {
            let mut inner = self.inner.lock().unwrap();
            inner.warning = Some(warning);
            inner.snapshot()
        };
        emit_status(app, &status);
        status
    }
}

/// Resolves the persisted palette selection, fetching scene colors from the
/// bridge for scene-derived palettes.
#[cfg(windows)]
async fn resolve_music_palette<R: Runtime>(
    app: &AppHandle<R>,
    choice: &MusicPaletteChoice,
) -> Result<ResolvedPalette, String> {
    match choice {
        MusicPaletteChoice::Builtin(palette) => Ok(ResolvedPalette::Builtin(*palette)),
        MusicPaletteChoice::Scene(reference) => {
            let client = HueClient::new()?;
            let bridge = client.get_stored_bridge(app)?;
            let rest_key = resolve_streaming_rest_key(app, &client, &bridge.bridge_id)?;
            let scenes = client.get_scenes(&bridge.bridge_ip, &rest_key).await?;
            let scene = scenes
                .into_iter()
                .find(|scene| scene.id == reference.scene_id)
                .ok_or_else(|| {
                    "The scene selected for the Music palette no longer exists.".to_string()
                })?;
            music::scene_palette_stops(&scene.colors).ok_or_else(|| {
                format!(
                    "The scene \"{}\" has no colors to build a Music palette from.",
                    scene.name
                )
            })
        }
    }
}

/// Streams frames at `tick` until stopped, a send/capture fails, or area
/// ownership changes externally. The sequence number increments per frame and
/// wraps at 255.
#[allow(clippy::too_many_arguments)]
async fn run_session<T, B>(
    transport: &T,
    bridge: &B,
    area_id: &str,
    application_id: &str,
    mut source: ColorSource,
    timing: StreamTiming,
    stop_behavior: StopBehavior,
    stop_rx: watch::Receiver<bool>,
    live_rx: watch::Receiver<UpdateSyncRequest>,
    on_warning: &(dyn Fn(String) + Send + Sync),
) -> Option<String>
where
    T: SessionTransport,
    B: SessionBridge,
{
    let end = run_stream(
        transport,
        bridge,
        area_id,
        application_id,
        &mut source,
        timing,
        stop_rx,
        live_rx,
        on_warning,
    )
    .await;

    // Stop order per plan: capture workers, then the stream, then the area
    // release, then the configured stop behavior.
    source.shutdown().await;
    transport.close().await;
    match end {
        StreamEnd::Stopped => {
            let _ = bridge.release(area_id).await;
            match stop_behavior {
                StopBehavior::Restore => bridge.restore().await.err(),
                StopBehavior::Keep => None,
                StopBehavior::TurnOff => bridge.turn_off().await.err(),
            }
        }
        StreamEnd::OwnershipLost => {
            Some("Another application took over the entertainment area.".to_string())
        }
        StreamEnd::Failed(error) => {
            let _ = bridge.release(area_id).await;
            let _ = bridge.restore().await;
            Some(error)
        }
    }
}

#[allow(clippy::too_many_arguments)]
async fn run_stream<T, B>(
    transport: &T,
    bridge: &B,
    area_id: &str,
    application_id: &str,
    source: &mut ColorSource,
    timing: StreamTiming,
    mut stop_rx: watch::Receiver<bool>,
    mut live_rx: watch::Receiver<UpdateSyncRequest>,
    on_warning: &(dyn Fn(String) + Send + Sync),
) -> StreamEnd
where
    T: SessionTransport,
    B: SessionBridge,
{
    if *stop_rx.borrow() {
        return StreamEnd::Stopped;
    }
    let mut sequence: u8 = 0;
    let mut frame_tick = tokio::time::interval(timing.frame);
    let mut ownership_tick = tokio::time::interval(timing.ownership_poll);
    let mut poll_failures: u32 = 0;
    let mut live_open = true;
    loop {
        tokio::select! {
            _ = frame_tick.tick() => {
                let (colors, warning) = match source.next_colors() {
                    Ok(colors) => colors,
                    Err(error) => return StreamEnd::Failed(error),
                };
                if let Some(warning) = warning {
                    on_warning(warning);
                }
                let frame = match protocol::encode_frame(area_id, sequence, &colors) {
                    Ok(frame) => frame,
                    Err(error) => return StreamEnd::Failed(error),
                };
                if let Err(error) = transport.send(&frame).await {
                    return StreamEnd::Failed(error);
                }
                sequence = sequence.wrapping_add(1);
            }
            _ = ownership_tick.tick() => {
                match bridge.get_area(area_id).await {
                    Ok(area) => {
                        poll_failures = 0;
                        if ownership_lost(&area, application_id) {
                            return StreamEnd::OwnershipLost;
                        }
                    }
                    Err(error) => {
                        // Transient poll failures don't kill the stream; a
                        // run of them means the bridge itself is gone.
                        poll_failures += 1;
                        if poll_failures >= BRIDGE_LOSS_THRESHOLD {
                            return StreamEnd::Failed(format!(
                                "Lost contact with the bridge while streaming: {error}"
                            ));
                        }
                    }
                }
            }
            changed = live_rx.changed(), if live_open => {
                match changed {
                    Ok(()) => {
                        let update = *live_rx.borrow_and_update();
                        if let Some(intensity) = update.intensity {
                            frame_tick = tokio::time::interval(
                                Duration::from_secs_f64(1.0 / f64::from(intensity.tick_hz())),
                            );
                        }
                        source.apply(update);
                    }
                    // Sender dropped: no more live updates, keep streaming.
                    Err(_) => live_open = false,
                }
            }
            changed = stop_rx.changed() => {
                // A closed channel means the engine dropped the sender; treat
                // it like a stop request either way.
                if changed.is_err() || *stop_rx.borrow() {
                    return StreamEnd::Stopped;
                }
            }
        }
    }
}

fn emit_status<R: Runtime>(app: &AppHandle<R>, status: &HostSyncStatus) {
    // Idle and Error come only after the stop behavior ran, so automations
    // write their looks over PC Sync's restore, never under it.
    if matches!(
        status.state,
        HostSyncLifecycle::Idle | HostSyncLifecycle::Error
    ) {
        crate::services::automations::runtime::signal(
            crate::services::automations::runtime::Signal::SyncEnded,
        );
    }
    if let Err(_error) = app.emit(STATUS_EVENT, status.clone()) {
        #[cfg(debug_assertions)]
        eprintln!("failed to emit {STATUS_EVENT}: {_error}");
    }
}

#[cfg(test)]
mod tests {
    use std::collections::VecDeque;

    use super::*;

    type CallLog = Arc<Mutex<Vec<&'static str>>>;

    struct MockBridge {
        areas: Mutex<VecDeque<Result<HueEntertainmentArea, String>>>,
        restore_error: Option<String>,
        calls: CallLog,
    }

    impl MockBridge {
        fn new(
            areas: impl IntoIterator<Item = Result<HueEntertainmentArea, String>>,
            calls: CallLog,
        ) -> Self {
            Self {
                areas: Mutex::new(areas.into_iter().collect()),
                restore_error: None,
                calls,
            }
        }

        fn owned(calls: CallLog) -> Self {
            Self::new([Ok(area("active", Some(US)))], calls)
        }
    }

    impl SessionBridge for MockBridge {
        async fn get_area(&self, _area_id: &str) -> Result<HueEntertainmentArea, String> {
            self.calls.lock().unwrap().push("get-area");
            self.areas
                .lock()
                .unwrap()
                .pop_front()
                .unwrap_or_else(|| Ok(area("active", Some(US))))
        }

        async fn claim(&self, _area_id: &str) -> Result<(), String> {
            self.calls.lock().unwrap().push("claim");
            Ok(())
        }

        async fn release(&self, _area_id: &str) -> Result<(), String> {
            self.calls.lock().unwrap().push("release");
            Ok(())
        }

        async fn restore(&self) -> Result<(), String> {
            self.calls.lock().unwrap().push("restore");
            match &self.restore_error {
                Some(error) => Err(error.clone()),
                None => Ok(()),
            }
        }

        async fn turn_off(&self) -> Result<(), String> {
            self.calls.lock().unwrap().push("turn-off");
            Ok(())
        }
    }

    #[derive(Debug)]
    struct MockTransport {
        send_error: Option<String>,
        calls: CallLog,
    }

    impl MockTransport {
        fn new(calls: CallLog) -> Self {
            Self {
                send_error: None,
                calls,
            }
        }
    }

    impl SessionTransport for MockTransport {
        async fn send(&self, _frame: &[u8]) -> Result<(), String> {
            self.calls.lock().unwrap().push("send");
            match &self.send_error {
                Some(error) => Err(error.clone()),
                None => Ok(()),
            }
        }

        async fn close(&self) {
            self.calls.lock().unwrap().push("close");
        }
    }

    struct FailingTransportFactory {
        calls: CallLog,
    }

    impl SessionTransportFactory for FailingTransportFactory {
        type Transport = MockTransport;

        async fn connect(
            &self,
            _bridge_ip: &str,
            _application_id: &str,
            _psk: [u8; 16],
        ) -> Result<Self::Transport, String> {
            self.calls.lock().unwrap().push("connect");
            Err("handshake failed".to_string())
        }
    }

    fn area(status: &str, owner: Option<&str>) -> HueEntertainmentArea {
        HueEntertainmentArea {
            id: "918be4cd-8533-4d45-ae5e-bc8e37268310".to_string(),
            name: "Test area".to_string(),
            configuration_type: Some("monitor".to_string()),
            status: status.to_string(),
            active_streamer_id: owner.map(ToString::to_string),
            channels: Vec::new(),
            light_ids: Vec::new(),
        }
    }

    const US: &str = "our-application-id";
    const OTHER: &str = "someone-else";
    const AREA_ID: &str = "918be4cd-8533-4d45-ae5e-bc8e37268310";

    fn static_source() -> ColorSource {
        ColorSource::Static(vec![ChannelColor::from_rgb8(0, [10, 20, 30])])
    }

    fn fast_timing() -> StreamTiming {
        StreamTiming {
            frame: Duration::from_millis(1),
            ownership_poll: Duration::from_millis(1),
        }
    }

    fn live_channel() -> (
        watch::Sender<UpdateSyncRequest>,
        watch::Receiver<UpdateSyncRequest>,
    ) {
        watch::channel(UpdateSyncRequest::default())
    }

    fn ignore_warnings(_warning: String) {}

    #[tokio::test]
    async fn failed_transport_connect_releases_the_claimed_area() {
        let calls = CallLog::default();
        let bridge = MockBridge::owned(calls.clone());
        let factory = FailingTransportFactory {
            calls: calls.clone(),
        };

        let error = claim_and_connect(&bridge, &factory, "192.0.2.1", AREA_ID, US, [0; 16])
            .await
            .unwrap_err();

        assert_eq!(error, "handshake failed");
        assert_eq!(
            *calls.lock().unwrap(),
            ["claim", "connect", "release", "restore"]
        );
    }

    #[tokio::test]
    async fn explicit_stop_closes_releases_then_restores() {
        let calls = CallLog::default();
        let bridge = MockBridge::owned(calls.clone());
        let transport = MockTransport::new(calls.clone());
        let (_stop_tx, stop_rx) = watch::channel(true);

        let (_live_tx, live_rx) = live_channel();
        let error = run_session(
            &transport,
            &bridge,
            AREA_ID,
            US,
            static_source(),
            fast_timing(),
            StopBehavior::Restore,
            stop_rx,
            live_rx,
            &ignore_warnings,
        )
        .await;

        assert_eq!(error, None);
        assert_eq!(*calls.lock().unwrap(), ["close", "release", "restore"]);
    }

    #[tokio::test]
    async fn stop_behaviors_keep_and_turn_off_replace_the_restore() {
        for (behavior, expected_tail) in [
            (StopBehavior::Keep, vec!["close", "release"]),
            (StopBehavior::TurnOff, vec!["close", "release", "turn-off"]),
        ] {
            let calls = CallLog::default();
            let bridge = MockBridge::owned(calls.clone());
            let transport = MockTransport::new(calls.clone());
            let (_stop_tx, stop_rx) = watch::channel(true);
            let (_live_tx, live_rx) = live_channel();

            let error = run_session(
                &transport,
                &bridge,
                AREA_ID,
                US,
                static_source(),
                fast_timing(),
                behavior,
                stop_rx,
                live_rx,
                &ignore_warnings,
            )
            .await;

            assert_eq!(error, None);
            let calls = calls.lock().unwrap();
            assert!(!calls.contains(&"restore"), "{behavior:?}: {calls:?}");
            assert!(calls.ends_with(&expected_tail), "{behavior:?}: {calls:?}");
        }
    }

    #[tokio::test]
    async fn transport_failure_releases_and_restores() {
        let calls = CallLog::default();
        let bridge = MockBridge::owned(calls.clone());
        let transport = MockTransport {
            send_error: Some("send failed".to_string()),
            calls: calls.clone(),
        };
        let (_stop_tx, stop_rx) = watch::channel(false);

        let (_live_tx, live_rx) = live_channel();
        let error = run_session(
            &transport,
            &bridge,
            AREA_ID,
            US,
            static_source(),
            fast_timing(),
            StopBehavior::Restore,
            stop_rx,
            live_rx,
            &ignore_warnings,
        )
        .await;

        assert_eq!(error.as_deref(), Some("send failed"));
        let calls = calls.lock().unwrap();
        let send = calls.iter().position(|call| *call == "send").unwrap();
        let close = calls.iter().position(|call| *call == "close").unwrap();
        assert!(send < close);
        assert!(calls.ends_with(&["release", "restore"]));
    }

    #[tokio::test]
    async fn ownership_loss_does_not_release_or_restore_against_the_new_owner() {
        let calls = CallLog::default();
        let bridge = MockBridge::new([Ok(area("active", Some(OTHER)))], calls.clone());
        let transport = MockTransport::new(calls.clone());
        let (_stop_tx, stop_rx) = watch::channel(false);

        let (_live_tx, live_rx) = live_channel();
        let error = run_session(
            &transport,
            &bridge,
            AREA_ID,
            US,
            static_source(),
            fast_timing(),
            StopBehavior::Restore,
            stop_rx,
            live_rx,
            &ignore_warnings,
        )
        .await;

        let error = error.unwrap();
        assert_eq!(
            error,
            "Another application took over the entertainment area."
        );
        assert!(!error.contains(OTHER));
        let calls = calls.lock().unwrap();
        assert!(calls.contains(&"close"));
        assert!(!calls.contains(&"release"));
        assert!(!calls.contains(&"restore"));
    }

    #[tokio::test]
    async fn repeated_bridge_poll_failures_end_the_stream_and_restore() {
        let calls = CallLog::default();
        let bridge = MockBridge::new(
            [
                Err("offline".to_string()),
                Err("offline".to_string()),
                Err("offline".to_string()),
            ],
            calls.clone(),
        );
        let transport = MockTransport::new(calls.clone());
        let (_stop_tx, stop_rx) = watch::channel(false);

        let (_live_tx, live_rx) = live_channel();
        let error = run_session(
            &transport,
            &bridge,
            AREA_ID,
            US,
            static_source(),
            fast_timing(),
            StopBehavior::Restore,
            stop_rx,
            live_rx,
            &ignore_warnings,
        )
        .await;

        assert!(error.unwrap().contains("Lost contact with the bridge"));
        let calls = calls.lock().unwrap();
        assert_eq!(
            calls.iter().filter(|call| **call == "get-area").count(),
            BRIDGE_LOSS_THRESHOLD as usize
        );
        assert!(calls.ends_with(&["close", "release", "restore"]));
    }

    #[test]
    fn takeover_gate_only_blocks_unconfirmed_foreign_streams() {
        // Inactive area: never blocked.
        assert!(!takeover_blocked(&area("inactive", None), US, false));
        // Foreign active stream: blocked until confirmed.
        assert!(takeover_blocked(&area("active", Some(OTHER)), US, false));
        assert!(!takeover_blocked(&area("active", Some(OTHER)), US, true));
        // Our own stale ownership is not a takeover.
        assert!(!takeover_blocked(&area("active", Some(US)), US, false));
    }

    #[test]
    fn ownership_is_lost_when_inactive_or_foreign() {
        assert!(!ownership_lost(&area("active", Some(US)), US));
        assert!(ownership_lost(&area("active", Some(OTHER)), US));
        assert!(ownership_lost(&area("inactive", None), US));
        // Active but with no reported streamer: treat as lost, never stream blind.
        assert!(ownership_lost(&area("active", None), US));
    }

    #[test]
    fn second_session_is_rejected_without_disturbing_the_first() {
        let engine = HostSyncEngine::default();
        let status = engine.begin_session("area-1").unwrap().status;
        assert_eq!(status.state, HostSyncLifecycle::Starting);

        let error = engine.begin_session("area-2").unwrap_err();
        assert!(error.contains("already active"));
        // The rejected start must not have disturbed the first session.
        let current = engine.status();
        assert_eq!(current.state, HostSyncLifecycle::Starting);
        assert_eq!(current.area_id.as_deref(), Some("area-1"));
    }

    #[test]
    fn a_new_session_clears_a_previous_error() {
        let engine = HostSyncEngine::default();
        {
            let mut inner = engine.inner.lock().unwrap();
            inner.lifecycle = HostSyncLifecycle::Error;
            inner.error = Some("previous failure".to_string());
        }
        let status = engine.begin_session("area").unwrap().status;
        assert_eq!(status.state, HostSyncLifecycle::Starting);
        assert_eq!(status.error, None);
    }

    #[test]
    fn stop_is_idempotent_when_idle_or_errored() {
        let engine = HostSyncEngine::default();
        assert!(engine.request_stop().is_none());
        assert!(engine.request_stop().is_none());
        assert_eq!(engine.status().state, HostSyncLifecycle::Idle);

        engine.inner.lock().unwrap().lifecycle = HostSyncLifecycle::Error;
        assert!(engine.request_stop().is_none());
        assert_eq!(engine.status().state, HostSyncLifecycle::Error);
    }

    #[test]
    fn stop_signals_a_running_session_exactly_once() {
        let engine = HostSyncEngine::default();
        let stop_rx = engine.begin_session("area").unwrap().stop_rx;
        engine.inner.lock().unwrap().lifecycle = HostSyncLifecycle::Running;

        let status = engine.request_stop().expect("running session must stop");
        assert_eq!(status.state, HostSyncLifecycle::Stopping);
        assert!(*stop_rx.borrow(), "streaming task must see the stop signal");
        // Already stopping: a second stop is a no-op.
        assert!(engine.request_stop().is_none());
    }

    #[test]
    fn stop_during_starting_is_visible_to_the_pending_task() {
        let engine = HostSyncEngine::default();
        let stop_rx = engine.begin_session("area").unwrap().stop_rx;
        let status = engine.request_stop().expect("starting session must stop");
        assert_eq!(status.state, HostSyncLifecycle::Stopping);
        assert!(*stop_rx.borrow());
    }

    #[test]
    fn update_is_rejected_without_an_active_session() {
        let engine = HostSyncEngine::default();
        let error = engine
            .update_sync(UpdateSyncRequest::default())
            .unwrap_err();
        assert!(error.contains("No active PC sync session"));

        engine.inner.lock().unwrap().lifecycle = HostSyncLifecycle::Error;
        assert!(engine.update_sync(UpdateSyncRequest::default()).is_err());
    }

    #[test]
    fn update_validates_brightness_and_reaches_the_session() {
        let engine = HostSyncEngine::default();
        let mut live_rx = engine.begin_session("area").unwrap().live_rx;
        engine.inner.lock().unwrap().lifecycle = HostSyncLifecycle::Running;

        let error = engine
            .update_sync(UpdateSyncRequest {
                brightness: Some(150.0),
                intensity: None,
            })
            .unwrap_err();
        assert!(error.contains("between 0 and 100"));
        assert!(!live_rx.has_changed().unwrap(), "invalid update never sent");

        engine
            .update_sync(UpdateSyncRequest {
                brightness: Some(40.0),
                intensity: Some(SyncIntensity::High),
            })
            .unwrap();
        assert!(live_rx.has_changed().unwrap());
        let update = *live_rx.borrow_and_update();
        assert_eq!(update.brightness, Some(40.0));
        assert!(matches!(update.intensity, Some(SyncIntensity::High)));
    }

    #[tokio::test]
    async fn live_updates_and_a_dropped_live_channel_do_not_end_the_stream() {
        let calls = CallLog::default();
        let bridge = MockBridge::owned(calls.clone());
        let transport = MockTransport::new(calls.clone());
        let (stop_tx, stop_rx) = watch::channel(false);
        let (live_tx, live_rx) = live_channel();

        let session = run_session(
            &transport,
            &bridge,
            AREA_ID,
            US,
            static_source(),
            fast_timing(),
            StopBehavior::Restore,
            stop_rx,
            live_rx,
            &ignore_warnings,
        );
        let driver = async {
            live_tx
                .send(UpdateSyncRequest {
                    brightness: Some(10.0),
                    intensity: Some(SyncIntensity::Subtle),
                })
                .unwrap();
            tokio::time::sleep(Duration::from_millis(20)).await;
            drop(live_tx);
            tokio::time::sleep(Duration::from_millis(20)).await;
            stop_tx.send(true).unwrap();
        };
        let (error, ()) = tokio::join!(session, driver);

        assert_eq!(error, None, "live updates must not end the stream");
        let calls = calls.lock().unwrap();
        assert!(calls.contains(&"send"), "stream kept sending");
        assert!(calls.ends_with(&["close", "release", "restore"]));
    }

    #[test]
    fn shutdown_is_a_no_op_when_idle() {
        let engine = HostSyncEngine::default();
        engine.shutdown_blocking(Duration::from_millis(10));
        assert_eq!(engine.status().state, HostSyncLifecycle::Idle);
    }

    #[test]
    fn shutdown_signals_and_joins_the_streaming_task() {
        let engine = HostSyncEngine::default();
        let stop_rx = engine.begin_session("area").unwrap().stop_rx;
        {
            let mut inner = engine.inner.lock().unwrap();
            inner.lifecycle = HostSyncLifecycle::Running;
            // Stand-in for the streaming task: exits when signalled, like
            // run_stream reacting to the watch channel.
            let mut task_rx = stop_rx.clone();
            inner.task = Some(tauri::async_runtime::spawn(async move {
                let _ = task_rx.changed().await;
            }));
        }

        engine.shutdown_blocking(Duration::from_secs(2));
        assert!(*stop_rx.borrow(), "shutdown must signal the task");
        assert!(
            engine.inner.lock().unwrap().task.is_none(),
            "shutdown must take and join the task handle"
        );
    }
}
