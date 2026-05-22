use crate::ai_quota::types::{
    ProviderId, ProviderQuota, QuotaSource, QuotaReliability, QuotaWindow, QuotaWindowId, QuotaUnit
};
use crate::ai_quota::util::command::{resolve_cli_path, run_command_with_timeout};
use crate::ai_quota::util::paths::{get_claude_paths, find_existing_file};
use crate::ai_quota::util::redact::redact_secret;
use chrono::Utc;
use std::fs;
use std::time::Duration;

pub fn get_claude_quota() -> ProviderQuota {
    let cli_path = resolve_cli_path("claude");
    let cli_installed = cli_path.is_some();
    let paths = get_claude_paths();
    
    let mut logged_in = false;
    let mut account_label = None;
    let mut windows = Vec::new();
    let mut source = QuotaSource::Unavailable;
    let mut reliability = QuotaReliability::Low;
    let mut warning = None;
    let mut error = None;

    // Check credentials file first as a local indicator of auth
    let credentials_file = find_existing_file(&paths, ".credentials.json");

    if credentials_file.is_some() {
        logged_in = true;
        source = QuotaSource::LocalFile;
        reliability = QuotaReliability::Medium;

        // Try to parse email/account from credentials
        if let Some(ref path) = credentials_file {
            if let Ok(content) = fs::read_to_string(path) {
                let redacted = redact_secret(&content);
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&redacted) {
                    if let Some(email) = json.get("email").and_then(|v| v.as_str()) {
                        account_label = Some(email.to_string());
                    } else if let Some(account) = json.get("account").and_then(|v| v.as_str()) {
                        account_label = Some(account.to_string());
                    }
                }
            }
        }
    }

    // Try to query CLI if installed for auth confirmation
    if let Some(ref path) = cli_path {
        match run_command_with_timeout(path, &["auth", "status"], Duration::from_secs(4)) {
            Ok(output) => {
                let clean_output = redact_secret(&output);
                if clean_output.contains("Logged in") || clean_output.contains("Active") {
                    logged_in = true;
                    source = QuotaSource::Cli;
                    reliability = QuotaReliability::High;
                    
                    // Parse email (e.g. "Logged in as user@domain.com")
                    for line in clean_output.lines() {
                        if line.contains("as ") {
                            if let Some(pos) = line.find("as ") {
                                let email = line[pos + 3..].trim().to_string();
                                if !email.is_empty() {
                                    account_label = Some(email);
                                }
                            }
                        }
                    }
                } else if clean_output.contains("Not logged in") {
                    logged_in = false;
                }
            }
            Err(err) => {
                let clean_err = redact_secret(&err);
                if credentials_file.is_some() {
                    warning = Some(format!("CLI status check failed, using local files: {}", clean_err));
                } else {
                    error = Some(clean_err);
                }
            }
        }
    }

    // CLI is installed but we could not confirm login status or found not logged in
    if cli_installed && !logged_in {
        warning = Some("CLI installed, but login status not confirmed".to_string());
        return ProviderQuota {
            provider: ProviderId::Claude,
            display_name: "Claude Code".to_string(),
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

    // If logged in, search cache file for quota information
    let mut five_hour_percent = None;
    let mut seven_day_percent = None;
    let mut five_hour_reset = None;
    let mut seven_day_reset = None;
    let mut cache_found = false;

    if logged_in {
        let mut cache_candidates = Vec::new();
        if let Some(home) = dirs::home_dir() {
            cache_candidates.push(home.join(".ai-usage-monitor").join("claude-quota.json"));
            cache_candidates.push(home.join(".claude").join("quota.json"));
        }

        for path in cache_candidates {
            if path.exists() && path.is_file() {
                if let Ok(content) = fs::read_to_string(&path) {
                    let redacted = redact_secret(&content);
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&redacted) {
                        five_hour_percent = json.get("fiveHourRemainingPercent").and_then(|v| v.as_f64());
                        seven_day_percent = json.get("sevenDayRemainingPercent").and_then(|v| v.as_f64());
                        five_hour_reset = json.get("fiveHourResetAt").and_then(|v| v.as_str()).map(|s| s.to_string());
                        seven_day_reset = json.get("sevenDayResetAt").and_then(|v| v.as_str()).map(|s| s.to_string());
                        cache_found = true;
                        source = QuotaSource::Statusline;
                        reliability = QuotaReliability::High;
                        break;
                    }
                }
            }
        }
    }

    if logged_in {
        if cache_found && (five_hour_percent.is_some() || seven_day_percent.is_some()) {
            if let Some(pct5) = five_hour_percent {
                windows.push(QuotaWindow {
                    id: QuotaWindowId::Window5h,
                    label: "5-Hour Limit".to_string(),
                    remaining_percent: Some(pct5),
                    remaining_value: None,
                    total_value: None,
                    unit: QuotaUnit::Percent,
                    reset_at: five_hour_reset,
                });
            }
            if let Some(pct7) = seven_day_percent {
                windows.push(QuotaWindow {
                    id: QuotaWindowId::Window7d,
                    label: "7-Day Limit".to_string(),
                    remaining_percent: Some(pct7),
                    remaining_value: None,
                    total_value: None,
                    unit: QuotaUnit::Percent,
                    reset_at: seven_day_reset,
                });
            }
        } else {
            // Remainder not found
            warning = Some("Logged in, quota unavailable".to_string());
        }
    }

    ProviderQuota {
        provider: ProviderId::Claude,
        display_name: "Claude Code".to_string(),
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
