fn main() {
    // `commands::feedback` reads this through `option_env!`, which is resolved
    // at compile time. Without this directive Cargo has no reason to rebuild
    // when the value changes, so a release could quietly ship a stale token —
    // or none at all, silently disabling feedback.
    println!("cargo:rerun-if-env-changed=MOTE_FEEDBACK_APP_TOKEN");

    tauri_build::build()
}
