//! Calendar rules: lights that change around the events on a subscribed
//! calendar.
//!
//! A calendar is an iCalendar address (Google's secret address, an Outlook
//! published calendar, an iCloud public calendar, or any `.ics` or `webcal:`
//! link). The address is a secret, so it lives in the keyring; only a name and
//! an id are stored in `calendar.json`. Event contents are never written to
//! disk: feeds are fetched on start and every 15 minutes, and what they say is
//! kept in memory for the next few days only.
//!
//! A rule holds its look from a few minutes before a matching event starts
//! until a few minutes after it ends, as the runtime's `Calendar(rule id)`
//! holder. Rules rank among themselves in the order they are listed, so the
//! runtime's priority, snapshots, and restoring apply as for any automation.

pub mod ics;

use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_store::StoreExt;
use tokio::sync::Notify;

use super::looks::Write;
use super::priority::Holder;
use super::resolve::{ClaimSpec, Desire, Looks};
use super::settings::{AutomationScene, AutomationTarget};
use ics::Occurrence;

const STORE_FILE: &str = "calendar.json";
const STORE_KEY: &str = "calendar";
const STATUS_EVENT: &str = "calendar-status";
const KEYRING_SERVICE: &str = "com.motedesktop.mote";
const REFRESH_EVERY: Duration = Duration::from_secs(15 * 60);
/// A failed fetch tries again sooner than a good one refreshes.
const RETRY_EVERY: Duration = Duration::from_secs(5 * 60);
const PAST: chrono::Duration = chrono::Duration::days(1);
const AHEAD: chrono::Duration = chrono::Duration::days(8);
const MAX_FEED_BYTES: usize = 8 * 1024 * 1024;
const MAX_FEEDS: usize = 10;
const MAX_RULES: usize = 30;
const MAX_URL_LEN: usize = 2000;
const TRANSITION_MS: u32 = 400;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CalendarFeed {
    pub id: String,
    pub name: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CalendarLook {
    #[default]
    Color,
    White,
    Scene,
    Off,
    Dim,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CalendarRule {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    /// Empty means every calendar.
    pub feed_ids: Vec<String>,
    /// Comma-separated words or phrases; an event matches if its title has
    /// any of them. Empty matches every title.
    pub title_includes: String,
    /// An event whose title has any of these never matches.
    pub title_excludes: String,
    /// Skip events marked free.
    pub busy_only: bool,
    pub include_all_day: bool,
    /// Minutes before an event starts that the look begins, 0-120.
    pub lead_minutes: u32,
    /// Minutes after it ends that the look stays, 0-120.
    pub trail_minutes: u32,
    pub bridge_id: Option<String>,
    pub targets: Vec<AutomationTarget>,
    pub look: CalendarLook,
    pub xy: [f64; 2],
    pub mirek: u16,
    /// 1-100; the scene's own levels are scaled by it.
    pub brightness: f64,
    pub scene: Option<AutomationScene>,
    /// Put the lights back when the event ends.
    pub restore: bool,
}

impl Default for CalendarRule {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: "Meetings".into(),
            enabled: false,
            feed_ids: Vec::new(),
            title_includes: String::new(),
            title_excludes: String::new(),
            busy_only: true,
            include_all_day: false,
            lead_minutes: 0,
            trail_minutes: 0,
            bridge_id: None,
            targets: Vec::new(),
            look: CalendarLook::Color,
            xy: [0.675, 0.322],
            mirek: 366,
            brightness: 100.0,
            scene: None,
            restore: true,
        }
    }
}

fn terms(text: &str) -> Vec<String> {
    text.split(',')
        .map(|term| term.trim().to_lowercase())
        .filter(|term| !term.is_empty())
        .collect()
}

