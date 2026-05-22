use super::types::UsageSnapshot;
use crate::ai_quota::providers::codex::get_codex_quota;
use crate::ai_quota::types::{QuotaWindowId};
use chrono::Utc;
use reqwest::blocking::Client; // Maintained for signature compatibility

pub fn fetch_codex_usage(
    _client: &Client,
    _token: &Option<String>,
    plan: &Option<String>,
    account: &Option<String>,
) -> Result<UsageSnapshot, String> {
    let quota = get_codex_quota();

    // CLI not installed or not logged in -> fallback to Offline / Not Configured representation
    if !quota.cli_installed || !quota.logged_in {
        return Ok(UsageSnapshot {
            provider: "codex".to_string(),
            display_name: "Codex".to_string(),
            account_label: account.clone().unwrap_or_else(|| "Not Configured".to_string()),
            plan_label: plan.clone().unwrap_or_else(|| "Pro Plan".to_string()),
            used: 0.0,
            limit: 0.0,
            unit: "messages".to_string(),
            status: "unknown".to_string(),
            last_updated_at: Utc::now().to_rfc3339(),
        });
    }

    let account_label = quota.account_label
        .clone()
        .or_else(|| account.clone())
        .unwrap_or_else(|| "Active Account".to_string());
        
    let plan_label = plan.clone().unwrap_or_else(|| "Pro Plan".to_string());

    // Locate primary rate limit window first, then credits, then secondary
    if let Some(primary) = quota.windows.iter().find(|w| w.id == QuotaWindowId::Primary) {
        let remaining = primary.remaining_percent.unwrap_or(100.0);
        let used = (100.0 - remaining).clamp(0.0, 100.0);
        let limit = 100.0;
        let status = if used >= 90.0 {
            "danger".to_string()
        } else if used >= 70.0 {
            "warning".to_string()
        } else {
            "ok".to_string()
        };

        return Ok(UsageSnapshot {
            provider: "codex".to_string(),
            display_name: "Codex".to_string(),
            account_label,
            plan_label,
            used,
            limit,
            unit: "%".to_string(),
            status,
            last_updated_at: Utc::now().to_rfc3339(),
        });
    }

    if let Some(credits) = quota.windows.iter().find(|w| w.id == QuotaWindowId::Credits) {
        let used = credits.remaining_value.unwrap_or(0.0);
        return Ok(UsageSnapshot {
            provider: "codex".to_string(),
            display_name: "Codex".to_string(),
            account_label,
            plan_label,
            used,
            limit: 0.0,
            unit: "credits".to_string(),
            status: "ok".to_string(),
            last_updated_at: Utc::now().to_rfc3339(),
        });
    }

    if let Some(secondary) = quota.windows.iter().find(|w| w.id == QuotaWindowId::Secondary) {
        let remaining = secondary.remaining_percent.unwrap_or(100.0);
        let used = (100.0 - remaining).clamp(0.0, 100.0);
        let limit = 100.0;
        let status = if used >= 90.0 {
            "danger".to_string()
        } else if used >= 70.0 {
            "warning".to_string()
        } else {
            "ok".to_string()
        };

        return Ok(UsageSnapshot {
            provider: "codex".to_string(),
            display_name: "Codex".to_string(),
            account_label,
            plan_label,
            used,
            limit,
            unit: "%".to_string(),
            status,
            last_updated_at: Utc::now().to_rfc3339(),
        });
    }

    // Default safe fallback if logged in but windows are empty
    Ok(UsageSnapshot {
        provider: "codex".to_string(),
        display_name: "Codex".to_string(),
        account_label,
        plan_label,
        used: 0.0,
        limit: 0.0,
        unit: "active".to_string(),
        status: "ok".to_string(),
        last_updated_at: Utc::now().to_rfc3339(),
    })
}
