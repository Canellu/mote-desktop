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

/// What the Store says Mote Pro costs here, in this customer's market.
///
/// The price is never hard-coded. A base price in NOK is one of 240 market
/// conversions, so the only correct figure is the one the Store itself formats
/// for the signed-in account — currency, separators and all.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProOffer {
    /// Localized product title, or None when the Store could not answer.
    title: Option<String>,
    /// Localized, currency-formatted price, e.g. "kr 149,00". None when unknown.
    formatted_price: Option<String>,
    /// Whether the customer already owns it, per the Store's own collection.
    owned: bool,
}

impl ProOffer {
    const fn unknown() -> Self {
        Self {
            title: None,
            formatted_price: None,
            owned: false,
        }
    }
}

/// Reads the localized Mote Pro offer, reusing the diagnostic's product query.
///
/// Returns unknowns rather than an error when the Store cannot answer: a
/// paywall with no price is still a usable paywall, and refusing to render one
/// because a price lookup failed would be worse than showing the value without
/// the number.
pub async fn read_pro_offer(app: tauri::AppHandle) -> ProOffer {
    let report = get_store_commerce_diagnostic_for_platform(app).await;

    report
        .products
        .iter()
        .find(|product| {
            product
                .in_app_offer_token
                .eq_ignore_ascii_case(MOTE_PRO_IN_APP_OFFER_TOKEN)
        })
        .map(|product| ProOffer {
            title: Some(product.title.clone()),
            formatted_price: Some(product.formatted_price.clone()),
            owned: product.in_user_collection,
        })
        .unwrap_or_else(ProOffer::unknown)
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

    let report = get_store_commerce_diagnostic_for_platform(app.clone()).await;

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

    // Initialise the very object RequestPurchaseAsync is called on; see
    // initialize_with_main_window for why that cannot be skipped.
    let context = StoreContext::GetDefault().map_err(|error| error.message())?;
    initialize_with_main_window(&context, &app)?;

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

/// Parents Microsoft's Store UI to the main Mote window.
///
/// A desktop app has to initialise the exact `StoreContext` it calls a UI
/// method on. The association does not carry over to a context obtained again
/// from `GetDefault`, and without one the call fails with
/// ERROR_INVALID_WINDOW_HANDLE (1400) before any dialog opens. 0.2.0 shipped that
/// failure for purchases: the Store event log showed
/// `RequestPurchaseAsync(9P3J5KCBFVQZ)` rejected with "Invalid window handle".
///
/// Synchronous on purpose. The window handle and the COM initializer are not
/// `Send`, so they must not live across an await inside an async command.
#[cfg(target_os = "windows")]
fn initialize_with_main_window(
    context: &windows::Services::Store::StoreContext,
    app: &tauri::AppHandle,
) -> Result<(), String> {
    use tauri::Manager;
    use windows::core::Interface;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Shell::IInitializeWithWindow;

    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "The main window is unavailable.".to_string())?;
    let hwnd = window.hwnd().map_err(|error| error.to_string())?;
    let initializer = context
        .cast::<IInitializeWithWindow>()
        .map_err(|error| error.message())?;
    unsafe { initializer.Initialize(HWND(hwnd.0)) }.map_err(|error| error.message())
}

/// Whether the Microsoft Store has a newer Mote Desktop for this installation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreUpdateStatus {
    /// False when the app was not installed from the Store (a development build,
    /// a sideloaded package). There is nothing to ask, so the interface stays
    /// silent rather than reporting an error nobody can act on.
    supported: bool,
    available: bool,
    /// Set per submission in Partner Center ("Make this update mandatory").
    mandatory: bool,
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
impl StoreUpdateStatus {
    const fn unsupported() -> Self {
        Self {
            supported: false,
            available: false,
            mandatory: false,
        }
    }

    const fn nothing_available() -> Self {
        Self {
            supported: true,
            available: false,
            mandatory: false,
        }
    }
}

