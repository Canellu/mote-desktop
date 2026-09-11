use tauri::{AppHandle, Manager};

use crate::services::entitlements::{EntitlementRuntime, EntitlementSnapshot};

/// What the customer currently owns, in provider-neutral terms.
///
/// The frontend never learns which commerce backend answered, only the
/// normalized states, so a later Store adapter can replace the provider without
/// touching a single React component.
///
/// A missing runtime reports `unavailable` rather than erroring: the interface
/// should degrade to the Free presentation, not to a crash.
#[tauri::command(rename = "get-entitlements")]
pub fn get_entitlements(app: AppHandle) -> EntitlementSnapshot {
    app.try_state::<EntitlementRuntime>()
        .map(|runtime| runtime.snapshot())
        .unwrap_or_else(EntitlementSnapshot::unavailable)
}

/// Moves the running app between Free and Pro without a Store purchase, so both
/// paths can be exercised during development.
///
/// The command exists in every build to keep the IPC surface constant, but it
/// can only do anything in a debug one: the mutable provider behind it is
/// `#[cfg(any(test, debug_assertions))]`, so a release binary has nothing to
/// set and says so rather than pretending to succeed.
#[tauri::command(rename = "set-debug-entitlements")]
pub fn set_debug_entitlements(
    app: AppHandle,
    snapshot: EntitlementSnapshot,
) -> Result<EntitlementSnapshot, String> {
    #[cfg(debug_assertions)]
    {
        let runtime = app
            .try_state::<EntitlementRuntime>()
            .ok_or_else(|| "entitlement runtime is not managed".to_string())?;

        runtime.set_debug_snapshot(snapshot);
        Ok(runtime.snapshot())
    }

    #[cfg(not(debug_assertions))]
    {
        let _ = (app, snapshot);
        Err("entitlement overrides are unavailable in a release build".to_string())
    }
}
