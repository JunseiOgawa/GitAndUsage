use crate::ai_quota::types::{
    ProviderId, ProviderQuota, QuotaSource, QuotaReliability, QuotaWindow, QuotaWindowId, QuotaUnit
};
use crate::ai_quota::util::command::resolve_cli_path;
use crate::ai_quota::util::paths::{get_codex_paths, find_existing_file};
use crate::ai_quota::util::redact::redact_secret;
use chrono::{Utc, TimeZone};
use std::fs;
use std::path::{Path, PathBuf};

fn scan_dir_recursive(dir: &Path, files: &mut Vec<PathBuf>) {
    if dir.is_dir() {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    scan_dir_recursive(&path, files);
                } else if path.is_file() {
                    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                        if ext == "json" || ext == "jsonl" {
                            files.push(path);
                        }
                    }
                }
            }
        }
    }
}

pub fn get_codex_quota() -> ProviderQuota {
    let cli_installed = resolve_cli_path("codex").is_some();
    let paths = get_codex_paths();

    let mut logged_in = false;
    let mut account_label = None;
    let mut windows = Vec::new();
    let mut source = QuotaSource::Unavailable;
    let mut reliability = QuotaReliability::Low;
    let mut warning: Option<String> = None;
    let error: Option<String> = None;

    let auth_file = find_existing_file(&paths, "auth.json");
    let config_file = find_existing_file(&paths, "config.toml");

    // Auth verification
    if auth_file.is_some() || config_file.is_some() {
        logged_in = true;
        source = QuotaSource::LocalFile;
        reliability = QuotaReliability::Medium;

        if let Some(ref path) = auth_file {
            if let Ok(content) = fs::read_to_string(path) {
                let redacted = redact_secret(&content);
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&redacted) {
                    if let Some(email) = json.get("email").and_then(|v| v.as_str()) {
                        account_label = Some(email.to_string());
                    } else if let Some(username) = json.get("username").and_then(|v| v.as_str()) {
                        account_label = Some(username.to_string());
                    }
                }
            }
        }

        if account_label.is_none() {
            if let Some(ref path) = config_file {
                if let Ok(content) = fs::read_to_string(path) {
                    if let Ok(toml_val) = toml::from_str::<toml::Value>(&content) {
                        if let Some(email) = toml_val.get("email").and_then(|v| v.as_str()) {
                            account_label = Some(email.to_string());
                        } else if let Some(auth) = toml_val.get("auth") {
                            if let Some(email) = auth.get("email").and_then(|v| v.as_str()) {
                                account_label = Some(email.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    if cli_installed {
        if source == QuotaSource::Unavailable {
            source = QuotaSource::Cli;
        }
    }

    // CLI is installed but login cannot be confirmed
    if cli_installed && !logged_in {
        warning = Some("CLI installed, but login status not confirmed".to_string());
        return ProviderQuota {
            provider: ProviderId::Codex,
            display_name: "Codex CLI".to_string(),
            cli_installed,
            logged_in: false,
            account_label: None,
            windows: vec![],
            source,
            reliability,
            updated_at: Utc::now().to_rfc3339(),
            warning: warning.map(|w| redact_secret(&w)),
            error: error.map(|e| redact_secret(&e)),
        };
    }

    // Scan sessions and history files recursively for rate limit events
    let mut primary_used_percent: Option<f64> = None;
    let mut primary_reset_at: Option<String> = None;
    
    let mut secondary_used_percent: Option<f64> = None;
    let mut secondary_reset_at: Option<String> = None;

    let mut credit_balance: Option<f64> = None;
    let mut rate_limits_found = false;

    // Helper to extract limits from a JSON value
    let mut extract_rate_limits = |json: &serde_json::Value| {
        let mut found = false;
        
        let rate_limits_opt = json.get("rate_limits")
            .or_else(|| json.get("payload").and_then(|p| p.get("rate_limits")));

        if let Some(limits) = rate_limits_opt {
            if let Some(primary) = limits.get("primary") {
                if let Some(used) = primary.get("used_percent").and_then(|v| v.as_f64()) {
                    primary_used_percent = Some(used);
                    found = true;
                }
                if let Some(reset) = primary.get("resets_at").and_then(|v| v.as_i64()) {
                    let dt = Utc.timestamp_opt(reset, 0).single();
                    primary_reset_at = dt.map(|d| d.to_rfc3339());
                }
            }
            if let Some(secondary) = limits.get("secondary") {
                if let Some(used) = secondary.get("used_percent").and_then(|v| v.as_f64()) {
                    secondary_used_percent = Some(used);
                    found = true;
                }
                if let Some(reset) = secondary.get("resets_at").and_then(|v| v.as_i64()) {
                    let dt = Utc.timestamp_opt(reset, 0).single();
                    secondary_reset_at = dt.map(|d| d.to_rfc3339());
                }
            }
            if let Some(credits) = limits.get("credits").and_then(|v| v.as_f64()) {
                credit_balance = Some(credits);
            }
        }
        
        if let Some(credits) = json.get("credits").and_then(|v| v.as_f64()) {
            credit_balance = Some(credits);
        }
        
        found
    };

    if logged_in {
        let mut files_to_scan = Vec::new();
        for config_dir in &paths {
            scan_dir_recursive(&config_dir.join("sessions"), &mut files_to_scan);
            scan_dir_recursive(&config_dir.join("history"), &mut files_to_scan);
        }

        for path in files_to_scan {
            if let Ok(content) = fs::read_to_string(&path) {
                for line in content.lines() {
                    if line.contains("rate_limits") || line.contains("used_percent") {
                        let redacted_line = redact_secret(line);
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&redacted_line) {
                            if extract_rate_limits(&json) {
                                rate_limits_found = true;
                                reliability = QuotaReliability::High;
                            }
                        }
                    }
                }
            }
        }
    }

    if logged_in {
        if rate_limits_found && (primary_used_percent.is_some() || secondary_used_percent.is_some()) {
            if let Some(u_pri) = primary_used_percent {
                windows.push(QuotaWindow {
                    id: QuotaWindowId::Primary,
                    label: "Primary (5h)".to_string(),
                    remaining_percent: Some((100.0 - u_pri).clamp(0.0, 100.0)),
                    remaining_value: None,
                    total_value: None,
                    unit: QuotaUnit::Percent,
                    reset_at: primary_reset_at,
                });
            }
            if let Some(u_sec) = secondary_used_percent {
                windows.push(QuotaWindow {
                    id: QuotaWindowId::Secondary,
                    label: "Secondary (Weekly)".to_string(),
                    remaining_percent: Some((100.0 - u_sec).clamp(0.0, 100.0)),
                    remaining_value: None,
                    total_value: None,
                    unit: QuotaUnit::Percent,
                    reset_at: secondary_reset_at,
                });
            }
            if let Some(credits) = credit_balance {
                windows.push(QuotaWindow {
                    id: QuotaWindowId::Credits,
                    label: "Credits".to_string(),
                    remaining_percent: None,
                    remaining_value: Some(credits),
                    total_value: None,
                    unit: QuotaUnit::Credits,
                    reset_at: None,
                });
            }
        } else {
            warning = Some("Codex logged in, quota unavailable".to_string());
        }
    }

    ProviderQuota {
        provider: ProviderId::Codex,
        display_name: "Codex CLI".to_string(),
        cli_installed,
        logged_in,
        account_label,
        windows,
        source,
        reliability,
        updated_at: Utc::now().to_rfc3339(),
        warning: warning.map(|w| redact_secret(&w)),
        error: error.map(|e| redact_secret(&e)),
    }
}
