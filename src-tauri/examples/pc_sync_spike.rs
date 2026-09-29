//! Hardware spike driver for PC-hosted entertainment sync (plan step 1).
//!
//! Drives the exact modules the app uses — same keyring accounts, same DTLS
//! transport — without the Tauri shell, so streaming can be validated from a
//! terminal. Never prints credential material.
//!
//! ```text
//! cargo run --example pc_sync_spike -- status
//! cargo run --example pc_sync_spike -- provision            # press link button first
//! cargo run --example pc_sync_spike -- test <area-id> [r g b] [seconds]
//! ```

use std::time::Duration;

use mote_desktop_lib::services::entertainment::credentials;
use mote_desktop_lib::services::entertainment::dtls::EntertainmentTransport;
use mote_desktop_lib::services::entertainment::protocol::{self, ChannelColor};
use mote_desktop_lib::services::entertainment::snapshot;
use mote_desktop_lib::services::hue_client::HueClient;

/// How long `provision` polls for the link button before giving up.
const LINK_BUTTON_WINDOW: Duration = Duration::from_secs(90);
const LINK_BUTTON_POLL: Duration = Duration::from_secs(2);

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let result = match args.first().map(String::as_str) {
        Some("status") => status().await,
        Some("provision") => provision().await,
        Some("test") => test(&args[1..]).await,
        Some("white") => white(&args[1..]).await,
        Some("video") => video(&args[1..]).await,
        Some("latency") => latency(&args[1..]).await,
        Some("audio") => audio(),
        Some("listen") => listen(&args[1..]),
        Some("capstate") => capstate(&args[1..]),
        _ => {
            eprintln!(
                "usage: pc_sync_spike status | provision | test <area-id> [r g b] [seconds] | white <area-id> | video <area-id> [seconds] | latency <area-id> [seconds] | audio | listen [device-substring] [seconds]"
            );
            std::process::exit(2);
        }
    };
    if let Err(error) = result {
        eprintln!("FAILED: {error}");
        std::process::exit(1);
    }
}

/// Reads the active bridge's (id, ip, application_key) from the app's store
/// file. Understands the multi-bridge `bridges` shape and falls back to the
/// legacy single-`bridge` key.
fn active_bridge() -> Result<(String, String, Option<String>), String> {
    let appdata =
        std::env::var("APPDATA").map_err(|_| "APPDATA environment variable not set".to_string())?;
    let path = format!("{appdata}\\com.motedesktop.mote\\hue-store.json");
    let text = std::fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read {path}: {error}"))?;
    let json: serde_json::Value = serde_json::from_str(&text)
        .map_err(|error| format!("Invalid store file {path}: {error}"))?;

    let read_entry = |entry: &serde_json::Value| {
        let ip = entry.get("bridge_ip").and_then(|v| v.as_str())?.to_string();
        let id = entry
            .get("bridge_id")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        let key = entry
            .get("application_key")
            .and_then(|v| v.as_str())
            .map(ToString::to_string);
        Some((id, ip, key))
    };

    if let Some(list) = json.pointer("/bridges/bridges").and_then(|v| v.as_array()) {
        let active = json
            .pointer("/bridges/activeBridgeId")
            .and_then(|v| v.as_str());
        let entry = list
            .iter()
            .find(|entry| {
                active
                    .zip(entry.get("bridge_id").and_then(|v| v.as_str()))
                    .map(|(a, b)| a.eq_ignore_ascii_case(b))
                    .unwrap_or(false)
            })
            .or_else(|| list.first());
        if let Some(found) = entry.and_then(read_entry) {
            return Ok(found);
        }
    }

    json.pointer("/bridge")
        .and_then(read_entry)
        .ok_or_else(|| format!("No bridge in {path}; pair the bridge in the app first."))
}

/// Reads the active bridge IP from the app's store file.
fn bridge_ip() -> Result<String, String> {
    active_bridge().map(|(_, ip, _)| ip)
}

/// The active bridge id, used to namespace entertainment credentials.
fn bridge_id() -> Result<String, String> {
    active_bridge().map(|(id, _, _)| id)
}

