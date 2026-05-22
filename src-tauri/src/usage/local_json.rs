use std::fs;
use std::path::Path;
use super::types::UsageSnapshot;

pub fn load_cached_snapshots(path: &Path) -> Vec<UsageSnapshot> {
    if path.exists() {
        if let Ok(contents) = fs::read_to_string(path) {
            serde_json::from_str(&contents).unwrap_or_default()
        } else {
            Vec::new()
        }
    } else {
        Vec::new()
    }
}

pub fn save_snapshots_to_json(path: &Path, snapshots: &[UsageSnapshot]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            let _ = fs::create_dir_all(parent);
        }
    }

    if let Ok(serialized) = serde_json::to_string_pretty(snapshots) {
        fs::write(path, serialized).map_err(|e| format!("Failed to write snapshots to JSON: {}", e))?;
    }
    Ok(())
}