impl CalendarRule {
    pub fn validate(&self, feeds: &[CalendarFeed]) -> Result<(), String> {
        if self.id.is_empty() || self.id.len() > 120 {
            return Err("This rule could not be saved.".into());
        }
        if self.name.trim().is_empty() || self.name.len() > 60 {
            return Err("Give each calendar rule a name.".into());
        }
        if self.title_includes.len() > 500 || self.title_excludes.len() > 500 {
            return Err("Keep the title words shorter.".into());
        }
        if self.lead_minutes > 120 || self.trail_minutes > 120 {
            return Err("Start and end at most two hours around the event.".into());
        }
        if self
            .feed_ids
            .iter()
            .any(|id| !feeds.iter().any(|feed| &feed.id == id))
        {
            return Err("Choose the calendars for this rule again.".into());
        }
        if self
            .xy
            .iter()
            .any(|v| !v.is_finite() || !(0.0..=1.0).contains(v))
            || !(50..=1000).contains(&self.mirek)
            || !self.brightness.is_finite()
            || !(1.0..=100.0).contains(&self.brightness)
        {
            return Err("Choose a valid look.".into());
        }
        if self.targets.len() > 100
            || self.targets.iter().any(|target| {
                target.id.is_empty() || target.id.len() > 512 || target.name.len() > 512
            })
        {
            return Err("Choose the lights for this rule again.".into());
        }
        let chosen = if self.look == CalendarLook::Scene {
            self.scene.is_some()
        } else {
            !self.targets.is_empty()
        };
        if (chosen || !self.targets.is_empty())
            && self.bridge_id.as_deref().is_none_or(str::is_empty)
        {
            return Err("Choose the lights for this rule again.".into());
        }
        if self.enabled && !chosen {
            return Err(if self.look == CalendarLook::Scene {
                "Choose a scene before turning on this rule.".into()
            } else {
                "Choose lights before turning on this rule.".into()
            });
        }
        Ok(())
    }

    pub fn matches(&self, feed_id: &str, event: &Occurrence) -> bool {
        if !self.feed_ids.is_empty() && !self.feed_ids.iter().any(|id| id == feed_id) {
            return false;
        }
        if (self.busy_only && !event.busy) || (!self.include_all_day && event.all_day) {
            return false;
        }
        let title = event.title.to_lowercase();
        let includes = terms(&self.title_includes);
        if !includes.is_empty() && !includes.iter().any(|term| title.contains(term)) {
            return false;
        }
        !terms(&self.title_excludes)
            .iter()
            .any(|term| title.contains(term))
    }

    /// When the look is on for an event: from the lead before its start to the
    /// trail after its end.
    pub fn window(&self, event: &Occurrence) -> (DateTime<Utc>, DateTime<Utc>) {
        (
            event.start - chrono::Duration::minutes(self.lead_minutes as i64),
            event.end + chrono::Duration::minutes(self.trail_minutes as i64),
        )
    }

    fn spec(&self) -> ClaimSpec {
        if self.look == CalendarLook::Scene {
            return ClaimSpec::Scene {
                bridge_id: self.bridge_id.clone(),
                scene_id: self.scene.as_ref().map(|scene| scene.id.clone()),
                scale: Some(self.brightness),
            };
        }
        ClaimSpec::Lights {
            bridge_id: self.bridge_id.clone(),
            targets: self.targets.clone(),
            looks: Looks::Uniform(match self.look {
                CalendarLook::White => Write::White {
                    mirek: self.mirek,
                    brightness: self.brightness,
                },
                CalendarLook::Off => Write::Off,
                CalendarLook::Dim => Write::Dim(self.brightness),
                _ => Write::Color {
                    xy: self.xy,
                    brightness: self.brightness,
                },
            }),
        }
    }

