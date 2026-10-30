fn main() {
    // `commands::feedback` reads this through `option_env!`, which is resolved
    // at compile time. Without this directive Cargo has no reason to rebuild
    // when the value changes, so a release could quietly ship a stale token —
    // or none at all, silently disabling feedback.
    println!("cargo:rerun-if-env-changed=MOTE_FEEDBACK_APP_TOKEN");
    // Debug-only: `services::entitlements` opens on Pro when this is set.
    println!("cargo:rerun-if-env-changed=MOTE_DEBUG_PRO");
    println!("cargo:rustc-check-cfg=cfg(mote_personal_install)");
    if std::env::var_os("MOTE_DEBUG_PRO").is_some() {
        println!("cargo:rustc-cfg=mote_personal_install");
    }

    tauri_build::build()
}
