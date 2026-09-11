use std::fmt;
use std::sync::Arc;

use serde::{Deserialize, Serialize};

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
}

impl Capability {
    pub const ALL: [Self; 4] = [
        Self::MultipleBridges,
        Self::DashboardCustomLayout,
        Self::PcSync,
        Self::AdvancedWidgets,
    ];

    pub const fn required_product(self) -> EntitlementProduct {
        match self {
            Self::MultipleBridges
            | Self::DashboardCustomLayout
            | Self::PcSync
            | Self::AdvancedWidgets => EntitlementProduct::Pro,
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
    fn required(capability: Capability, product: EntitlementProduct) -> Self {
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

    fn unavailable(capability: Capability, product: EntitlementProduct) -> Self {
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

/// What the Tauri app manages: the authorization service, plus — in a debug
/// build only — the handle that can move it between Free and Pro.
///
/// One managed value rather than two so the mutable handle cannot outlive or
/// drift from the service reading it. In a release build the field is not
/// compiled at all, so there is no path to a development entitlement even if a
/// command tried to take one.
pub struct EntitlementRuntime {
    service: EntitlementService,
    #[cfg(debug_assertions)]
    debug: Arc<DebugEntitlementProvider>,
}

impl EntitlementRuntime {
    pub fn snapshot(&self) -> EntitlementSnapshot {
        self.service.snapshot()
    }

    pub fn authorize(&self, capability: Capability) -> Result<(), AuthorizationError> {
        self.service.authorize(capability)
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
                debug,
            }
        }

        #[cfg(not(debug_assertions))]
        {
            // No commerce adapter is wired yet, so release reports Unknown. That
            // is honest rather than permissive: `authorize` refuses on Unknown,
            // which is why callers must not gate shipped features on it until a
            // real adapter can answer. See docs/free-pro-feature-matrix.md.
            Self {
                service: EntitlementService::default(),
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
}