/// The REST key for CLIP calls: dedicated entertainment credential when
/// provisioned, else the main app credential (keyring, then store fallback).
fn rest_key() -> Result<String, String> {
    let (id, _, store_key) = active_bridge()?;
    if let Some(key) = credentials::load_application_key(&id)? {
        return Ok(key);
    }
    // Main app credential: per-bridge keyring account, then the copy in the
    // store file.
    let main = keyring::Entry::new("com.motedesktop.mote", &format!("hue-application-key:{id}"))
        .map_err(|error| format!("Keyring access failed: {error}"))
        .and_then(|entry| {
            entry
                .get_password()
                .map_err(|error| format!("Keyring read failed: {error}"))
        });
    if let Ok(key) = main {
        return Ok(key);
    }
    // Only builds that predate the keyring-only migration left a copy here.
    store_key.ok_or_else(|| "No usable Hue application key found.".to_string())
}

async fn status() -> Result<(), String> {
    let ip = bridge_ip()?;
    println!("bridge ip: {ip}");

    let creds = credentials::credential_status(&bridge_id()?);
    println!("entertainment clientkey stored: {}", creds.has_client_key);
    println!(
        "dedicated entertainment application key: {}",
        creds.has_dedicated_application_key
    );

    let key = rest_key()?;
    let client = HueClient::new()?;
    match client.fetch_application_id(&ip, &key).await {
        Ok(id) => println!("hue-application-id: {id}"),
        Err(error) => println!("hue-application-id lookup failed: {error}"),
    }

    let areas = client.get_entertainment_areas(&ip, &key).await?;
    if areas.is_empty() {
        println!("no entertainment areas configured (create one in the official Hue app)");
    }
    for area in areas {
        println!(
            "area {} — \"{}\" type={} status={} channels={} owner={}",
            area.id,
            area.name,
            area.configuration_type.as_deref().unwrap_or("?"),
            area.status,
            area.channels.len(),
            area.active_streamer_id.as_deref().unwrap_or("-"),
        );
    }
    Ok(())
}

async fn provision() -> Result<(), String> {
    let ip = bridge_ip()?;
    let client = HueClient::new()?;
    println!(
        "polling link-button pairing for {}s ...",
        LINK_BUTTON_WINDOW.as_secs()
    );

    let deadline = std::time::Instant::now() + LINK_BUTTON_WINDOW;
    loop {
        match client.pair_entertainment_credential(&ip).await {
            Ok((application_key, client_key)) => {
                let id = bridge_id()?;
                credentials::save_application_key(&id, &application_key)?;
                credentials::save_client_key(&id, &client_key)?;
                println!("provisioned and saved to keyring.");
                return Ok(());
            }
            Err(error) if error.contains("101") => {
                // Link button not pressed yet.
                if std::time::Instant::now() >= deadline {
                    return Err("link button was not pressed in time.".to_string());
                }
                print!(".");
                use std::io::Write as _;
                let _ = std::io::stdout().flush();
                tokio::time::sleep(LINK_BUTTON_POLL).await;
            }
            Err(error) => return Err(error),
        }
    }
}

