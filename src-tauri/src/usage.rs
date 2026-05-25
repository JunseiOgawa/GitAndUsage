pub mod claude;
pub mod codex;
pub mod copilot;
pub mod local_json;
pub mod types;

use crate::config::get_app_config;
use chrono::Utc;
use reqwest::blocking::Client;
use std::path::Path;

pub use claude::fetch_claude_usage;
pub use codex::fetch_codex_usage;
pub use copilot::fetch_copilot_usage;
pub use local_json::{load_cached_snapshots, save_snapshots_to_json};
pub use types::UsageSnapshot;

fn create_client() -> Client {
    Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .unwrap_or_default()
}

#[tauri::command]
pub fn get_usage_snapshot(json_path: String) -> Result<Vec<UsageSnapshot>, String> {
    // 1. Read app configuration directly from backend storage
    let config = get_app_config().unwrap_or_default();
    let client = create_client();

    let mut current_snapshots = Vec::new();
    let path = Path::new(&json_path);

    // Load existing cached snapshots for fallback merging
    let cached_snapshots = load_cached_snapshots(path);

    // 2. Fetch Codex (OpenAI)
    match fetch_codex_usage(&client, &config.codex_token, &None, &None) {
        Ok(snapshot) => current_snapshots.push(snapshot),
        Err(err) => {
            println!("Codex fetch failed (using fallback cache): {}", err);
            if let Some(cached) = cached_snapshots.iter().find(|s| s.provider == "codex") {
                let mut degraded = cached.clone();
                degraded.status = "warning".to_string(); // Flag degraded state
                current_snapshots.push(degraded);
            } else {
                current_snapshots.push(UsageSnapshot {
                    provider: "codex".to_string(),
                    display_name: "Codex".to_string(),
                    account_label: "".to_string(),
                    plan_label: "Pro Plan".to_string(),
                    used: 0.0,
                    limit: 0.0,
                    unit: "messages".to_string(),
                    status: "error".to_string(),
                    last_updated_at: Utc::now().to_rfc3339(),
                });
            }
        }
    }

    // 3. Fetch Copilot
    match fetch_copilot_usage(&client, &config.copilot_pat, &None, &None) {
        Ok(snapshot) => current_snapshots.push(snapshot),
        Err(err) => {
            println!("Copilot fetch failed (using fallback cache): {}", err);
            if let Some(cached) = cached_snapshots.iter().find(|s| s.provider == "copilot") {
                let mut degraded = cached.clone();
                degraded.status = "warning".to_string();
                current_snapshots.push(degraded);
            } else {
                current_snapshots.push(UsageSnapshot {
                    provider: "copilot".to_string(),
                    display_name: "GitHub Copilot".to_string(),
                    account_label: "".to_string(),
                    plan_label: "Individual".to_string(),
                    used: 0.0,
                    limit: 0.0,
                    unit: "requests".to_string(),
                    status: "error".to_string(),
                    last_updated_at: Utc::now().to_rfc3339(),
                });
            }
        }
    }

    // 4. Fetch Claude
    match fetch_claude_usage(&client, &config.claude_key, &None, &None) {
        Ok(snapshot) => current_snapshots.push(snapshot),
        Err(err) => {
            println!("Claude fetch failed (using fallback cache): {}", err);
            if let Some(cached) = cached_snapshots.iter().find(|s| s.provider == "claude") {
                let mut degraded = cached.clone();
                degraded.status = "warning".to_string();
                current_snapshots.push(degraded);
            } else {
                current_snapshots.push(UsageSnapshot {
                    provider: "claude".to_string(),
                    display_name: "Claude".to_string(),
                    account_label: "".to_string(),
                    plan_label: "Pro Plan".to_string(),
                    used: 0.0,
                    limit: 0.0,
                    unit: "credits".to_string(),
                    status: "error".to_string(),
                    last_updated_at: Utc::now().to_rfc3339(),
                });
            }
        }
    }

    // 5. Save updated snapshots list into local usage.json cache
    let _ = save_snapshots_to_json(path, &current_snapshots);

    Ok(current_snapshots)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;

    #[test]
    fn test_claude_log_parser() {
        let temp_dir = std::env::temp_dir();
        let log_path = temp_dir.join("test_claude_usage.log");

        let mut file = fs::File::create(&log_path).unwrap();
        writeln!(file, "[2026-05-21 12:00:00] Sending prompt to Claude...").unwrap();
        writeln!(file, "[2026-05-21 12:00:01] Received response. usage: {{ \"input_tokens\": 1500, \"output_tokens\": 450 }}").unwrap();
        writeln!(file, "[2026-05-21 12:05:00] Another call. input_tokens: 300, output_tokens: 150, tokens: 450").unwrap();
        drop(file);

        let path_str = log_path.to_string_lossy().to_string();
        let client = create_client();
        let result = fetch_claude_usage(
            &client,
            &Some(path_str),
            &Some("Local Plan".to_string()),
            &None,
        );

        assert!(result.is_ok());
        let snapshot = result.unwrap();
        assert_eq!(snapshot.provider, "claude");
        assert!(snapshot.used > 0.0);

        let _ = fs::remove_file(log_path);
    }
}
