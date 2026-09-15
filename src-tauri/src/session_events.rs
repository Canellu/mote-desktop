//! Tells the automations when this PC locks, unlocks, sleeps and wakes.
//!
//! Lock and unlock reach a window only after it registers for session
//! notifications; sleep and wake reach every top-level window. Both arrive at
//! the main window, which lives as long as the process, through a subclass of
//! its own. `session_end` keeps a separate one for leaving at sign-out.

use tauri::Manager;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
use windows_sys::Win32::System::RemoteDesktop::{
    WTSRegisterSessionNotification, NOTIFY_FOR_THIS_SESSION,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    PBT_APMRESUMESUSPEND, PBT_APMSUSPEND, WM_POWERBROADCAST, WM_WTSSESSION_CHANGE,
    WTS_SESSION_LOCK, WTS_SESSION_UNLOCK,
};

use crate::services::automations::runtime::{signal, Signal};

/// Tells this subclass apart from `session_end`'s and tao's on the same window.
const SUBCLASS_ID: usize = 0x4D4F_5446;

pub fn watch(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let Ok(hwnd) = window.hwnd() else {
        return;
    };

    // Safety: the callback is a plain function with no reference data, and
    // Windows removes the subclass when the window is destroyed.
    let installed = unsafe { SetWindowSubclass(HWND(hwnd.0), Some(session_proc), SUBCLASS_ID, 0) };
    if !installed.as_bool() {
        eprintln!("could not watch for this PC locking");
        return;
    }

    // Safety: a live top-level window owned by this process.
    if unsafe { WTSRegisterSessionNotification(hwnd.0, NOTIFY_FOR_THIS_SESSION) } == 0 {
        eprintln!("could not register for lock and unlock notifications");
    }
}

unsafe extern "system" fn session_proc(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _subclass_id: usize,
    _reference_data: usize,
) -> LRESULT {
    match (message, wparam.0 as u32) {
        (WM_WTSSESSION_CHANGE, WTS_SESSION_LOCK) => signal(Signal::Locked(true)),
        (WM_WTSSESSION_CHANGE, WTS_SESSION_UNLOCK) => signal(Signal::Locked(false)),
        (WM_POWERBROADCAST, PBT_APMSUSPEND) => signal(Signal::Suspended(true)),
        // Sent only when a person woke the PC, not a wake timer at 3 a.m.
        (WM_POWERBROADCAST, PBT_APMRESUMESUSPEND) => signal(Signal::Suspended(false)),
        _ => {}
    }
    unsafe { DefSubclassProc(hwnd, message, wparam, lparam) }
}