    /// The look this rule shows, for a preview.
    pub fn desire(&self) -> Desire {
        Desire {
            holder: Holder::Calendar(self.id.clone()),
            spec: self.spec(),
            restore: self.restore,
            transition_ms: TRANSITION_MS,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CalendarSettings {
    pub feeds: Vec<CalendarFeed>,
    /// In priority order: an earlier rule keeps a light a later one wants.
    pub rules: Vec<CalendarRule>,
}

impl CalendarSettings {
    pub fn validate(&self) -> Result<(), String> {
        if self.feeds.len() > MAX_FEEDS {
            return Err(format!("Add at most {MAX_FEEDS} calendars."));
        }
        if self.rules.len() > MAX_RULES {
            return Err(format!("Keep at most {MAX_RULES} calendar rules."));
        }
        for feed in &self.feeds {
            if feed.id.is_empty() || feed.name.trim().is_empty() || feed.name.len() > 60 {
                return Err("Give each calendar a name.".into());
            }
        }
        for rule in &self.rules {
            rule.validate(&self.feeds)?;
        }
        Ok(())
    }
}

pub fn load<R: Runtime>(app: &AppHandle<R>) -> CalendarSettings {
    app.store(STORE_FILE)
        .ok()
        .and_then(|store| store.get(STORE_KEY))
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default()
}

pub fn save<R: Runtime>(app: &AppHandle<R>, settings: &CalendarSettings) -> Result<(), String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|_| "Failed to open calendar settings.".to_string())?;
    store.set(
        STORE_KEY,
        serde_json::to_value(settings).map_err(|_| "Calendar settings are invalid.".to_string())?,
    );
    store
        .save()
        .map_err(|_| "Failed to save calendar settings.".to_string())
}

fn secret(feed_id: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, &format!("calendar-feed:{feed_id}"))
        .map_err(|_| "Secure credential storage is not available.".to_string())
}

pub fn save_url(feed_id: &str, url: &str) -> Result<(), String> {
    secret(feed_id)?
        .set_password(url)
        .map_err(|_| "Could not keep the calendar address safely.".to_string())
}

fn load_url(feed_id: &str) -> Option<String> {
    secret(feed_id).ok()?.get_password().ok()
}

pub fn forget_url(feed_id: &str) {
    if let Ok(entry) = secret(feed_id) {
        let _ = entry.delete_credential();
    }
}

/// A calendar address made fetchable: `webcal:` becomes `https:`, and only
/// HTTPS is accepted, so the address and its events never cross the network
/// in the clear.
pub fn normalize_url(text: &str) -> Result<String, String> {
    let text = text.trim();
    if text.len() > MAX_URL_LEN {
        return Err("That calendar address is too long.".into());
    }
    let text = match text.split_once("://") {
        Some((scheme, rest))
            if scheme.eq_ignore_ascii_case("webcal") || scheme.eq_ignore_ascii_case("webcals") =>
        {
            format!("https://{rest}")
        }
        _ => text.to_string(),
    };
    let url = reqwest::Url::parse(&text).map_err(|_| {
        "Paste the calendar's full address, starting with https:// or webcal://.".to_string()
    })?;
    if url.scheme() != "https" {
        return Err("Only secure calendar addresses (https:// or webcal://) are supported.".into());
    }
    if url.host_str().is_none_or(str::is_empty) {
        return Err(
            "Paste the calendar's full address, starting with https:// or webcal://.".into(),
        );
    }
    Ok(url.to_string())
}

fn client() -> Result<&'static reqwest::Client, String> {
    static CLIENT: OnceLock<Result<reqwest::Client, String>> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            // Certificates are checked, unlike the Hue client's, which has to
            // accept the bridge's self-signed one.
            reqwest::Client::builder()
                .timeout(Duration::from_secs(20))
                .redirect(reqwest::redirect::Policy::limited(5))
                .user_agent("MoteDesktop/1 (+https://motedesktop.com)")
                .build()
                .map_err(|_| "Could not start the calendar client.".to_string())
        })
        .as_ref()
        .map_err(Clone::clone)
}

#[derive(Debug, Clone, Default)]
struct FeedState {
    text: Option<Arc<String>>,
    etag: Option<String>,
    last_modified: Option<String>,
    events: Vec<Occurrence>,
    synced_at: Option<DateTime<Utc>>,
    error: Option<String>,
}

