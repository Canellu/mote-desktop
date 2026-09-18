mod commands;
// Public so the hardware spike example (examples/pc_sync_spike.rs) can drive
// the entertainment stack directly without the Tauri shell.
pub mod services;
#[cfg(target_os = "windows")]
mod session_end;
#[cfg(target_os = "windows")]
mod session_events;

use tauri::{
    menu::{Menu, MenuItem},
    Manager,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = commands::app_settings::show_main_window(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            // Let the plugin restore size/position, but not visibility — the
            // setup hook decides whether to show the window so a login launch
            // (`--autostart`) can stay hidden in the tray.
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        & !tauri_plugin_window_state::StateFlags::VISIBLE,
                )
                // Widget windows persist their bounds in widget-settings.json.
                // Letting this plugin track them as well restores a second,
                // stale position after the widget-specific bounds are applied.
                .with_filter(|label| label == "main")
                .build(),
        )
        .manage(services::entitlements::EntitlementRuntime::default())
        .manage(services::automations::runtime::AutomationRuntime::default())
        .manage(commands::events::EventStreamState::default())
        .manage(commands::home_map::HomeMapStorageState::default())
        .manage(services::entertainment::engine::HostSyncEngine::default())
        .manage(
            services::sync_box_client::SyncBoxClient::new()
                .expect("failed to create Sync Box HTTP client"),
        )
        .invoke_handler(tauri::generate_handler![
            commands::shortcuts::execute_shortcut,
            commands::automations::get_automation_settings,
            commands::automations::set_automation_settings,
            commands::automations::get_automation_status,
            commands::automations::preview_automation,
            commands::app_settings::get_app_settings,
            commands::app_settings::set_close_button_behavior,
            commands::app_settings::set_auto_start,
            commands::app_settings::set_desktop_shortcut,
            commands::app_settings::handle_main_window_close,
            commands::app_settings::minimize_main_window,
            commands::home_map::read_home_map,
            commands::home_map::write_home_map,
            commands::discovery::discover_bridges,
            commands::discovery::pair_bridge,
            commands::discovery::get_hue_session,
            commands::discovery::reset_hue_session,
            commands::bridges::list_hue_bridges,
            commands::bridges::set_active_hue_bridge,
            commands::bridges::remove_hue_bridge,
            commands::bridges::rename_hue_bridge,
            commands::lights::get_hue_lights,
            commands::lights::set_light_state,
            commands::lights::signal_light,
            commands::lights::set_light_color,
            commands::rooms::get_hue_rooms,
            commands::rooms::update_room_members,
            commands::zones::get_hue_zones,
            commands::zones::create_hue_zone,
            commands::zones::update_zone_members,
            commands::grouped_lights::set_grouped_light_state,
            commands::grouped_lights::set_all_lights_state,
            commands::scenes::get_hue_scenes,
            commands::scenes::get_hue_smart_scenes,
            commands::scenes::activate_scene,
            commands::scenes::start_dynamic_scene,
            commands::scenes::stop_dynamic_scene,
            commands::scenes::set_scene_brightness,
            commands::scenes::activate_smart_scene,
            commands::scenes::deactivate_smart_scene,
            commands::scenes::create_hue_scene,
            commands::scenes::create_hue_gallery_scene,
            commands::settings::get_hue_settings_summary,
            commands::settings::get_hue_home_name,
            commands::settings::rename_hue_resource,
            commands::settings::get_hue_resource,
            commands::settings::create_hue_resource,
            commands::settings::update_hue_resource,
            commands::settings::delete_hue_resource,
            commands::settings::get_hue_accessory_services,
            commands::settings::get_switch_input_configuration,
            commands::settings::set_switch_input_configuration,
            commands::settings::start_hue_device_discovery,
            commands::settings::start_hue_qr_device_discovery,
            commands::settings::start_hue_serial_light_discovery,
            commands::settings::assign_device_to_room,
            commands::settings::assign_device_to_zone,
            commands::settings::create_hue_room,
            commands::store_commerce::get_store_commerce_diagnostic,
            commands::store_commerce::check_store_update,
            commands::store_commerce::download_store_update,
            commands::store_commerce::install_store_update,
            commands::entitlements::get_entitlements,
            commands::entitlements::set_debug_entitlements,
            commands::entitlements::set_debug_trial,
            commands::entitlements::refresh_entitlements,
            commands::entitlements::purchase_pro,
            commands::entitlements::get_pro_offer,
            commands::host_sync::get_host_sync_overview,
            commands::host_sync::get_host_sync_preferences,
            commands::host_sync::set_host_sync_preferences,
            commands::host_sync::provision_host_sync_credentials,
            commands::host_sync::start_host_sync,
            commands::host_sync::update_host_sync,
            commands::host_sync::start_host_sync_color_test,
            commands::host_sync::stop_host_sync,
            commands::host_sync::get_host_sync_status,
            commands::sync_box::discover_sync_boxes,
            commands::sync_box::pair_sync_box,
            commands::sync_box::get_sync_box_session,
            commands::sync_box::reset_sync_box_session,
            commands::sync_box::get_sync_box_state,
            commands::sync_box::set_sync_box_execution,
            commands::sync_box::set_sync_box_source_mode,
            commands::feedback::preview_feedback,
            commands::feedback::submit_feedback,
            commands::events::start_hue_events,
            commands::events::stop_hue_events,
            commands::widget::open_widget_window,
            commands::widget::list_widgets,
            commands::widget::get_widget_state,
            commands::widget::close_widget_window,
            commands::widget::save_widget_bounds,
            commands::widget::sync_widget_layout,
            commands::widget::widget_frontend_ready,
            commands::widget::set_widget_pinned,
            commands::widget::set_widget_always_on_top,
            commands::widget::get_widget_controls,
            commands::widget::set_widget_controls,
            commands::widget::preview_widget_config,
            commands::widget::set_widget_config,
            commands::widget::open_widget_settings,
            commands::widget::open_widget_target,
            commands::widget::remove_widget,
            commands::widget::set_widget_acrylic,
            commands::widget::get_widget_placement,
            commands::widget::set_widget_position,
            commands::widget::reset_widget_position,
        ])
        .setup(|app| {
            // The trial is local, so it is known before the Store answers. Load it
            // first, so the widgets restored below already reflect it.
            commands::entitlements::initialize_trial(app.handle());
            commands::entitlements::watch_trial(app.handle().clone());

            // Entitlements start Unknown, and Unknown refuses, so a paid feature
            // stays shut until the Store answers. Ask on launch rather than
            // waiting for the first person to open a gated screen, or the app
            // would look like it had revoked a purchase for a moment.
            {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    commands::entitlements::refresh_entitlements(handle).await;
                });
            }

            services::automations::runtime::start(app.handle());

            #[cfg(desktop)]
            {
                let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png"))?;

                let show_item =
                    MenuItem::with_id(app, "show", "Show Mote Desktop", true, None::<&str>)?;
                let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

                tauri::tray::TrayIconBuilder::with_id("main")
                    .icon(icon)
                    .tooltip("Mote Desktop")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id().as_ref() {
                        "show" => {
                            let _ = commands::app_settings::show_main_window(app);
                        }
                        "quit" => app.exit(0),
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| match event {
                        tauri::tray::TrayIconEvent::Click {
                            button: tauri::tray::MouseButton::Left,
                            ..
                        }
                        | tauri::tray::TrayIconEvent::DoubleClick {
                            button: tauri::tray::MouseButton::Left,
                            ..
                        } => {
                            let _ = commands::app_settings::show_main_window(tray.app_handle());
                        }
                        _ => {}
                    })
                    .build(app)?;
            }

            if let Some(window) = app.get_webview_window("main") {
                let app_handle = app.handle().clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        if commands::app_settings::should_minimize_to_tray(&app_handle) {
                            api.prevent_close();
                            let _ = commands::app_settings::hide_main_window(&app_handle);
                        }
                    }
                });
            }

            #[cfg(target_os = "windows")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_shadow(true);

                    if let Ok(hwnd_struct) = window.hwnd() {
                        // 1. Convert the window handle to a plain raw pointer integer
                        let hwnd_raw = hwnd_struct.0 as isize;

                        unsafe {
                            // 2. Dynamically link the Windows DWM function directly to bypass crate version conflicts
                            #[link(name = "dwmapi")]
                            extern "system" {
                                fn DwmSetWindowAttribute(
                                    hwnd: isize,
                                    dwAttribute: u32,
                                    pvAttribute: *const std::ffi::c_void,
                                    cbAttribute: u32,
                                ) -> i32;
                            }

                            let border_color: u32 = 0xFFFFFFFF; // Fully transparent/white fallback
                            const DWMWA_BORDER_COLOR: u32 = 34; // Windows DWM system constant for border color

                            // 3. Make the API call using pure, basic data types
                            let _ = DwmSetWindowAttribute(
                                hwnd_raw,
                                DWMWA_BORDER_COLOR,
                                &border_color as *const u32 as *const _,
                                std::mem::size_of::<u32>() as u32,
                            );
                        }
                    }
                }

                // Without this, Windows waits about 30 seconds for Mote to close
                // before a Store update can install.
                session_end::exit_when_session_ends(app.handle());
                session_events::watch(app.handle());
            }
            // The main window is configured `visible: false`; show it now unless
            // this was a login launch, which should start quietly in the tray.
            if !commands::app_settings::launched_via_autostart() {
                let _ = commands::app_settings::show_main_window(app.handle());
            }

            commands::app_settings::apply_desktop_shortcut_preference(app.handle());

            if let Err(_error) = commands::widget::restore_widget_window(app.handle()) {
                #[cfg(debug_assertions)]
                eprintln!("failed to restore widget window: {_error}");
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                // Bounded best-effort cleanup: stop a live PC sync stream,
                // release the entertainment area, and restore the lights.
                if let Some(engine) =
                    app_handle.try_state::<services::entertainment::engine::HostSyncEngine>()
                {
                    engine.shutdown_blocking(services::entertainment::engine::EXIT_CLEANUP_TIMEOUT);
                }
                if let Some(automations) =
                    app_handle.try_state::<services::automations::runtime::AutomationRuntime>()
                {
                    automations
                        .shutdown_blocking(services::automations::runtime::EXIT_CLEANUP_TIMEOUT);
                }
            }
        });
}
