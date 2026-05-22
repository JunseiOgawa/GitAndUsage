pub mod types;
pub mod util {
    pub mod command;
    pub mod paths;
    pub mod redact;
}
pub mod providers {
    pub mod claude;
    pub mod codex;
    pub mod copilot;
    pub mod opencode;
}
pub mod cache;

use types::{ProviderQuota, ProviderAuthStatus};
use std::thread;

#[tauri::command]
pub async fn get_all_ai_quotas() -> Result<Vec<ProviderQuota>, String> {
    // Attempt to load from cache first if it exists and is fresh (e.g. less than 10 seconds old)
    // Actually, we can fetch in parallel to ensure real-time accuracy while maintaining speed
    let handle_claude = thread::spawn(|| providers::claude::get_claude_quota());
    let handle_codex = thread::spawn(|| providers::codex::get_codex_quota());
    let handle_copilot = thread::spawn(|| providers::copilot::get_copilot_quota());
    let handle_opencode = thread::spawn(|| providers::opencode::get_opencode_quota());

    let claude = handle_claude.join().map_err(|_| "Claude thread panicked".to_string())?;
    let codex = handle_codex.join().map_err(|_| "Codex thread panicked".to_string())?;
    let copilot = handle_copilot.join().map_err(|_| "Copilot thread panicked".to_string())?;
    let opencode = handle_opencode.join().map_err(|_| "OpenCode thread panicked".to_string())?;

    let quotas = vec![claude, codex, copilot, opencode];

    // Save to cache
    cache::save_quotas_to_cache(&quotas, None);

    Ok(quotas)
}

#[tauri::command]
pub async fn refresh_ai_quota(provider: String) -> Result<ProviderQuota, String> {
    let fresh_quota = match provider.to_lowercase().as_str() {
        "claude" => providers::claude::get_claude_quota(),
        "codex" => providers::codex::get_codex_quota(),
        "copilot" => providers::copilot::get_copilot_quota(),
        "opencode" => providers::opencode::get_opencode_quota(),
        _ => return Err(format!("Unknown provider: {}", provider)),
    };

    // Load existing cached quotas, merge the updated one, and save
    let mut cached_quotas = if let Some(cache_data) = cache::load_cached_quotas() {
        cache_data.quotas
    } else {
        Vec::new()
    };

    let target_provider = fresh_quota.provider.clone();
    if let Some(pos) = cached_quotas.iter().position(|q| q.provider == target_provider) {
        cached_quotas[pos] = fresh_quota.clone();
    } else {
        cached_quotas.push(fresh_quota.clone());
    }

    cache::save_quotas_to_cache(&cached_quotas, None);

    Ok(fresh_quota)
}

#[tauri::command]
pub async fn check_ai_provider_auth(provider: String) -> Result<ProviderAuthStatus, String> {
    let quota = match provider.to_lowercase().as_str() {
        "claude" => providers::claude::get_claude_quota(),
        "codex" => providers::codex::get_codex_quota(),
        "copilot" => providers::copilot::get_copilot_quota(),
        "opencode" => providers::opencode::get_opencode_quota(),
        _ => return Err(format!("Unknown provider: {}", provider)),
    };

    Ok(ProviderAuthStatus {
        provider: provider.clone(),
        logged_in: quota.logged_in,
        cli_installed: quota.cli_installed,
        account_label: quota.account_label,
        error: quota.error,
    })
}
