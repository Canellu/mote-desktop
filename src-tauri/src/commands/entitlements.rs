use std::time::Duration;

use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::commands::store_commerce::{
    purchase_mote_pro, read_pro_offer, read_store_entitlements, ProOffer, PurchaseOutcome,
};
use crate::services::entitlements::{
    AuthorizationError, Capability, EntitlementRuntime, EntitlementSnapshot, EntitlementStatus,
};
use crate::services::trial;

/// Tells every window that what this installation may do has changed.
const ENTITLEMENTS_CHANGED_EVENT: &str = "entitlements-changed";

/// What the customer currently owns, and their trial, in provider-neutral terms.
///
/// The frontend never learns which commerce backend answered, only the
/// normalized states, so a later Store adapter can replace the provider without
/// touching a single React component.
///
/// A missing runtime reports `unavailable` rather than erroring: the interface
/// should degrade to the Free presentation, not to a crash.
#[tauri::command(rename = "get-entitlements")]
pub fn get_entitlements(app: AppHandle) -> EntitlementStatus {
    app.try_state::<EntitlementRuntime>()
        .map(|runtime| runtime.status())
        .unwrap_or_else(EntitlementStatus::unavailable)
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
) -> Result<EntitlementStatus, String> {
    #[cfg(debug_assertions)]
    {
        let runtime = app
            .try_state::<EntitlementRuntime>()
            .ok_or_else(|| "entitlement runtime is not managed".to_string())?;

        runtime.set_debug_snapshot(snapshot);
        let status = runtime.status();
        entitlements_changed(&app);
        Ok(status)
    }

    #[cfg(not(debug_assertions))]
    {
        let _ = (app, snapshot);
        Err("entitlement overrides are unavailable in a release build".to_string())
    }
}

/// A point in the trial the development override can jump to.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DebugTrial {
    None,
    Active,
    Ending,
    Ended,
}

/// Puts the running app at a point in the trial, so the countdown, reminders and
/// the ended state can be seen without waiting two weeks.
///
/// Memory only, and a no-op in a release build for the same reason as
/// `set-debug-entitlements`.
#[tauri::command(rename = "set-debug-trial")]
pub fn set_debug_trial(app: AppHandle, state: DebugTrial) -> Result<EntitlementStatus, String> {
    #[cfg(debug_assertions)]
    {
        let runtime = app
            .try_state::<EntitlementRuntime>()
            .ok_or_else(|| "entitlement runtime is not managed".to_string())?;

        let now = trial::now_ms();
        let started_at = match state {
            DebugTrial::None => None,
            DebugTrial::Active => Some(now),
            // Two and a half days to go: inside the three-day reminder.
            DebugTrial::Ending => Some(now - trial::TRIAL_LENGTH_MS + 5 * trial::DAY_MS / 2),
            DebugTrial::Ended => Some(now - trial::TRIAL_LENGTH_MS - trial::DAY_MS),
        };

        runtime.set_trial(started_at.map(trial::TrialRecord::starting_at));
        let status = runtime.status();
        entitlements_changed(&app);
        Ok(status)
    }

    #[cfg(not(debug_assertions))]
    {
        let _ = (app, state);
        Err("trial overrides are unavailable in a release build".to_string())
    }
}

/// Re-reads entitlements from the commerce backend and folds the answer into the
/// cache the synchronous authorization path reads.
///
/// This is also the restore path. Restoring a purchase on a new machine is not a
/// separate transaction — it is this same read, once the customer is signed in
/// to the Microsoft account that owns the add-on.
#[tauri::command(rename = "refresh-entitlements")]
pub async fn refresh_entitlements(app: AppHandle) -> EntitlementStatus {
    let fresh = read_store_entitlements(app.clone()).await;

    let Some(runtime) = app.try_state::<EntitlementRuntime>() else {
        return EntitlementStatus {
            pro: fresh.pro,
            household: fresh.household,
            trial: None,
        };
    };

    let before = runtime.status();
    runtime.apply_store_snapshot(fresh);
    let after = runtime.status();

    if after != before {
        entitlements_changed(&app);
    }
    after
}

/// Loads this installation's trial at launch, and starts one for an installation
/// that already has a bridge but never recorded a trial.
///
/// Runs before the Store has answered, which is the point: the trial is local, so
/// somebody on a trial is never shown Free while the Store is slow or offline.
pub fn initialize_trial(app: &AppHandle) {
    #[cfg(not(debug_assertions))]
    {
        if let Some(runtime) = app.try_state::<EntitlementRuntime>() {
            if let Some(record) = trial::storage::load(app) {
                let record = record.seen_at(trial::now_ms());
                trial::storage::save(app, record);
                runtime.set_trial(Some(record));
            }
        }
    }

    start_trial_if_paired(app);
    apply_widget_limits(app);
}

