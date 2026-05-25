use super::types::UsageSnapshot;
use chrono::Utc;
use reqwest::blocking::Client;
use serde::Deserialize;
use std::fs;
use std::path::Path;

pub fn fetch_claude_usage(
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
                    let cost_url = format!(
                        "https://api.anthropic.com/v1/organizations/{}/cost_report",
                        org_id
                    );
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
                                    plan_label: plan
                                        .clone()
                                        .unwrap_or_else(|| "Pro Plan".to_string()),
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
        return Err(format!(
            "Anthropic API returned status: {}",
            response.status()
        ));
    } else {
        // Treat input as a Log File Path (Premium Dynamic Log Parser)
        let path = Path::new(key_val);
        if path.exists() {
            let contents =
                fs::read_to_string(path).map_err(|e| format!("Failed to read log file: {}", e))?;

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
                        for word in
                            line.split(|c: char| !c.is_ascii_alphanumeric() && c != '.' && c != '_')
                        {
                            if let Ok(val) = word.parse::<f64>() {
                                if val > 0.0 && val < 1000000.0 {
                                    if line.contains("input")
                                        || line.contains("output")
                                        || line.contains("prompt")
                                    {
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
