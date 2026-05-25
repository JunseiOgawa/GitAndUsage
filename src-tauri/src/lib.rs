use tauri::{Manager, PhysicalPosition, PhysicalSize, Position, Size};

pub mod ai_quota;
pub mod commands;
pub mod config;
pub mod git;
pub mod usage;

#[cfg(windows)]
fn get_work_area(monitor: &tauri::Monitor) -> (PhysicalPosition<i32>, PhysicalSize<u32>) {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };

    unsafe {
        let pt = POINT {
            x: monitor.position().x,
            y: monitor.position().y,
        };
        let hmonitor = MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if GetMonitorInfoW(hmonitor, &mut info).as_bool() {
            return (
                PhysicalPosition {
                    x: info.rcWork.left,
                    y: info.rcWork.top,
                },
                PhysicalSize {
                    width: (info.rcWork.right - info.rcWork.left) as u32,
                    height: (info.rcWork.bottom - info.rcWork.top) as u32,
                },
            );
        }
    }

    (monitor.position().clone(), monitor.size().clone())
}

#[cfg(not(windows))]
fn get_work_area(monitor: &tauri::Monitor) -> (PhysicalPosition<i32>, PhysicalSize<u32>) {
    (monitor.position().clone(), monitor.size().clone())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            let monitor = window.primary_monitor().unwrap().unwrap();
            let (work_pos, work_size) = get_work_area(&monitor);

            // Load config or fall back to default
            let config = config::get_app_config().unwrap_or_default();
            let height_ratio = config.height_ratio;

            let height = (work_size.height as f64 * height_ratio) as u32;

            // Apply sizing and positioning based on usage_only configuration and dock position
            if config.usage_only {
                let scale_factor = monitor.scale_factor();
                let dock = config
                    .dock_position
                    .clone()
                    .unwrap_or_else(|| "right".to_string());
                let controller_width = config.controller_width.unwrap_or(380) as f64;
                let controller_height = config.controller_height.unwrap_or(96) as f64;

                match dock.as_str() {
                    "left" => {
                        let width = (controller_width * scale_factor) as u32;
                        window
                            .set_size(Size::Physical(PhysicalSize { width, height }))
                            .unwrap();
                        window.set_position(Position::Physical(work_pos)).unwrap();
                    }
                    "top" => {
                        let width = work_size.width;
                        let bar_height = (controller_height * scale_factor) as u32;
                        window
                            .set_size(Size::Physical(PhysicalSize {
                                width,
                                height: bar_height,
                            }))
                            .unwrap();
                        window.set_position(Position::Physical(work_pos)).unwrap();
                    }
                    "bottom" => {
                        let width = work_size.width;
                        let bar_height = (controller_height * scale_factor) as u32;
                        let y = work_pos.y + (work_size.height - bar_height) as i32;
                        window
                            .set_size(Size::Physical(PhysicalSize {
                                width,
                                height: bar_height,
                            }))
                            .unwrap();
                        window
                            .set_position(Position::Physical(PhysicalPosition { x: work_pos.x, y }))
                            .unwrap();
                    }
                    "floating" => {
                        let width = (controller_width * scale_factor) as u32;
                        window
                            .set_size(Size::Physical(PhysicalSize { width, height }))
                            .unwrap();
                        // In floating mode, do not force a position at startup, or center it
                    }
                    _ => {
                        // "right"
                        let width = (controller_width * scale_factor) as u32;
                        let x = work_pos.x + (work_size.width - width) as i32;
                        window
                            .set_size(Size::Physical(PhysicalSize { width, height }))
                            .unwrap();
                        window
                            .set_position(Position::Physical(PhysicalPosition { x, y: work_pos.y }))
                            .unwrap();
                    }
                }
            } else {
                let normal_dock = config
                    .normal_dock_position
                    .clone()
                    .unwrap_or_else(|| "floating".to_string());
                let controller_width = config.controller_width.unwrap_or(380) as f64;
                let scale_factor = monitor.scale_factor();

                match normal_dock.as_str() {
                    "left" => {
                        let width = (controller_width * scale_factor) as u32;
                        window
                            .set_size(Size::Physical(PhysicalSize {
                                width,
                                height: work_size.height,
                            }))
                            .unwrap();
                        window.set_position(Position::Physical(work_pos)).unwrap();
                    }
                    "right" => {
                        let width = (controller_width * scale_factor) as u32;
                        let x = work_pos.x + (work_size.width - width) as i32;
                        window
                            .set_size(Size::Physical(PhysicalSize {
                                width,
                                height: work_size.height,
                            }))
                            .unwrap();
                        window
                            .set_position(Position::Physical(PhysicalPosition { x, y: work_pos.y }))
                            .unwrap();
                    }
                    "top" => {
                        let width = work_size.width;
                        window
                            .set_size(Size::Physical(PhysicalSize { width, height }))
                            .unwrap();
                        window.set_position(Position::Physical(work_pos)).unwrap();
                    }
                    "bottom" => {
                        let width = work_size.width;
                        let y = work_pos.y + (work_size.height - height) as i32;
                        window
                            .set_size(Size::Physical(PhysicalSize { width, height }))
                            .unwrap();
                        window
                            .set_position(Position::Physical(PhysicalPosition { x: work_pos.x, y }))
                            .unwrap();
                    }
                    _ => {
                        // "floating"
                        let width = work_size.width;
                        window
                            .set_size(Size::Physical(PhysicalSize { width, height }))
                            .unwrap();
                        window.set_position(Position::Physical(work_pos)).unwrap();
                    }
                }
            }

            // Force window to stay on top
            window.set_always_on_top(true).unwrap();

            // Build System Tray Menu
            let quit_i = tauri::menu::MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let show_i =
                tauri::menu::MenuItem::with_id(app, "show", "Show App", true, None::<&str>)?;
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
                .on_menu_event(|app, event| match event.id.0.as_str() {
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
            commands::set_window_size_mode,
            commands::preview_controller_size,
            commands::move_to_next_monitor
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
