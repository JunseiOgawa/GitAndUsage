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
    #[serde(default)]
    pub usage_only: bool,
    pub accent_color: Option<String>,
    pub window_opacity: Option<u32>,
    pub dock_position: Option<String>,
    /// Dock position for normal (non-coin) window mode.
    /// Independent from dock_position which controls coin/usage-only mode.
    pub normal_dock_position: Option<String>,
    pub controller_width: Option<u32>,
    pub controller_height: Option<u32>,
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
            usage_only: false,
            accent_color: Some("#6366f1".to_string()),
            window_opacity: Some(90),
            dock_position: Some("right".to_string()),
            normal_dock_position: Some("floating".to_string()),
            controller_width: Some(380),
            controller_height: Some(96),
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

fn obfuscate(plain: &str) -> String {
    let key = b"GitAndUsageSecureKey123";
    let xor_bytes: Vec<u8> = plain.bytes()
        .enumerate()
        .map(|(i, b)| b ^ key[i % key.len()])
        .collect();
    let hex_str: String = xor_bytes.iter().map(|b| format!("{:02x}", b)).collect();
    format!("enc:{}", hex_str)
}

fn deobfuscate(cipher: &str) -> Option<String> {
    if !cipher.starts_with("enc:") {
        return Some(cipher.to_string());
    }
    let data = &cipher[4..];
    if data.len() % 2 != 0 {
        return None;
    }
    let mut decoded = Vec::new();
    for i in (0..data.len()).step_by(2) {
        if i + 2 > data.len() {
            return None;
        }
        let byte_str = &data[i..i+2];
        let byte = u8::from_str_radix(byte_str, 16).ok()?;
        decoded.push(byte);
    }
    let key = b"GitAndUsageSecureKey123";
    let plain_bytes: Vec<u8> = decoded.iter()
        .enumerate()
        .map(|(i, &b)| b ^ key[i % key.len()])
        .collect();
    String::from_utf8(plain_bytes).ok()
}

