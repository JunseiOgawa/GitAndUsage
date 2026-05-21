use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub repo_path: String,
    pub height_ratio: f64,
    pub usage_json_path: String,
    pub enabled_providers: Vec<String>,
    pub codex_token: Option<String>,
    pub copilot_pat: Option<String>,
    pub claude_key: Option<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        let repo_path = std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .to_string_lossy()
            .to_string();
        Self {
            repo_path,
            height_ratio: 0.20,
            usage_json_path: "./usage.json".to_string(),
            enabled_providers: vec![
                "codex".to_string(),
                "copilot".to_string(),
                "claude".to_string(),
            ],
            codex_token: None,
            copilot_pat: None,
            claude_key: None,
        }
    }
}

fn get_config_path() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|parent| parent.to_path_buf()))
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
        .join("config.toml")
}

#[tauri::command]
pub fn get_app_config() -> Result<AppConfig, String> {
    let config_path = get_config_path();
    if config_path.exists() {
        let contents = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read config file: {}", e))?;
        let config: AppConfig = toml::from_str(&contents)
            .map_err(|e| format!("Failed to parse config file: {}", e))?;
        Ok(config)
    } else {
        let default_config = AppConfig::default();
        let toml_str = toml::to_string_pretty(&default_config)
            .map_err(|e| format!("Failed to serialize default config: {}", e))?;
        fs::write(&config_path, toml_str)
            .map_err(|e| format!("Failed to write default config: {}", e))?;
        Ok(default_config)
    }
}

#[tauri::command]
pub fn save_app_config(config: AppConfig) -> Result<(), String> {
    let config_path = get_config_path();
    let toml_str = toml::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    fs::write(&config_path, toml_str)
        .map_err(|e| format!("Failed to write config: {}", e))?;
    Ok(())
}