enum Fetched {
    Changed {
        text: String,
        etag: Option<String>,
        last_modified: Option<String>,
    },
    Unchanged,
}

/// Downloads a feed, asking the server to skip it when nothing changed.
async fn fetch(
    url: &str,
    etag: Option<&str>,
    last_modified: Option<&str>,
) -> Result<Fetched, String> {
    let mut request = client()?
        .get(url)
        .header("Accept", "text/calendar, */*;q=0.5");
    if let Some(etag) = etag {
        request = request.header("If-None-Match", etag);
    }
    if let Some(last_modified) = last_modified {
        request = request.header("If-Modified-Since", last_modified);
    }
    // The address is a secret: errors say what went wrong, never where.
    let response = request.send().await.map_err(|error| {
        if error.is_timeout() {
            "The calendar took too long to answer.".to_string()
        } else {
            "The calendar could not be reached.".to_string()
        }
    })?;
    let status = response.status();
    if status == reqwest::StatusCode::NOT_MODIFIED {
        return Ok(Fetched::Unchanged);
    }
    if status == reqwest::StatusCode::NOT_FOUND || status == reqwest::StatusCode::GONE {
        return Err(
            "This calendar address no longer works. Copy it again and add the calendar anew."
                .into(),
        );
    }
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err(
            "The calendar refused the address. Make sure it is the secret or public iCal address."
                .into(),
        );
    }
    if !status.is_success() {
        return Err(format!(
            "The calendar answered with an error ({}).",
            status.as_u16()
        ));
    }
    if response
        .content_length()
        .is_some_and(|length| length as usize > MAX_FEED_BYTES)
    {
        return Err("This calendar is too large to follow.".into());
    }
    let header = |name: &str| {
        response
            .headers()
            .get(name)
            .and_then(|value| value.to_str().ok())
            .map(str::to_string)
    };
    let (etag, last_modified) = (header("etag"), header("last-modified"));
    let bytes = response
        .bytes()
        .await
        .map_err(|_| "The calendar could not be read.".to_string())?;
    if bytes.len() > MAX_FEED_BYTES {
        return Err("This calendar is too large to follow.".into());
    }
    let text = String::from_utf8_lossy(&bytes).into_owned();
    if !text.contains("BEGIN:VCALENDAR") {
        return Err("That address is not a calendar. Use the iCal (.ics) address.".into());
    }
    Ok(Fetched::Changed {
        text,
        etag,
        last_modified,
    })
}

