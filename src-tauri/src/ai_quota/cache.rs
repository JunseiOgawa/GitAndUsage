use crate::ai_quota::types::ProviderQuota;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use chrono::Utc;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QuotaCacheData {
    pub quotas: Vec<ProviderQuota>,
    pub updated_at: String,
    pub last_success_at: Option<String>,
    pub last_error: Option<String>,
}

pub fn get_cache_path() -> PathBuf {
    if let Some(config_dir) = dirs::config_dir() {
        let app_dir = config_dir.join("tauri-app");
        if !app_dir.exists() {
            let _ = fs::create_dir_all(&app_dir);
        }
        app_dir.join("ai-quota-cache.json")
    } else {
        // Fallback to executable directory
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|parent| parent.to_path_buf()))
            .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
            .join("ai-quota-cache.json")
    }
}

pub fn load_cached_quotas() -> Option<QuotaCacheData> {
    let path = get_cache_path();
    if path.exists() {
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(data) = serde_json::from_str::<QuotaCacheData>(&content) {
                return Some(data);
            }
        }
    }
    None
}

pub fn save_quotas_to_cache(quotas: &[ProviderQuota], error_msg: Option<String>) {
    let path = get_cache_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let mut last_success = None;
    if error_msg.is_none() {
        last_success = Some(Utc::now().to_rfc3339());
    } else if let Some(cached) = load_cached_quotas() {
        last_success = cached.last_success_at;
    }

    let cache_data = QuotaCacheData {
        quotas: quotas.to_vec(),
        updated_at: Utc::now().to_rfc3339(),
        last_success_at: last_success,
        last_error: error_msg,
    };

    if let Ok(serialized) = serde_json::to_string_pretty(&cache_data) {
        let _ = fs::write(path, serialized);
    }
}