/// Starts the trial the first time this installation has a saved bridge. A trial
/// that already exists, running or over, is never started again.
pub fn start_trial_if_paired(app: &AppHandle) {
    #[cfg(not(debug_assertions))]
    {
        let Some(runtime) = app.try_state::<EntitlementRuntime>() else {
            return;
        };
        if runtime.trial().is_some() {
            return;
        }

        let paired = crate::commands::bridges::list_hue_bridges(app.clone())
            .is_ok_and(|bridges| !bridges.is_empty());
        if !paired {
            return;
        }

        let record = trial::TrialRecord::starting_at(trial::now_ms());
        trial::storage::save(app, record);
        runtime.set_trial(Some(record));
        entitlements_changed(app);
    }

    #[cfg(debug_assertions)]
    let _ = app;
}

/// Notices the trial ending while Mote is running — it can sit in the tray for
/// days — and records, hourly, that this installation is still in use.
pub fn watch_trial(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut was_active = trial_active(&app);
        let mut minutes: u32 = 0;

        loop {
            tokio::time::sleep(Duration::from_secs(60)).await;

            let active = trial_active(&app);
            if active != was_active {
                was_active = active;
                entitlements_changed(&app);
            }

            minutes = minutes.wrapping_add(1);
            if minutes % 60 == 0 {
                record_seen(&app);
            }
        }
    });
}

fn trial_active(app: &AppHandle) -> bool {
    app.try_state::<EntitlementRuntime>()
        .is_some_and(|runtime| runtime.trial_active())
}

fn record_seen(app: &AppHandle) {
    #[cfg(not(debug_assertions))]
    {
        let Some(runtime) = app.try_state::<EntitlementRuntime>() else {
            return;
        };
        if let Some(record) = runtime.trial() {
            let record = record.seen_at(trial::now_ms());
            trial::storage::save(app, record);
            runtime.set_trial(Some(record));
        }
    }

    #[cfg(debug_assertions)]
    let _ = app;
}

/// Tells every window that what this installation may do has changed, and brings
/// open widgets in line with it.
pub fn entitlements_changed(app: &AppHandle) {
    apply_widget_limits(app);
    let _ = app.emit(ENTITLEMENTS_CHANGED_EVENT, ());
}

fn apply_widget_limits(app: &AppHandle) {
    let lapsed = app
        .try_state::<EntitlementRuntime>()
        .is_some_and(|runtime| runtime.pro_lapsed());
    crate::commands::widget::set_free_limits(app, lapsed);
}

/// Opens Microsoft's purchase UI for Mote Pro, then re-reads entitlements so the
/// app reflects the purchase without a restart.
///
/// The returned outcome describes the dialog. What the customer actually owns
/// comes from the refresh that follows it, never from the dialog's word alone —
/// the Store license is the only thing that grants a capability.
#[tauri::command(rename = "purchase-mote-pro")]
pub async fn purchase_pro(app: AppHandle) -> Result<PurchaseOutcome, String> {
    let outcome = purchase_mote_pro(app.clone()).await?;
    refresh_entitlements(app).await;
    Ok(outcome)
}

/// Refuses unless this installation is entitled to `capability`.
///
/// The refusal carries serialized `AuthorizationError` JSON rather than prose,
/// because the interface has to tell "you do not own this" apart from "we could
/// not check". One offers a purchase and the other offers a retry, and showing
/// a purchase prompt to somebody who already paid is much the worse mistake.
///
/// Commands here return `Result<_, String>`, so the structure travels inside
/// the string rather than changing every signature in the crate.
pub fn require(app: &AppHandle, capability: Capability) -> Result<(), String> {
    let Some(runtime) = app.try_state::<EntitlementRuntime>() else {
        // Unreachable in a built app, and still refuses rather than opening the
        // gate, because a missing runtime is not proof of a purchase.
        return Err(serialize_refusal(AuthorizationError::unavailable(
            capability,
            capability.required_product(),
        )));
    };

    runtime.authorize(capability).map_err(serialize_refusal)
}

fn serialize_refusal(error: AuthorizationError) -> String {
    serde_json::to_string(&error).unwrap_or_else(|_| error.to_string())
}

/// The localized Mote Pro offer for the paywall: title, price, and whether the
/// Store already considers it owned.
#[tauri::command(rename = "get-pro-offer")]
pub async fn get_pro_offer(app: AppHandle) -> ProOffer {
    read_pro_offer(app).await
}
