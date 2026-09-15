//! Lets Mote leave when Windows ends the session or closes it for an update.
//!
//! Windows asks through `WM_QUERYENDSESSION` and `WM_ENDSESSION`, at sign-out and
//! also from Restart Manager when a Store update replaces the package. tao answers
//! `WM_ENDSESSION` by running Tauri's exit path, then keeps its event loop, and
//! with it the tray icon and the process, alive. Windows waits for a process that
//! never leaves and kills it at its timeout: the 0.2.5.0 and 0.3.0.0 updates both
//! logged about 30 seconds between the shutdown request and the package swap.

use tauri::Manager;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
use windows_sys::Win32::UI::WindowsAndMessaging::WM_ENDSESSION;

/// Tells this subclass apart from tao's own on the same window.
const SUBCLASS_ID: usize = 0x4D4F_5445;

/// Windows sends the session messages to every top-level window, a hidden one
/// included, and the main window lives as long as the process, so it is the one
/// to watch.
pub fn exit_when_session_ends(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let Ok(hwnd) = window.hwnd() else {
        return;
    };

    // Safety: the callback is a plain function with no reference data, and
    // Windows removes the subclass when the window is destroyed.
    let installed =
        unsafe { SetWindowSubclass(HWND(hwnd.0), Some(end_session_proc), SUBCLASS_ID, 0) };
    if !installed.as_bool() {
        eprintln!("could not watch for the Windows session ending");
    }
}

unsafe extern "system" fn end_session_proc(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _subclass_id: usize,
    _reference_data: usize,
) -> LRESULT {
    // A zero wParam means the session is not ending after all.
    if message == WM_ENDSESSION && wparam.0 != 0 {
        // tao's handler runs Tauri's exit path, which stops PC Sync and restores
        // the lights. Ending the process is the only part it leaves out.
        unsafe { DefSubclassProc(hwnd, message, wparam, lparam) };
        std::process::exit(0);
    }
    unsafe { DefSubclassProc(hwnd, message, wparam, lparam) }
}
