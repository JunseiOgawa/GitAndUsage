use crate::ai_quota::types::{
    ProviderId, ProviderQuota, QuotaReliability, QuotaSource, QuotaWindow,
};
use crate::ai_quota::util::command::{resolve_cli_path, run_command_with_timeout};
use crate::ai_quota::util::paths::{find_existing_file, get_copilot_paths};
use crate::ai_quota::util::redact::redact_secret;
use chrono::Utc;
use std::env;
use std::fs;
use std::time::Duration;

pub trait CopilotQuotaAdapter {
    fn fetch_quota(&self) -> Result<Vec<QuotaWindow>, String>;
}

pub struct NotImplementedAdapter;

impl CopilotQuotaAdapter for NotImplementedAdapter {
    fn fetch_quota(&self) -> Result<Vec<QuotaWindow>, String> {
        Ok(vec![])
    }
}

pub fn get_copilot_quota() -> ProviderQuota {
    let copilot_path = resolve_cli_path("copilot");
    let gh_path = resolve_cli_path("gh");

    let cli_installed = copilot_path.is_some();
    let gh_installed = gh_path.is_some();
    let paths = get_copilot_paths();

    let mut logged_in = false;
    let mut account_label = None;
    let mut source = QuotaSource::Unavailable;
    let mut reliability = QuotaReliability::Low;
    let mut warning: Option<String> = None;
    let mut error: Option<String> = None;

    // Search for tokens in env
    let mut token = env::var("COPILOT_GITHUB_TOKEN")
        .or_else(|_| env::var("GH_TOKEN"))
        .or_else(|_| env::var("GITHUB_TOKEN"))
        .ok()
        .filter(|t| !t.trim().is_empty());

    // Search ~/.copilot/config.json
    let config_file = find_existing_file(&paths, "config.json");
    if let Some(ref path) = config_file {
        if let Ok(content) = fs::read_to_string(path) {
            let redacted = redact_secret(&content);
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&redacted) {
                if token.is_none() {
                    token = json
                        .get("token")
                        .or_else(|| json.get("github_token"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                }
                if let Some(user) = json
                    .get("user")
                    .or_else(|| json.get("username"))
                    .and_then(|v| v.as_str())
                {
                    account_label = Some(user.to_string());
                }
            }
        }
    }

    if token.is_some() {
        logged_in = true;
        source = QuotaSource::LocalFile;
        reliability = QuotaReliability::Medium;
    }

    // Try gh auth fallback if still not sure or if we can query details
    if let Some(ref path) = gh_path {
        if !logged_in {
            match run_command_with_timeout(path, &["auth", "token"], Duration::from_secs(3)) {
                Ok(out) => {
                    let gh_token = out.trim().to_string();
                    if !gh_token.is_empty() {
                        logged_in = true;
                        source = QuotaSource::CliAuth;
                        reliability = QuotaReliability::Medium;
                    }
                }
                Err(_) => {}
            }
        }
    }

    if logged_in && account_label.is_none() {
        if let Some(ref path) = gh_path {
            // Query gh auth status to get the user name
            if let Ok(status_out) =
                run_command_with_timeout(path, &["auth", "status"], Duration::from_secs(3))
            {
                let clean = redact_secret(&status_out);
                for line in clean.lines() {
                    if line.contains("Logged in to") && line.contains("as") {
                        if let Some(pos) = line.find("as ") {
                            let user = line[pos + 3..]
                                .trim()
                                .split_whitespace()
                                .next()
                                .unwrap_or("")
                                .to_string();
                            if !user.is_empty() {
                                account_label = Some(user);
                            }
                        }
                    }
                }
            }
        }
    }

    if cli_installed || gh_installed {
        if source == QuotaSource::Unavailable {
            source = QuotaSource::Cli;
        }
    }

    // CLI is installed but login status not confirmed
    if (cli_installed || gh_installed) && !logged_in {
        warning = Some("CLI installed, but login status not confirmed".to_string());
        return ProviderQuota {
            provider: ProviderId::Copilot,
            display_name: "GitHub Copilot".to_string(),
            cli_installed: cli_installed || gh_installed,
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

    // Fetch quota using adapter
    let adapter = NotImplementedAdapter;
    let windows = match adapter.fetch_quota() {
        Ok(w) => w,
        Err(e) => {
            error = Some(redact_secret(&e));
            vec![]
        }
    };

    if logged_in && windows.is_empty() {
        warning = Some("Copilot logged in, quota unavailable".to_string());
    }

    ProviderQuota {
        provider: ProviderId::Copilot,
        display_name: "GitHub Copilot".to_string(),
        cli_installed: cli_installed || gh_installed,
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
