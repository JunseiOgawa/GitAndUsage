use tauri::{PhysicalPosition, PhysicalSize, Position, Size};
use crate::config;

#[cfg(windows)]
fn get_work_area(monitor: &tauri::Monitor) -> (PhysicalPosition<i32>, PhysicalSize<u32>) {
    use windows::Win32::Graphics::Gdi::{MonitorFromPoint, GetMonitorInfoW, MONITORINFO, MONITOR_DEFAULTTONEAREST};
    use windows::Win32::Foundation::POINT;
    unsafe {
        let pt = POINT { x: monitor.position().x, y: monitor.position().y };
        let hmonitor = MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        // as_bool() is used for BOOL in windows crate
        if GetMonitorInfoW(hmonitor, &mut info).as_bool() {
            return (
                PhysicalPosition { x: info.rcWork.left, y: info.rcWork.top },
                PhysicalSize { width: (info.rcWork.right - info.rcWork.left) as u32, height: (info.rcWork.bottom - info.rcWork.top) as u32 }
            );
        }
    }
    (monitor.position().clone(), monitor.size().clone())
}

#[cfg(not(windows))]
fn get_work_area(monitor: &tauri::Monitor) -> (PhysicalPosition<i32>, PhysicalSize<u32>) {
    (monitor.position().clone(), monitor.size().clone())
}

#[tauri::command]
pub fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// Resize and reposition the window based on the current mode.
/// `usage_only` is passed directly from the frontend to avoid re-reading config from disk,
/// which eliminates the noticeable lag when switching modes.
#[tauri::command]
pub fn set_window_size_mode(window: tauri::Window, settings_open: bool, usage_only: Option<bool>) {
    if let Some(monitor) = window.current_monitor().unwrap().or_else(|| window.primary_monitor().unwrap()) {
        // Read height_ratio from config, but use the caller-provided usage_only flag
        // so we don't pay the disk I/O cost when it matters most.
        let config = config::get_app_config().unwrap_or_default();
        let height_ratio = config.height_ratio;
        let height = (monitor.size().height as f64 * height_ratio) as u32;

        // Resolve effective usage_only: prefer the caller-supplied value, fall back to saved config
        let effective_usage_only = usage_only.unwrap_or(config.usage_only);

        let controller_width = config.controller_width.unwrap_or(380) as f64;
        let controller_height = config.controller_height.unwrap_or(96) as f64;

        if settings_open {
            let scale_factor = monitor.scale_factor();
            let width = monitor.size().width;
            let target_height = ((520.0 * scale_factor) as u32).min((monitor.size().height as f64 * 0.85) as u32);
            window.set_size(Size::Physical(PhysicalSize { width, height: target_height })).unwrap();
            window.set_position(Position::Physical(PhysicalPosition { x: monitor.position().x, y: monitor.position().y })).unwrap();
        } else if effective_usage_only {
            let scale_factor = monitor.scale_factor();
            let dock = config.dock_position.unwrap_or_else(|| "right".to_string());
            
            match dock.as_str() {
                "left" => {
                    let width = (controller_width * scale_factor) as u32;
                    window.set_size(Size::Physical(PhysicalSize { width, height })).unwrap();
                    window.set_position(Position::Physical(PhysicalPosition { x: monitor.position().x, y: monitor.position().y })).unwrap();
                }
                "top" => {
                    let width = monitor.size().width;
                    let bar_height = (controller_height * scale_factor) as u32;
                    window.set_size(Size::Physical(PhysicalSize { width, height: bar_height })).unwrap();
                    window.set_position(Position::Physical(PhysicalPosition { x: monitor.position().x, y: monitor.position().y })).unwrap();
                }
                "bottom" => {
                    let width = monitor.size().width;
                    let bar_height = (controller_height * scale_factor) as u32;
                    let y = monitor.position().y + (monitor.size().height - bar_height) as i32;
                    window.set_size(Size::Physical(PhysicalSize { width, height: bar_height })).unwrap();
                    window.set_position(Position::Physical(PhysicalPosition { x: monitor.position().x, y })).unwrap();
                }
                "floating" => {
                    let width = (controller_width * scale_factor) as u32;
                    window.set_size(Size::Physical(PhysicalSize { width, height })).unwrap();
                    // In floating mode, let the user move it freely, do not set_position!
                }
                _ => { // "right"
                    let width = (controller_width * scale_factor) as u32;
                    let x = monitor.position().x + (monitor.size().width - width) as i32;
                    window.set_size(Size::Physical(PhysicalSize { width, height })).unwrap();
                    window.set_position(Position::Physical(PhysicalPosition { x, y: monitor.position().y })).unwrap();
                }
            }
        } else {
            // Normal mode: apply dock layout based on normal_dock_position
            let scale_factor = monitor.scale_factor();
            let normal_dock = config.normal_dock_position.unwrap_or_else(|| "floating".to_string());
            
            match normal_dock.as_str() {
                "left" => {
                    let width = (controller_width * scale_factor) as u32;
                    window.set_size(Size::Physical(PhysicalSize { width, height })).unwrap();
                    window.set_position(Position::Physical(PhysicalPosition { x: monitor.position().x, y: monitor.position().y })).unwrap();
                }
                "right" => {
                    let width = (controller_width * scale_factor) as u32;
                    let x = monitor.position().x + (monitor.size().width - width) as i32;
                    window.set_size(Size::Physical(PhysicalSize { width, height })).unwrap();
                    window.set_position(Position::Physical(PhysicalPosition { x, y: monitor.position().y })).unwrap();
                }
                "top" => {
                    let width = monitor.size().width;
                    let bar_height = (controller_height * scale_factor) as u32;
                    window.set_size(Size::Physical(PhysicalSize { width, height: bar_height })).unwrap();
                    window.set_position(Position::Physical(PhysicalPosition { x: monitor.position().x, y: monitor.position().y })).unwrap();
                }
                "bottom" => {
                    let width = monitor.size().width;
                    let bar_height = (controller_height * scale_factor) as u32;
                    let y = monitor.position().y + (monitor.size().height - bar_height) as i32;
                    window.set_size(Size::Physical(PhysicalSize { width, height: bar_height })).unwrap();
                    window.set_position(Position::Physical(PhysicalPosition { x: monitor.position().x, y })).unwrap();
                }
                _ => { // "floating" — full-width at top-left origin (legacy default)
                    let width = monitor.size().width;
                    window.set_size(Size::Physical(PhysicalSize { width, height })).unwrap();
                    window.set_position(Position::Physical(PhysicalPosition { x: monitor.position().x, y: monitor.position().y })).unwrap();
                }
            }
        }
    }
}

