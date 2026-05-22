use reqwest::blocking::Client;
use chrono::Utc;
use serde::Deserialize;
use super::types::UsageSnapshot;

pub fn fetch_copilot_usage(
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