#[tauri::command]
pub fn get_app_config() -> Result<AppConfig, String> {
    let config_path = get_config_path();
    if config_path.exists() {
        let contents = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read config file: {}", e))?;
        let mut config: AppConfig = toml::from_str(&contents)
            .map_err(|e| format!("Failed to parse config file: {}", e))?;
        
        // Transparently deobfuscate credentials
        if let Some(ref t) = config.codex_token {
            config.codex_token = deobfuscate(t);
        }
        if let Some(ref t) = config.copilot_pat {
            config.copilot_pat = deobfuscate(t);
        }
        if let Some(ref t) = config.claude_key {
            config.claude_key = deobfuscate(t);
        }
        
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
pub fn save_app_config(mut config: AppConfig) -> Result<(), String> {
    // Transparently obfuscate credentials before saving
    if let Some(ref t) = config.codex_token {
        if !t.trim().is_empty() {
            config.codex_token = Some(obfuscate(t));
        }
    }
    if let Some(ref t) = config.copilot_pat {
        if !t.trim().is_empty() {
            config.copilot_pat = Some(obfuscate(t));
        }
    }
    if let Some(ref t) = config.claude_key {
        if !t.trim().is_empty() {
            config.claude_key = Some(obfuscate(t));
        }
    }

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
    fn test_obfuscation_deobfuscation() {
        let plain = "ghp_mySuperSecretGitHubPat12345";
        let encrypted = obfuscate(plain);
        assert!(encrypted.starts_with("enc:"));
        
        let decrypted = deobfuscate(&encrypted).unwrap();
        assert_eq!(plain, decrypted);

        // Plain text tokens (no enc: prefix) should remain untouched
        let untouched = deobfuscate(plain).unwrap();
        assert_eq!(plain, untouched);
    }

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
        assert!(!config.usage_only);
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
            usage_only: true,
            accent_color: Some("#6366f1".to_string()),
            window_opacity: Some(90),
            dock_position: Some("right".to_string()),
            normal_dock_position: Some("floating".to_string()),
            controller_width: Some(380),
            controller_height: Some(96),
        };

        let json_value = serde_json::to_value(&config).unwrap();
        let json_map = json_value.as_object().unwrap();

        // Verify snake_case keys are completely absent
        assert!(!json_map.contains_key("repo_path"));
        assert!(!json_map.contains_key("height_ratio"));
        assert!(!json_map.contains_key("usage_json_path"));
        assert!(!json_map.contains_key("enabled_providers"));
        assert!(!json_map.contains_key("codex_token"));
        assert!(!json_map.contains_key("usage_only"));
        assert!(!json_map.contains_key("accent_color"));
        assert!(!json_map.contains_key("window_opacity"));
        assert!(!json_map.contains_key("dock_position"));
        assert!(!json_map.contains_key("normal_dock_position"));
        assert!(!json_map.contains_key("controller_width"));
        assert!(!json_map.contains_key("controller_height"));
 
        // Verify camelCase keys exist and match
        assert_eq!(json_map.get("repoPath").unwrap().as_str().unwrap(), "/test/repo");
        assert_eq!(json_map.get("heightRatio").unwrap().as_f64().unwrap(), 0.15);
        assert_eq!(json_map.get("usageJsonPath").unwrap().as_str().unwrap(), "/test/usage.json");
        assert_eq!(json_map.get("codexToken").unwrap().as_str().unwrap(), "token123");
        assert_eq!(json_map.get("accentColor").unwrap().as_str().unwrap(), "#6366f1");
        assert_eq!(json_map.get("windowOpacity").unwrap().as_u64().unwrap(), 90);
        assert_eq!(json_map.get("usageOnly").unwrap().as_bool().unwrap(), true);
        assert_eq!(json_map.get("dockPosition").unwrap().as_str().unwrap(), "right");
        assert_eq!(json_map.get("normalDockPosition").unwrap().as_str().unwrap(), "floating");
        assert_eq!(json_map.get("controllerWidth").unwrap().as_u64().unwrap(), 380);
        assert_eq!(json_map.get("controllerHeight").unwrap().as_u64().unwrap(), 96);
    }

    // =========================================================================
    // Dock分離テスト: CoinモードとNormalモードが互いに干渉しないことを検証
    // =========================================================================

    /// デフォルト設定では dock_position と normal_dock_position が異なる初期値を持つ
    #[test]
    fn test_default_dock_positions_are_independent() {
        let config = AppConfig::default();
        assert_eq!(config.dock_position.as_deref(), Some("right"));
        assert_eq!(config.normal_dock_position.as_deref(), Some("floating"));
        assert_ne!(config.dock_position, config.normal_dock_position);
    }

    /// Coinモードの dock_position を変更しても normal_dock_position は変わらない
    #[test]
    fn test_changing_coin_dock_does_not_affect_normal_dock() {
        let mut config = AppConfig::default();
        let original_normal = config.normal_dock_position.clone();
        config.dock_position = Some("left".to_string());
        assert_eq!(config.dock_position.as_deref(), Some("left"));
        assert_eq!(config.normal_dock_position, original_normal,
            "normal_dock_position must NOT be modified when coin dock changes");
    }

    /// 通常モードの normal_dock_position を変更しても dock_position は変わらない
    #[test]
    fn test_changing_normal_dock_does_not_affect_coin_dock() {
        let mut config = AppConfig::default();
        let original_coin = config.dock_position.clone();
        config.normal_dock_position = Some("top".to_string());
        assert_eq!(config.normal_dock_position.as_deref(), Some("top"));
        assert_eq!(config.dock_position, original_coin,
            "dock_position must NOT be modified when normal dock changes");
    }

    /// 両方のDock設定を同時に独立した値に設定できる
    #[test]
    fn test_both_dock_positions_can_hold_different_values() {
        let config = AppConfig {
            repo_path: ".".to_string(),
            height_ratio: 0.20,
            usage_json_path: "./usage.json".to_string(),
            enabled_providers: vec![],
            codex_token: None,
            copilot_pat: None,
            claude_key: None,
            usage_only: false,
            accent_color: None,
            window_opacity: None,
            dock_position: Some("bottom".to_string()),
            normal_dock_position: Some("right".to_string()),
            controller_width: None,
            controller_height: None,
        };
        assert_eq!(config.dock_position.as_deref(), Some("bottom"));
        assert_eq!(config.normal_dock_position.as_deref(), Some("right"));
        assert_ne!(config.dock_position, config.normal_dock_position);
    }

    /// TOML往復シリアライズで両フィールドが独立して保存・復元される
    #[test]
    fn test_toml_round_trip_preserves_dock_independence() {
        let original = AppConfig {
            repo_path: "/test".to_string(),
            height_ratio: 0.20,
            usage_json_path: "./usage.json".to_string(),
            enabled_providers: vec!["codex".to_string()],
            codex_token: None,
            copilot_pat: None,
            claude_key: None,
            usage_only: true,
            accent_color: Some("#6366f1".to_string()),
            window_opacity: Some(90),
            dock_position: Some("left".to_string()),
            normal_dock_position: Some("bottom".to_string()),
            controller_width: Some(380),
            controller_height: Some(96),
        };
        let toml_str = toml::to_string_pretty(&original).unwrap();
        let restored: AppConfig = toml::from_str(&toml_str).unwrap();
        assert_eq!(restored.dock_position.as_deref(), Some("left"),
            "coin dock_position must be preserved after TOML round-trip");
        assert_eq!(restored.normal_dock_position.as_deref(), Some("bottom"),
            "normal_dock_position must be preserved after TOML round-trip");
        assert_ne!(restored.dock_position, restored.normal_dock_position);
    }

    /// JSON往復で両フィールドが camelCase キーとして独立して存在する
    #[test]
    fn test_json_round_trip_preserves_dock_independence() {
        let original = AppConfig {
            repo_path: "/test".to_string(),
            height_ratio: 0.20,
            usage_json_path: "./usage.json".to_string(),
            enabled_providers: vec![],
            codex_token: None,
            copilot_pat: None,
            claude_key: None,
            usage_only: false,
            accent_color: None,
            window_opacity: None,
            dock_position: Some("top".to_string()),
            normal_dock_position: Some("left".to_string()),
            controller_width: None,
            controller_height: None,
        };
        let json_str = serde_json::to_string(&original).unwrap();
        let restored: AppConfig = serde_json::from_str(&json_str).unwrap();
        assert_eq!(restored.dock_position.as_deref(), Some("top"));
        assert_eq!(restored.normal_dock_position.as_deref(), Some("left"));
    }

    /// normal_dock_position のない古い設定ファイルを読んでも panic しない
    #[test]
    fn test_missing_normal_dock_position_falls_back_to_none() {
        let toml_without_normal_dock = r#"
            repoPath = "/repo"
            heightRatio = 0.2
            usageJsonPath = "./usage.json"
            enabledProviders = ["codex"]
            usageOnly = false
            dockPosition = "right"
        "#;
        let config: AppConfig = toml::from_str(toml_without_normal_dock).unwrap();
        assert!(config.normal_dock_position.is_none(),
            "Old config without normal_dock_position must deserialize to None gracefully");
        assert_eq!(config.dock_position.as_deref(), Some("right"));
    }

    /// usage_only フラグ変更は dock フィールドに影響しない
    #[test]
    fn test_usage_only_toggle_does_not_change_dock_fields() {
        let mut config = AppConfig::default();
        config.dock_position = Some("left".to_string());
        config.normal_dock_position = Some("top".to_string());
        config.usage_only = true;
        assert_eq!(config.dock_position.as_deref(), Some("left"));
        assert_eq!(config.normal_dock_position.as_deref(), Some("top"));
        config.usage_only = false;
        assert_eq!(config.dock_position.as_deref(), Some("left"));
        assert_eq!(config.normal_dock_position.as_deref(), Some("top"));
    }

    // =========================================================================
    // DockLogic ユニットテスト: ウィンドウサイズ計算の純粋関数テスト
    // =========================================================================

    fn calc_normal_dock_size(
        dock: &str, monitor_w: u32, monitor_h: u32,
        height_ratio: f64, ctrl_w: f64, ctrl_h: f64, scale: f64,
    ) -> (u32, u32) {
        let height = (monitor_h as f64 * height_ratio) as u32;
        match dock {
            "left" | "right" => ((ctrl_w * scale) as u32, monitor_h),
            "top" | "bottom" => (monitor_w, (ctrl_h * scale) as u32),
            _ => (monitor_w, height), // floating
        }
    }

    fn calc_coin_dock_size(
        dock: &str, monitor_w: u32, monitor_h: u32,
        height_ratio: f64, ctrl_w: f64, ctrl_h: f64, scale: f64,
    ) -> (u32, u32) {
        let height = (monitor_h as f64 * height_ratio) as u32;
        match dock {
            "left" | "right" | "floating" => ((ctrl_w * scale) as u32, height),
            "top" | "bottom" => (monitor_w, (ctrl_h * scale) as u32),
            _ => (monitor_w, height),
        }
    }

    #[test]
    fn test_normal_dock_left_produces_narrow_window() {
        let (w, h) = calc_normal_dock_size("left", 2560, 1440, 0.20, 380.0, 96.0, 1.0);
        assert_eq!(w, 380, "normal left: width must equal controllerWidth");
        assert_eq!(h, 1440, "normal left: height must fill the monitor work area");
    }

    #[test]
    fn test_normal_dock_right_produces_narrow_window() {
        let (w, h) = calc_normal_dock_size("right", 2560, 1440, 0.20, 380.0, 96.0, 1.0);
        assert_eq!(w, 380);
        assert_eq!(h, 1440);
    }

    #[test]
    fn test_normal_dock_top_produces_wide_bar() {
        let (w, h) = calc_normal_dock_size("top", 2560, 1440, 0.20, 380.0, 96.0, 1.0);
        assert_eq!(w, 2560, "normal top: width must be full monitor width");
        assert_eq!(h, 96, "normal top: height must equal controllerHeight");
    }

    #[test]
    fn test_normal_dock_bottom_produces_wide_bar() {
        let (w, h) = calc_normal_dock_size("bottom", 2560, 1440, 0.20, 380.0, 96.0, 1.0);
        assert_eq!(w, 2560);
        assert_eq!(h, 96);
    }

    #[test]
    fn test_normal_dock_floating_produces_fullwidth() {
        let (w, h) = calc_normal_dock_size("floating", 2560, 1440, 0.20, 380.0, 96.0, 1.0);
        assert_eq!(w, 2560, "normal floating: width must be full monitor width");
        assert_eq!(h, 288);
    }

    #[test]
    fn test_coin_and_normal_dock_sizes_are_computed_independently() {
        let (mw, mh) = (2560u32, 1440u32);
        let (ratio, cw, ch, scale) = (0.20f64, 380.0f64, 96.0f64, 1.0f64);
        let coin_size = calc_coin_dock_size("bottom", mw, mh, ratio, cw, ch, scale);
        let normal_size = calc_normal_dock_size("right", mw, mh, ratio, cw, ch, scale);
        assert_ne!(coin_size, normal_size,
            "Coin and normal mode sizes must be computed independently");
        assert_eq!(coin_size.0, 2560, "coin bottom must be full width");
        assert_eq!(normal_size.0, 380, "normal right must be controllerWidth");
    }

    #[test]
    fn test_dock_size_scales_with_hidpi() {
        let (mw, mh) = (2560u32, 1440u32);
        let (ratio, cw, ch) = (0.20f64, 380.0f64, 96.0f64);
        let scale = 2.0f64;
        let (w, _) = calc_normal_dock_size("left", mw, mh, ratio, cw, ch, scale);
        assert_eq!(w, 760, "HiDPI scale=2: physical width must double");
        let (coin_w, _) = calc_coin_dock_size("right", mw, mh, ratio, cw, ch, scale);
        assert_eq!(coin_w, 760, "coin HiDPI scale=2: physical width must double");
    }
}