/// Allows the frontend to preview the controller width and height resizing in real-time.
#[tauri::command]
pub fn preview_controller_size(window: tauri::Window, width: u32, height: u32) {
    if let Some(monitor) = window.current_monitor().unwrap().or_else(|| window.primary_monitor().unwrap()) {
        let scale_factor = monitor.scale_factor();
        let config = config::get_app_config().unwrap_or_default();
        
        let app_height = (monitor.size().height as f64 * config.height_ratio) as u32;

        // Select which dock setting to use based on current mode
        if config.usage_only {
            let dock = config.dock_position.unwrap_or_else(|| "right".to_string());
            match dock.as_str() {
                "left" => {
                    let p_width = (width as f64 * scale_factor) as u32;
                    window.set_size(Size::Physical(PhysicalSize { width: p_width, height: app_height })).unwrap();
                    window.set_position(Position::Physical(PhysicalPosition { x: monitor.position().x, y: monitor.position().y })).unwrap();
                }
                "top" => {
                    let p_width = monitor.size().width;
                    let bar_height = (height as f64 * scale_factor) as u32;
                    window.set_size(Size::Physical(PhysicalSize { width: p_width, height: bar_height })).unwrap();
                    window.set_position(Position::Physical(PhysicalPosition { x: monitor.position().x, y: monitor.position().y })).unwrap();
                }
                "bottom" => {
                    let p_width = monitor.size().width;
                    let bar_height = (height as f64 * scale_factor) as u32;
                    let y = monitor.position().y + (monitor.size().height - bar_height) as i32;
                    window.set_size(Size::Physical(PhysicalSize { width: p_width, height: bar_height })).unwrap();
                    window.set_position(Position::Physical(PhysicalPosition { x: monitor.position().x, y })).unwrap();
                }
                "floating" => {
                    let p_width = (width as f64 * scale_factor) as u32;
                    window.set_size(Size::Physical(PhysicalSize { width: p_width, height: app_height })).unwrap();
                }
                _ => { // "right"
                    let p_width = (width as f64 * scale_factor) as u32;
                    let x = monitor.position().x + (monitor.size().width - p_width) as i32;
                    window.set_size(Size::Physical(PhysicalSize { width: p_width, height: app_height })).unwrap();
                    window.set_position(Position::Physical(PhysicalPosition { x, y: monitor.position().y })).unwrap();
                }
            }
        } else {
            let dock = config.normal_dock_position.unwrap_or_else(|| "floating".to_string());
            match dock.as_str() {
                "left" => {
                    let p_width = (width as f64 * scale_factor) as u32;
                    window.set_size(Size::Physical(PhysicalSize { width: p_width, height: app_height })).unwrap();
                    window.set_position(Position::Physical(PhysicalPosition { x: monitor.position().x, y: monitor.position().y })).unwrap();
                }
                "right" => {
                    let p_width = (width as f64 * scale_factor) as u32;
                    let x = monitor.position().x + (monitor.size().width - p_width) as i32;
                    window.set_size(Size::Physical(PhysicalSize { width: p_width, height: app_height })).unwrap();
                    window.set_position(Position::Physical(PhysicalPosition { x, y: monitor.position().y })).unwrap();
                }
                "top" => {
                    let p_width = monitor.size().width;
                    let bar_height = (height as f64 * scale_factor) as u32;
                    window.set_size(Size::Physical(PhysicalSize { width: p_width, height: bar_height })).unwrap();
                    window.set_position(Position::Physical(PhysicalPosition { x: monitor.position().x, y: monitor.position().y })).unwrap();
                }
                "bottom" => {
                    let p_width = monitor.size().width;
                    let bar_height = (height as f64 * scale_factor) as u32;
                    let y = monitor.position().y + (monitor.size().height - bar_height) as i32;
                    window.set_size(Size::Physical(PhysicalSize { width: p_width, height: bar_height })).unwrap();
                    window.set_position(Position::Physical(PhysicalPosition { x: monitor.position().x, y })).unwrap();
                }
                _ => { // "floating"
                    let p_width = monitor.size().width;
                    window.set_size(Size::Physical(PhysicalSize { width: p_width, height: app_height })).unwrap();
                    window.set_position(Position::Physical(PhysicalPosition { x: monitor.position().x, y: monitor.position().y })).unwrap();
                }
            }
        }
    }
}