/// How a download or install request ended, flattened for the interface.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StoreUpdateOutcome {
    /// The package is downloaded and waits for the install. Mote is still open.
    Downloaded,
    /// Windows installed the update. Mote is normally closed by then, so the
    /// interface rarely gets to see this.
    Installed,
    /// Nothing newer was waiting by the time the request was made.
    UpToDate,
    /// The customer dismissed Microsoft's dialog.
    Canceled,
    /// Download or deployment failed: battery, Wi-Fi policy, or anything else.
    Failed,
}

/// Asks the Store whether a newer package is published. Needs no window.
#[tauri::command(rename = "check-store-update")]
pub async fn check_store_update() -> StoreUpdateStatus {
    check_store_update_for_platform().await
}

/// Downloads the newer package without installing it, so Mote stays open and
/// usable while it arrives.
#[tauri::command(rename = "download-store-update")]
pub async fn download_store_update(app: tauri::AppHandle) -> Result<StoreUpdateOutcome, String> {
    download_store_update_for_platform(app).await
}

/// Installs the downloaded package. Windows closes Mote to do it and reopens it.
#[tauri::command(rename = "install-store-update")]
pub async fn install_store_update(app: tauri::AppHandle) -> Result<StoreUpdateOutcome, String> {
    install_store_update_for_platform(app).await
}

#[cfg(target_os = "windows")]
async fn check_store_update_for_platform() -> StoreUpdateStatus {
    use windows::Services::Store::StoreContext;

    if !inspect_package().available {
        return StoreUpdateStatus::unsupported();
    }

    // A failed check reads as "nothing available": a missing prompt is harmless,
    // and a prompt for an update that is not there is not.
    let Ok(context) = StoreContext::GetDefault() else {
        return StoreUpdateStatus::nothing_available();
    };
    let Ok(operation) = context.GetAppAndOptionalStorePackageUpdatesAsync() else {
        return StoreUpdateStatus::nothing_available();
    };
    let Ok(updates) = operation.await else {
        return StoreUpdateStatus::nothing_available();
    };

    let available = updates.Size().unwrap_or(0) > 0;
    let mandatory = (&updates)
        .into_iter()
        .any(|update| update.Mandatory().unwrap_or(false));

    StoreUpdateStatus {
        supported: true,
        available,
        mandatory,
    }
}

/// Which half of an update a Store call performs.
#[cfg(target_os = "windows")]
#[derive(Clone, Copy, PartialEq, Eq)]
enum UpdateStep {
    Download,
    /// Downloads whatever is still missing first, which after `Download` is nothing.
    Install,
}

#[cfg(target_os = "windows")]
fn require_store_install() -> Result<(), String> {
    if inspect_package().available {
        Ok(())
    } else {
        Err(
            "Updates come from the Microsoft Store, and this copy was not installed from it."
                .to_string(),
        )
    }
}

#[cfg(target_os = "windows")]
async fn download_store_update_for_platform(
    app: tauri::AppHandle,
) -> Result<StoreUpdateOutcome, String> {
    use windows::Services::Store::{StoreContext, StorePackageUpdateState};

    require_store_install()?;
    let context = StoreContext::GetDefault().map_err(|error| error.message())?;
    initialize_with_main_window(&context, &app)?;

    Ok(
        match run_store_update(&context, &app, UpdateStep::Download).await? {
            None => StoreUpdateOutcome::UpToDate,
            Some(StorePackageUpdateState::Completed) => StoreUpdateOutcome::Downloaded,
            Some(StorePackageUpdateState::Canceled) => StoreUpdateOutcome::Canceled,
            Some(_) => StoreUpdateOutcome::Failed,
        },
    )
}

