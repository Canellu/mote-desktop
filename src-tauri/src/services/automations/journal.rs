//! The lights automations changed, kept on disk so a crash never strands them.
//!
//! Written before the writes it describes and again once they land, to a
//! temporary file that replaces the journal in one rename, so a crash mid-save
//! leaves the previous journal whole. Holds bridge and light ids and states
//! only; the application key is read from the keyring when a restore runs.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

use super::ownership::JournalEntry;

const FILE_NAME: &str = "automation-journal.json";
const VERSION: u32 = 1;

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JournalFile {
    version: u32,
    entries: Vec<JournalEntry>,
}

#[derive(Debug, Default)]
pub struct Journal {
    path: Option<PathBuf>,
    /// What is on disk, so an unchanged journal is not rewritten.
    saved: Vec<JournalEntry>,
}

impl Journal {
    pub fn open<R: Runtime>(app: &AppHandle<R>) -> Self {
        Self {
            path: app
                .path()
                .app_config_dir()
                .ok()
                .map(|directory| directory.join(FILE_NAME)),
            saved: Vec::new(),
        }
    }

    #[cfg(test)]
    fn at(path: PathBuf) -> Self {
        Self {
            path: Some(path),
            saved: Vec::new(),
        }
    }

    /// What a previous run left behind. An unreadable or newer journal reads
    /// as empty rather than blocking automations.
    pub fn load(&mut self) -> Vec<JournalEntry> {
        let Some(path) = &self.path else {
            return Vec::new();
        };
        let entries = std::fs::read(path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<JournalFile>(&bytes).ok())
            .filter(|file| file.version == VERSION)
            .map(|file| file.entries)
            .unwrap_or_default();
        self.saved = entries.clone();
        entries
    }

    pub fn save(&mut self, entries: Vec<JournalEntry>) -> Result<(), String> {
        if entries == self.saved {
            return Ok(());
        }
        let Some(path) = &self.path else {
            return Err("There is nowhere to keep the automation journal.".into());
        };
        let failed = |_| "Could not save the automation journal.".to_string();
        if entries.is_empty() {
            match std::fs::remove_file(path) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(failed(error)),
            }
        } else {
            if let Some(directory) = path.parent() {
                std::fs::create_dir_all(directory).map_err(failed)?;
            }
            let bytes = serde_json::to_vec(&JournalFile {
                version: VERSION,
                entries: entries.clone(),
            })
            .map_err(|_| "The automation journal is invalid.".to_string())?;
            let temporary = path.with_extension("json.tmp");
            std::fs::write(&temporary, bytes).map_err(failed)?;
            // Replaces the old journal in one step, on Windows too.
            std::fs::rename(&temporary, path).map_err(failed)?;
        }
        self.saved = entries;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::automations::looks::Applied;
    use crate::services::automations::ownership::LightKey;
    use crate::services::automations::priority::Holder;
    use crate::services::entertainment::snapshot::LightSnapshot;

    fn entry() -> JournalEntry {
        JournalEntry {
            key: LightKey {
                bridge_id: "BRIDGE".into(),
                light_id: "desk".into(),
            },
            before: LightSnapshot {
                id: "desk".into(),
                on: true,
                brightness: Some(40.0),
                color_mode: Some("ct".into()),
                xy: None,
                mirek: Some(366),
            },
            applied: Applied {
                on: true,
                brightness: Some(100.0),
                xy: Some([0.675, 0.322]),
                mirek: None,
            },
            holder: Holder::Calendar("standup".into()),
            restore: true,
        }
    }

    fn scratch(name: &str) -> PathBuf {
        let directory =
            std::env::temp_dir().join(format!("mote-journal-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&directory);
        directory.join(FILE_NAME)
    }

    #[test]
    fn a_saved_journal_reads_back_and_an_empty_one_is_removed() {
        let path = scratch("roundtrip");
        let mut journal = Journal::at(path.clone());
        assert!(journal.load().is_empty());
        journal.save(vec![entry()]).unwrap();
        assert!(path.exists());
        assert!(!path.with_extension("json.tmp").exists());

        let mut next = Journal::at(path.clone());
        assert_eq!(next.load(), vec![entry()]);
        next.save(Vec::new()).unwrap();
        assert!(!path.exists());
    }

    #[test]
    fn a_damaged_journal_reads_as_empty() {
        let path = scratch("damaged");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, b"{\"version\":1,\"entries\":[").unwrap();
        assert!(Journal::at(path).load().is_empty());
    }

    #[test]
    fn an_entry_holds_ids_and_states_only() {
        let value = serde_json::to_value(entry()).unwrap();
        let mut fields: Vec<&str> = value
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        fields.sort();
        assert_eq!(fields, ["applied", "before", "holder", "key", "restore"]);
        let mut key: Vec<&str> = value["key"]
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        key.sort();
        assert_eq!(key, ["bridgeId", "lightId"]);
    }
}