/// Cycle the window between available monitors in the specified direction.
#[tauri::command]
pub fn move_to_next_monitor(window: tauri::Window, direction: String) -> Result<(), String> {
    let monitors = window.available_monitors().map_err(|e| e.to_string())?;
    if monitors.len() <= 1 {
        return Ok(());
    }

    // Sort monitors by X coordinate
    let mut sorted_monitors = monitors;
    sorted_monitors.sort_by_key(|m| m.position().x);

    // Get current monitor
    let current_mon = window.current_monitor().map_err(|e| e.to_string())?
        .ok_or_else(|| "Could not determine current monitor".to_string())?;

    // Find current monitor index
    let current_idx = sorted_monitors.iter().position(|m| m.name() == current_mon.name())
        .unwrap_or(0);

    // Determine target index
    let target_idx = if direction == "left" {
        if current_idx == 0 {
            sorted_monitors.len() - 1
        } else {
            current_idx - 1
        }
    } else {
        (current_idx + 1) % sorted_monitors.len()
    };

    let target_monitor = &sorted_monitors[target_idx];
    
    // Now move the window to the target monitor!
    // Sizing/position calculations are completely offset by the target monitor's coordinates.
    let config = config::get_app_config().unwrap_or_default();
    let height_ratio = config.height_ratio;
    let height = (target_monitor.size().height as f64 * height_ratio) as u32;
    let scale_factor = target_monitor.scale_factor();
    
    let controller_width = config.controller_width.unwrap_or(380) as f64;
    let controller_height = config.controller_height.unwrap_or(96) as f64;
    
    if config.usage_only {
        let dock = config.dock_position.unwrap_or_else(|| "right".to_string());
        match dock.as_str() {
            "left" => {
                let width = (controller_width * scale_factor) as u32;
                window.set_size(Size::Physical(PhysicalSize { width, height })).unwrap();
                window.set_position(Position::Physical(PhysicalPosition { 
                    x: target_monitor.position().x, 
                    y: target_monitor.position().y 
                })).unwrap();
            }
            "top" => {
                let width = target_monitor.size().width;
                let bar_height = (controller_height * scale_factor) as u32;
                window.set_size(Size::Physical(PhysicalSize { width, height: bar_height })).unwrap();
                window.set_position(Position::Physical(PhysicalPosition { 
                    x: target_monitor.position().x, 
                    y: target_monitor.position().y 
                })).unwrap();
            }
            "bottom" => {
                let width = target_monitor.size().width;
                let bar_height = (controller_height * scale_factor) as u32;
                let y = target_monitor.position().y + (target_monitor.size().height - bar_height) as i32;
                window.set_size(Size::Physical(PhysicalSize { width, height: bar_height })).unwrap();
                window.set_position(Position::Physical(PhysicalPosition { 
                    x: target_monitor.position().x, 
                    y 
                })).unwrap();
            }
            "floating" => {
                let width = (controller_width * scale_factor) as u32;
                window.set_size(Size::Physical(PhysicalSize { width, height })).unwrap();
                let x = target_monitor.position().x + ((target_monitor.size().width - width) / 2) as i32;
                let y = target_monitor.position().y + ((target_monitor.size().height - height) / 2) as i32;
                window.set_position(Position::Physical(PhysicalPosition { x, y })).unwrap();
            }
            _ => { // "right"
                let width = (controller_width * scale_factor) as u32;
                let x = target_monitor.position().x + (target_monitor.size().width - width) as i32;
                window.set_size(Size::Physical(PhysicalSize { width, height })).unwrap();
                window.set_position(Position::Physical(PhysicalPosition { 
                    x, 
                    y: target_monitor.position().y 
                })).unwrap();
            }
        }
    } else {
        let normal_dock = config.normal_dock_position.unwrap_or_else(|| "floating".to_string());
        match normal_dock.as_str() {
            "left" => {
                let width = (controller_width * scale_factor) as u32;
                window.set_size(Size::Physical(PhysicalSize { width, height })).unwrap();
                window.set_position(Position::Physical(PhysicalPosition {
                    x: target_monitor.position().x,
                    y: target_monitor.position().y
                })).unwrap();
            }
            "right" => {
                let width = (controller_width * scale_factor) as u32;
                let x = target_monitor.position().x + (target_monitor.size().width - width) as i32;
                window.set_size(Size::Physical(PhysicalSize { width, height })).unwrap();
                window.set_position(Position::Physical(PhysicalPosition {
                    x,
                    y: target_monitor.position().y
                })).unwrap();
            }
            "top" => {
                let width = target_monitor.size().width;
                let bar_height = (controller_height * scale_factor) as u32;
                window.set_size(Size::Physical(PhysicalSize { width, height: bar_height })).unwrap();
                window.set_position(Position::Physical(PhysicalPosition {
                    x: target_monitor.position().x,
                    y: target_monitor.position().y
                })).unwrap();
            }
            "bottom" => {
                let width = target_monitor.size().width;
                let bar_height = (controller_height * scale_factor) as u32;
                let y = target_monitor.position().y + (target_monitor.size().height - bar_height) as i32;
                window.set_size(Size::Physical(PhysicalSize { width, height: bar_height })).unwrap();
                window.set_position(Position::Physical(PhysicalPosition {
                    x: target_monitor.position().x,
                    y
                })).unwrap();
            }
            _ => { // "floating" — full-width at top-left origin of target monitor
                let width = target_monitor.size().width;
                window.set_size(Size::Physical(PhysicalSize { width, height })).unwrap();
                window.set_position(Position::Physical(PhysicalPosition {
                    x: target_monitor.position().x,
                    y: target_monitor.position().y
                })).unwrap();
            }
        }
    }

    Ok(())
}
