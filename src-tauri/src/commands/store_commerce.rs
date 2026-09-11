use serde::Serialize;

use crate::services::entitlements::{EntitlementSnapshot, EntitlementState};

const MOTE_PRO_IN_APP_OFFER_TOKEN: &str = "mote-pro";

/// The entitlement half of the diagnostic, without the rest of the report.
///
/// Deliberately the same code path the spike exercised rather than a second
/// reader: a provider that disagreed with the diagnostic would be the hardest
/// possible bug to chase, because the diagnostic is the tool you would reach for
/// to chase it.
pub async fn read_store_entitlements(app: tauri::AppHandle) -> EntitlementSnapshot {
    get_store_commerce_diagnostic_for_platform(app)
        .await
        .entitlements
}

/// What Microsoft's purchase UI reported, flattened to something the interface
/// can act on without learning the Store's vocabulary.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PurchaseOutcome {
    /// The customer now owns Mote Pro, whether they just bought it or already did.
    Owned,
    /// The customer dismissed the purchase without buying. Not an error.
    Declined,
    /// The Store could not complete it. Worth retrying; nothing was charged.
    Unavailable,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreCommerceDiagnostic {
    status: &'static str,
    package: PackageDiagnostic,
    owner_window: StageDiagnostic,
    app_license: AppLicenseDiagnostic,
    entitlements: EntitlementSnapshot,
    durable_products: StageDiagnostic,
    add_on_licenses: Vec<AddOnLicenseDiagnostic>,
    products: Vec<ProductDiagnostic>,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct PackageDiagnostic {
    available: bool,
    name: Option<String>,
    family_name: Option<String>,
    error: Option<ErrorDiagnostic>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StageDiagnostic {
    succeeded: bool,
    error: Option<ErrorDiagnostic>,
}

impl StageDiagnostic {
    fn succeeded() -> Self {
        Self {
            succeeded: true,
            error: None,
        }
    }

    fn failed(error: ErrorDiagnostic) -> Self {
        Self {
            succeeded: false,
            error: Some(error),
        }
    }

    fn blocked(message: impl Into<String>) -> Self {
        Self::failed(ErrorDiagnostic {
            code: None,
            message: message.into(),
        })
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppLicenseDiagnostic {
    succeeded: bool,
    active: Option<bool>,
    trial: Option<bool>,
    sku_store_id: Option<String>,
    error: Option<ErrorDiagnostic>,
}

impl AppLicenseDiagnostic {
    fn failed(error: ErrorDiagnostic) -> Self {
        Self {
            succeeded: false,
            active: None,
            trial: None,
            sku_store_id: None,
            error: Some(error),
        }
    }

    fn blocked(message: impl Into<String>) -> Self {
        Self::failed(ErrorDiagnostic {
            code: None,
            message: message.into(),
        })
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorDiagnostic {
    code: Option<String>,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AddOnLicenseDiagnostic {
    store_id: String,
    in_app_offer_token: String,
    active: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProductDiagnostic {
    store_id: String,
    in_app_offer_token: String,
    title: String,
    formatted_price: String,
    in_user_collection: bool,
}

#[cfg(target_os = "windows")]
impl From<windows::core::Error> for ErrorDiagnostic {
    fn from(error: windows::core::Error) -> Self {
        Self {
            code: Some(format_hresult(error.code())),
            message: error.message(),
        }
    }
}

/// Reads the current Microsoft Store package, app license, and durable add-ons.
///
/// This command is deliberately diagnostic-only. It does not request a
/// purchase, identify the customer, or return transaction data.
#[tauri::command]
pub async fn get_store_commerce_diagnostic(app: tauri::AppHandle) -> StoreCommerceDiagnostic {
    get_store_commerce_diagnostic_for_platform(app).await
}

/// Opens Microsoft's purchase UI for the Mote Pro durable add-on.
///
/// The add-on's Store ID is not hard-coded: it is discovered through the same
/// associated-products query the diagnostic runs, so a re-created add-on cannot
/// leave a stale identifier compiled into the app.
#[cfg(target_os = "windows")]
pub async fn purchase_mote_pro(app: tauri::AppHandle) -> Result<PurchaseOutcome, String> {
    use windows::core::HSTRING;
    use windows::Services::Store::{StoreContext, StorePurchaseStatus};

    let report = get_store_commerce_diagnostic_for_platform(app).await;

    let store_id = report
        .products
        .iter()
        .find(|product| {
            product
                .in_app_offer_token
                .eq_ignore_ascii_case(MOTE_PRO_IN_APP_OFFER_TOKEN)
        })
        .map(|product| product.store_id.clone())
        .ok_or_else(|| {
            "Mote Pro is not offered by this Store account yet. The add-on must be published \
             against a published parent package before it can be bought."
                .to_string()
        })?;

    // GetDefault returns the context the diagnostic already initialised with the
    // main window, which is what the purchase dialog needs to parent itself.
    let context = StoreContext::GetDefault().map_err(|error| error.message())?;

    let result = context
        .RequestPurchaseAsync(&HSTRING::from(store_id))
        .map_err(|error| error.message())?
        .await
        .map_err(|error| error.message())?;

    let status = result.Status().map_err(|error| error.message())?;

    Ok(match status {
        StorePurchaseStatus::Succeeded | StorePurchaseStatus::AlreadyPurchased =>
            PurchaseOutcome::Owned,
        StorePurchaseStatus::NotPurchased => PurchaseOutcome::Declined,
        // NetworkError, ServerError, and anything added later.
        _ => PurchaseOutcome::Unavailable,
    })
}

#[cfg(not(target_os = "windows"))]
pub async fn purchase_mote_pro(_app: tauri::AppHandle) -> Result<PurchaseOutcome, String> {
    Err("Mote Pro is sold through the Microsoft Store, which is Windows-only.".to_string())
}

#[cfg(not(target_os = "windows"))]
async fn get_store_commerce_diagnostic_for_platform(
    _app: tauri::AppHandle,
) -> StoreCommerceDiagnostic {
    let unsupported = "Microsoft Store commerce diagnostics are only available on Windows";
    StoreCommerceDiagnostic {
        status: "unsupported",
        package: PackageDiagnostic {
            error: Some(ErrorDiagnostic {
                code: None,
                message: unsupported.to_owned(),
            }),
            ..PackageDiagnostic::default()
        },
        owner_window: StageDiagnostic::blocked(unsupported),
        app_license: AppLicenseDiagnostic::blocked(unsupported),
        entitlements: EntitlementSnapshot::unavailable(),
        durable_products: StageDiagnostic::blocked(unsupported),
        add_on_licenses: Vec::new(),
        products: Vec::new(),
    }
}

#[cfg(target_os = "windows")]
async fn get_store_commerce_diagnostic_for_platform(
    app: tauri::AppHandle,
) -> StoreCommerceDiagnostic {
    use tauri::Manager;
    use windows::core::{Interface, HSTRING};
    use windows::Services::Store::StoreContext;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Shell::IInitializeWithWindow;
    use windows_collections::IIterable;

    let package = inspect_package();

    let context = match StoreContext::GetDefault() {
        Ok(context) => context,
        Err(error) => {
            return blocked_report(
                package,
                StageDiagnostic::blocked("StoreContext is unavailable"),
                error.into(),
            );
        }
    };

    let owner_window = match app.get_webview_window("main") {
        Some(window) => match window.hwnd() {
            Ok(hwnd) => match context.cast::<IInitializeWithWindow>() {
                Ok(initializer) => {
                    let hwnd = HWND(hwnd.0);
                    match unsafe { initializer.Initialize(hwnd) } {
                        Ok(()) => StageDiagnostic::succeeded(),
                        Err(error) => StageDiagnostic::failed(error.into()),
                    }
                }
                Err(error) => StageDiagnostic::failed(error.into()),
            },
            Err(error) => {
                StageDiagnostic::blocked(format!("The main window handle is unavailable: {error}"))
            }
        },
        None => StageDiagnostic::blocked("The main Tauri window is unavailable"),
    };

    if !owner_window.succeeded {
        return StoreCommerceDiagnostic {
            status: "blocked",
            package,
            owner_window,
            app_license: AppLicenseDiagnostic::blocked(
                "Store queries were skipped because the owner window could not be configured",
            ),
            entitlements: EntitlementSnapshot::unavailable(),
            durable_products: StageDiagnostic::blocked(
                "Store queries were skipped because the owner window could not be configured",
            ),
            add_on_licenses: Vec::new(),
            products: Vec::new(),
        };
    }

    let (app_license, add_on_licenses) = match context.GetAppLicenseAsync() {
        Ok(operation) => match operation.await {
            Ok(license) => {
                let licenses = match license.AddOnLicenses() {
                    Ok(licenses) => licenses,
                    Err(error) => {
                        return StoreCommerceDiagnostic {
                            status: "blocked",
                            package,
                            owner_window,
                            app_license: AppLicenseDiagnostic::failed(error.into()),
                            entitlements: EntitlementSnapshot::unavailable(),
                            durable_products: StageDiagnostic::blocked(
                                "Durable products were not queried after the license read failed",
                            ),
                            add_on_licenses: Vec::new(),
                            products: Vec::new(),
                        };
                    }
                };

                let mut results = Vec::with_capacity(licenses.Size().unwrap_or_default() as usize);
                for entry in &licenses {
                    let result = (|| {
                        let license = entry.Value()?;
                        Ok::<_, windows::core::Error>(AddOnLicenseDiagnostic {
                            store_id: entry.Key()?.to_string_lossy(),
                            in_app_offer_token: license.InAppOfferToken()?.to_string_lossy(),
                            active: license.IsActive()?,
                        })
                    })();
                    match result {
                        Ok(result) => results.push(result),
                        Err(error) => {
                            return StoreCommerceDiagnostic {
                                status: "blocked",
                                package,
                                owner_window,
                                app_license: AppLicenseDiagnostic::failed(error.into()),
                                entitlements: EntitlementSnapshot::unavailable(),
                                durable_products: StageDiagnostic::blocked(
                                    "Durable products were not queried after an add-on license read failed",
                                ),
                                add_on_licenses: Vec::new(),
                                products: Vec::new(),
                            };
                        }
                    }
                }

                let app_license = (|| {
                    Ok::<_, windows::core::Error>(AppLicenseDiagnostic {
                        succeeded: true,
                        active: Some(license.IsActive()?),
                        trial: Some(license.IsTrial()?),
                        sku_store_id: Some(license.SkuStoreId()?.to_string_lossy()),
                        error: None,
                    })
                })();

                match app_license {
                    Ok(app_license) => (app_license, results),
                    Err(error) => (AppLicenseDiagnostic::failed(error.into()), Vec::new()),
                }
            }
            Err(error) => (AppLicenseDiagnostic::failed(error.into()), Vec::new()),
        },
        Err(error) => (AppLicenseDiagnostic::failed(error.into()), Vec::new()),
    };

    // Keep the non-Send WinRT collection out of the async state machine. The
    // returned operation is agile and can safely be awaited by Tauri.
    let durable_operation = {
        let durable_kinds: IIterable<HSTRING> = vec![HSTRING::from("Durable")].into();
        context.GetAssociatedStoreProductsAsync(&durable_kinds)
    };
    let (durable_products, products) = match durable_operation {
        Ok(operation) => match operation.await {
            Ok(result) => match result.ExtendedError() {
                Ok(extended_error) if extended_error.is_err() => (
                    StageDiagnostic::failed(ErrorDiagnostic {
                        code: Some(format_hresult(extended_error)),
                        message: "Store returned an extended product-query error".to_owned(),
                    }),
                    Vec::new(),
                ),
                Ok(_) => match result.Products() {
                    Ok(products) => {
                        let mut diagnostics =
                            Vec::with_capacity(products.Size().unwrap_or_default() as usize);
                        for entry in &products {
                            let product = (|| {
                                let product = entry.Value()?;
                                Ok::<_, windows::core::Error>(ProductDiagnostic {
                                    store_id: product.StoreId()?.to_string_lossy(),
                                    in_app_offer_token: product
                                        .InAppOfferToken()?
                                        .to_string_lossy(),
                                    title: product.Title()?.to_string_lossy(),
                                    formatted_price: product
                                        .Price()?
                                        .FormattedPrice()?
                                        .to_string_lossy(),
                                    in_user_collection: product.IsInUserCollection()?,
                                })
                            })();
                            match product {
                                Ok(product) => diagnostics.push(product),
                                Err(error) => {
                                    return StoreCommerceDiagnostic {
                                        status: "blocked",
                                        package,
                                        owner_window,
                                        app_license,
                                        entitlements: EntitlementSnapshot::unavailable(),
                                        durable_products: StageDiagnostic::failed(error.into()),
                                        add_on_licenses,
                                        products: Vec::new(),
                                    };
                                }
                            }
                        }
                        (StageDiagnostic::succeeded(), diagnostics)
                    }
                    Err(error) => (StageDiagnostic::failed(error.into()), Vec::new()),
                },
                Err(error) => (StageDiagnostic::failed(error.into()), Vec::new()),
            },
            Err(error) => (StageDiagnostic::failed(error.into()), Vec::new()),
        },
        Err(error) => (StageDiagnostic::failed(error.into()), Vec::new()),
    };

    let status = if package.available && app_license.succeeded && durable_products.succeeded {
        "ready"
    } else {
        "blocked"
    };
    let entitlements = map_store_entitlements(&app_license, &add_on_licenses);

    StoreCommerceDiagnostic {
        status,
        package,
        owner_window,
        app_license,
        entitlements,
        durable_products,
        add_on_licenses,
        products,
    }
}

#[cfg(target_os = "windows")]
fn blocked_report(
    package: PackageDiagnostic,
    owner_window: StageDiagnostic,
    error: ErrorDiagnostic,
) -> StoreCommerceDiagnostic {
    StoreCommerceDiagnostic {
        status: "blocked",
        package,
        owner_window,
        app_license: AppLicenseDiagnostic::failed(error),
        entitlements: EntitlementSnapshot::unavailable(),
        durable_products: StageDiagnostic::blocked(
            "Durable products were not queried because StoreContext is unavailable",
        ),
        add_on_licenses: Vec::new(),
        products: Vec::new(),
    }
}

fn map_store_entitlements(
    app_license: &AppLicenseDiagnostic,
    add_on_licenses: &[AddOnLicenseDiagnostic],
) -> EntitlementSnapshot {
    let pro = if !app_license.succeeded || app_license.active.is_none() {
        EntitlementState::Unknown
    } else if app_license.active == Some(false) {
        EntitlementState::Inactive
    } else if add_on_licenses.iter().any(|license| {
        license.active
            && license
                .in_app_offer_token
                .eq_ignore_ascii_case(MOTE_PRO_IN_APP_OFFER_TOKEN)
    }) {
        EntitlementState::Active
    } else {
        EntitlementState::Inactive
    };

    EntitlementSnapshot {
        pro,
        // Household is a future backend subscription and is not inferred from
        // the Windows durable add-on response.
        household: EntitlementState::Unknown,
    }
}

#[cfg(target_os = "windows")]
fn inspect_package() -> PackageDiagnostic {
    use windows::core::Error;
    use windows::ApplicationModel::Package;

    let result = (|| {
        let package = Package::Current()?;
        let id = package.Id()?;
        Ok::<_, Error>((
            id.Name()?.to_string_lossy(),
            id.FamilyName()?.to_string_lossy(),
        ))
    })();

    match result {
        Ok((name, family_name)) => PackageDiagnostic {
            available: true,
            name: Some(name),
            family_name: Some(family_name),
            error: None,
        },
        Err(error) => PackageDiagnostic {
            available: false,
            name: None,
            family_name: None,
            error: Some(error.into()),
        },
    }
}

#[cfg(target_os = "windows")]
fn format_hresult(code: windows::core::HRESULT) -> String {
    format!("0x{:08X}", code.0 as u32)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn app_license(active: Option<bool>, succeeded: bool) -> AppLicenseDiagnostic {
        AppLicenseDiagnostic {
            succeeded,
            active,
            trial: Some(false),
            sku_store_id: None,
            error: None,
        }
    }

    fn add_on(token: &str, active: bool) -> AddOnLicenseDiagnostic {
        AddOnLicenseDiagnostic {
            store_id: "test-store-id".to_owned(),
            in_app_offer_token: token.to_owned(),
            active,
        }
    }

    #[test]
    fn active_mote_pro_license_maps_to_active_pro() {
        let result =
            map_store_entitlements(&app_license(Some(true), true), &[add_on("MOTE-PRO", true)]);

        assert_eq!(result.pro, EntitlementState::Active);
        assert_eq!(result.household, EntitlementState::Unknown);
    }

    #[test]
    fn successful_license_read_without_active_mote_pro_maps_to_inactive() {
        let inactive = map_store_entitlements(
            &app_license(Some(true), true),
            &[add_on("mote-pro", false), add_on("another-product", true)],
        );

        assert_eq!(inactive.pro, EntitlementState::Inactive);
    }

    #[test]
    fn failed_or_ambiguous_license_read_never_grants_pro() {
        assert_eq!(
            map_store_entitlements(&app_license(None, false), &[]).pro,
            EntitlementState::Unknown
        );
        assert_eq!(
            map_store_entitlements(&app_license(None, true), &[add_on("mote-pro", true)]).pro,
            EntitlementState::Unknown
        );
    }

    #[test]
    fn inactive_base_app_license_cannot_grant_pro() {
        let result =
            map_store_entitlements(&app_license(Some(false), true), &[add_on("mote-pro", true)]);

        assert_eq!(result.pro, EntitlementState::Inactive);
    }
}
