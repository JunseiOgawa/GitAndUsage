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
    pub codex_plan: Option<String>,
    pub codex_account: Option<String>,
    pub copilot_plan: Option<String>,
    pub copilot_account: Option<String>,
    pub claude_plan: Option<String>,
    pub claude_account: Option<String>,
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
            codex_plan: None,
            codex_account: None,
            copilot_plan: None,
            copilot_account: None,
            claude_plan: None,
            claude_account: None,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = AppConfig::default();
        assert_eq!(config.height_ratio, 0.20);
        assert_eq!(config.usage_json_path, "./usage.json");
        assert!(config.enabled_providers.contains(&"codex".to_string()));
        assert!(config.enabled_providers.contains(&"copilot".to_string()));
        assert!(config.enabled_providers.contains(&"claude".to_string()));
        assert!(config.codex_token.is_none());
        assert!(config.copilot_pat.is_none());
        assert!(config.claude_key.is_none());
    }

    #[test]
    fn test_toml_serialization() {
        let config = AppConfig::default();
        let toml_str = toml::to_string_pretty(&config).unwrap();
        let deserialized: AppConfig = toml::from_str(&toml_str).unwrap();
        assert_eq!(deserialized.height_ratio, config.height_ratio);
        assert_eq!(deserialized.repo_path, config.repo_path);
        assert_eq!(deserialized.usage_json_path, config.usage_json_path);
    }

    #[test]
    fn test_json_camel_case_renaming() {
        let config = AppConfig {
            repo_path: "/test/repo".to_string(),
            height_ratio: 0.15,
            usage_json_path: "/test/usage.json".to_string(),
            enabled_providers: vec!["codex".to_string()],
            codex_token: Some("token123".to_string()),
            copilot_pat: None,
            claude_key: None,
            codex_plan: Some("Plus".to_string()),
            codex_account: Some("user@domain.com".to_string()),
            copilot_plan: None,
            copilot_account: None,
            claude_plan: None,
            claude_account: None,
        };

        let json_value = serde_json::to_value(&config).unwrap();
        let json_map = json_value.as_object().unwrap();

        // Verify snake_case keys are completely absent
        assert!(!json_map.contains_key("repo_path"));
        assert!(!json_map.contains_key("height_ratio"));
        assert!(!json_map.contains_key("usage_json_path"));
        assert!(!json_map.contains_key("enabled_providers"));
        assert!(!json_map.contains_key("codex_token"));
        assert!(!json_map.contains_key("codex_plan"));
        assert!(!json_map.contains_key("codex_account"));

        // Verify camelCase keys exist and match
        assert_eq!(json_map.get("repoPath").unwrap().as_str().unwrap(), "/test/repo");
        assert_eq!(json_map.get("heightRatio").unwrap().as_f64().unwrap(), 0.15);
        assert_eq!(json_map.get("usageJsonPath").unwrap().as_str().unwrap(), "/test/usage.json");
        assert_eq!(json_map.get("codexToken").unwrap().as_str().unwrap(), "token123");
        assert_eq!(json_map.get("codexPlan").unwrap().as_str().unwrap(), "Plus");
        assert_eq!(json_map.get("codexAccount").unwrap().as_str().unwrap(), "user@domain.com");
    }
}
