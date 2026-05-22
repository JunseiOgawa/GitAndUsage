use tauri::{PhysicalPosition, PhysicalSize, Position, Size};
use crate::config;

#[tauri::command]
pub fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// Resize and reposition the window based on the current mode.
/// `usage_only` is passed directly from the frontend to avoid re-reading config from disk,
/// which eliminates the noticeable lag when switching modes.
#[tauri::command]
pub fn set_window_size_mode(window: tauri::Window, settings_open: bool, usage_only: Option<bool>) {
    if let Some(monitor) = window.primary_monitor().unwrap() {
        // Read height_ratio from config, but use the caller-provided usage_only flag
        // so we don't pay the disk I/O cost when it matters most.
        let config = config::get_app_config().unwrap_or_default();
        let height_ratio = config.height_ratio;
        let height = (monitor.size().height as f64 * height_ratio) as u32;

        // Resolve effective usage_only: prefer the caller-supplied value, fall back to saved config
        let effective_usage_only = usage_only.unwrap_or(config.usage_only);

        if settings_open {
            let scale_factor = monitor.scale_factor();
            let width = monitor.size().width;
            let target_height = ((520.0 * scale_factor) as u32).min((monitor.size().height as f64 * 0.85) as u32);
            window.set_size(Size::Physical(PhysicalSize { width, height: target_height })).unwrap();
            window.set_position(Position::Physical(PhysicalPosition { x: 0, y: 0 })).unwrap();
        } else if effective_usage_only {
            let scale_factor = monitor.scale_factor();
            let dock = config.dock_position.unwrap_or_else(|| "right".to_string());
            
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
                    // In floating mode, let the user move it freely, do not set_position!
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
            window.set_size(Size::Physical(PhysicalSize { width, height })).unwrap();
            window.set_position(Position::Physical(PhysicalPosition { x: 0, y: 0 })).unwrap();
        }
    }
}
