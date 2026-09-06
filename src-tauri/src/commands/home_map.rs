use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::Value;
use tauri::{AppHandle, Manager, State};

const MAX_MAP_BYTES: usize = 16 * 1024 * 1024;
static TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);

/// Serializes map reads and compare-and-swap writes across this app's windows.
#[derive(Default)]
pub struct HomeMapStorageState(Mutex<()>);

impl HomeMapStorageState {
    fn read(&self, root: &Path, bridge_id: &str) -> Result<Option<String>, String> {
        let _guard = self.0.lock().map_err(|_| "Map storage is unavailable.")?;
        read_raw(&bridge_path(root, bridge_id)?)
    }

    fn write(
        &self,
        root: &Path,
        bridge_id: &str,
        value: &str,
        expected: Option<&str>,
    ) -> Result<(), String> {
        validate_payload(value, bridge_id)?;
        let path = bridge_path(root, bridge_id)?;
        let _guard = self.0.lock().map_err(|_| "Map storage is unavailable.")?;
        let current = read_raw(&path)?;
        if current.as_deref() != expected {
            return Err("This map changed since it was loaded. Reload it before saving.".into());
        }
        if let Some(raw) = current.as_deref() {
            validate_payload(raw, bridge_id).map_err(|error| {
                format!("The existing map must be preserved for recovery: {error}")
            })?;
        }
        atomic_replace(&path, value, |source, target| fs::rename(source, target))
    }
}

#[tauri::command(rename = "read-home-map")]
pub fn read_home_map(
    app: AppHandle,
    state: State<'_, HomeMapStorageState>,
    bridge_id: String,
) -> Result<Option<String>, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    state.read(&root.join("home-maps"), &bridge_id)
}

#[tauri::command(rename = "write-home-map")]
pub fn write_home_map(
    app: AppHandle,
    state: State<'_, HomeMapStorageState>,
    bridge_id: String,
    value: String,
    expected: Option<String>,
) -> Result<(), String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    state.write(
        &root.join("home-maps"),
        &bridge_id,
        &value,
        expected.as_deref(),
    )
}

fn valid_text(value: &str, limit: usize) -> bool {
    !value.trim().is_empty() && value.encode_utf16().count() <= limit
}

fn bridge_path(root: &Path, bridge_id: &str) -> Result<PathBuf, String> {
    if !valid_text(bridge_id, 128) {
        return Err("A bridge ID of at most 128 characters is required.".into());
    }
    let encoded: String = bridge_id
        .bytes()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    let mut path = root.to_path_buf();
    // Chunk long IDs to stay below filesystem component limits; hex is injective.
    let mut remaining = encoded.as_str();
    while remaining.len() > 120 {
        path.push(&remaining[..120]);
        remaining = &remaining[120..];
    }
    path.push(format!("{remaining}.json"));
    Ok(path)
}

fn read_raw(path: &Path) -> Result<Option<String>, String> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Could not read the home map: {error}")),
    };
    let mut raw = String::new();
    file.take(MAX_MAP_BYTES as u64 + 1)
        .read_to_string(&mut raw)
        .map_err(|error| format!("Could not read the home map: {error}"))?;
    if raw.len() > MAX_MAP_BYTES {
        return Err(
            "The existing map exceeds the storage limit and must be preserved for recovery.".into(),
        );
    }
    Ok(Some(raw))
}

