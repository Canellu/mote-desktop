//! Focus sessions: a timer rhythm the lights follow.
//!
//! A ritual is a rhythm (focus, break, and long-break lengths and a number of
//! rounds), the lights to use, a lighting personality, and three colors. A
//! running session is only timing: what the lights show is handed to the
//! automation runtime as the `Focus` holder's look, so snapshots, priority,
//! PC Sync, and restoring the lights afterwards are the runtime's job.
//!
//! Time is monotonic. Sleep pauses a session rather than letting its phases
//! run out while nobody is there.

use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

use super::looks::{mirek_for_xy, Write};
use super::priority::Holder;
use super::resolve::{ClaimSpec, Desire, Looks};
use super::settings::AutomationTarget;

const STORE_FILE: &str = "focus.json";
const STORE_KEY: &str = "focus";
const MAX_RITUALS: usize = 50;
const MAX_TEXT_LEN: usize = 120;
/// Between phases, so the person can start the next one early or add time.
pub const INTERMISSION: Duration = Duration::from_secs(10);
/// Time "Add time" gives a focus phase, and a break.
const EXTEND_FOCUS: Duration = Duration::from_secs(5 * 60);
const EXTEND_BREAK: Duration = Duration::from_secs(2 * 60);
/// Minimal's warning look starts this long before a focus phase ends.
const WARNING_BEFORE_END: Duration = Duration::from_secs(60);
const TRANSITION_MS: u32 = 1500;
/// Calm drifts slowly, so each of its steps fades for longer.
const CALM_TRANSITION_MS: u32 = 4000;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Vibe {
    /// One cool look that warms as the phase nears its end.
    #[default]
    Calm,
    /// A gradient across the lights that shifts at each quarter.
    Journey,
    /// The lights fill up in order as the phase goes by.
    Race,
    /// A look for each phase and a warning in the last minute, nothing else.
    Minimal,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct FocusRitual {
    pub id: String,
    pub name: String,
    pub focus_minutes: u32,
    pub break_minutes: u32,
    pub long_break_minutes: u32,
    /// Focus phases in a session. A short break follows each but the last,
    /// which is followed by the long break.
    pub rounds: u32,
    pub bridge_id: Option<String>,
    pub targets: Vec<AutomationTarget>,
    pub vibe: Vibe,
    pub focus_xy: [f64; 2],
    /// Where focus lights end up as a phase finishes.
    pub warning_xy: [f64; 2],
    pub break_xy: [f64; 2],
    /// 1-100.
    pub focus_brightness: f64,
    /// 1-100.
    pub break_brightness: f64,
    /// A Windows notification when a phase ends.
    pub notify: bool,
}

impl Default for FocusRitual {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: "Clear Mind".into(),
            focus_minutes: 25,
            break_minutes: 5,
            long_break_minutes: 15,
            rounds: 4,
            bridge_id: None,
            targets: Vec::new(),
            vibe: Vibe::Calm,
            focus_xy: [0.2800, 0.2900],
            warning_xy: [0.5300, 0.4100],
            break_xy: [0.3500, 0.4700],
            focus_brightness: 80.0,
            break_brightness: 50.0,
            notify: true,
        }
    }
}

impl FocusRitual {
    pub fn validate(&self) -> Result<(), String> {
        if self.id.is_empty() || self.id.len() > MAX_TEXT_LEN {
            return Err("This routine could not be saved.".into());
        }
        if self.name.trim().is_empty() || self.name.len() > MAX_TEXT_LEN {
            return Err("Give the routine a name.".into());
        }
        if !(1..=180).contains(&self.focus_minutes) {
            return Err("Focus lasts between 1 and 180 minutes.".into());
        }
        if !(1..=60).contains(&self.break_minutes) {
            return Err("A break lasts between 1 and 60 minutes.".into());
        }
        if !(1..=90).contains(&self.long_break_minutes) {
            return Err("A long break lasts between 1 and 90 minutes.".into());
        }
        if !(1..=12).contains(&self.rounds) {
            return Err("Choose between 1 and 12 rounds.".into());
        }
        if self.targets.len() > 100
            || self.targets.iter().any(|target| {
                target.id.is_empty() || target.id.len() > 512 || target.name.len() > 512
            })
        {
            return Err("Choose the lights for this routine again.".into());
        }
        if !self.targets.is_empty() && self.bridge_id.as_deref().is_none_or(str::is_empty) {
            return Err("Choose the lights for this routine again.".into());
        }
        for xy in [self.focus_xy, self.warning_xy, self.break_xy] {
            if xy
                .iter()
                .any(|value| !value.is_finite() || !(0.0..=1.0).contains(value))
            {
                return Err("Choose a valid color.".into());
            }
        }
        for level in [self.focus_brightness, self.break_brightness] {
            if !level.is_finite() || !(1.0..=100.0).contains(&level) {
                return Err("Brightness must be between 1 and 100%.".into());
            }
        }
        Ok(())
    }

