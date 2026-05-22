use crate::ai_quota::types::{
    ProviderId, ProviderQuota, QuotaSource, QuotaReliability, QuotaWindow, QuotaWindowId, QuotaUnit
};
use crate::ai_quota::util::command::{resolve_cli_path, run_command_with_timeout};
use crate::ai_quota::util::paths::{get_opencode_paths, find_existing_file};
use crate::ai_quota::util::redact::redact_secret;
use chrono::Utc;
use std::env;
use std::fs;
use std::time::Duration;

pub fn get_opencode_quota() -> ProviderQuota {
    let opencode_path = resolve_cli_path("opencode");
    let quota_path = resolve_cli_path("opencode-quota");

    let cli_installed = opencode_path.is_some();
    let quota_cli_installed = quota_path.is_some();
    let paths = get_opencode_paths();

    let mut logged_in = false;
    let mut account_label = None;
    let mut windows = Vec::new();
    let mut source = QuotaSource::Unavailable;
    let mut reliability = QuotaReliability::Low;
    let mut warning: Option<String> = None;
    let error: Option<String> = None;

    // Check environment variables for OpenCode Go
    let go_workspace = env::var("OPENCODE_GO_WORKSPACE_ID").ok().filter(|s| !s.trim().is_empty());
    let go_cookie = env::var("OPENCODE_GO_AUTH_COOKIE").ok().filter(|s| !s.trim().is_empty());

    if go_workspace.is_some() || go_cookie.is_some() {
        logged_in = true;
        source = QuotaSource::LocalFile;
    }

    // Check local files auth.json / config.json / opencode.json
    let auth_file = find_existing_file(&paths, "auth.json");
    let config_file = find_existing_file(&paths, "config.json");
    let opencode_json = find_existing_file(&paths, "opencode.json");

    if auth_file.is_some() || config_file.is_some() || opencode_json.is_some() {
        logged_in = true;
        source = QuotaSource::LocalFile;
        reliability = QuotaReliability::Medium;

        if let Some(ref path) = auth_file {
            if let Ok(content) = fs::read_to_string(path) {
                let redacted = redact_secret(&content);
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&redacted) {
                    if let Some(user) = json.get("user").or_else(|| json.get("email")).and_then(|v| v.as_str()) {
                        account_label = Some(user.to_string());
                    }
                }
            }
        }
    }

    // Try executing CLI to verify login status and get account details
    if let Some(ref path) = opencode_path {
        match run_command_with_timeout(path, &["auth", "list"], Duration::from_secs(3)) {
            Ok(out) => {
                let clean = redact_secret(&out);
                if !clean.contains("No active accounts") && !clean.trim().is_empty() {
                    logged_in = true;
                    source = QuotaSource::Cli;
                    reliability = QuotaReliability::High;

                    // Parse first active account line if possible
                    for line in clean.lines() {
                        if line.contains("*") || line.contains("active") {
                            let parts: Vec<&str> = line.split_whitespace().collect();
                            if parts.len() > 1 {
                                account_label = Some(parts[1].to_string());
                            }
                        }
                    }
                }
            }
            Err(_) => {}
        }
    }

    if cli_installed || quota_cli_installed {
        if source == QuotaSource::Unavailable {
            source = QuotaSource::Cli;
        }
    }

    // CLI is installed but login cannot be confirmed
    if (cli_installed || quota_cli_installed) && !logged_in {
        warning = Some("CLI installed, but login status not confirmed".to_string());
        return ProviderQuota {
            provider: ProviderId::Opencode,
            display_name: "OpenCode".to_string(),
            cli_installed: cli_installed || quota_cli_installed,
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

    // Setup standard sub-providers list
    let sub_providers = vec![
        ("go", "OpenCode Go"),
        ("copilot", "Copilot (OpenCode)"),
        ("openai", "OpenAI (OpenCode)"),
        ("anthropic", "Anthropic (OpenCode)"),
    ];

    let mut quota_parsed = false;
    
    // Only query quota if logged_in and opencode-quota command exists
    if logged_in {
        if let Some(ref path) = quota_path {
            match run_command_with_timeout(path, &["show", "--json"], Duration::from_secs(4)) {
                Ok(json_out) => {
                    let clean = redact_secret(&json_out);
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&clean) {
                        for (id, label) in &sub_providers {
                            if let Some(prov_quota) = json.get(id) {
                                let mut rem_pct = None;
                                if let Some(used) = prov_quota.get("used_percent").and_then(|v| v.as_f64()) {
                                    rem_pct = Some((100.0 - used).clamp(0.0, 100.0));
                                } else if let Some(rem) = prov_quota.get("remaining_percent").and_then(|v| v.as_f64()) {
                                    rem_pct = Some(rem);
                                }

                                if rem_pct.is_some() || prov_quota.get("remaining_value").is_some() {
                                    windows.push(QuotaWindow {
                                        id: QuotaWindowId::Unknown,
                                        label: label.to_string(),
                                        remaining_percent: rem_pct,
                                        remaining_value: prov_quota.get("remaining_value").and_then(|v| v.as_f64()),
                                        total_value: prov_quota.get("total_value").and_then(|v| v.as_f64()),
                                        unit: QuotaUnit::Percent,
                                        reset_at: prov_quota.get("resets_at").or_else(|| prov_quota.get("reset_at")).and_then(|v| v.as_str()).map(|s| s.to_string()),
                                    });
                                }
                            }
                        }
                        if !windows.is_empty() {
                            quota_parsed = true;
                            source = QuotaSource::OpencodeQuota;
                            reliability = QuotaReliability::High;
                        }
                    }
                }
                Err(_) => {
                    // Do not expose CLI execute failure to the final error field as required
                }
            }
        }
    }

    if logged_in && !quota_parsed {
        warning = Some("OpenCode logged in, quota unavailable".to_string());
    }

    ProviderQuota {
        provider: ProviderId::Opencode,
        display_name: "OpenCode".to_string(),
        cli_installed: cli_installed || quota_cli_installed,
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