fn validate_payload(raw: &str, bridge_id: &str) -> Result<(), String> {
    if raw.len() > MAX_MAP_BYTES {
        return Err("The home map exceeds the 16 MiB storage limit.".into());
    }
    let value: Value =
        serde_json::from_str(raw).map_err(|_| "The home map is not valid JSON.".to_string())?;
    let envelope = value.as_object().ok_or("Map storage must be an object.")?;
    if envelope.get("schemaVersion").and_then(Value::as_f64) != Some(1.0) {
        return Err("Map storage has an unsupported schema version.".into());
    }
    if !valid_text(bridge_id, 128)
        || envelope.get("bridgeId").and_then(Value::as_str) != Some(bridge_id)
    {
        return Err("Map storage belongs to another bridge.".into());
    }
    let mut map_id: Option<&str> = None;
    for key in ["published", "draft"] {
        let document = envelope
            .get(key)
            .ok_or_else(|| format!("Map storage is missing {key}."))?;
        if document.is_null() {
            continue;
        }
        let document = document
            .as_object()
            .ok_or_else(|| format!("The {key} map must be an object."))?;
        if document.get("schemaVersion").and_then(Value::as_f64) != Some(1.0) {
            return Err(format!("The {key} map has an unsupported schema version."));
        }
        if document.get("bridgeId").and_then(Value::as_str) != Some(bridge_id) {
            return Err(format!("The {key} map belongs to another bridge."));
        }
        let id = document
            .get("id")
            .and_then(Value::as_str)
            .filter(|id| valid_text(id, 128))
            .ok_or_else(|| format!("The {key} map needs an ID."))?;
        if map_id.is_some_and(|other| other != id) {
            return Err("The draft and published map IDs differ.".into());
        }
        map_id = Some(id);
        let has_name = document
            .get("name")
            .and_then(Value::as_str)
            .is_some_and(|name| valid_text(name, 200));
        let has_mode = matches!(
            document.get("drawingMode").and_then(Value::as_str),
            Some("sketch" | "measured")
        );
        let has_units = matches!(
            document.get("units").and_then(Value::as_str),
            Some("metric" | "imperial")
        );
        let has_floors = document
            .get("floors")
            .and_then(Value::as_array)
            .is_some_and(|floors| (1..=32).contains(&floors.len()));
        // The frontend validates all floor geometry before saving or rendering.
        if !has_name || !has_mode || !has_units || !has_floors {
            return Err(format!("The {key} map is missing valid document fields."));
        }
    }
    Ok(())
}

fn create_temporary(parent: &Path) -> io::Result<(PathBuf, File)> {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    for _ in 0..16 {
        let sequence = TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let path = parent.join(format!(
            ".map-{}-{stamp}-{sequence}.tmp",
            std::process::id()
        ));
        match OpenOptions::new().create_new(true).write(true).open(&path) {
            Ok(file) => return Ok((path, file)),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error),
        }
    }
    Err(io::Error::new(
        io::ErrorKind::AlreadyExists,
        "Could not reserve a temporary map file.",
    ))
}

