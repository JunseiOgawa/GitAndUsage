use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use chrono::{Datelike, Utc};
use reqwest::blocking::Client;
use crate::config::get_app_config;

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

fn create_client() -> Client {
    Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .unwrap_or_default()
}

// GitHub Copilot Telemetry API Integration
fn fetch_copilot_usage(
    client: &Client,
    pat: &Option<String>,
    plan: &Option<String>,
    account: &Option<String>,
) -> Result<UsageSnapshot, String> {
    let is_configured = pat.is_some() && !pat.as_ref().unwrap().is_empty();
    if !is_configured {
        return Ok(UsageSnapshot {
            provider: "copilot".to_string(),
            display_name: "GitHub Copilot".to_string(),
            account_label: "Not Configured".to_string(),
            plan_label: plan.clone().unwrap_or_else(|| "Individual".to_string()),
            used: 0.0,
            limit: 0.0,
            unit: "requests".to_string(),
            status: "unknown".to_string(),
            last_updated_at: Utc::now().to_rfc3339(),
        });
    }

    let pat_val = pat.as_ref().unwrap();
    let has_org = account.is_some() && !account.as_ref().unwrap().is_empty();
    let is_org_plan = plan
        .as_ref()
        .map(|p| p.to_lowercase() == "business" || p.to_lowercase() == "enterprise")
        .unwrap_or(false);

    if has_org && is_org_plan {
        // Business or Enterprise quota (Org Billing API)
        let org = account.as_ref().unwrap();
        let url = format!("https://api.github.com/orgs/{}/copilot/billing", org);
        let response = client
            .get(&url)
            .header("Authorization", format!("Bearer {}", pat_val))
            .header("User-Agent", "Tauri-TopBar-Monitor")
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .send()
            .map_err(|e| format!("HTTP request failed: {}", e))?;

        let status = response.status();
        if status.is_success() {
            #[derive(Deserialize)]
            struct SeatBreakdown {
                total: Option<i32>,
                active_this_cycle: Option<i32>,
            }
            #[derive(Deserialize)]
            struct BillingResponse {
                seat_breakdown: Option<SeatBreakdown>,
            }

            let billing: BillingResponse = response
                .json()
                .map_err(|e| format!("Failed to parse JSON: {}", e))?;

            if let Some(sb) = billing.seat_breakdown {
                let total = sb.total.unwrap_or(0) as f64;
                let active = sb.active_this_cycle.unwrap_or(0) as f64;
                let status_str = if active >= total * 0.9 {
                    "danger".to_string()
                } else if active >= total * 0.7 {
                    "warning".to_string()
                } else {
                    "ok".to_string()
                };

                return Ok(UsageSnapshot {
                    provider: "copilot".to_string(),
                    display_name: "GitHub Copilot".to_string(),
                    account_label: org.clone(),
                    plan_label: plan.clone().unwrap_or_else(|| "Enterprise".to_string()),
                    used: active,
                    limit: total,
                    unit: "seats".to_string(),
                    status: status_str,
                    last_updated_at: Utc::now().to_rfc3339(),
                });
            }
        }
        return Err(format!("Copilot Org API returned status: {}", status));
    } else {
        // Individual Plan verification
        let url = "https://api.github.com/user/copilot/billing";
        let response = client
            .get(url)
            .header("Authorization", format!("Bearer {}", pat_val))
            .header("User-Agent", "Tauri-TopBar-Monitor")
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .send()
            .map_err(|e| format!("HTTP request failed: {}", e))?;

        if response.status().is_success() {
            return Ok(UsageSnapshot {
                provider: "copilot".to_string(),
                display_name: "GitHub Copilot".to_string(),
                account_label: account.clone().unwrap_or_default(),
                plan_label: "Individual".to_string(),
                used: 1.0,
                limit: 0.0, // No limit displayed
                unit: "active".to_string(),
                status: "ok".to_string(),
                last_updated_at: Utc::now().to_rfc3339(),
            });
        }
        return Err(format!("Copilot User API returned status: {}", response.status()));
    }
}

