use tauri::{Manager, PhysicalPosition, PhysicalSize, Position, Size};

pub mod config;
pub mod git;
pub mod usage;

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

            let width = monitor.size().width;
            let height = (monitor.size().height as f64 * height_ratio) as u32;

            // Apply size
            window
                .set_size(Size::Physical(PhysicalSize { width, height }))
                .unwrap();

            // Position at (0, 0)
            window
                .set_position(Position::Physical(PhysicalPosition { x: 0, y: 0 }))
                .unwrap();

            // Force window to stay on top
            window.set_always_on_top(true).unwrap();

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            git::get_git_status,
            usage::get_usage_snapshot,
            config::get_app_config,
            config::save_app_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