fn atomic_replace(
    path: &Path,
    value: &str,
    replace: impl FnOnce(&Path, &Path) -> io::Result<()>,
) -> Result<(), String> {
    let parent = path.parent().ok_or("The home map path is invalid.")?;
    fs::create_dir_all(parent).map_err(|error| format!("Could not create map storage: {error}"))?;
    let (temporary, mut file) = create_temporary(parent)
        .map_err(|error| format!("Could not prepare the home map save: {error}"))?;
    let result = file
        .write_all(value.as_bytes())
        .and_then(|_| file.sync_all());
    // Windows must release our temporary file handle before replacement.
    drop(file);
    let result = result.and_then(|_| replace(&temporary, path));
    if let Err(error) = result {
        let cleanup = fs::remove_file(&temporary);
        let cleanup_error = cleanup
            .err()
            .filter(|error| error.kind() != io::ErrorKind::NotFound)
            .map(|error| format!(" Temporary file cleanup also failed: {error}"))
            .unwrap_or_default();
        return Err(format!(
            "Could not save the home map: {error}.{cleanup_error}"
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::{Arc, Barrier};

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let root = std::env::temp_dir();
            let (reservation, file) = create_temporary(&root).unwrap();
            drop(file);
            let directory = reservation.with_extension("map-tests");
            fs::create_dir(&directory).unwrap();
            fs::remove_file(reservation).unwrap();
            Self(directory)
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn payload(bridge: &str, name: &str) -> String {
        json!({
            "schemaVersion": 1, "bridgeId": bridge, "published": null,
            "draft": {
                "schemaVersion": 1, "bridgeId": bridge, "id": "map-1", "name": name,
                "drawingMode": "sketch", "units": "metric", "floors": [{
                    "id": "floor-1", "name": "Ground floor", "vertices": [],
                    "areas": [], "dimensions": [], "lights": []
                }]
            }
        })
        .to_string()
    }

    #[test]
    fn roundtrip_and_atomic_replacement() {
        let directory = TestDirectory::new();
        let store = HomeMapStorageState::default();
        assert_eq!(store.read(&directory.0, "bridge").unwrap(), None);
        let first = payload("bridge", "First");
        store.write(&directory.0, "bridge", &first, None).unwrap();
        assert_eq!(
            store.read(&directory.0, "bridge").unwrap(),
            Some(first.clone())
        );
        let second = payload("bridge", "Second");
        store
            .write(&directory.0, "bridge", &second, Some(&first))
            .unwrap();
        assert_eq!(store.read(&directory.0, "bridge").unwrap(), Some(second));
        assert_eq!(fs::read_dir(&directory.0).unwrap().count(), 1);
    }

    #[test]
    fn bridge_paths_are_isolated_and_cannot_escape_root() {
        let directory = TestDirectory::new();
        let store = HomeMapStorageState::default();
        for bridge in ["bridge", "BRIDGE", "../elsewhere\\target", "🛋️ home"] {
            store
                .write(&directory.0, bridge, &payload(bridge, bridge), None)
                .unwrap();
            assert_eq!(
                store.read(&directory.0, bridge).unwrap(),
                Some(payload(bridge, bridge))
            );
            let path = bridge_path(&directory.0, bridge).unwrap();
            assert!(path.starts_with(&directory.0));
            assert_eq!(path.parent(), Some(directory.0.as_path()));
        }
        assert_eq!(fs::read_dir(&directory.0).unwrap().count(), 4);
        let long = "a".repeat(128);
        let path = bridge_path(&directory.0, &long).unwrap();
        assert!(path
            .strip_prefix(&directory.0)
            .unwrap()
            .components()
            .all(|part| part.as_os_str().len() <= 125));
        store
            .write(&directory.0, &long, &payload(&long, "Long"), None)
            .unwrap();
        assert!(store.read(&directory.0, &long).unwrap().is_some());
        assert!(bridge_path(&directory.0, "  ").is_err());
        assert!(bridge_path(&directory.0, &"a".repeat(129)).is_err());
        assert!(bridge_path(&directory.0, &"🛋".repeat(65)).is_err());
    }

    #[test]
    fn malformed_raw_is_preserved_and_not_implicitly_overwritten() {
        let directory = TestDirectory::new();
        let path = bridge_path(&directory.0, "bridge").unwrap();
        let original = " \n{broken-json\n";
        fs::write(&path, original).unwrap();
        let store = HomeMapStorageState::default();
        assert_eq!(
            store.read(&directory.0, "bridge").unwrap(),
            Some(original.into())
        );
        assert!(store
            .write(&directory.0, "bridge", &payload("bridge", "New"), None)
            .is_err());
        assert!(store
            .write(
                &directory.0,
                "bridge",
                &payload("bridge", "New"),
                Some(original)
            )
            .is_err());
        assert_eq!(fs::read_to_string(path).unwrap(), original);
    }

    #[test]
    fn stale_expected_value_cannot_replace_a_newer_save() {
        let directory = TestDirectory::new();
        let store = HomeMapStorageState::default();
        let original = payload("bridge", "Original");
        store
            .write(&directory.0, "bridge", &original, None)
            .unwrap();
        let error = store
            .write(
                &directory.0,
                "bridge",
                &payload("bridge", "New"),
                Some("stale"),
            )
            .unwrap_err();
        assert!(error.contains("Reload"));
        assert_eq!(store.read(&directory.0, "bridge").unwrap(), Some(original));
    }

    #[test]
    fn invalid_envelopes_and_document_identity_are_rejected() {
        let directory = TestDirectory::new();
        let store = HomeMapStorageState::default();
        let valid: Value = serde_json::from_str(&payload("bridge", "Home")).unwrap();
        let mut invalid = vec![
            json!(null),
            json!([]),
            json!({}),
            json!({"schemaVersion": 1, "bridgeId": "bridge", "published": null}),
        ];
        for (field, value) in [
            ("schemaVersion", json!(2)),
            ("bridgeId", json!("other")),
            ("draft", json!({})),
        ] {
            let mut envelope = valid.clone();
            envelope[field] = value;
            invalid.push(envelope);
        }
        for (field, value) in [
            ("bridgeId", json!("other")),
            ("schemaVersion", json!(2)),
            ("name", json!("")),
            ("floors", json!([])),
        ] {
            let mut envelope = valid.clone();
            envelope["draft"][field] = value;
            invalid.push(envelope);
        }
        let mut mismatch = valid.clone();
        mismatch["published"] = mismatch["draft"].clone();
        mismatch["draft"]["id"] = json!("different-map");
        invalid.push(mismatch);
        for envelope in invalid {
            assert!(store
                .write(&directory.0, "bridge", &envelope.to_string(), None)
                .is_err());
        }
        assert!(store.write(&directory.0, "bridge", "{bad", None).is_err());
        assert!(store
            .write(&directory.0, "bridge", &" ".repeat(MAX_MAP_BYTES + 1), None)
            .unwrap_err()
            .contains("16 MiB"));
        assert_eq!(store.read(&directory.0, "bridge").unwrap(), None);
        assert_eq!(fs::read_dir(&directory.0).unwrap().count(), 0);
    }

    #[test]
    fn failed_rename_preserves_original_and_removes_owned_temporary() {
        let directory = TestDirectory::new();
        let path = bridge_path(&directory.0, "bridge").unwrap();
        fs::write(&path, "original").unwrap();
        let other_file = directory.0.join(".unrelated.tmp");
        fs::write(&other_file, "untouched").unwrap();
        let error = atomic_replace(&path, "replacement", |temporary, destination| {
            assert_eq!(fs::read_to_string(temporary).unwrap(), "replacement");
            assert_eq!(fs::read_to_string(destination).unwrap(), "original");
            Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "locked destination",
            ))
        })
        .unwrap_err();
        assert!(error.contains("locked destination"));
        assert_eq!(fs::read_to_string(path).unwrap(), "original");
        assert_eq!(fs::read_to_string(other_file).unwrap(), "untouched");
        assert_eq!(fs::read_dir(&directory.0).unwrap().count(), 2);
    }

    #[test]
    fn oversized_and_non_utf8_files_remain_unavailable_and_untouched() {
        let directory = TestDirectory::new();
        let path = bridge_path(&directory.0, "bridge").unwrap();
        let oversized = vec![b' '; MAX_MAP_BYTES + 1];
        fs::write(&path, &oversized).unwrap();
        let store = HomeMapStorageState::default();
        assert!(store
            .read(&directory.0, "bridge")
            .unwrap_err()
            .contains("storage limit"));
        assert_eq!(fs::metadata(&path).unwrap().len(), oversized.len() as u64);
        fs::write(&path, [0xff, 0xfe]).unwrap();
        assert!(store.read(&directory.0, "bridge").is_err());
        assert_eq!(fs::read(&path).unwrap(), [0xff, 0xfe]);
    }

    #[test]
    fn simultaneous_compare_and_swap_has_only_one_winner() {
        let directory = TestDirectory::new();
        let store = Arc::new(HomeMapStorageState::default());
        let barrier = Arc::new(Barrier::new(2));
        let handles: Vec<_> = ["First", "Second"]
            .into_iter()
            .map(|name| {
                let store = Arc::clone(&store);
                let barrier = Arc::clone(&barrier);
                let root = directory.0.clone();
                std::thread::spawn(move || {
                    barrier.wait();
                    store.write(&root, "bridge", &payload("bridge", name), None)
                })
            })
            .collect();
        let results: Vec<_> = handles
            .into_iter()
            .map(|handle| handle.join().unwrap())
            .collect();
        assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
        let saved = store.read(&directory.0, "bridge").unwrap().unwrap();
        assert!(saved == payload("bridge", "First") || saved == payload("bridge", "Second"));
    }
}
