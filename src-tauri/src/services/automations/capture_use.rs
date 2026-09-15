//! Which apps are using the microphone or camera right now.
//!
//! Windows records capture per app in the capability access manager's consent
//! store, the same record behind the microphone and camera indicators in the
//! taskbar. An entry whose `LastUsedTimeStop` is zero says it is still
//! capturing. Reading it needs no permission and no integration with any calling
//! app, so Teams, Zoom, Discord and a browser tab all count the same way.
//!
//! That record is not always closed. A process killed mid-capture can leave its
//! entry open for good: the Android Emulator's QEMU is a known one, still marked
//! as using the microphone more than a year after it last ran. So an entry only
//! counts when its capture began after this boot and, for a desktop app, while
//! its executable is still running.

use std::time::Duration;

use serde::Serialize;

const NON_PACKAGED_PREFIX: &str = "NonPackaged\\";
/// 100-nanosecond intervals from 1601-01-01, where FILETIME counts from, to
/// 1970-01-01.
const FILETIME_UNIX_EPOCH: u64 = 116_444_736_000_000_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureApp {
    /// The consent-store key: a package family name, or `NonPackaged\` and the
    /// executable path with `#` in place of `\`.
    pub id: String,
    pub name: String,
    pub microphone: bool,
    pub camera: bool,
}

/// Every app capturing now, except Mote itself.
pub fn active_apps() -> Vec<CaptureApp> {
    platform::active_apps()
}

/// A readable name for a consent-store key: the executable's name, or the last
/// part of a package's name.
fn display_name(id: &str) -> String {
    if let Some(path) = id.strip_prefix(NON_PACKAGED_PREFIX) {
        let file = path
            .rsplit(|c| c == '#' || c == '\\')
            .next()
            .unwrap_or(path);
        // ".exe" is ASCII, so a lowercase match ends on a character boundary.
        return if file.to_ascii_lowercase().ends_with(".exe") {
            file[..file.len() - 4].to_string()
        } else {
            file.to_string()
        };
    }
    let family = id.split('_').next().unwrap_or(id);
    family.rsplit('.').next().unwrap_or(family).to_string()
}

/// The consent-store key Windows gives a desktop executable.
fn desktop_id(path: &str) -> String {
    format!("{NON_PACKAGED_PREFIX}{}", path.replace('\\', "#"))
}

/// The lowercase executable file name in a desktop app's key.
fn desktop_file_name(id: &str) -> Option<String> {
    id.strip_prefix(NON_PACKAGED_PREFIX)
        .and_then(|path| path.rsplit('#').next())
        .map(str::to_lowercase)
}

/// When this PC booted, as a FILETIME.
fn boot_filetime(since_unix_epoch: Duration, uptime: Duration) -> u64 {
    let hundred_ns =
        |duration: Duration| u64::try_from(duration.as_nanos() / 100).unwrap_or(u64::MAX);
    FILETIME_UNIX_EPOCH
        .saturating_add(hundred_ns(since_unix_epoch))
        .saturating_sub(hundred_ns(uptime))
}

/// Whether an open record can be believed. A capture that began before boot
/// cannot still be running. A desktop app must also have its executable running;
/// a packaged app's key holds no path to look for, so boot is its only check.
fn still_capturing(id: &str, started: u64, booted: u64, is_running: impl Fn(&str) -> bool) -> bool {
    started > booted && (!id.starts_with(NON_PACKAGED_PREFIX) || is_running(id))
}

