use crate::ai_quota::types::{
    ProviderId, ProviderQuota, QuotaReliability, QuotaSource, QuotaUnit, QuotaWindow, QuotaWindowId,
};
use crate::ai_quota::util::command::resolve_cli_path;
use crate::ai_quota::util::paths::{find_existing_file, get_codex_paths};
use crate::ai_quota::util::redact::redact_secret;
use chrono::{TimeZone, Utc};
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

pub fn get_codex_quota() -> ProviderQuota {
    let cli_path_opt = resolve_cli_path("codex");
    let cli_installed = cli_path_opt.is_some();
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

    // Auth verification using local cache
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

    // If CLI not installed or path not found
    let cli_path = match cli_path_opt {
        Some(path) => path,
        None => {
            return ProviderQuota {
                provider: ProviderId::Codex,
                display_name: "Codex CLI".to_string(),
                cli_installed: false,
                logged_in,
                account_label,
                windows,
                source,
                reliability,
                updated_at: Utc::now().to_rfc3339(),
                warning: Some("Codex CLI not installed".to_string()),
                error,
            };
        }
    };

    let mut primary_used_percent: Option<f64> = None;
    let mut primary_reset_at: Option<String> = None;
    let mut secondary_used_percent: Option<f64> = None;
    let mut secondary_reset_at: Option<String> = None;
    let mut credit_balance: Option<f64> = None;
    let mut rate_limits_found = false;

    // Spawn codex app-server
    let spawn_res = Command::new(&cli_path)
        .arg("app-server")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn();

    match spawn_res {
        Ok(mut child) => {
            let mut stdin = child.stdin.take().unwrap();
            let stdout = child.stdout.take().unwrap();

            let (tx, rx) = mpsc::channel();
            thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    if let Ok(l) = line {
                        if tx.send(l).is_err() {
                            break;
                        }
                    } else {
                        break;
                    }
                }
            });

            // Step 1: Initialize
            let init_msg = r#"{"method":"initialize","id":1,"params":{"clientInfo":{"name":"git-and-usage","title":"GitAndUsage","version":"0.1.0"}}}"#;
            let mut initialized = false;

            if writeln!(stdin, "{}", init_msg).is_ok() && stdin.flush().is_ok() {
                let start_time = std::time::Instant::now();
                let timeout = Duration::from_millis(1500);

                while start_time.elapsed() < timeout {
                    let remaining = timeout
                        .checked_sub(start_time.elapsed())
                        .unwrap_or(Duration::ZERO);
                    match rx.recv_timeout(remaining) {
                        Ok(line) => {
                            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                                if json.get("id").and_then(|id| id.as_i64()) == Some(1) {
                                    initialized = true;
                                    break;
                                }
                            }
                        }
                        Err(_) => break,
                    }
                }
            }

            // Step 2: Read Rate Limits
            if initialized {
                let rate_limits_msg = r#"{"method":"account/rateLimits/read","id":2}"#;
                if writeln!(stdin, "{}", rate_limits_msg).is_ok() && stdin.flush().is_ok() {
                    let start_time = std::time::Instant::now();
                    let timeout = Duration::from_millis(1500);

                    while start_time.elapsed() < timeout {
                        let remaining = timeout
                            .checked_sub(start_time.elapsed())
                            .unwrap_or(Duration::ZERO);
                        match rx.recv_timeout(remaining) {
                            Ok(line) => {
                                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                                    if json.get("id").and_then(|id| id.as_i64()) == Some(2) {
                                        let rate_limits_opt = json
                                            .get("rateLimits")
                                            .or_else(|| {
                                                json.get("result").and_then(|r| r.get("rateLimits"))
                                            })
                                            .or_else(|| json.get("result"));

                                        if let Some(limits) = rate_limits_opt {
                                            if let Some(primary) = limits.get("primary") {
                                                if let Some(used) = primary
                                                    .get("usedPercent")
                                                    .and_then(|v| v.as_f64())
                                                {
                                                    primary_used_percent = Some(used);
                                                    rate_limits_found = true;
                                                }
                                                if let Some(reset) =
                                                    primary.get("resetsAt").and_then(|v| v.as_i64())
                                                {
                                                    let dt = Utc.timestamp_opt(reset, 0).single();
                                                    primary_reset_at = dt.map(|d| d.to_rfc3339());
                                                }
                                            }
                                            if let Some(secondary) = limits.get("secondary") {
                                                if let Some(used) = secondary
                                                    .get("usedPercent")
                                                    .and_then(|v| v.as_f64())
                                                {
                                                    secondary_used_percent = Some(used);
                                                    rate_limits_found = true;
                                                }
                                                if let Some(reset) = secondary
                                                    .get("resetsAt")
                                                    .and_then(|v| v.as_i64())
                                                {
                                                    let dt = Utc.timestamp_opt(reset, 0).single();
                                                    secondary_reset_at = dt.map(|d| d.to_rfc3339());
                                                }
                                            }
                                            if let Some(credits) =
                                                limits.get("credits").and_then(|v| v.as_f64())
                                            {
                                                credit_balance = Some(credits);
                                            }
                                        }
                                        break;
                                    }
                                }
                            }
                            Err(_) => break,
                        }
                    }
                }
            }

            let _ = child.kill();
            let _ = child.wait();
        }
        Err(e) => {
            warning = Some(format!("Failed to spawn codex app-server: {}", e));
        }
    }

    if rate_limits_found {
        logged_in = true;
        source = QuotaSource::Cli;
        reliability = QuotaReliability::High;

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
        if logged_in {
            warning = Some("Codex logged in, quota unavailable via app-server".to_string());
        } else {
            warning =
                Some("Codex CLI is installed but not logged in or cannot fetch quota".to_string());
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