/// Checks an address before it is saved: it must answer with a calendar.
/// Returns how many events it has over the next week.
pub async fn check_url(url: &str) -> Result<usize, String> {
    match fetch(url, None, None).await? {
        Fetched::Changed { text, .. } => {
            let now = Utc::now();
            Ok(ics::occurrences(
                &text,
                now,
                now + chrono::Duration::days(7),
                &ics::system_zone,
            )
            .len())
        }
        Fetched::Unchanged => Ok(0),
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedStatus {
    pub id: String,
    /// Wall-clock milliseconds of the last good fetch.
    pub synced_at: Option<i64>,
    pub error: Option<String>,
    /// Events over the next week.
    pub events: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventMatch {
    pub feed_id: String,
    pub title: String,
    /// Wall-clock milliseconds.
    pub start: i64,
    pub end: i64,
    pub all_day: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleStatus {
    pub id: String,
    /// The event the look is on for now.
    pub active: Option<EventMatch>,
    pub next: Option<EventMatch>,
    /// Plain text, or a serialized `AuthorizationError` when Pro refused.
    pub error: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarStatus {
    pub feeds: Vec<FeedStatus>,
    pub rules: Vec<RuleStatus>,
    pub syncing: bool,
}

fn event_match(feed_id: &str, event: &Occurrence) -> EventMatch {
    EventMatch {
        feed_id: feed_id.to_string(),
        title: event.title.clone(),
        start: event.start.timestamp_millis(),
        end: event.end.timestamp_millis(),
        all_day: event.all_day,
    }
}

#[derive(Default)]
pub struct CalendarService {
    settings: Mutex<CalendarSettings>,
    feeds: Mutex<HashMap<String, FeedState>>,
    published: Mutex<CalendarStatus>,
    syncing: std::sync::atomic::AtomicBool,
    wake: Notify,
}

impl CalendarService {
    pub fn settings(&self) -> CalendarSettings {
        self.settings
            .lock()
            .expect("calendar lock poisoned")
            .clone()
    }

    pub fn set_settings(&self, settings: CalendarSettings) {
        {
            let mut feeds = self.feeds.lock().expect("calendar lock poisoned");
            feeds.retain(|id, _| settings.feeds.iter().any(|feed| &feed.id == id));
        }
        *self.settings.lock().expect("calendar lock poisoned") = settings;
        self.wake.notify_one();
    }

    /// Fetches every calendar now rather than at the next refresh.
    pub fn refresh(&self) {
        self.wake.notify_one();
    }

    /// Rule ids in priority order, for the runtime's ranking.
    pub fn rule_order(&self) -> Vec<String> {
        self.settings
            .lock()
            .expect("calendar lock poisoned")
            .rules
            .iter()
            .map(|rule| rule.id.clone())
            .collect()
    }

    fn each_event(&self, mut visit: impl FnMut(&str, &Occurrence)) {
        let settings = self.settings();
        let feeds = self.feeds.lock().expect("calendar lock poisoned");
        for feed in settings.feeds.iter().filter(|feed| feed.enabled) {
            if let Some(state) = feeds.get(&feed.id) {
                for event in &state.events {
                    visit(&feed.id, event);
                }
            }
        }
    }

    /// What every enabled rule wants right now.
    pub fn desires(&self, now: DateTime<Utc>) -> Vec<Desire> {
        let settings = self.settings();
        settings
            .rules
            .iter()
            .filter(|rule| rule.enabled)
            .filter(|rule| {
                let mut active = false;
                self.each_event(|feed_id, event| {
                    if !active && rule.matches(feed_id, event) {
                        let (from, to) = rule.window(event);
                        active = from <= now && now < to;
                    }
                });
                active
            })
            .map(CalendarRule::desire)
            .collect()
    }

    /// The events a rule would act on over the next week, soonest first.
    pub fn upcoming(&self, rule: &CalendarRule, now: DateTime<Utc>) -> Vec<EventMatch> {
        let mut found = Vec::new();
        self.each_event(|feed_id, event| {
            let (_, to) = rule.window(event);
            if to > now
                && event.start < now + chrono::Duration::days(7)
                && rule.matches(feed_id, event)
            {
                found.push(event_match(feed_id, event));
            }
        });
        found.sort_by_key(|event| event.start);
        found.truncate(20);
        found
    }

    pub fn status(
        &self,
        now: DateTime<Utc>,
        errors: impl Fn(&Holder) -> Option<String>,
    ) -> CalendarStatus {
        let settings = self.settings();
        let feeds = {
            let feeds = self.feeds.lock().expect("calendar lock poisoned");
            settings
                .feeds
                .iter()
                .map(|feed| {
                    let state = feeds.get(&feed.id);
                    FeedStatus {
                        id: feed.id.clone(),
                        synced_at: state
                            .and_then(|state| state.synced_at)
                            .map(|at| at.timestamp_millis()),
                        error: state.and_then(|state| state.error.clone()),
                        events: state.map_or(0, |state| {
                            state
                                .events
                                .iter()
                                .filter(|event| {
                                    event.end > now && event.start < now + chrono::Duration::days(7)
                                })
                                .count()
                        }),
                    }
                })
                .collect()
        };
        let rules = settings
            .rules
            .iter()
            .map(|rule| {
                let mut active = None;
                let mut next: Option<EventMatch> = None;
                self.each_event(|feed_id, event| {
                    if !rule.matches(feed_id, event) {
                        return;
                    }
                    let (from, to) = rule.window(event);
                    if from <= now && now < to {
                        active.get_or_insert_with(|| event_match(feed_id, event));
                    } else if from > now
                        && next
                            .as_ref()
                            .is_none_or(|next| event.start.timestamp_millis() < next.start)
                    {
                        next = Some(event_match(feed_id, event));
                    }
                });
                RuleStatus {
                    id: rule.id.clone(),
                    active: active.filter(|_| rule.enabled),
                    next,
                    error: rule
                        .enabled
                        .then(|| errors(&Holder::Calendar(rule.id.clone())))
                        .flatten(),
                }
            })
            .collect();
        CalendarStatus {
            feeds,
            rules,
            syncing: self.syncing.load(std::sync::atomic::Ordering::SeqCst),
        }
    }

    /// Emits the status when it changed.
    pub fn publish<R: Runtime>(&self, app: &AppHandle<R>, next: CalendarStatus) {
        {
            let mut published = self.published.lock().expect("calendar lock poisoned");
            if *published == next {
                return;
            }
            *published = next.clone();
        }
        let _ = app.emit(STATUS_EVENT, next);
    }

    pub fn published(&self) -> CalendarStatus {
        self.published
            .lock()
            .expect("calendar lock poisoned")
            .clone()
    }
}

static STARTED: OnceLock<()> = OnceLock::new();

/// Loads the saved calendars and starts the task that keeps them fresh.
pub fn start(app: &AppHandle) {
    let Some(service) = app.try_state::<CalendarService>() else {
        return;
    };
    if STARTED.set(()).is_err() {
        return;
    }
    *service.settings.lock().expect("calendar lock poisoned") = load(app);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            let service = app.state::<CalendarService>();
            let settings = service.settings();
            let mut failed = false;
            service
                .syncing
                .store(true, std::sync::atomic::Ordering::SeqCst);
            for feed in settings.feeds.iter().filter(|feed| feed.enabled) {
                let Some(url) = load_url(&feed.id) else {
                    let mut feeds = service.feeds.lock().expect("calendar lock poisoned");
                    feeds.entry(feed.id.clone()).or_default().error = Some(
                        "This calendar's address is missing. Remove it and add it again.".into(),
                    );
                    failed = true;
                    continue;
                };
                let (etag, last_modified) = {
                    let feeds = service.feeds.lock().expect("calendar lock poisoned");
                    feeds
                        .get(&feed.id)
                        .filter(|state| state.text.is_some())
                        .map(|state| (state.etag.clone(), state.last_modified.clone()))
                        .unwrap_or_default()
                };
                let result = fetch(&url, etag.as_deref(), last_modified.as_deref()).await;
                let now = Utc::now();
                let mut feeds = service.feeds.lock().expect("calendar lock poisoned");
                let state = feeds.entry(feed.id.clone()).or_default();
                match result {
                    Ok(Fetched::Changed {
                        text,
                        etag,
                        last_modified,
                    }) => {
                        state.text = Some(Arc::new(text));
                        state.etag = etag;
                        state.last_modified = last_modified;
                        state.synced_at = Some(now);
                        state.error = None;
                    }
                    Ok(Fetched::Unchanged) => {
                        state.synced_at = Some(now);
                        state.error = None;
                    }
                    Err(error) => {
                        state.error = Some(error);
                        failed = true;
                    }
                }
                // Events are re-read each pass, so the window keeps moving.
                if let Some(text) = state.text.clone() {
                    state.events =
                        ics::occurrences(&text, now - PAST, now + AHEAD, &ics::system_zone);
                }
            }
            service
                .syncing
                .store(false, std::sync::atomic::Ordering::SeqCst);
            super::runtime::signal(super::runtime::Signal::Wake);
            let wait = if failed { RETRY_EVERY } else { REFRESH_EVERY };
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

    fn event(title: &str, busy: bool, all_day: bool) -> Occurrence {
        let start = Utc::now();
        Occurrence {
            uid: "1".into(),
            title: title.into(),
            start,
            end: start + chrono::Duration::hours(1),
            all_day,
            busy,
        }
    }

    fn rule() -> CalendarRule {
        CalendarRule {
            id: "meetings".into(),
            bridge_id: Some("BRIDGE".into()),
            targets: vec![AutomationTarget {
                kind: TargetKind::Light,
                id: "desk".into(),
                name: "Desk".into(),
            }],
            ..CalendarRule::default()
        }
    }

    #[test]
    fn titles_calendars_and_free_time_filter_events() {
        let mut rule = rule();
        assert!(rule.matches("work", &event("Weekly sync", true, false)));
        assert!(!rule.matches("work", &event("Lunch", false, false)));
        assert!(!rule.matches("work", &event("Holiday", true, true)));

        rule.title_includes = "Sync, 1:1".into();
        rule.title_excludes = "optional".into();
        assert!(rule.matches("work", &event("Weekly SYNC", true, false)));
        assert!(rule.matches("work", &event("1:1 with Sam", true, false)));
        assert!(!rule.matches("work", &event("Planning", true, false)));
        assert!(!rule.matches("work", &event("Sync (optional)", true, false)));

        rule.feed_ids = vec!["home".into()];
        assert!(!rule.matches("work", &event("Weekly sync", true, false)));
    }

    #[test]
    fn the_window_opens_early_and_closes_late() {
        let mut rule = rule();
        rule.lead_minutes = 5;
        rule.trail_minutes = 10;
        let meeting = event("Sync", true, false);
        let (from, to) = rule.window(&meeting);
        assert_eq!(meeting.start - from, chrono::Duration::minutes(5));
        assert_eq!(to - meeting.end, chrono::Duration::minutes(10));
    }

    #[test]
    fn rules_validate() {
        let feeds = vec![CalendarFeed {
            id: "work".into(),
            name: "Work".into(),
            enabled: true,
        }];
        let mut rule = rule();
        rule.enabled = true;
        assert_eq!(rule.validate(&feeds), Ok(()));
        rule.feed_ids = vec!["gone".into()];
        assert!(rule.validate(&feeds).is_err());
        rule.feed_ids.clear();
        rule.look = CalendarLook::Scene;
        assert!(rule.validate(&feeds).is_err());
        rule.enabled = false;
        assert_eq!(rule.validate(&feeds), Ok(()));
        rule.lead_minutes = 500;
        assert!(rule.validate(&feeds).is_err());
    }

    #[test]
    fn addresses_are_made_https() {
        assert_eq!(
            normalize_url("webcal://p01-calendars.icloud.com/published/2/abc").unwrap(),
            "https://p01-calendars.icloud.com/published/2/abc"
        );
        assert!(
            normalize_url("https://calendar.google.com/calendar/ical/x/private-y/basic.ics")
                .is_ok()
        );
        assert!(normalize_url("http://example.com/cal.ics").is_err());
        assert!(normalize_url("calendar").is_err());
    }

    #[test]
    fn a_rule_becomes_a_claim_on_its_lights() {
        let desire = rule().desire();
        assert_eq!(desire.holder, Holder::Calendar("meetings".into()));
        assert!(desire.restore);
        assert!(matches!(
            desire.spec,
            ClaimSpec::Lights {
                looks: Looks::Uniform(Write::Color { .. }),
                ..
            }
        ));
    }

    #[test]
    fn ipc_names_are_camel_case() {
        let value = serde_json::to_value(CalendarRule::default()).unwrap();
        assert!(value.get("titleIncludes").is_some());
        assert!(value.get("leadMinutes").is_some());
        assert_eq!(value["look"], "color");
    }
}