#[cfg(target_os = "windows")]
async fn install_store_update_for_platform(
    app: tauri::AppHandle,
) -> Result<StoreUpdateOutcome, String> {
    use windows::Services::Store::{StoreContext, StorePackageUpdateState};

    require_store_install()?;
    let context = StoreContext::GetDefault().map_err(|error| error.message())?;
    initialize_with_main_window(&context, &app)?;

    Ok(
        match run_store_update(&context, &app, UpdateStep::Install).await? {
            None => StoreUpdateOutcome::UpToDate,
            Some(StorePackageUpdateState::Completed) => StoreUpdateOutcome::Installed,
            Some(StorePackageUpdateState::Canceled) => StoreUpdateOutcome::Canceled,
            Some(_) => StoreUpdateOutcome::Failed,
        },
    )
}

/// Runs one step, silently when the Store allows it. None means nothing newer
/// is waiting.
///
/// A silent call skips Microsoft's dialog, but only works while "Update apps
/// automatically" is on and the network is not metered. When it ends any way
/// other than finished or cancelled, the step runs again with the dialog, which
/// can tell the customer what stood in the way.
#[cfg(target_os = "windows")]
async fn run_store_update(
    context: &windows::Services::Store::StoreContext,
    app: &tauri::AppHandle,
    step: UpdateStep,
) -> Result<Option<windows::Services::Store::StorePackageUpdateState>, String> {
    use windows::Services::Store::StorePackageUpdateState;

    let silent = context
        .CanSilentlyDownloadStorePackageUpdates()
        .unwrap_or(false);
    let state = run_store_update_once(context, app, step, silent).await?;

    if silent
        && !matches!(
            state,
            None | Some(StorePackageUpdateState::Completed | StorePackageUpdateState::Canceled)
        )
    {
        return run_store_update_once(context, app, step, false).await;
    }
    Ok(state)
}

#[cfg(target_os = "windows")]
async fn run_store_update_once(
    context: &windows::Services::Store::StoreContext,
    app: &tauri::AppHandle,
    step: UpdateStep,
    silent: bool,
) -> Result<Option<windows::Services::Store::StorePackageUpdateState>, String> {
    use tauri::Emitter;
    use windows::core::Interface;
    use windows::Services::Store::{
        StorePackageUpdate, StorePackageUpdateState, StorePackageUpdateStatus,
    };
    use windows_collections::IIterable;
    use windows_future::AsyncOperationProgressHandler;

    /// Read by `STORE_UPDATE_PROGRESS_EVENT` in `src/features/updates/api.ts`.
    #[derive(Clone, Serialize)]
    struct StoreUpdateProgress {
        percent: u8,
    }

    let updates = context
        .GetAppAndOptionalStorePackageUpdatesAsync()
        .map_err(|error| error.message())?
        .await
        .map_err(|error| error.message())?;

    // Everything that touches the update list happens in this block, so the list
    // is dropped before the operation is awaited below.
    let operation = {
        let updates = updates;
        if updates.Size().map_err(|error| error.message())? == 0 {
            return Ok(None);
        }
        if step == UpdateStep::Install {
            prepare_for_update_install(app);
        }

        let iterable = updates
            .cast::<IIterable<StorePackageUpdate>>()
            .map_err(|error| error.message())?;
        let operation = match (step, silent) {
            (UpdateStep::Download, true) => {
                context.TrySilentDownloadStorePackageUpdatesAsync(&iterable)
            }
            (UpdateStep::Download, false) => {
                context.RequestDownloadStorePackageUpdatesAsync(&iterable)
            }
            (UpdateStep::Install, true) => {
                context.TrySilentDownloadAndInstallStorePackageUpdatesAsync(&iterable)
            }
            (UpdateStep::Install, false) => {
                context.RequestDownloadAndInstallStorePackageUpdatesAsync(&iterable)
            }
        }
        .map_err(|error| error.message())?;

        // Only the download is shown. The install closes Mote within seconds, and
        // Microsoft's dialog, when there is one, reports as Pending and is skipped.
        if step == UpdateStep::Download {
            let progress_app = app.clone();
            operation
                .SetProgress(&AsyncOperationProgressHandler::new(move |_, progress| {
                    let status: &StorePackageUpdateStatus = &progress;
                    if status.PackageUpdateState != StorePackageUpdateState::Downloading {
                        return Ok(());
                    }
                    // Bytes when the Store knows the size. Otherwise its progress
                    // value, which a download fills from 0 to 0.8, leaving the
                    // rest for an install.
                    let share = if status.PackageDownloadSizeInBytes > 0 {
                        status.PackageBytesDownloaded as f64
                            / status.PackageDownloadSizeInBytes as f64
                    } else {
                        status.PackageDownloadProgress / 0.8
                    };
                    let percent = (share * 100.0).round().clamp(0.0, 100.0) as u8;
                    let _ = progress_app
                        .emit("store-update-progress", StoreUpdateProgress { percent });
                    Ok(())
                }))
                .map_err(|error| error.message())?;
        }
        operation
    };

    let result = operation.await.map_err(|error| error.message())?;
    result
        .OverallState()
        .map(Some)
        .map_err(|error| error.message())
}

