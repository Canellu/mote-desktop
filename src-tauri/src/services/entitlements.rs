use std::fmt;
use std::sync::{Arc, RwLock};

use serde::{Deserialize, Serialize};

use crate::services::trial::{now_ms, TrialRecord, TrialStatus};

/// Paid product capabilities. Feature code depends on these stable names, not
/// on Store product IDs or provider-specific license types.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Capability {
    MultipleBridges,
    DashboardCustomLayout,
    PcSync,
    /// Named for what it gates rather than for the feature as a whole: creating
    /// widgets is free, and only composition beyond one single-target control
    /// per widget is paid. `Widgets` read as though the feature itself were
    /// paid, which is what the website ended up publishing.
    AdvancedWidgets,
    /// System-wide hotkeys that drive lights from anywhere in Windows.
    GlobalShortcuts,
    /// Lights that react to this PC: the on-air light during calls, and the
    /// away automation when the PC locks or sleeps. Setting one up is free;
    /// starting it is gated.
    LocalAutomation,
}

impl Capability {
    pub const ALL: [Self; 6] = [
        Self::MultipleBridges,
        Self::DashboardCustomLayout,
        Self::PcSync,
        Self::AdvancedWidgets,
        Self::GlobalShortcuts,
        Self::LocalAutomation,
    ];

    pub const fn required_product(self) -> EntitlementProduct {
        match self {
            Self::MultipleBridges
            | Self::DashboardCustomLayout
            | Self::PcSync
            | Self::AdvancedWidgets
            | Self::GlobalShortcuts
            | Self::LocalAutomation => EntitlementProduct::Pro,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EntitlementProduct {
    Pro,
    Household,
}

/// Normalized state exposed by every commerce adapter.
///
/// A provider's valid cached/grace result maps to `Active`. Transient failures
/// map to `Unknown`, never to `Inactive`, so they cannot erase configuration or
/// masquerade as an authoritative downgrade.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EntitlementState {
    Active,
    Inactive,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntitlementSnapshot {
    pub pro: EntitlementState,
    pub household: EntitlementState,
}

impl EntitlementSnapshot {
    pub const fn unavailable() -> Self {
        Self {
            pro: EntitlementState::Unknown,
            household: EntitlementState::Unknown,
        }
    }

    pub const fn state_for(self, product: EntitlementProduct) -> EntitlementState {
        match product {
            EntitlementProduct::Pro => self.pro,
            EntitlementProduct::Household => self.household,
        }
    }
}

impl Default for EntitlementSnapshot {
    fn default() -> Self {
        Self::unavailable()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthorizationErrorCode {
    ProRequired,
    HouseholdRequired,
    EntitlementUnavailable,
}

/// Structured authorization failure suitable for returning through Tauri IPC.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthorizationError {
    pub code: AuthorizationErrorCode,
    pub capability: Capability,
    pub required_product: EntitlementProduct,
}

impl AuthorizationError {
    pub(crate) fn required(capability: Capability, product: EntitlementProduct) -> Self {
        let code = match product {
            EntitlementProduct::Pro => AuthorizationErrorCode::ProRequired,
            EntitlementProduct::Household => AuthorizationErrorCode::HouseholdRequired,
        };

        Self {
            code,
            capability,
            required_product: product,
        }
    }

    pub(crate) fn unavailable(capability: Capability, product: EntitlementProduct) -> Self {
        Self {
            code: AuthorizationErrorCode::EntitlementUnavailable,
            capability,
            required_product: product,
        }
    }
}

impl fmt::Display for AuthorizationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "authorization failed for {:?}: {:?}",
            self.capability, self.code
        )
    }
}

impl std::error::Error for AuthorizationError {}

/// Commerce adapters own refresh and persistence. The authorization service
/// only consumes their normalized cached snapshot.
pub trait EntitlementProvider: Send + Sync {
    fn snapshot(&self) -> EntitlementSnapshot;
}

#[derive(Debug, Default)]
pub struct UnavailableEntitlementProvider;

impl EntitlementProvider for UnavailableEntitlementProvider {
    fn snapshot(&self) -> EntitlementSnapshot {
        EntitlementSnapshot::unavailable()
    }
}

pub struct EntitlementService {
    provider: Arc<dyn EntitlementProvider>,
}

impl EntitlementService {
    pub fn new(provider: Arc<dyn EntitlementProvider>) -> Self {
        Self { provider }
    }

    pub fn snapshot(&self) -> EntitlementSnapshot {
        self.provider.snapshot()
    }

