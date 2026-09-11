use tauri::{AppHandle, Manager};

use crate::commands::store_commerce::{
    purchase_mote_pro, read_pro_offer, read_store_entitlements, ProOffer, PurchaseOutcome,
};
use crate::services::entitlements::{
    AuthorizationError, Capability, EntitlementRuntime, EntitlementSnapshot,
};

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

/// Re-reads entitlements from the commerce backend and folds the answer into the
/// cache the synchronous authorization path reads.
///
/// This is also the restore path. Restoring a purchase on a new machine is not a
/// separate transaction — it is this same read, once the customer is signed in
/// to the Microsoft account that owns the add-on.
#[tauri::command(rename = "refresh-entitlements")]
pub async fn refresh_entitlements(app: AppHandle) -> EntitlementSnapshot {
    let fresh = read_store_entitlements(app.clone()).await;

    app.try_state::<EntitlementRuntime>()
        .map(|runtime| runtime.apply_store_snapshot(fresh))
        .unwrap_or(fresh)
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