// OpenAI / Codex API Integration
fn fetch_codex_usage(
    client: &Client,
    token: &Option<String>,
    plan: &Option<String>,
    account: &Option<String>,
) -> Result<UsageSnapshot, String> {
    let is_configured = token.is_some() && !token.as_ref().unwrap().is_empty();
    if !is_configured {
        return Ok(UsageSnapshot {
            provider: "codex".to_string(),
            display_name: "Codex".to_string(),
            account_label: "Not Configured".to_string(),
            plan_label: plan.clone().unwrap_or_else(|| "Pro Plan".to_string()),
            used: 0.0,
            limit: 0.0,
            unit: "messages".to_string(),
            status: "unknown".to_string(),
            last_updated_at: Utc::now().to_rfc3339(),
        });
    }

    let token_val = token.as_ref().unwrap();

    if token_val.starts_with("sk-") {
        // Developer API Key
        let today = Utc::now().format("%Y-%m-%d").to_string();
        let url = format!("https://api.openai.com/v1/usage?date={}", today);
        let response = client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token_val))
            .send()
            .map_err(|e| format!("HTTP request failed: {}", e))?;

        if response.status().is_success() {
            #[derive(Deserialize)]
            struct UsageItem {
                n_context_tokens_total: Option<i64>,
                n_generated_tokens_total: Option<i64>,
            }
            #[derive(Deserialize)]
            struct OpenAIUsageResponse {
                data: Option<Vec<UsageItem>>,
            }

            let usage: OpenAIUsageResponse = response
                .json()
                .map_err(|e| format!("Failed to parse OpenAI usage: {}", e))?;

            let mut total_tokens = 0.0;
            if let Some(items) = usage.data {
                for item in items {
                    let ctx = item.n_context_tokens_total.unwrap_or(0) as f64;
                    let gen = item.n_generated_tokens_total.unwrap_or(0) as f64;
                    total_tokens += ctx + gen;
                }
            }

            let used_k = total_tokens / 1000.0;
            let limit_k = 500.0; // 500k token default quota representation
            let status = if used_k >= limit_k * 0.9 {
                "danger".to_string()
            } else if used_k >= limit_k * 0.7 {
                "warning".to_string()
            } else {
                "ok".to_string()
            };

            return Ok(UsageSnapshot {
                provider: "codex".to_string(),
                display_name: "Codex".to_string(),
                account_label: account.clone().unwrap_or_default(),
                plan_label: plan.clone().unwrap_or_else(|| "API Key".to_string()),
                used: used_k,
                limit: limit_k,
                unit: "k tokens".to_string(),
                status,
                last_updated_at: Utc::now().to_rfc3339(),
            });
        }
        return Err(format!("OpenAI Usage API returned status: {}", response.status()));
    } else if token_val.starts_with("sess-") {
        // Web / Dashboard Session Token (Billing Usage)
        let url = "https://api.openai.com/dashboard/billing/subscription";
        let response = client
            .get(url)
            .header("Authorization", format!("Bearer {}", token_val))
            .send()
            .map_err(|e| format!("HTTP request failed: {}", e))?;

        let status = response.status();
        if status.is_success() {
            #[derive(Deserialize)]
            struct Subscription {
                hard_limit_usd: Option<f64>,
            }
            let sub: Subscription = response
                .json()
                .map_err(|e| format!("Failed to parse subscription: {}", e))?;

            let limit = sub.hard_limit_usd.unwrap_or(120.0);

            let now = Utc::now();
            let start_date = format!("{}-{:02}-01", now.year(), now.month());
            let end_date = now.format("%Y-%m-%d").to_string();

            let usage_url = format!(
                "https://api.openai.com/v1/dashboard/billing/usage?start_date={}&end_date={}",
                start_date, end_date
            );

            let usage_response = client
                .get(&usage_url)
                .header("Authorization", format!("Bearer {}", token_val))
                .send()
                .map_err(|e| format!("Usage HTTP request failed: {}", e))?;

            if usage_response.status().is_success() {
                #[derive(Deserialize)]
                struct BillingUsage {
                    total_usage: Option<f64>, // in cents
                }
                let bu: BillingUsage = usage_response
                    .json()
                    .map_err(|e| format!("Failed to parse usage JSON: {}", e))?;

                let used_usd = bu.total_usage.unwrap_or(0.0) / 100.0;
                let status_str = if used_usd >= limit * 0.9 {
                    "danger".to_string()
                } else if used_usd >= limit * 0.7 {
                    "warning".to_string()
                } else {
                    "ok".to_string()
                };

                return Ok(UsageSnapshot {
                    provider: "codex".to_string(),
                    display_name: "Codex".to_string(),
                    account_label: account.clone().unwrap_or_default(),
                    plan_label: plan.clone().unwrap_or_else(|| "Pro Plan".to_string()),
                    used: used_usd,
                    limit,
                    unit: "$".to_string(),
                    status: status_str,
                    last_updated_at: Utc::now().to_rfc3339(),
                });
            }
        }
        return Err(format!("OpenAI Subscription API returned status: {}", status));
    }

    // Default active representation for fallback on basic user tokens
    Ok(UsageSnapshot {
        provider: "codex".to_string(),
        display_name: "Codex".to_string(),
        account_label: account.clone().unwrap_or_default(),
        plan_label: plan.clone().unwrap_or_else(|| "Pro Plan".to_string()),
        used: 1.0,
        limit: 0.0,
        unit: "active".to_string(),
        status: "ok".to_string(),
        last_updated_at: Utc::now().to_rfc3339(),
    })
}

