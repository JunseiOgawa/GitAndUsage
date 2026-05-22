use tauri::{PhysicalPosition, PhysicalSize, Position, Size};
use crate::config;

#[tauri::command]
pub fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub fn set_window_size_mode(window: tauri::Window, settings_open: bool) {
    if let Some(monitor) = window.primary_monitor().unwrap() {
        let config = config::get_app_config().unwrap_or_default();
        let height_ratio = config.height_ratio;
        let height = (monitor.size().height as f64 * height_ratio) as u32;

        if settings_open {
            let width = monitor.size().width;
            window.set_size(Size::Physical(PhysicalSize { width, height })).unwrap();
            window.set_position(Position::Physical(PhysicalPosition { x: 0, y: 0 })).unwrap();
        } else if config.usage_only {
            let scale_factor = monitor.scale_factor();
            let width = (380.0 * scale_factor) as u32;
            let x = monitor.size().width - width;
            window.set_size(Size::Physical(PhysicalSize { width, height })).unwrap();
            window.set_position(Position::Physical(PhysicalPosition { x: x as i32, y: 0 })).unwrap();
        } else {
            let width = monitor.size().width;
            window.set_size(Size::Physical(PhysicalSize { width, height })).unwrap();
            window.set_position(Position::Physical(PhysicalPosition { x: 0, y: 0 })).unwrap();
        }
    }
}