    fn phases(&self) -> Vec<Phase> {
        let mut phases = Vec::new();
        for round in 0..self.rounds.max(1) {
            phases.push(Phase::Focus);
            phases.push(if round + 1 == self.rounds.max(1) {
                Phase::LongBreak
            } else {
                Phase::Break
            });
        }
        phases
    }

    fn length(&self, phase: Phase) -> Duration {
        Duration::from_secs(
            60 * u64::from(match phase {
                Phase::Focus => self.focus_minutes,
                Phase::Break => self.break_minutes,
                Phase::LongBreak => self.long_break_minutes,
            }),
        )
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct FocusStore {
    pub rituals: Vec<FocusRitual>,
    pub last_ritual_id: Option<String>,
}

pub fn load<R: Runtime>(app: &AppHandle<R>) -> FocusStore {
    app.store(STORE_FILE)
        .ok()
        .and_then(|store| store.get(STORE_KEY))
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default()
}

pub fn save<R: Runtime>(app: &AppHandle<R>, data: &FocusStore) -> Result<(), String> {
    if data.rituals.len() > MAX_RITUALS {
        return Err(format!("Keep at most {MAX_RITUALS} routines."));
    }
    let store = app
        .store(STORE_FILE)
        .map_err(|_| "Failed to open focus routines.".to_string())?;
    store.set(
        STORE_KEY,
        serde_json::to_value(data).map_err(|_| "Focus routines are invalid.".to_string())?,
    );
    store
        .save()
        .map_err(|_| "Failed to save focus routines.".to_string())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Phase {
    Focus,
    Break,
    LongBreak,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Lifecycle {
    #[default]
    Idle,
    Running,
    Paused,
    /// Ten seconds between phases.
    Intermission,
    Completed,
}

/// What just happened, for a notification.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Change {
    PhaseEnded(Phase),
    PhaseStarted(Phase),
    Completed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Stage {
    Phase,
    Intermission,
}

#[derive(Debug, Clone)]
pub struct Session {
    ritual: FocusRitual,
    phases: Vec<Phase>,
    step: usize,
    stage: Stage,
    length: Duration,
    /// Time spent in this stage before `running_since`.
    banked: Duration,
    /// `None` while paused or once complete.
    running_since: Option<Instant>,
    /// The wall clock at `running_since`, so the interface can count down.
    wall_since: Option<SystemTime>,
    focused: Duration,
    completed_rounds: u32,
    finished: bool,
    /// Paused because the PC went to sleep rather than by the person.
    paused_by_sleep: bool,
}

impl Session {
    pub fn start(ritual: FocusRitual, now: Instant) -> Self {
        let phases = ritual.phases();
        let length = ritual.length(phases[0]);
        Self {
            ritual,
            phases,
            step: 0,
            stage: Stage::Phase,
            length,
            banked: Duration::ZERO,
            running_since: Some(now),
            wall_since: Some(SystemTime::now()),
            focused: Duration::ZERO,
            completed_rounds: 0,
            finished: false,
            paused_by_sleep: false,
        }
    }

    pub fn ritual(&self) -> &FocusRitual {
        &self.ritual
    }

    pub fn finished(&self) -> bool {
        self.finished
    }

    pub fn phase(&self) -> Phase {
        self.phases[self.step]
    }

    fn next_phase(&self) -> Option<Phase> {
        self.phases.get(self.step + 1).copied()
    }

    fn elapsed(&self, now: Instant) -> Duration {
        self.banked
            + self
                .running_since
                .map_or(Duration::ZERO, |since| now.saturating_duration_since(since))
    }

    pub fn remaining(&self, now: Instant) -> Duration {
        self.length.saturating_sub(self.elapsed(now))
    }

    fn progress(&self, now: Instant) -> f64 {
        if self.length.is_zero() {
            return 1.0;
        }
        (self.elapsed(now).as_secs_f64() / self.length.as_secs_f64()).clamp(0.0, 1.0)
    }

    fn begin_stage(&mut self, stage: Stage, length: Duration, now: Instant) {
        self.stage = stage;
        self.length = length;
        self.banked = Duration::ZERO;
        self.running_since = Some(now);
        self.wall_since = Some(SystemTime::now());
    }

    /// Ends the current phase, counting its focus time.
    fn close_phase(&mut self, now: Instant) {
        if self.phase() == Phase::Focus {
            self.focused += self.elapsed(now).min(self.length);
            self.completed_rounds += 1;
        }
    }

    /// Moves on when a stage runs out. At most one step per call, so a long
    /// gap never replays a string of stale looks.
    pub fn tick(&mut self, now: Instant) -> Option<Change> {
        if self.finished || self.running_since.is_none() || self.elapsed(now) < self.length {
            return None;
        }
        match self.stage {
            Stage::Phase => {
                let ended = self.phase();
                self.close_phase(now);
                if self.next_phase().is_none() {
                    self.finish();
                    Some(Change::Completed)
                } else {
                    self.begin_stage(Stage::Intermission, INTERMISSION, now);
                    Some(Change::PhaseEnded(ended))
                }
            }
            Stage::Intermission => {
                self.advance(now);
                Some(Change::PhaseStarted(self.phase()))
            }
        }
    }

    fn advance(&mut self, now: Instant) {
        self.step += 1;
        let length = self.ritual.length(self.phase());
        self.begin_stage(Stage::Phase, length, now);
    }

    fn finish(&mut self) {
        self.finished = true;
        self.running_since = None;
        self.wall_since = None;
    }

    pub fn pause(&mut self, now: Instant, by_sleep: bool) {
        if self.finished || self.running_since.is_none() {
            return;
        }
        self.banked = self.elapsed(now);
        self.running_since = None;
        self.wall_since = None;
        self.paused_by_sleep = by_sleep;
    }

    pub fn resume(&mut self, now: Instant) {
        if self.finished || self.running_since.is_some() {
            return;
        }
        self.running_since = Some(now);
        self.wall_since = Some(SystemTime::now());
        self.paused_by_sleep = false;
    }

    pub fn paused_by_sleep(&self) -> bool {
        self.paused_by_sleep
    }

    /// Starts the next phase now: skips what is left of this phase, or the
    /// rest of the intermission.
    pub fn skip(&mut self, now: Instant) -> Option<Change> {
        if self.finished {
            return None;
        }
        if self.stage == Stage::Phase {
            self.close_phase(now);
        }
        if self.next_phase().is_none() {
            self.finish();
            return Some(Change::Completed);
        }
        let paused = self.running_since.is_none();
        self.advance(now);
        if paused {
            self.pause(now, false);
        }
        Some(Change::PhaseStarted(self.phase()))
    }

    /// Five more minutes of focus, or two more of a break. In the
    /// intermission it reopens the phase that just ended.
    pub fn extend(&mut self, now: Instant) {
        if self.finished {
            return;
        }
        let phase = self.phase();
        let extra = if phase == Phase::Focus {
            EXTEND_FOCUS
        } else {
            EXTEND_BREAK
        };
        match self.stage {
            Stage::Phase => self.length += extra,
            Stage::Intermission => {
                if phase == Phase::Focus {
                    // Its time was counted when it closed; it is counted again
                    // in full when it closes for good.
                    let length = self.ritual.length(phase);
                    self.focused = self.focused.saturating_sub(length);
                    self.completed_rounds = self.completed_rounds.saturating_sub(1);
                    self.begin_stage(Stage::Phase, length, now);
                    self.banked = length;
                    self.running_since = Some(now);
                } else {
                    let length = self.ritual.length(phase);
                    self.begin_stage(Stage::Phase, length, now);
                    self.banked = length;
                }
                self.length += extra;
            }
        }
    }

    /// What the lights show right now, or `None` once the session is over.
    pub fn looks(&self, now: Instant) -> Option<(Looks, u32)> {
        if self.finished {
            return None;
        }
        // The intermission already shows the phase to come.
        let (phase, progress, remaining) = match self.stage {
            Stage::Phase => (self.phase(), self.progress(now), self.remaining(now)),
            Stage::Intermission => (self.next_phase()?, 0.0, Duration::MAX),
        };
        let ritual = &self.ritual;
        let tint = |xy: [f64; 2], brightness: f64| Write::Tint {
            xy,
            mirek: mirek_for_xy(xy),
            brightness,
        };
        let focus_at = |t: f64| {
            tint(
                lerp(ritual.focus_xy, ritual.warning_xy, t),
                ritual.focus_brightness,
            )
        };
        if phase != Phase::Focus {
            return Some((
                Looks::Uniform(tint(ritual.break_xy, ritual.break_brightness)),
                TRANSITION_MS,
            ));
        }
        Some(match ritual.vibe {
            Vibe::Calm => {
                // Holds the focus look for most of the phase, then warms in
                // quarter steps.
                let warm = ((progress - 0.6) / 0.4).clamp(0.0, 1.0);
                let step = (warm * 4.0).floor() / 4.0;
                (Looks::Uniform(focus_at(step)), CALM_TRANSITION_MS)
            }
            Vibe::Journey => {
                let quarter = (progress * 4.0).floor().min(3.0);
                let stops = (0..4)
                    .map(|index| focus_at((quarter + f64::from(index) / 3.0) / 4.0))
                    .collect();
                (Looks::Spread(stops), TRANSITION_MS)
            }
            Vibe::Race => (
                Looks::Progress {
                    done: focus_at(1.0),
                    todo: focus_at(0.0),
                    fraction: (progress * 20.0).floor() / 20.0,
                },
                TRANSITION_MS,
            ),
            Vibe::Minimal => (
                Looks::Uniform(focus_at(if remaining <= WARNING_BEFORE_END {
                    1.0
                } else {
                    0.0
                })),
                TRANSITION_MS,
            ),
        })
    }

    pub fn desire(&self, now: Instant) -> Option<Desire> {
        let (looks, transition_ms) = self.looks(now)?;
        Some(Desire {
            holder: Holder::Focus,
            spec: ClaimSpec::Lights {
                bridge_id: self.ritual.bridge_id.clone(),
                targets: self.ritual.targets.clone(),
                looks,
            },
            restore: true,
            transition_ms,
        })
    }

    pub fn status(&self, now: Instant) -> FocusStatus {
        let (phase, next_phase) = match self.stage {
            Stage::Phase => (Some(self.phase()), self.next_phase()),
            Stage::Intermission => (Some(self.phase()), self.next_phase()),
        };
        let lifecycle = if self.finished {
            Lifecycle::Completed
        } else if self.running_since.is_none() {
            Lifecycle::Paused
        } else if self.stage == Stage::Intermission {
            Lifecycle::Intermission
        } else {
            Lifecycle::Running
        };
        let remaining = if self.finished {
            Duration::ZERO
        } else {
            self.remaining(now)
        };
        FocusStatus {
            lifecycle,
            ritual_id: Some(self.ritual.id.clone()),
            ritual_name: Some(self.ritual.name.clone()),
            phase,
            next_phase: if self.finished { None } else { next_phase },
            intermission: self.stage == Stage::Intermission && !self.finished,
            round: (self.step / 2) as u32 + 1,
            rounds: self.ritual.rounds,
            stage_ms: self.length.as_millis() as u64,
            remaining_ms: remaining.as_millis() as u64,
            ends_at: self.wall_since.map(|since| {
                let at = since + self.length.saturating_sub(self.banked);
                at.duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64
            }),
            focused_ms: self.focused.as_millis() as u64,
            completed_rounds: self.completed_rounds,
            paused_by_sleep: self.paused_by_sleep,
            error: None,
        }
    }
}

fn lerp(from: [f64; 2], to: [f64; 2], t: f64) -> [f64; 2] {
    let t = t.clamp(0.0, 1.0);
    [
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
    ]
}

/// What the interface shows. `endsAt` is wall-clock milliseconds while the
/// clock runs, so a countdown needs no events between phases.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusStatus {
    pub lifecycle: Lifecycle,
    pub ritual_id: Option<String>,
    pub ritual_name: Option<String>,
    pub phase: Option<Phase>,
    pub next_phase: Option<Phase>,
    pub intermission: bool,
    pub round: u32,
    pub rounds: u32,
    pub stage_ms: u64,
    pub remaining_ms: u64,
    pub ends_at: Option<u64>,
    pub focused_ms: u64,
    pub completed_rounds: u32,
    pub paused_by_sleep: bool,
    /// Plain text, or a serialized `AuthorizationError` when Pro refused.
    pub error: Option<String>,
}

/// The line a notification or the tray shows when something changes.
pub fn announce(change: Change, ritual: &FocusRitual) -> (String, String) {
    match change {
        Change::PhaseEnded(Phase::Focus) => (
            "Focus done".into(),
            "Nice work. Your break starts in a few seconds.".into(),
        ),
        Change::PhaseEnded(_) => (
            "Break over".into(),
            "Focus starts again in a few seconds.".into(),
        ),
        Change::PhaseStarted(Phase::Focus) => (
            "Focus".into(),
            format!(
                "{} minutes. Your lights will keep time.",
                ritual.focus_minutes
            ),
        ),
        Change::PhaseStarted(Phase::Break) => (
            "Break".into(),
            format!("{} minutes to step away.", ritual.break_minutes),
        ),
        Change::PhaseStarted(Phase::LongBreak) => (
            "Long break".into(),
            format!("{} minutes. You have earned it.", ritual.long_break_minutes),
        ),
        Change::Completed => (
            "Session complete".into(),
            format!(
                "{} rounds of focus. Your lights are back to how they were.",
                ritual.rounds
            ),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::automations::settings::TargetKind;

    fn ritual(vibe: Vibe) -> FocusRitual {
        FocusRitual {
            id: "clear-mind".into(),
            focus_minutes: 25,
            break_minutes: 5,
            long_break_minutes: 15,
            rounds: 2,
            vibe,
            bridge_id: Some("BRIDGE".into()),
            targets: vec![AutomationTarget {
                kind: TargetKind::Room,
                id: "office".into(),
                name: "Office".into(),
            }],
            ..FocusRitual::default()
        }
    }

    const MINUTE: Duration = Duration::from_secs(60);

    #[test]
    fn a_session_runs_focus_break_focus_long_break() {
        let start = Instant::now();
        let mut session = Session::start(ritual(Vibe::Calm), start);
        let mut now = start;
        let mut seen = Vec::new();
        for _ in 0..400 {
            now += MINUTE / 4;
            if let Some(change) = session.tick(now) {
                seen.push(change);
            }
            if session.finished() {
                break;
            }
        }
        assert_eq!(
            seen,
            vec![
                Change::PhaseEnded(Phase::Focus),
                Change::PhaseStarted(Phase::Break),
                Change::PhaseEnded(Phase::Break),
                Change::PhaseStarted(Phase::Focus),
                Change::PhaseEnded(Phase::Focus),
                Change::PhaseStarted(Phase::LongBreak),
                Change::Completed,
            ]
        );
        let status = session.status(now);
        assert_eq!(status.lifecycle, Lifecycle::Completed);
        assert_eq!(status.completed_rounds, 2);
        assert_eq!(status.focused_ms, 50 * 60 * 1000);
        assert!(session.desire(now).is_none());
    }

    #[test]
    fn a_pause_stops_the_clock() {
        let start = Instant::now();
        let mut session = Session::start(ritual(Vibe::Minimal), start);
        session.pause(start + 10 * MINUTE, true);
        assert_eq!(
            session.status(start + 10 * MINUTE).lifecycle,
            Lifecycle::Paused
        );
        assert!(session.paused_by_sleep());
        // An hour asleep changes nothing.
        assert_eq!(session.tick(start + 70 * MINUTE), None);
        assert_eq!(session.remaining(start + 70 * MINUTE), 15 * MINUTE);
        session.resume(start + 70 * MINUTE);
        assert_eq!(session.remaining(start + 80 * MINUTE), 5 * MINUTE);
        assert!(session.status(start + 80 * MINUTE).ends_at.is_some());
    }

    #[test]
    fn the_intermission_can_be_skipped_or_turned_into_more_time() {
        let start = Instant::now();
        let mut session = Session::start(ritual(Vibe::Minimal), start);
        let ended = start + 25 * MINUTE;
        assert_eq!(session.tick(ended), Some(Change::PhaseEnded(Phase::Focus)));
        assert_eq!(session.status(ended).lifecycle, Lifecycle::Intermission);

        // "Add time": back in focus with five minutes to go, not yet counted.
        session.extend(ended);
        let status = session.status(ended);
        assert_eq!(status.lifecycle, Lifecycle::Running);
        assert_eq!(status.phase, Some(Phase::Focus));
        assert_eq!(status.remaining_ms, 5 * 60 * 1000);
        assert_eq!(status.completed_rounds, 0);

        assert_eq!(
            session.tick(ended + 5 * MINUTE),
            Some(Change::PhaseEnded(Phase::Focus))
        );
        assert_eq!(
            session.status(ended + 5 * MINUTE).focused_ms,
            30 * 60 * 1000
        );
        // "Start now".
        assert_eq!(
            session.skip(ended + 5 * MINUTE),
            Some(Change::PhaseStarted(Phase::Break))
        );
    }

    #[test]
    fn skipping_the_last_phase_completes_the_session() {
        let start = Instant::now();
        let mut ritual = ritual(Vibe::Race);
        ritual.rounds = 1;
        let mut session = Session::start(ritual, start);
        assert_eq!(
            session.skip(start),
            Some(Change::PhaseStarted(Phase::LongBreak))
        );
        assert_eq!(session.skip(start), Some(Change::Completed));
    }

    #[test]
    fn looks_follow_the_vibe() {
        let start = Instant::now();
        let calm = Session::start(ritual(Vibe::Calm), start);
        let early = calm.looks(start + MINUTE).unwrap().0;
        let late = calm.looks(start + 24 * MINUTE).unwrap().0;
        assert_ne!(early, late);
        // Mid-phase the look holds still, so the lights are not rewritten.
        assert_eq!(early, calm.looks(start + 10 * MINUTE).unwrap().0);

        let minimal = Session::start(ritual(Vibe::Minimal), start);
        assert_ne!(
            minimal.looks(start + 23 * MINUTE).unwrap().0,
            minimal.looks(start + 24 * MINUTE + MINUTE / 2).unwrap().0
        );

        let race = Session::start(ritual(Vibe::Race), start);
        match race.looks(start + 12 * MINUTE + MINUTE / 2).unwrap().0 {
            Looks::Progress { fraction, .. } => assert_eq!(fraction, 0.5),
            other => panic!("expected progress, got {other:?}"),
        }

        let journey = Session::start(ritual(Vibe::Journey), start);
        assert!(
            matches!(journey.looks(start).unwrap().0, Looks::Spread(ref stops) if stops.len() == 4)
        );
    }

    #[test]
    fn breaks_use_the_break_look_and_the_intermission_shows_it_early() {
        let start = Instant::now();
        let mut session = Session::start(ritual(Vibe::Journey), start);
        session.tick(start + 25 * MINUTE);
        let (looks, _) = session.looks(start + 25 * MINUTE).unwrap();
        match looks {
            Looks::Uniform(Write::Tint { xy, brightness, .. }) => {
                assert_eq!(xy, FocusRitual::default().break_xy);
                assert_eq!(brightness, 50.0);
            }
            other => panic!("expected the break tint, got {other:?}"),
        }
    }

    #[test]
    fn rituals_validate() {
        let mut ritual = ritual(Vibe::Calm);
        assert_eq!(ritual.validate(), Ok(()));
        ritual.focus_minutes = 0;
        assert!(ritual.validate().is_err());
        ritual.focus_minutes = 25;
        ritual.bridge_id = None;
        assert!(ritual.validate().is_err());
        ritual.targets.clear();
        assert_eq!(ritual.validate(), Ok(()));
        ritual.name = "  ".into();
        assert!(ritual.validate().is_err());
    }

    #[test]
    fn ipc_names_are_camel_case() {
        let value = serde_json::to_value(FocusRitual::default()).unwrap();
        assert!(value.get("focusMinutes").is_some());
        assert_eq!(value["vibe"], "calm");
        let status = serde_json::to_value(FocusStatus {
            phase: Some(Phase::LongBreak),
            ..FocusStatus::default()
        })
        .unwrap();
        assert_eq!(status["phase"], "longBreak");
        assert_eq!(status["lifecycle"], "idle");
    }
}
