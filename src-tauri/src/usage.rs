use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UsageSnapshot {
    pub provider: String,
    pub display_name: String,
    pub account_label: String,
    pub plan_label: String,
    pub used: f64,
    pub limit: f64,
    pub unit: String,
    pub status: String,
    pub last_updated_at: String,
}

#[tauri::command]
pub fn get_usage_snapshot(json_path: String) -> Result<Vec<UsageSnapshot>, String> {
    let path = Path::new(&json_path);
    if path.exists() {
        let contents = fs::read_to_string(path)
            .map_err(|e| format!("Failed to read usage JSON file: {}", e))?;
        let snapshots: Vec<UsageSnapshot> = serde_json::from_str(&contents)
            .map_err(|e| format!("Failed to parse usage JSON file: {}", e))?;
        Ok(snapshots)
    } else {
        // Default content as requested in specifications
        let default_content = r#"[
  { "provider": "codex", "displayName": "Codex", "accountLabel": "Junse", "planLabel": "Pro Plan", "used": 12.0, "limit": 50.0, "unit": "messages", "status": "ok", "lastUpdatedAt": "2026-05-21T14:00:00Z" },
  { "provider": "copilot", "displayName": "GitHub Copilot", "accountLabel": "JunseiOgawa", "planLabel": "Enterprise", "used": 1280.0, "limit": 2000.0, "unit": "requests", "status": "ok", "lastUpdatedAt": "2026-05-21T14:00:00Z" },
  { "provider": "claude", "displayName": "Claude", "accountLabel": "Personal", "planLabel": "Pro Plan", "used": 16.5, "limit": 20.0, "unit": "credits", "status": "warning", "lastUpdatedAt": "2026-05-21T14:00:00Z" }
]"#;
        // Make sure parent directories exist
        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() && !parent.exists() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create directories for usage JSON: {}", e))?;
            }
        }

        fs::write(path, default_content)
            .map_err(|e| format!("Failed to write default usage JSON: {}", e))?;

        let snapshots: Vec<UsageSnapshot> = serde_json::from_str(default_content)
            .map_err(|e| format!("Failed to parse default usage JSON: {}", e))?;
        Ok(snapshots)
    }
}