    pub fn authorize(&self, capability: Capability) -> Result<(), AuthorizationError> {
        let required_product = capability.required_product();

        match self.snapshot().state_for(required_product) {
            EntitlementState::Active => Ok(()),
            EntitlementState::Inactive => {
                Err(AuthorizationError::required(capability, required_product))
            }
            EntitlementState::Unknown => Err(AuthorizationError::unavailable(
                capability,
                required_product,
            )),
        }
    }
}

impl Default for EntitlementService {
    fn default() -> Self {
        Self::new(Arc::new(UnavailableEntitlementProvider))
    }
}

/// Mutable provider for local development and tests. It is omitted from release
/// builds so a production binary cannot enable a development entitlement.
#[cfg(any(test, debug_assertions))]
pub struct DebugEntitlementProvider {
    snapshot: std::sync::RwLock<EntitlementSnapshot>,
}

#[cfg(any(test, debug_assertions))]
impl DebugEntitlementProvider {
    pub fn new(snapshot: EntitlementSnapshot) -> Self {
        Self {
            snapshot: std::sync::RwLock::new(snapshot),
        }
    }

    pub fn set_snapshot(&self, snapshot: EntitlementSnapshot) {
        *self
            .snapshot
            .write()
            .expect("debug entitlement lock poisoned") = snapshot;
    }
}

#[cfg(any(test, debug_assertions))]
impl EntitlementProvider for DebugEntitlementProvider {
    fn snapshot(&self) -> EntitlementSnapshot {
        *self
            .snapshot
            .read()
            .expect("debug entitlement lock poisoned")
    }
}

/// Holds the last answer a commerce backend gave, so the synchronous
/// `EntitlementProvider` contract can be served from an asynchronous Store API.
///
/// The grace rule lives here: an authoritative answer always wins, including a
/// downgrade, because a refund or revocation is a real Inactive. A failure is
/// not an answer, so it must never overwrite a cached Active — otherwise a flat
/// network or a Store hiccup would revoke a purchase the customer made.
#[derive(Default)]
pub struct CachedEntitlementProvider {
    snapshot: std::sync::RwLock<EntitlementSnapshot>,
}

impl CachedEntitlementProvider {
    /// Folds a freshly read snapshot into the cache, one product at a time.
    pub fn apply(&self, fresh: EntitlementSnapshot) -> EntitlementSnapshot {
        let mut cached = self
            .snapshot
            .write()
            .expect("cached entitlement lock poisoned");

        cached.pro = merge_state(cached.pro, fresh.pro);
        cached.household = merge_state(cached.household, fresh.household);
        *cached
    }
}

/// `Unknown` means "could not answer", so it leaves whatever was known in
/// place. Anything else is authoritative and replaces it.
const fn merge_state(cached: EntitlementState, fresh: EntitlementState) -> EntitlementState {
    match fresh {
        EntitlementState::Unknown => cached,
        answer => answer,
    }
}

impl EntitlementProvider for CachedEntitlementProvider {
    fn snapshot(&self) -> EntitlementSnapshot {
        *self
            .snapshot
            .read()
            .expect("cached entitlement lock poisoned")
    }
}

/// Everything the interface is told: what the Store says was bought, plus this
/// installation's trial once one has started.
///
/// `pro` stays the purchase alone, so the interface can tell a trial from a
/// purchase. Pro is usable when `pro` is active or the trial is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntitlementStatus {
    pub pro: EntitlementState,
    pub household: EntitlementState,
    pub trial: Option<TrialStatus>,
}

impl EntitlementStatus {
    pub const fn unavailable() -> Self {
        Self {
            pro: EntitlementState::Unknown,
            household: EntitlementState::Unknown,
            trial: None,
        }
    }
}

/// What the Tauri app manages: the authorization service, this installation's
/// trial, and — in a debug build only — the handle that can move it between Free
/// and Pro.
///
/// One managed value rather than several so the mutable handle cannot outlive or
/// drift from the service reading it. In a release build the field is not
/// compiled at all, so there is no path to a development entitlement even if a
/// command tried to take one.
pub struct EntitlementRuntime {
    service: EntitlementService,
    trial: RwLock<Option<TrialRecord>>,
    #[cfg(debug_assertions)]
    debug: Arc<DebugEntitlementProvider>,
    #[cfg(not(debug_assertions))]
    cache: Arc<CachedEntitlementProvider>,
}

impl EntitlementRuntime {
    pub fn snapshot(&self) -> EntitlementSnapshot {
        self.service.snapshot()
    }

    pub fn status(&self) -> EntitlementStatus {
        self.status_at(now_ms())
    }