async fn test(args: &[String]) -> Result<(), String> {
    let area_id = args
        .first()
        .ok_or_else(|| "usage: test <area-id> [r g b] [seconds]".to_string())?;
    let rgb: [u8; 3] = if args.len() >= 4 {
        [parse(&args[1])?, parse(&args[2])?, parse(&args[3])?]
    } else {
        [255, 0, 255] // magenta: unmistakable against normal scenes
    };
    let seconds: u64 = args
        .get(4)
        .map(|s| parse(s))
        .transpose()?
        .map(u64::from)
        .unwrap_or(10);

    let ip = bridge_ip()?;
    let key = rest_key()?;
    let client = HueClient::new()?;

    let client_key = credentials::load_client_key(&bridge_id()?)?
        .ok_or_else(|| "no entertainment clientkey stored; run `provision` first.".to_string())?;
    let psk = credentials::decode_client_key(&client_key)?;

    let application_id = client.fetch_application_id(&ip, &key).await?;
    println!("hue-application-id: {application_id}");

    let area = client.get_entertainment_area(&ip, &key, area_id).await?;
    println!(
        "area \"{}\" status={} channels={}",
        area.name,
        area.status,
        area.channels.len()
    );
    if area.status == "active"
        && area.active_streamer_id.as_deref() != Some(application_id.as_str())
    {
        return Err(format!(
            "area is owned by another streamer ({}); stop it first.",
            area.active_streamer_id.as_deref().unwrap_or("unknown")
        ));
    }

    let snapshots = snapshot::capture(&client, &ip, &key, &area.light_ids).await?;
    println!("snapshotted {} member light(s)", snapshots.len());

    println!("claiming area (action: start) ...");
    client
        .set_entertainment_action(&ip, &key, area_id, "start")
        .await?;

    println!("DTLS handshake on {ip}:2100 ...");
    let transport = match EntertainmentTransport::connect(&ip, &application_id, psk).await {
        Ok(transport) => transport,
        Err(error) => {
            let _ = client
                .set_entertainment_action(&ip, &key, area_id, "stop")
                .await;
            return Err(error);
        }
    };
    println!(
        "handshake OK — streaming rgb({},{},{}) for {seconds}s",
        rgb[0], rgb[1], rgb[2]
    );

    let colors: Vec<ChannelColor> = area
        .channels
        .iter()
        .map(|channel| ChannelColor::from_rgb8(channel.channel_id, rgb))
        .collect();

    let mut sequence: u8 = 0;
    let started = std::time::Instant::now();
    let mut result = Ok(());
    while started.elapsed() < Duration::from_secs(seconds) {
        let frame = protocol::encode_frame(&area.id, sequence, &colors)?;
        if let Err(error) = transport.send(&frame).await {
            result = Err(error);
            break;
        }
        // Once, mid-stream: verify the bridge reports our application id as
        // `active_streamer` — the engine's ownership monitor relies on it.
        if sequence == 10 {
            match client.get_entertainment_area(&ip, &key, area_id).await {
                Ok(live) => {
                    let owner = live.active_streamer_id.as_deref().unwrap_or("-");
                    println!(
                        "live ownership check: status={} owner={} matches_our_id={}",
                        live.status,
                        owner,
                        owner == application_id
                    );
                }
                Err(error) => println!("live ownership check failed: {error}"),
            }
        }
        sequence = sequence.wrapping_add(1);
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    println!("closing stream and releasing area ...");
    transport.close().await;
    client
        .set_entertainment_action(&ip, &key, area_id, "stop")
        .await?;

    println!("restoring {} light(s) from snapshot ...", snapshots.len());
    snapshot::restore(&client, &ip, &key, &snapshots).await?;
    result.map(|()| println!("done — lights restored to their pre-stream state."))
}

/// Recovery helper: sets every light in an area to warm white. For lights
/// left in a streamed color by runs that predate snapshot/restore.
async fn white(args: &[String]) -> Result<(), String> {
    let area_id = args
        .first()
        .ok_or_else(|| "usage: white <area-id>".to_string())?;
    let ip = bridge_ip()?;
    let key = rest_key()?;
    let client = HueClient::new()?;

    let area = client.get_entertainment_area(&ip, &key, area_id).await?;
    let warm_white: Vec<snapshot::LightSnapshot> = area
        .light_ids
        .iter()
        .map(|id| snapshot::LightSnapshot {
            id: id.clone(),
            on: true,
            brightness: Some(80.0),
            color_mode: Some("ct".to_string()),
            xy: None,
            mirek: Some(370), // ~2700K
        })
        .collect();
    snapshot::restore(&client, &ip, &key, &warm_white).await?;
    println!("set {} light(s) to warm white.", warm_white.len());
    Ok(())
}

/// Diagnostic: lists the render endpoints the app enumerates and flags the
/// one Music captures when following the Windows default. With a virtual audio
/// router (SteelSeries Sonar, VoiceMeeter, ...) the default is often a per-app
/// sub-mix, so apps routed elsewhere are never heard by loopback.
fn audio() -> Result<(), String> {
    let outputs = mote_desktop_lib::services::entertainment::audio::enumerate_audio_outputs()?;
    println!("render endpoints the app sees ({}):", outputs.len());
    for output in &outputs {
        println!(
            "  {} {}",
            if output.is_default {
                "[DEFAULT]"
            } else {
                "         "
            },
            output.name
        );
    }
    println!(
        "\nMusic with audioDeviceId=null captures the [DEFAULT] endpoint above.\nApps routed to any other endpoint (e.g. another Sonar channel) are not heard."
    );
    Ok(())
}

/// Diagnostic: meters loopback RMS on endpoints matching `device-substring`
/// (case-insensitive) for a few seconds each, so you can see which endpoint
/// actually carries an app's audio. No arg meters every endpoint. Play the
/// app you're debugging (e.g. Spotify) while this runs.
fn listen(args: &[String]) -> Result<(), String> {
    use mote_desktop_lib::services::entertainment::audio;

    let filter = args.first().map(|s| s.to_lowercase());
    let seconds: u64 = args.get(1).and_then(|s| s.parse().ok()).unwrap_or(4);
    let duration = Duration::from_secs(seconds);

    let outputs = audio::enumerate_audio_outputs()?;
    let matches: Vec<_> = outputs
        .iter()
        .filter(|o| {
            filter
                .as_deref()
                .is_none_or(|needle| o.name.to_lowercase().contains(needle))
        })
        .collect();
    if matches.is_empty() {
        return Err("no endpoint matched that substring (try `audio` to list them).".to_string());
    }

    println!(
        "metering {} endpoint(s) for {seconds}s each — play the audio you're testing now:\n",
        matches.len()
    );
    for output in matches {
        print!("  {:<48} ", output.name);
        use std::io::Write as _;
        let _ = std::io::stdout().flush();
        match audio::measure_loopback_peak_rms(Some(output.id.clone()), duration) {
            Ok(peak) => {
                let heard = if peak > 0.001 {
                    "HEARS AUDIO"
                } else {
                    "silent"
                };
                println!("peak RMS {peak:.4}  -> {heard}");
            }
            Err(error) => println!("error: {error}"),
        }
    }
    Ok(())
}

/// Diagnostic: captures the first endpoint matching `device-substring` exactly
/// like a Music session and logs its state every 500ms, so we can see whether
/// an explicit device spuriously leaves the `Active` state (which the session's
/// device-loss guard treats as a disconnect).
fn capstate(args: &[String]) -> Result<(), String> {
    use mote_desktop_lib::services::entertainment::audio;

    let needle = args
        .first()
        .ok_or_else(|| "usage: capstate <device-substring> [seconds]".to_string())?
        .to_lowercase();
    let seconds: u64 = args.get(1).and_then(|s| s.parse().ok()).unwrap_or(15);

    let outputs = audio::enumerate_audio_outputs()?;
    let output = outputs
        .iter()
        .find(|o| o.name.to_lowercase().contains(&needle))
        .ok_or_else(|| "no endpoint matched that substring (try `audio`).".to_string())?;

    println!(
        "capturing \"{}\" for {seconds}s, polling state every 500ms (play audio now):\n",
        output.name
    );
    let log = audio::diagnose_selected_device_capture(
        output.id.clone(),
        Duration::from_secs(seconds),
        Duration::from_millis(500),
    )?;
    for line in &log {
        println!("  {line}");
    }
    Ok(())
}

fn parse(value: &str) -> Result<u8, String> {
    value
        .parse::<u8>()
        .map_err(|_| format!("expected a number 0-255, got {value:?}"))
}

/// Hardware spike for capture-driven sync: samples the primary display and
/// streams the mapped channel colors, mirroring the engine's Video mode.
async fn video(args: &[String]) -> Result<(), String> {
    use mote_desktop_lib::services::entertainment::analysis::{
        self, ChannelSmoother, SyncIntensity, SyncMode,
    };
    use mote_desktop_lib::services::entertainment::capture::{CaptureRig, ColorBoard};
    use mote_desktop_lib::services::entertainment::displays;

    let area_id = args
        .first()
        .ok_or_else(|| "usage: video <area-id> [seconds]".to_string())?;
    let seconds: u64 = args
        .get(1)
        .map(|s| parse(s))
        .transpose()?
        .map(u64::from)
        .unwrap_or(15);
    let mode = SyncMode::Video;
    let intensity = SyncIntensity::High;

    let ip = bridge_ip()?;
    let key = rest_key()?;
    let client = HueClient::new()?;

    let client_key = credentials::load_client_key(&bridge_id()?)?
        .ok_or_else(|| "no entertainment clientkey stored; run `provision` first.".to_string())?;
    let psk = credentials::decode_client_key(&client_key)?;
    let application_id = client.fetch_application_id(&ip, &key).await?;

    let area = client.get_entertainment_area(&ip, &key, area_id).await?;
    let displays_all = displays::enumerate_displays()?;
    let selected = displays::resolve_selected(&displays_all, true, &[])?;
    println!(
        "capturing {} ({}x{}) for {} channel(s)",
        selected[0].name,
        selected[0].width,
        selected[0].height,
        area.channels.len()
    );

    let bounds: Vec<_> = selected.iter().map(|d| d.bounds()).collect();
    let frame = analysis::ScreenFrame::from_configuration_type(area.configuration_type.as_deref());
    let tiles = analysis::map_channels_to_tiles(&area.channels, &bounds, frame);
    for tile in &tiles {
        println!(
            "  channel {} -> display {} tile [{:.2},{:.2}]x[{:.2},{:.2}]",
            area.channels[tile.channel_index].channel_id,
            tile.display_index,
            tile.left,
            tile.right,
            tile.top,
            tile.bottom
        );
    }

    let snapshots = snapshot::capture(&client, &ip, &key, &area.light_ids).await?;
    println!(
        "snapshotted {} light(s); claiming area ...",
        snapshots.len()
    );
    client
        .set_entertainment_action(&ip, &key, area_id, "start")
        .await?;

    let transport = match EntertainmentTransport::connect(&ip, &application_id, psk).await {
        Ok(transport) => transport,
        Err(error) => {
            let _ = client
                .set_entertainment_action(&ip, &key, area_id, "stop")
                .await;
            return Err(error);
        }
    };

    let tick = Duration::from_secs_f64(1.0 / f64::from(intensity.tick_hz()));
    let board = ColorBoard::new(area.channels.len());
    let mut rig = match CaptureRig::start(&selected, &tiles, &board, tick) {
        Ok(rig) => rig,
        Err(error) => {
            transport.close().await;
            let _ = client
                .set_entertainment_action(&ip, &key, area_id, "stop")
                .await;
            return Err(error);
        }
    };
    println!(
        "capture running — streaming screen colors for {seconds}s (move colorful windows around!)"
    );

    let channel_ids: Vec<u8> = area.channels.iter().map(|c| c.channel_id).collect();
    let mut smoother = ChannelSmoother::new(channel_ids.len(), intensity, mode);
    let mut sequence: u8 = 0;
    let started = std::time::Instant::now();
    let mut result = Ok(());
    while started.elapsed() < Duration::from_secs(seconds) {
        if let Some(error) = board.error() {
            result = Err(error);
            break;
        }
        let targets = board.snapshot();
        let smoothed = smoother.step(&targets);
        let colors =
            analysis::to_wire_colors(smoothed, &channel_ids, mode.saturation_boost(), 100.0);
        let frame = protocol::encode_frame(&area.id, sequence, &colors)?;
        if let Err(error) = transport.send(&frame).await {
            result = Err(error);
            break;
        }
        if sequence == 40 {
            let sample: Vec<[u16; 3]> = colors.iter().map(|c| c.rgb).collect();
            println!("live wire colors (seq 40): {sample:?}");
        }
        sequence = sequence.wrapping_add(1);
        tokio::time::sleep(tick).await;
    }

    println!("stopping capture, releasing area, restoring lights ...");
    rig.stop();
    transport.close().await;
    client
        .set_entertainment_action(&ip, &key, area_id, "stop")
        .await?;
    snapshot::restore(&client, &ip, &key, &snapshots).await?;
    result.map(|()| println!("done."))
}

/// Manual-acceptance latency check: runs the real capture -> smooth -> encode
/// -> DTLS-send pipeline at High and Extreme and reports the internal
/// capture-analysis-to-send latency distribution against the 50 ms target.
/// Only genuinely new frames (board timestamp advanced) are measured, so
/// static-resend ticks never inflate the numbers.
async fn latency(args: &[String]) -> Result<(), String> {
    use mote_desktop_lib::services::entertainment::analysis::{
        self, ChannelSmoother, SyncIntensity, SyncMode,
    };
    use mote_desktop_lib::services::entertainment::capture::{CaptureRig, ColorBoard};
    use mote_desktop_lib::services::entertainment::displays;

    let area_id = args
        .first()
        .ok_or_else(|| "usage: latency <area-id> [seconds]".to_string())?;
    let seconds: u64 = args
        .get(1)
        .map(|s| parse(s))
        .transpose()?
        .map(u64::from)
        .unwrap_or(10);
    let mode = SyncMode::Game; // lowest-latency mode: the worst case for the target

    let ip = bridge_ip()?;
    let key = rest_key()?;
    let client = HueClient::new()?;

    let client_key = credentials::load_client_key(&bridge_id()?)?
        .ok_or_else(|| "no entertainment clientkey stored; run `provision` first.".to_string())?;
    let psk = credentials::decode_client_key(&client_key)?;
    let application_id = client.fetch_application_id(&ip, &key).await?;

    let area = client.get_entertainment_area(&ip, &key, area_id).await?;
    let displays_all = displays::enumerate_displays()?;
    let selected = displays::resolve_selected(&displays_all, true, &[])?;
    let bounds: Vec<_> = selected.iter().map(|d| d.bounds()).collect();
    let frame = analysis::ScreenFrame::from_configuration_type(area.configuration_type.as_deref());
    let tiles = analysis::map_channels_to_tiles(&area.channels, &bounds, frame);
    let channel_ids: Vec<u8> = area.channels.iter().map(|c| c.channel_id).collect();

    let snapshots = snapshot::capture(&client, &ip, &key, &area.light_ids).await?;
    println!(
        "measuring capture->send latency on {} ({} channel(s)); move colorful content around!",
        selected[0].name,
        area.channels.len()
    );
    client
        .set_entertainment_action(&ip, &key, area_id, "start")
        .await?;

    let transport = match EntertainmentTransport::connect(&ip, &application_id, psk).await {
        Ok(transport) => transport,
        Err(error) => {
            let _ = client
                .set_entertainment_action(&ip, &key, area_id, "stop")
                .await;
            return Err(error);
        }
    };

    let mut result = Ok(());
    for intensity in [SyncIntensity::High, SyncIntensity::Extreme] {
        let tick = Duration::from_secs_f64(1.0 / f64::from(intensity.tick_hz()));
        let board = ColorBoard::new(area.channels.len());
        let mut rig = match CaptureRig::start(&selected, &tiles, &board, tick) {
            Ok(rig) => rig,
            Err(error) => {
                result = Err(error);
                break;
            }
        };
        let mut smoother = ChannelSmoother::new(channel_ids.len(), intensity, mode);
        let mut sequence: u8 = 0;
        let mut samples: Vec<f64> = Vec::new();
        let mut last_measured: Option<std::time::Instant> = None;
        let started = std::time::Instant::now();
        while started.elapsed() < Duration::from_secs(seconds) {
            if let Some(error) = board.error() {
                result = Err(error);
                break;
            }
            let update = board.last_update();
            let targets = board.snapshot();
            let smoothed = smoother.step(&targets);
            let colors =
                analysis::to_wire_colors(smoothed, &channel_ids, mode.saturation_boost(), 100.0);
            let wire = protocol::encode_frame(&area.id, sequence, &colors)?;
            if let Err(error) = transport.send(&wire).await {
                result = Err(error);
                break;
            }
            // Count a sample only when this is a frame we hadn't sent before,
            // measured from analysis completion to just after the wire send.
            if let Some(update) = update {
                if last_measured != Some(update) {
                    samples.push(update.elapsed().as_secs_f64() * 1000.0);
                    last_measured = Some(update);
                }
            }
            sequence = sequence.wrapping_add(1);
            tokio::time::sleep(tick).await;
        }
        rig.stop();
        report_latency(intensity.tick_hz(), &mut samples);
        if result.is_err() {
            break;
        }
    }

    println!("releasing area and restoring lights ...");
    transport.close().await;
    client
        .set_entertainment_action(&ip, &key, area_id, "stop")
        .await?;
    snapshot::restore(&client, &ip, &key, &snapshots).await?;
    result.map(|()| println!("done."))
}

/// Prints p50/p95/max for a latency sample set and PASS/FAIL against 50 ms.
fn report_latency(tick_hz: u32, samples: &mut [f64]) {
    if samples.is_empty() {
        println!("  {tick_hz} Hz: no new frames captured (was the screen static?)");
        return;
    }
    samples.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let pct = |p: f64| {
        let idx = ((p / 100.0) * (samples.len() as f64 - 1.0)).round() as usize;
        samples[idx]
    };
    let p50 = pct(50.0);
    let p95 = pct(95.0);
    let max = *samples.last().unwrap();
    let verdict = if max < 50.0 { "PASS" } else { "FAIL" };
    println!(
        "  {tick_hz} Hz over {} frames: p50={p50:.1}ms p95={p95:.1}ms max={max:.1}ms -> {verdict} (<50ms)",
        samples.len()
    );
}
