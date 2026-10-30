// Prevents additional console window on Windows in release, DO NOT REMOVE!!
// `mote_personal_install` (set by build.rs from MOTE_DEBUG_PRO) hides it in a
// personal debug install too.
#![cfg_attr(
    any(not(debug_assertions), mote_personal_install),
    windows_subsystem = "windows"
)]

fn main() {
    mote_desktop_lib::run()
}
