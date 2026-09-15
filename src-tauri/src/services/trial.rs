//! The Mote Pro trial: fourteen days of every Pro capability, starting when this
//! installation pairs its first Hue Bridge.
//!
//! Nothing here leaves the PC. The start date is kept twice — in the app's config
//! folder and in the Windows credential store — and the earlier date wins. The
//! credential store is the copy that matters: Windows deletes a packaged app's
//! data when it is uninstalled but leaves its credentials, so a reinstall finds
//! the trial it already had instead of starting another.

use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

pub const TRIAL_DAYS: i64 = 14;
pub const DAY_MS: i64 = 24 * 60 * 60 * 1000;
pub const TRIAL_LENGTH_MS: i64 = TRIAL_DAYS * DAY_MS;

/// One installation's trial, as stored. Times are Unix milliseconds.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrialRecord {
    pub started_at: i64,
    /// The latest moment Mote was seen running.
    pub last_seen_at: i64,
}

impl TrialRecord {
    pub const fn starting_at(now: i64) -> Self {
        Self {
            started_at: now,
            last_seen_at: now,
        }
    }

    pub const fn ends_at(self) -> i64 {
        self.started_at + TRIAL_LENGTH_MS
    }

    /// Whether the trial still grants Pro at `now`.
    ///
    /// Measured from the later of the clock and the last time Mote ran, so
    /// winding the clock back does not buy more days.
    pub fn is_active(self, now: i64) -> bool {
        now.max(self.last_seen_at) < self.ends_at()
    }

    pub fn seen_at(self, now: i64) -> Self {
        Self {
            last_seen_at: self.last_seen_at.max(now),
            ..self
        }
    }

    /// Two copies of one trial: the earliest start and the latest sighting.
    pub fn merge(self, other: Self) -> Self {
        Self {
            started_at: self.started_at.min(other.started_at),
            last_seen_at: self.last_seen_at.max(other.last_seen_at),
        }
    }
}

/// Folds whichever copies were found into one.
pub fn merge_copies(
    first: Option<TrialRecord>,
    second: Option<TrialRecord>,
) -> Option<TrialRecord> {
    match (first, second) {
        (Some(first), Some(second)) => Some(first.merge(second)),
        (only, None) | (None, only) => only,
    }
}

/// What the interface is told about the trial.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrialStatus {
    pub started_at: i64,
    pub ends_at: i64,
    pub active: bool,
}

impl TrialStatus {
    pub fn of(record: TrialRecord, now: i64) -> Self {
        Self {
            started_at: record.started_at,
            ends_at: record.ends_at(),
            active: record.is_active(now),
        }
    }
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| i64::try_from(elapsed.as_millis()).unwrap_or(i64::MAX))
        .unwrap_or(0)
}

/// Where the trial is kept. Only release builds touch it: a development build
/// shares the credential store with an installed Store copy, and must neither
/// read that copy's trial nor start one for it.
pub mod storage {
    use std::{fs, path::PathBuf};

    use keyring::Entry;
    use tauri::{AppHandle, Manager};

    use super::{merge_copies, TrialRecord};

    const CREDENTIAL_SERVICE: &str = "com.motedesktop.mote";
    const CREDENTIAL_ACCOUNT: &str = "mote-pro-trial";
    const FILE_NAME: &str = "pro-trial.json";

    pub fn load(app: &AppHandle) -> Option<TrialRecord> {
        merge_copies(load_credential(), load_file(app))
    }

    /// Writes both copies, each on a best-effort basis: either one alone is
    /// still enough to find the trial again.
    pub fn save(app: &AppHandle, record: TrialRecord) {
        let Ok(json) = serde_json::to_string(&record) else {
            return;
        };

        if let Ok(entry) = Entry::new(CREDENTIAL_SERVICE, CREDENTIAL_ACCOUNT) {
            let _ = entry.set_password(&json);
        }

        if let Some(path) = file_path(app) {
            if let Some(parent) = path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::write(path, json);
        }
    }

    fn load_credential() -> Option<TrialRecord> {
        let json = Entry::new(CREDENTIAL_SERVICE, CREDENTIAL_ACCOUNT)
            .ok()?
            .get_password()
            .ok()?;
        serde_json::from_str(&json).ok()
    }

    fn load_file(app: &AppHandle) -> Option<TrialRecord> {
        let json = fs::read_to_string(file_path(app)?).ok()?;
        serde_json::from_str(&json).ok()
    }

    fn file_path(app: &AppHandle) -> Option<PathBuf> {
        app.path()
            .app_config_dir()
            .ok()
            .map(|dir| dir.join(FILE_NAME))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const START: i64 = 1_789_000_000_000;

    #[test]
    fn a_trial_lasts_fourteen_days() {
        let record = TrialRecord::starting_at(START);

        assert_eq!(record.ends_at(), START + 14 * DAY_MS);
        assert!(record.is_active(START));
        assert!(record.is_active(START + TRIAL_LENGTH_MS - 1));
        assert!(!record.is_active(START + TRIAL_LENGTH_MS));
    }

    #[test]
    fn winding_the_clock_back_does_not_buy_days() {
        let record = TrialRecord::starting_at(START).seen_at(START + TRIAL_LENGTH_MS + DAY_MS);

        // The clock now claims it is the first day again.
        assert!(!record.is_active(START + DAY_MS));
    }

    #[test]
    fn a_sighting_never_moves_backwards() {
        let record = TrialRecord::starting_at(START)
            .seen_at(START + 5 * DAY_MS)
            .seen_at(START + DAY_MS);

        assert_eq!(record.last_seen_at, START + 5 * DAY_MS);
    }

    #[test]
    fn two_copies_keep_the_earliest_start_and_the_latest_sighting() {
        let older = TrialRecord {
            started_at: START,
            last_seen_at: START + DAY_MS,
        };
        let newer = TrialRecord {
            started_at: START + 10 * DAY_MS,
            last_seen_at: START + 11 * DAY_MS,
        };

        assert_eq!(
            merge_copies(Some(newer), Some(older)),
            Some(TrialRecord {
                started_at: START,
                last_seen_at: START + 11 * DAY_MS,
            })
        );
        assert_eq!(merge_copies(None, Some(older)), Some(older));
        assert_eq!(merge_copies(Some(newer), None), Some(newer));
        assert_eq!(merge_copies(None, None), None);
    }

    #[test]
    fn records_and_status_use_stable_camel_case_names() {
        let record = TrialRecord::starting_at(START);

        assert_eq!(
            serde_json::to_value(record).unwrap(),
            serde_json::json!({ "startedAt": START, "lastSeenAt": START })
        );
        assert_eq!(
            serde_json::to_value(TrialStatus::of(record, START)).unwrap(),
            serde_json::json!({
                "startedAt": START,
                "endsAt": START + TRIAL_LENGTH_MS,
                "active": true
            })
        );
    }
}