#[cfg(target_os = "windows")]
mod platform {
    use std::collections::{BTreeMap, HashSet};
    use std::sync::OnceLock;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    use windows_registry::{Key, CURRENT_USER};
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::SystemInformation::GetTickCount64;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };

    use super::{
        boot_filetime, desktop_file_name, desktop_id, display_name, still_capturing, CaptureApp,
        NON_PACKAGED_PREFIX,
    };

    const CONSENT_STORE: &str =
        r"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore";

    /// An open consent-store record: whose, and when its capture began.
    struct Record {
        id: String,
        started: u64,
    }

    /// Desktop executables running now.
    #[derive(Default)]
    struct Running {
        /// Consent-store keys of processes whose full path was read, lowercased.
        ids: HashSet<String>,
        /// File names of processes that refused to say where they run from, such
        /// as an app running as administrator. A name match is the best there is.
        unverified_names: HashSet<String>,
    }

    pub fn active_apps() -> Vec<CaptureApp> {
        let microphone = open_records("microphone");
        let camera = open_records("webcam");
        if microphone.is_empty() && camera.is_empty() {
            return Vec::new();
        }

        // Safety: takes nothing and cannot fail.
        let uptime = Duration::from_millis(unsafe { GetTickCount64() });
        let since_epoch = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default();
        let booted = boot_filetime(since_epoch, uptime);
        let running = running_executables(
            microphone
                .iter()
                .chain(&camera)
                .map(|record| record.id.as_str()),
        );
        let is_running = |id: &str| {
            running.ids.contains(&id.to_lowercase())
                || desktop_file_name(id)
                    .is_some_and(|name| running.unverified_names.contains(&name))
        };
        let own = own_ids();

        let mut apps = BTreeMap::new();
        for (records, is_camera) in [(microphone, false), (camera, true)] {
            for record in records {
                if !still_capturing(&record.id, record.started, booted, is_running)
                    || own.iter().any(|id| id.eq_ignore_ascii_case(&record.id))
                {
                    continue;
                }
                let app = entry(&mut apps, record.id);
                if is_camera {
                    app.camera = true;
                } else {
                    app.microphone = true;
                }
            }
        }
        apps.into_values().collect()
    }

    fn entry(apps: &mut BTreeMap<String, CaptureApp>, id: String) -> &mut CaptureApp {
        apps.entry(id.clone()).or_insert_with(|| CaptureApp {
            name: display_name(&id),
            id,
            microphone: false,
            camera: false,
        })
    }

    fn open_records(capability: &str) -> Vec<Record> {
        let mut records = Vec::new();
        let Ok(store) = CURRENT_USER.open(format!(r"{CONSENT_STORE}\{capability}")) else {
            return records;
        };
        let Ok(names) = store.keys() else {
            return records;
        };
        for name in names {
            if name == "NonPackaged" {
                let Ok(desktop) = store.open(&name) else {
                    continue;
                };
                let Ok(paths) = desktop.keys() else {
                    continue;
                };
                for path in paths {
                    if let Some(started) = open_since(&desktop, &path) {
                        records.push(Record {
                            id: format!("{NON_PACKAGED_PREFIX}{path}"),
                            started,
                        });
                    }
                }
            } else if let Some(started) = open_since(&store, &name) {
                records.push(Record { id: name, started });
            }
        }
        records
    }

    /// When an entry's capture began, if its record is still open.
    fn open_since(parent: &Key, name: &str) -> Option<u64> {
        let key = parent.open(name).ok()?;
        let started = key
            .get_u64("LastUsedTimeStart")
            .ok()
            .filter(|start| *start > 0)?;
        (key.get_u64("LastUsedTimeStop").ok()? == 0).then_some(started)
    }

    /// Looks only at processes whose file name matches an open desktop record,
    /// so a long call costs one process snapshot per poll, not a query of every
    /// process.
    fn running_executables<'a>(ids: impl Iterator<Item = &'a str>) -> Running {
        let wanted: HashSet<String> = ids.filter_map(desktop_file_name).collect();
        let mut running = Running::default();
        if wanted.is_empty() {
            return running;
        }

        // Safety: the snapshot handle is closed before returning, and the entry
        // carries the size the API requires.
        unsafe {
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snapshot == INVALID_HANDLE_VALUE {
                return running;
            }
            let mut entry: PROCESSENTRY32W = std::mem::zeroed();
            entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
            let mut more = Process32FirstW(snapshot, &mut entry) != 0;
            while more {
                let length = entry
                    .szExeFile
                    .iter()
                    .position(|&unit| unit == 0)
                    .unwrap_or(entry.szExeFile.len());
                let name = String::from_utf16_lossy(&entry.szExeFile[..length]).to_lowercase();
                if wanted.contains(&name) {
                    match image_path(entry.th32ProcessID) {
                        Some(path) => {
                            running.ids.insert(desktop_id(&path).to_lowercase());
                        }
                        None => {
                            running.unverified_names.insert(name);
                        }
                    }
                }
                more = Process32NextW(snapshot, &mut entry) != 0;
            }
            CloseHandle(snapshot);
        }
        running
    }

    fn image_path(process_id: u32) -> Option<String> {
        // Safety: the process handle is closed on every path out, and the buffer
        // length passed matches the buffer.
        unsafe {
            let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, process_id);
            if process.is_null() {
                return None;
            }
            let mut buffer = vec![0u16; 32_768];
            let mut length = buffer.len() as u32;
            let read = QueryFullProcessImageNameW(
                process,
                PROCESS_NAME_WIN32,
                buffer.as_mut_ptr(),
                &mut length,
            ) != 0;
            CloseHandle(process);
            read.then(|| String::from_utf16_lossy(&buffer[..length as usize]))
        }
    }

    /// Mote's own keys, packaged or not, so it never puts itself on air.
    fn own_ids() -> &'static [String] {
        static OWN: OnceLock<Vec<String>> = OnceLock::new();
        OWN.get_or_init(|| {
            let mut ids = Vec::new();
            if let Ok(exe) = std::env::current_exe() {
                ids.push(desktop_id(&exe.to_string_lossy()));
            }
            if let Some(family) = crate::services::desktop_shortcut::package_family_name() {
                ids.push(family);
            }
            ids
        })
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    use super::CaptureApp;

    pub fn active_apps() -> Vec<CaptureApp> {
        Vec::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn desktop_apps_are_named_after_their_executable() {
        assert_eq!(
            display_name(r"NonPackaged\C:#Program Files#Zoom#bin#Zoom.exe"),
            "Zoom"
        );
        assert_eq!(display_name(r"NonPackaged\C:#tools#recorder"), "recorder");
        assert_eq!(display_name(r"NonPackaged\C:#Apps#Discord.EXE"), "Discord");
    }

    #[test]
    fn packaged_apps_are_named_after_their_package() {
        assert_eq!(display_name("MSTeams_8wekyb3d8bbwe"), "MSTeams");
        assert_eq!(
            display_name("Microsoft.WindowsCamera_8wekyb3d8bbwe"),
            "WindowsCamera"
        );
    }

    #[test]
    fn a_desktop_key_is_built_the_way_windows_builds_it() {
        let id = desktop_id(r"C:\Program Files\Zoom\bin\Zoom.exe");
        assert_eq!(id, r"NonPackaged\C:#Program Files#Zoom#bin#Zoom.exe");
        assert_eq!(desktop_file_name(&id).as_deref(), Some("zoom.exe"));
        assert_eq!(desktop_file_name("MSTeams_8wekyb3d8bbwe"), None);
    }

    #[test]
    fn boot_time_is_now_less_uptime_in_filetime_units() {
        assert_eq!(
            boot_filetime(Duration::ZERO, Duration::ZERO),
            FILETIME_UNIX_EPOCH
        );
        assert_eq!(
            boot_filetime(Duration::from_secs(10), Duration::from_secs(4)),
            FILETIME_UNIX_EPOCH + 60_000_000
        );
    }

    #[test]
    fn a_record_left_open_is_not_believed() {
        const QEMU: &str = r"NonPackaged\C:#Android#emulator#qemu-system-x86_64.exe";
        const TEAMS: &str = "MSTeams_8wekyb3d8bbwe";
        let booted = 1_000;
        let running = |_: &str| true;
        let stopped = |_: &str| false;

        // Began before this boot: whatever the record says, it is over.
        assert!(!still_capturing(QEMU, 500, booted, running));
        assert!(!still_capturing(TEAMS, 500, booted, running));
        // Began since boot, but the process is gone.
        assert!(!still_capturing(QEMU, 2_000, booted, stopped));
        assert!(still_capturing(QEMU, 2_000, booted, running));
        // A packaged app has no path to look for.
        assert!(still_capturing(TEAMS, 2_000, booted, stopped));
    }
}
