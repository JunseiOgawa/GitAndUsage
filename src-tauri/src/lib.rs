use tauri::{Manager, PhysicalPosition, PhysicalSize, Position, Size};

pub mod config;
pub mod git;
pub mod usage;
pub mod ai_quota;
pub mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            let monitor = window.primary_monitor().unwrap().unwrap();

            // Load config or fall back to default
            let config = config::get_app_config().unwrap_or_default();
            let height_ratio = config.height_ratio;

            let height = (monitor.size().height as f64 * height_ratio) as u32;

            // Apply sizing and positioning based on usage_only configuration and dock position
            if config.usage_only {
                let scale_factor = monitor.scale_factor();
                let dock = config.dock_position.clone().unwrap_or_else(|| "right".to_string());
                
                match dock.as_str() {
                    "left" => {
                        let width = (380.0 * scale_factor) as u32;
                        window.set_size(Size::Physical(PhysicalSize { width, height })).unwrap();
                        window.set_position(Position::Physical(PhysicalPosition { x: 0, y: 0 })).unwrap();
                    }
                    "top" => {
                        let width = monitor.size().width;
                        let bar_height = (96.0 * scale_factor) as u32;
                        window.set_size(Size::Physical(PhysicalSize { width, height: bar_height })).unwrap();
                        window.set_position(Position::Physical(PhysicalPosition { x: 0, y: 0 })).unwrap();
                    }
                    "bottom" => {
                        let width = monitor.size().width;
                        let bar_height = (96.0 * scale_factor) as u32;
                        let y = monitor.size().height - bar_height;
                        window.set_size(Size::Physical(PhysicalSize { width, height: bar_height })).unwrap();
                        window.set_position(Position::Physical(PhysicalPosition { x: 0, y: y as i32 })).unwrap();
                    }
                    "floating" => {
                        let width = (380.0 * scale_factor) as u32;
                        window.set_size(Size::Physical(PhysicalSize { width, height })).unwrap();
                        // In floating mode, do not force a position at startup, or center it
                    }
                    _ => { // "right"
                        let width = (380.0 * scale_factor) as u32;
                        let x = monitor.size().width - width;
                        window.set_size(Size::Physical(PhysicalSize { width, height })).unwrap();
                        window.set_position(Position::Physical(PhysicalPosition { x: x as i32, y: 0 })).unwrap();
                    }
                }
            } else {
                let width = monitor.size().width;
                window
                    .set_size(Size::Physical(PhysicalSize { width, height }))
                    .unwrap();
                window
                    .set_position(Position::Physical(PhysicalPosition { x: 0, y: 0 }))
                    .unwrap();
            }

            // Force window to stay on top
            window.set_always_on_top(true).unwrap();

            // Build System Tray Menu
            let quit_i = tauri::menu::MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let show_i = tauri::menu::MenuItem::with_id(app, "show", "Show App", true, None::<&str>)?;
            let menu = tauri::menu::MenuBuilder::new(app)
                .item(&show_i)
                .item(&quit_i)
                .build()?;

            // Load tray icon from embedded asset
            let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png"))?;

            // Build System Tray Icon
            let tray = tauri::tray::TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    match event.id.0.as_str() {
                        "quit" => {
                            app.exit(0);
                        }
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                window.show().unwrap();
                                window.set_focus().unwrap();
                            }
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let Some(window) = tray.app_handle().get_webview_window("main") {
                        match event {
                            tauri::tray::TrayIconEvent::Click { .. } => {
                                if window.is_visible().unwrap_or(false) {
                                    window.hide().unwrap();
                                } else {
                                    window.show().unwrap();
                                    window.set_focus().unwrap();
                                }
                            }
                            _ => {}
                        }
                    }
                })
                .build(app)?;

            // Manage the tray lifetime to keep it alive
            app.manage(tray);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            git::get_git_status,
            git::get_commit_log,
            git::get_commit_details,
            git::open_folder_dialog,
            git::checkout_branch,
            usage::get_usage_snapshot,
            config::get_app_config,
            config::save_app_config,
            ai_quota::get_all_ai_quotas,
            ai_quota::refresh_ai_quota,
            ai_quota::check_ai_provider_auth,
            commands::exit_app,
            commands::set_window_size_mode
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