    fn status_at(&self, now: i64) -> EntitlementStatus {
        let snapshot = self.snapshot();

        EntitlementStatus {
            pro: snapshot.pro,
            household: snapshot.household,
            trial: self.trial().map(|record| TrialStatus::of(record, now)),
        }
    }

    pub fn authorize(&self, capability: Capability) -> Result<(), AuthorizationError> {
        self.authorize_at(capability, now_ms())
    }

    /// A running trial stands in for a Pro purchase, and only for Pro. Once the
    /// trial is over the Store's own answer applies again, including "could not
    /// check", so an ended trial never reads as a refusal to somebody who paid.
    fn authorize_at(&self, capability: Capability, now: i64) -> Result<(), AuthorizationError> {
        match self.service.authorize(capability) {
            Err(_)
                if capability.required_product() == EntitlementProduct::Pro
                    && self.trial_active_at(now) =>
            {
                Ok(())
            }
            answer => answer,
        }
    }

    pub fn trial(&self) -> Option<TrialRecord> {
        *self.trial.read().expect("trial lock poisoned")
    }

    pub fn set_trial(&self, record: Option<TrialRecord>) {
        *self.trial.write().expect("trial lock poisoned") = record;
    }

    pub fn trial_active(&self) -> bool {
        self.trial_active_at(now_ms())
    }

    fn trial_active_at(&self, now: i64) -> bool {
        self.trial().is_some_and(|record| record.is_active(now))
    }

    /// Whether Pro has gone for certain: the Store says it is not owned and no
    /// trial is running. `Unknown` is not a lapse, so an unreachable Store never
    /// strips a paying customer's setup back to Free.
    pub fn pro_lapsed(&self) -> bool {
        self.pro_lapsed_at(now_ms())
    }

    fn pro_lapsed_at(&self, now: i64) -> bool {
        self.snapshot().pro == EntitlementState::Inactive && !self.trial_active_at(now)
    }

    /// Folds a snapshot read from the commerce backend into the cache.
    ///
    /// A debug build ignores it on purpose: the developer override is the whole
    /// point of that build, and a background Store refresh silently undoing a
    /// deliberate toggle would make the switch untrustworthy.
    pub fn apply_store_snapshot(&self, fresh: EntitlementSnapshot) -> EntitlementSnapshot {
        #[cfg(debug_assertions)]
        {
            let _ = fresh;
            self.snapshot()
        }

        #[cfg(not(debug_assertions))]
        {
            self.cache.apply(fresh)
        }
    }

    #[cfg(debug_assertions)]
    pub fn set_debug_snapshot(&self, snapshot: EntitlementSnapshot) {
        self.debug.set_snapshot(snapshot);
    }
}