// Anthropic Claude API & Log Parsing Integration
fn fetch_claude_usage(
    client: &Client,
    key_or_path: &Option<String>,
    plan: &Option<String>,
    account: &Option<String>,
) -> Result<UsageSnapshot, String> {
    let is_configured = key_or_path.is_some() && !key_or_path.as_ref().unwrap().is_empty();
    if !is_configured {
        return Ok(UsageSnapshot {
            provider: "claude".to_string(),
            display_name: "Claude".to_string(),
            account_label: "Not Configured".to_string(),
            plan_label: plan.clone().unwrap_or_else(|| "Pro Plan".to_string()),
            used: 0.0,
            limit: 0.0,
            unit: "credits".to_string(),
            status: "unknown".to_string(),
            last_updated_at: Utc::now().to_rfc3339(),
        });
    }

    let key_val = key_or_path.as_ref().unwrap();

    if key_val.starts_with("sk-ant-") {
        // Anthropic Claude Official API
        let url = "https://api.anthropic.com/v1/models";
        let response = client
            .get(url)
            .header("x-api-key", key_val)
            .header("anthropic-version", "2023-06-01")
            .send()
            .map_err(|e| format!("HTTP request failed: {}", e))?;

        if response.status().is_success() {
            // Try fetching cost report if organization is present
            if let Some(org_id) = account {
                if !org_id.is_empty() {
                    let cost_url = format!("https://api.anthropic.com/v1/organizations/{}/cost_report", org_id);
                    let cost_resp = client
                        .get(&cost_url)
                        .header("x-api-key", key_val)
                        .header("anthropic-version", "2023-06-01")
                        .send();

                    if let Ok(c_resp) = cost_resp {
                        if c_resp.status().is_success() {
                            #[derive(Deserialize)]
                            struct CostReport {
                                total_cost: Option<f64>,
                            }
                            if let Ok(report) = c_resp.json::<CostReport>() {
                                let cost = report.total_cost.unwrap_or(0.0);
                                let limit = 50.0;
                                let status = if cost >= limit * 0.9 {
                                    "danger".to_string()
                                } else if cost >= limit * 0.7 {
                                    "warning".to_string()
                                } else {
                                    "ok".to_string()
                                };

                                return Ok(UsageSnapshot {
                                    provider: "claude".to_string(),
                                    display_name: "Claude".to_string(),
                                    account_label: org_id.clone(),
                                    plan_label: plan.clone().unwrap_or_else(|| "Pro Plan".to_string()),
                                    used: cost,
                                    limit,
                                    unit: "credits".to_string(),
                                    status,
                                    last_updated_at: Utc::now().to_rfc3339(),
                                });
                            }
                        }
                    }
                }
            }

            return Ok(UsageSnapshot {
                provider: "claude".to_string(),
                display_name: "Claude".to_string(),
                account_label: account.clone().unwrap_or_default(),
                plan_label: plan.clone().unwrap_or_else(|| "Pro Plan".to_string()),
                used: 1.0,
                limit: 0.0,
                unit: "active".to_string(),
                status: "ok".to_string(),
                last_updated_at: Utc::now().to_rfc3339(),
            });
        }
        return Err(format!("Anthropic API returned status: {}", response.status()));
    } else {
        // Treat input as a Log File Path (Premium Dynamic Log Parser)
        let path = Path::new(key_val);
        if path.exists() {
            let contents = fs::read_to_string(path)
                .map_err(|e| format!("Failed to read log file: {}", e))?;

            let mut total_tokens = 0.0;
            for line in contents.lines() {
                if line.contains("tokens") || line.contains("usage") {
                    if let Some(pos) = line.find("tokens\"") {
                        let sub = &line[pos..];
                        if let Some(num_start) = sub.chars().position(|c| c.is_ascii_digit()) {
                            let num_str: String = sub[num_start..]
                                .chars()
                                .take_while(|c| c.is_ascii_digit() || *c == '.')
                                .collect();
                            if let Ok(num) = num_str.parse::<f64>() {
                                total_tokens += num;
                            }
                        }
                    } else {
                        // Generic word parser scanning for number keywords
                        for word in line.split(|c: char| !c.is_ascii_alphanumeric() && c != '.' && c != '_') {
                            if let Ok(val) = word.parse::<f64>() {
                                if val > 0.0 && val < 1000000.0 {
                                    if line.contains("input") || line.contains("output") || line.contains("prompt") {
                                        total_tokens += val;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            let (used, limit, unit) = if total_tokens > 10000.0 {
                (total_tokens / 1000.0, 1000.0, "k tokens".to_string())
            } else {
                (total_tokens, 10000.0, "tokens".to_string())
            };

            let status = if used >= limit * 0.9 {
                "danger".to_string()
            } else if used >= limit * 0.7 {
                "warning".to_string()
            } else {
                "ok".to_string()
            };

            let file_name = path
                .file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_else(|| "Log File".to_string());

            return Ok(UsageSnapshot {
                provider: "claude".to_string(),
                display_name: "Claude".to_string(),
                account_label: format!("Log: {}", file_name),
                plan_label: plan.clone().unwrap_or_else(|| "Local Log".to_string()),
                used,
                limit,
                unit,
                status,
                last_updated_at: Utc::now().to_rfc3339(),
            });
        }
    }

    Err("Invalid Anthropic key format or non-existent log path".to_string())
}

#[tauri::command]
pub fn get_usage_snapshot(json_path: String) -> Result<Vec<UsageSnapshot>, String> {
    // 1. Read app configuration directly from backend storage
    let config = get_app_config().unwrap_or_default();
    let client = create_client();

    let mut current_snapshots = Vec::new();
    let path = Path::new(&json_path);

    // Load existing cached snapshots for fallback merging
    let cached_snapshots: Vec<UsageSnapshot> = if path.exists() {
        if let Ok(contents) = fs::read_to_string(path) {
            serde_json::from_str(&contents).unwrap_or_default()
        } else {
            Vec::new()
        }
    } else {
        Vec::new()
    };

    // 2. Fetch Codex (OpenAI)
    match fetch_codex_usage(&client, &config.codex_token, &config.codex_plan, &config.codex_account) {
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
                    account_label: config.codex_account.clone().unwrap_or_default(),
                    plan_label: config.codex_plan.clone().unwrap_or_else(|| "Pro Plan".to_string()),
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
    match fetch_copilot_usage(&client, &config.copilot_pat, &config.copilot_plan, &config.copilot_account) {
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
                    account_label: config.copilot_account.clone().unwrap_or_default(),
                    plan_label: config.copilot_plan.clone().unwrap_or_else(|| "Individual".to_string()),
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
    match fetch_claude_usage(&client, &config.claude_key, &config.claude_plan, &config.claude_account) {
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
                    account_label: config.claude_account.clone().unwrap_or_default(),
                    plan_label: config.claude_plan.clone().unwrap_or_else(|| "Pro Plan".to_string()),
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
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            let _ = fs::create_dir_all(parent);
        }
    }

    if let Ok(serialized) = serde_json::to_string_pretty(&current_snapshots) {
        let _ = fs::write(path, serialized);
    }

    Ok(current_snapshots)
}

#[cfg(test)]
mod tests {
    use super::*;
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