/// Installing closes Mote, so this runs just before the install is requested.
#[cfg(target_os = "windows")]
fn prepare_for_update_install(app: &tauri::AppHandle) {
    use tauri::Manager;
    use windows::core::PCWSTR;
    use windows::Win32::System::Recovery::{
        RegisterApplicationRestart, REGISTER_APPLICATION_RESTART_FLAGS, RESTART_NO_CRASH,
        RESTART_NO_HANG, RESTART_NO_REBOOT,
    };

    // Stop a live PC Sync stream first so the lights are restored, rather than
    // left frozen on the last frame it sent.
    if let Some(engine) = app.try_state::<crate::services::entertainment::engine::HostSyncEngine>()
    {
        engine.stop(app);
    }

    // A packaged desktop app is not relaunched after a Store update unless it
    // registered for restart before Windows shut it down. The flags limit the
    // registration to update restarts, so a crash or hang still just closes.
    // The relaunch carries no arguments, so it opens the window even when this
    // instance started hidden through `--autostart`.
    let flags = REGISTER_APPLICATION_RESTART_FLAGS(
        RESTART_NO_CRASH.0 | RESTART_NO_HANG.0 | RESTART_NO_REBOOT.0,
    );
    // Safety: a null command line is documented as valid and has no lifetime.
    if let Err(error) = unsafe { RegisterApplicationRestart(PCWSTR::null(), flags) } {
        eprintln!("could not register Mote to restart after the update: {error}");
    }
}

#[cfg(not(target_os = "windows"))]
async fn check_store_update_for_platform() -> StoreUpdateStatus {
    StoreUpdateStatus::unsupported()
}

#[cfg(not(target_os = "windows"))]
async fn download_store_update_for_platform(
    _app: tauri::AppHandle,
) -> Result<StoreUpdateOutcome, String> {
    Err("Store updates are Windows-only.".to_string())
}

#[cfg(not(target_os = "windows"))]
async fn install_store_update_for_platform(
    _app: tauri::AppHandle,
) -> Result<StoreUpdateOutcome, String> {
    Err("Store updates are Windows-only.".to_string())
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

    #[test]
    fn store_update_types_serialize_in_the_shape_the_interface_reads() {
        let status = StoreUpdateStatus {
            supported: true,
            available: true,
            mandatory: false,
        };
        assert_eq!(
            serde_json::to_value(status).unwrap(),
            serde_json::json!({ "supported": true, "available": true, "mandatory": false })
        );
        assert_eq!(
            serde_json::to_value(StoreUpdateOutcome::UpToDate).unwrap(),
            serde_json::json!("up_to_date")
        );
        assert_eq!(
            serde_json::to_value(StoreUpdateOutcome::Downloaded).unwrap(),
            serde_json::json!("downloaded")
        );
    }

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