impl Default for EntitlementRuntime {
    fn default() -> Self {
        #[cfg(debug_assertions)]
        {
            // Development opens on the Free tier deliberately. The unpaid path
            // is the one that ships to everyone, so it should be the one a
            // developer sees without asking for it.
            let debug = Arc::new(DebugEntitlementProvider::new(EntitlementSnapshot {
                pro: EntitlementState::Inactive,
                household: EntitlementState::Inactive,
            }));

            Self {
                service: EntitlementService::new(debug.clone()),
                trial: RwLock::new(None),
                debug,
            }
        }

        #[cfg(not(debug_assertions))]
        {
            // Starts Unknown and stays there until a Store read lands, because
            // the Store API is asynchronous and this contract is not. Unknown
            // refuses, so nothing is granted by a refresh that never arrived.
            // The trial is loaded from disk at launch, before that read.
            let cache = Arc::new(CachedEntitlementProvider::default());

            Self {
                service: EntitlementService::new(cache.clone()),
                trial: RwLock::new(None),
                cache,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn service_with(pro: EntitlementState) -> EntitlementService {
        EntitlementService::new(Arc::new(DebugEntitlementProvider::new(
            EntitlementSnapshot {
                pro,
                household: EntitlementState::Inactive,
            },
        )))
    }

    #[test]
    fn every_launch_capability_requires_pro() {
        for capability in Capability::ALL {
            assert_eq!(capability.required_product(), EntitlementProduct::Pro);
        }
    }

    #[test]
    fn active_pro_authorizes_every_launch_capability() {
        let service = service_with(EntitlementState::Active);

        for capability in Capability::ALL {
            assert_eq!(service.authorize(capability), Ok(()));
        }
    }

    #[test]
    fn inactive_pro_returns_a_structured_pro_required_error() {
        let error = service_with(EntitlementState::Inactive)
            .authorize(Capability::PcSync)
            .unwrap_err();

        assert_eq!(error.code, AuthorizationErrorCode::ProRequired);
        assert_eq!(error.capability, Capability::PcSync);
        assert_eq!(error.required_product, EntitlementProduct::Pro);
    }

    #[test]
    fn unknown_pro_returns_entitlement_unavailable() {
        let error = service_with(EntitlementState::Unknown)
            .authorize(Capability::AdvancedWidgets)
            .unwrap_err();

        assert_eq!(error.code, AuthorizationErrorCode::EntitlementUnavailable);
        assert_eq!(error.capability, Capability::AdvancedWidgets);
        assert_eq!(error.required_product, EntitlementProduct::Pro);
    }

    #[test]
    fn default_service_never_grants_paid_capabilities() {
        let error = EntitlementService::default()
            .authorize(Capability::DashboardCustomLayout)
            .unwrap_err();

        assert_eq!(error.code, AuthorizationErrorCode::EntitlementUnavailable);
    }

    #[test]
    fn debug_provider_can_model_upgrade_and_downgrade_without_persisting_state() {
        let provider = Arc::new(DebugEntitlementProvider::new(EntitlementSnapshot {
            pro: EntitlementState::Inactive,
            household: EntitlementState::Inactive,
        }));
        let service = EntitlementService::new(provider.clone());

        assert_eq!(
            service.authorize(Capability::MultipleBridges),
            Err(AuthorizationError::required(
                Capability::MultipleBridges,
                EntitlementProduct::Pro,
            ))
        );

        provider.set_snapshot(EntitlementSnapshot {
            pro: EntitlementState::Active,
            household: EntitlementState::Inactive,
        });
        assert_eq!(service.authorize(Capability::MultipleBridges), Ok(()));

        provider.set_snapshot(EntitlementSnapshot {
            pro: EntitlementState::Inactive,
            household: EntitlementState::Inactive,
        });
        assert_eq!(
            service
                .authorize(Capability::MultipleBridges)
                .unwrap_err()
                .code,
            AuthorizationErrorCode::ProRequired
        );
    }

    #[test]
    fn ipc_shapes_use_stable_provider_neutral_names() {
        let snapshot = serde_json::to_value(EntitlementSnapshot {
            pro: EntitlementState::Active,
            household: EntitlementState::Unknown,
        })
        .unwrap();
        assert_eq!(
            snapshot,
            serde_json::json!({ "pro": "active", "household": "unknown" })
        );

        let error = serde_json::to_value(AuthorizationError::required(
            Capability::DashboardCustomLayout,
            EntitlementProduct::Pro,
        ))
        .unwrap();
        assert_eq!(
            error,
            serde_json::json!({
                "code": "pro_required",
                "capability": "dashboard_custom_layout",
                "requiredProduct": "pro"
            })
        );
    }

    #[test]
    fn capability_name_survives_the_rename_for_ipc_callers() {
        assert_eq!(
            serde_json::to_value(Capability::AdvancedWidgets).unwrap(),
            serde_json::json!("advanced_widgets")
        );
    }

    #[test]
    fn a_failed_read_never_revokes_a_cached_purchase() {
        let cache = CachedEntitlementProvider::default();

        cache.apply(EntitlementSnapshot {
            pro: EntitlementState::Active,
            household: EntitlementState::Inactive,
        });

        // Offline, or the Store simply not answering.
        let after = cache.apply(EntitlementSnapshot::unavailable());

        assert_eq!(after.pro, EntitlementState::Active);
        assert_eq!(after.household, EntitlementState::Inactive);
    }

    #[test]
    fn an_authoritative_downgrade_is_honoured() {
        let cache = CachedEntitlementProvider::default();

        cache.apply(EntitlementSnapshot {
            pro: EntitlementState::Active,
            household: EntitlementState::Unknown,
        });

        // A refund or revocation is a real answer and must land.
        let after = cache.apply(EntitlementSnapshot {
            pro: EntitlementState::Inactive,
            household: EntitlementState::Unknown,
        });

        assert_eq!(after.pro, EntitlementState::Inactive);
    }

    #[test]
    fn global_shortcuts_are_a_paid_capability() {
        // Shortcuts shipped before they had a tier. Pin the decision so it is not
        // quietly re-litigated by a later edit to the enum.
        assert_eq!(
            Capability::GlobalShortcuts.required_product(),
            EntitlementProduct::Pro
        );
        assert_eq!(
            serde_json::to_value(Capability::GlobalShortcuts).unwrap(),
            serde_json::json!("global_shortcuts")
        );
        assert!(Capability::ALL.contains(&Capability::GlobalShortcuts));
    }

    #[test]
    fn automations_are_a_paid_capability() {
        assert_eq!(
            Capability::LocalAutomation.required_product(),
            EntitlementProduct::Pro
        );
        assert_eq!(
            serde_json::to_value(Capability::LocalAutomation).unwrap(),
            serde_json::json!("local_automation")
        );
        assert!(Capability::ALL.contains(&Capability::LocalAutomation));
    }

    #[test]
    fn an_empty_cache_grants_nothing() {
        assert_eq!(
            CachedEntitlementProvider::default().snapshot(),
            EntitlementSnapshot::unavailable()
        );
    }

    #[test]
    fn debug_runtime_opens_on_the_free_tier() {
        // Development must not start entitled. A developer who never touches the
        // override should be looking at what ships to everyone.
        let runtime = EntitlementRuntime::default();

        assert_eq!(runtime.snapshot().pro, EntitlementState::Inactive);
        assert_eq!(
            runtime.authorize(Capability::PcSync).unwrap_err().code,
            AuthorizationErrorCode::ProRequired
        );
    }

    #[test]
    fn debug_runtime_override_grants_and_revokes_every_capability() {
        let runtime = EntitlementRuntime::default();

        runtime.set_debug_snapshot(EntitlementSnapshot {
            pro: EntitlementState::Active,
            household: EntitlementState::Inactive,
        });
        for capability in Capability::ALL {
            assert_eq!(runtime.authorize(capability), Ok(()));
        }

        runtime.set_debug_snapshot(EntitlementSnapshot {
            pro: EntitlementState::Inactive,
            household: EntitlementState::Inactive,
        });
        for capability in Capability::ALL {
            assert!(runtime.authorize(capability).is_err());
        }
    }

    const NOW: i64 = 1_789_000_000_000;

    fn runtime_with(pro: EntitlementState, trial_started: Option<i64>) -> EntitlementRuntime {
        let runtime = EntitlementRuntime::default();
        runtime.set_debug_snapshot(EntitlementSnapshot {
            pro,
            household: EntitlementState::Inactive,
        });
        runtime.set_trial(trial_started.map(TrialRecord::starting_at));
        runtime
    }

    fn ended_trial_start() -> i64 {
        NOW - crate::services::trial::TRIAL_LENGTH_MS
    }

    #[test]
    fn a_running_trial_authorizes_every_pro_capability() {
        let runtime = runtime_with(EntitlementState::Inactive, Some(NOW));

        for capability in Capability::ALL {
            assert_eq!(runtime.authorize_at(capability, NOW), Ok(()));
        }
        assert!(!runtime.pro_lapsed_at(NOW));
    }

    #[test]
    fn an_ended_trial_refuses_again() {
        let runtime = runtime_with(EntitlementState::Inactive, Some(ended_trial_start()));

        assert_eq!(
            runtime
                .authorize_at(Capability::PcSync, NOW)
                .unwrap_err()
                .code,
            AuthorizationErrorCode::ProRequired
        );
        assert!(runtime.pro_lapsed_at(NOW));
    }

    #[test]
    fn an_ended_trial_leaves_an_unanswered_store_unanswered() {
        let runtime = runtime_with(EntitlementState::Unknown, Some(ended_trial_start()));

        // "Could not check" must never become "you do not own this".
        assert_eq!(
            runtime
                .authorize_at(Capability::PcSync, NOW)
                .unwrap_err()
                .code,
            AuthorizationErrorCode::EntitlementUnavailable
        );
        assert!(!runtime.pro_lapsed_at(NOW));
    }

    #[test]
    fn free_without_a_trial_has_lapsed() {
        assert!(runtime_with(EntitlementState::Inactive, None).pro_lapsed_at(NOW));
    }

    #[test]
    fn a_purchase_outlasts_the_trial() {
        let runtime = runtime_with(EntitlementState::Active, Some(ended_trial_start()));

        assert_eq!(
            runtime.authorize_at(Capability::GlobalShortcuts, NOW),
            Ok(())
        );
        assert!(!runtime.pro_lapsed_at(NOW));
    }

    #[test]
    fn status_reports_the_purchase_and_the_trial_separately() {
        let runtime = runtime_with(EntitlementState::Inactive, Some(NOW));

        assert_eq!(
            serde_json::to_value(runtime.status_at(NOW)).unwrap(),
            serde_json::json!({
                "pro": "inactive",
                "household": "inactive",
                "trial": {
                    "startedAt": NOW,
                    "endsAt": NOW + crate::services::trial::TRIAL_LENGTH_MS,
                    "active": true
                }
            })
        );
        assert_eq!(
            serde_json::to_value(EntitlementStatus::unavailable()).unwrap(),
            serde_json::json!({ "pro": "unknown", "household": "unknown", "trial": null })
        );
    }
}
