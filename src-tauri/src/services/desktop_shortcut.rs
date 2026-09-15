//! A Mote Desktop shortcut on the user's desktop.
//!
//! The package manifest places one at install, and Settings can remove it or
//! put it back. Both use the same file name, so the Settings switch sees the
//! manifest's shortcut instead of adding a second one beside it.

use std::path::{Path, PathBuf};

/// Matches `desktop7:Shortcut File` in `msix/AppxManifest.xml.template`.
#[cfg(target_os = "windows")]
const SHORTCUT_FILE_NAME: &str = "Mote Desktop.lnk";

/// The `Application Id` in the package manifest.
#[cfg(target_os = "windows")]
const PACKAGE_APPLICATION_ID: &str = "MoteDesktop";

pub fn supported() -> bool {
    cfg!(target_os = "windows")
}

pub fn exists() -> bool {
    shortcut_path().is_ok_and(|path| path.exists())
}

pub fn set(enabled: bool) -> Result<(), String> {
    let path = shortcut_path()?;
    if enabled {
        return create(&path);
    }
    match std::fs::remove_file(&path) {
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => Err(error.to_string()),
        _ => Ok(()),
    }
}

#[cfg(target_os = "windows")]
fn shortcut_path() -> Result<PathBuf, String> {
    use windows::Win32::System::Com::CoTaskMemFree;
    use windows::Win32::UI::Shell::{FOLDERID_Desktop, SHGetKnownFolderPath, KF_FLAG_DEFAULT};

    // The known folder follows OneDrive and other desktop redirection, which a
    // path built from %USERPROFILE% would miss.
    let desktop = unsafe {
        let raw = SHGetKnownFolderPath(&FOLDERID_Desktop, KF_FLAG_DEFAULT, None)
            .map_err(|error| error.to_string())?;
        let path = raw.to_string();
        CoTaskMemFree(Some(raw.0.cast_const().cast()));
        path.map_err(|error| error.to_string())?
    };
    Ok(PathBuf::from(desktop).join(SHORTCUT_FILE_NAME))
}

#[cfg(target_os = "windows")]
fn create(path: &Path) -> Result<(), String> {
    use windows::core::{w, Interface, HSTRING};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, IPersistFile, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};

    unsafe {
        // Sync commands run on the main thread, where COM is already initialised.
        // Only an initialisation made here is balanced.
        let initialized = CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok();
        let result = (|| -> windows::core::Result<()> {
            let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
            set_target(&link)?;
            link.SetDescription(w!("Desktop control for Philips Hue"))?;
            link.cast::<IPersistFile>()?
                .Save(&HSTRING::from(path), true)
        })();
        if initialized {
            CoUninitialize();
        }
        result.map_err(|error| error.to_string())
    }
}

#[cfg(target_os = "windows")]
fn set_target(link: &windows::Win32::UI::Shell::IShellLinkW) -> windows::core::Result<()> {
    use windows::core::HSTRING;
    use windows::Win32::Foundation::E_FAIL;
    use windows::Win32::UI::Shell::{Common::ITEMIDLIST, ILFree, SHParseDisplayName};

    let Some(family) = package_family_name() else {
        // Development builds run unpackaged, where the executable can be started
        // directly.
        let exe = std::env::current_exe().map_err(|_| windows::core::Error::from(E_FAIL))?;
        return unsafe { link.SetPath(&HSTRING::from(exe.as_path())) };
    };

    // A packaged app's install folder is named after its version, so a path to the
    // executable breaks at the next update. The Apps folder entry starts the app
    // through its package, the way Start does.
    let name = HSTRING::from(format!(
        "shell:AppsFolder\\{family}!{PACKAGE_APPLICATION_ID}"
    ));
    let mut pidl: *mut ITEMIDLIST = std::ptr::null_mut();
    unsafe {
        SHParseDisplayName(&name, None, &mut pidl, 0, None)?;
        let result = link.SetIDList(pidl);
        ILFree(Some(pidl.cast_const()));
        result
    }
}

#[cfg(target_os = "windows")]
pub(crate) fn package_family_name() -> Option<String> {
    let id = windows::ApplicationModel::Package::Current()
        .ok()?
        .Id()
        .ok()?;
    Some(id.FamilyName().ok()?.to_string())
}

#[cfg(not(target_os = "windows"))]
fn shortcut_path() -> Result<PathBuf, String> {
    Err("Desktop shortcuts are only supported on Windows.".to_string())
}

#[cfg(not(target_os = "windows"))]
fn create(_path: &Path) -> Result<(), String> {
    Err("Desktop shortcuts are only supported on Windows.".to_string())
}
