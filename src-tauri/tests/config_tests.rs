use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tauri_app_lib::config::{get_app_config, save_app_config, AppConfig};

// A global mutex to ensure that tests running in parallel do not conflict
// when reading/writing to the shared `config.toml` file in the target directory.
fn get_test_mutex() -> &'static Mutex<()> {
    static MUTEX: OnceLock<Mutex<()>> = OnceLock::new();
    MUTEX.get_or_init(|| Mutex::new(()))
}

// Duplicates the private get_config_path logic from config.rs
fn get_test_config_path() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|parent| parent.to_path_buf()))
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
        .join("config.toml")
}

// RAII Guard that acquires the test mutex, backs up any existing config.toml
// using the tempfile crate, and restores it upon completion.
struct TestGuard {
    _lock: std::sync::MutexGuard<'static, ()>,
    config_path: PathBuf,
    backup_dir: Option<tempfile::TempDir>,
    backup_path: Option<PathBuf>,
}

impl TestGuard {
    fn new() -> Self {
        let lock = get_test_mutex().lock().unwrap();
        let config_path = get_test_config_path();

        let mut backup_dir = None;
        let mut backup_path = None;

        // If a config.toml already exists, back it up to a temporary directory
        if config_path.exists() {
            let dir = tempfile::tempdir().expect("Failed to create temp backup directory");
            let b_path = dir.path().join("config.toml.bak");
            
            if config_path.is_dir() {
                // If it is somehow a directory, move or remove it
                fs::rename(&config_path, &b_path).ok();
            } else {
                fs::copy(&config_path, &b_path).expect("Failed to backup config.toml");
                fs::remove_file(&config_path).expect("Failed to remove original config.toml for test setup");
            }
            
            backup_dir = Some(dir);
            backup_path = Some(b_path);
        }

        Self {
            _lock: lock,
            config_path,
            backup_dir,
            backup_path,
        }
    }
}

impl Drop for TestGuard {
    fn drop(&mut self) {
        // Remove whatever the test left behind (file or directory)
        if self.config_path.exists() {
            if self.config_path.is_dir() {
                fs::remove_dir_all(&self.config_path).ok();
            } else {
                fs::remove_file(&self.config_path).ok();
            }
        }

        // Restore original backup if it existed
        if let (Some(_), Some(b_path)) = (&self.backup_dir, &self.backup_path) {
            fs::copy(b_path, &self.config_path).expect("Failed to restore original config.toml");
        }
    }
}

#[test]
fn test_normal_read_write_flow() {
    let guard = TestGuard::new();

    // Ensure we start with no config file
    assert!(!guard.config_path.exists());

    // 1. Calling get_app_config should return the default config and write it to config.toml
    let initial_config = get_app_config().expect("Failed to get initial config");
    assert!(guard.config_path.exists());

    // 2. Verify config fields match default values
    let default_config = AppConfig::default();
    assert_eq!(initial_config.height_ratio, default_config.height_ratio);
    assert_eq!(initial_config.repo_path, default_config.repo_path);
    assert_eq!(initial_config.usage_json_path, default_config.usage_json_path);
    assert_eq!(initial_config.enabled_providers, default_config.enabled_providers);
    assert_eq!(initial_config.accent_color, default_config.accent_color);
    assert_eq!(initial_config.window_opacity, default_config.window_opacity);
    assert_eq!(initial_config.dock_position, default_config.dock_position);
    assert_eq!(initial_config.controller_width, default_config.controller_width);
    assert_eq!(initial_config.controller_height, default_config.controller_height);

    // 3. Modify the configuration and save it
    let mut modified_config = initial_config.clone();
    modified_config.repo_path = "/custom/repo/path".to_string();
    modified_config.height_ratio = 0.45;
    modified_config.usage_json_path = "./custom_usage.json".to_string();
    modified_config.enabled_providers = vec!["claude".to_string()];
    modified_config.usage_only = true;
    modified_config.accent_color = Some("#ff0000".to_string());
    modified_config.window_opacity = Some(80);
    modified_config.dock_position = Some("left".to_string());
    modified_config.controller_width = Some(400);
    modified_config.controller_height = Some(120);

    save_app_config(modified_config.clone()).expect("Failed to save app config");

    // 4. Retrieve config again and verify all values were persisted correctly
    let retrieved_config = get_app_config().expect("Failed to get config after saving");
    assert_eq!(retrieved_config.repo_path, "/custom/repo/path");
    assert_eq!(retrieved_config.height_ratio, 0.45);
    assert_eq!(retrieved_config.usage_json_path, "./custom_usage.json");
    assert_eq!(retrieved_config.enabled_providers, vec!["claude".to_string()]);
    assert!(retrieved_config.usage_only);
    assert_eq!(retrieved_config.accent_color, Some("#ff0000".to_string()));
    assert_eq!(retrieved_config.window_opacity, Some(80));
    assert_eq!(retrieved_config.dock_position, Some("left".to_string()));
    assert_eq!(retrieved_config.controller_width, Some(400));
    assert_eq!(retrieved_config.controller_height, Some(120));
}

#[test]
fn test_credential_obfuscation_normal() {
    let guard = TestGuard::new();

    // 1. Create a config with raw/plain credential keys
    let mut config = AppConfig::default();
    let plain_codex = "codex_secret_token_123";
    let plain_copilot = "copilot_pat_token_456";
    let plain_claude = "claude_api_key_789";

    config.codex_token = Some(plain_codex.to_string());
    config.copilot_pat = Some(plain_copilot.to_string());
    config.claude_key = Some(plain_claude.to_string());

    // 2. Save the config (which should transparently obfuscate the keys)
    save_app_config(config).expect("Failed to save config with credentials");

    // 3. Verify that the saved config.toml has obfuscated keys starting with "enc:"
    let toml_content = fs::read_to_string(&guard.config_path).expect("Failed to read saved TOML file");
    let parsed_toml: toml::Value = toml::from_str(&toml_content).expect("Failed to parse saved TOML content");

    let codex_saved = parsed_toml.get("codexToken").and_then(|v| v.as_str()).expect("Missing codexToken");
    let copilot_saved = parsed_toml.get("copilotPat").and_then(|v| v.as_str()).expect("Missing copilotPat");
    let claude_saved = parsed_toml.get("claudeKey").and_then(|v| v.as_str()).expect("Missing claudeKey");

    assert!(codex_saved.starts_with("enc:"));
    assert!(copilot_saved.starts_with("enc:"));
    assert!(claude_saved.starts_with("enc:"));

    assert_ne!(codex_saved, plain_codex);
    assert_ne!(copilot_saved, plain_copilot);
    assert_ne!(claude_saved, plain_claude);

    // 4. Retrieve the config via get_app_config and verify they are transparently deobfuscated
    let loaded_config = get_app_config().expect("Failed to load config");
    assert_eq!(loaded_config.codex_token.as_deref(), Some(plain_codex));
    assert_eq!(loaded_config.copilot_pat.as_deref(), Some(plain_copilot));
    assert_eq!(loaded_config.claude_key.as_deref(), Some(plain_claude));
}

#[test]
fn test_credential_obfuscation_edge_cases() {
    let guard = TestGuard::new();

    // -- Test Case 1: Empty and whitespace strings --
    // Empty/whitespace strings should NOT be obfuscated, keeping their raw state.
    let mut config = AppConfig::default();
    config.codex_token = Some("".to_string());
    config.copilot_pat = Some("   ".to_string());
    config.claude_key = None;

    save_app_config(config).expect("Failed to save edge-case config");

    let toml_content = fs::read_to_string(&guard.config_path).expect("Failed to read TOML");
    let parsed_toml: toml::Value = toml::from_str(&toml_content).expect("Failed to parse TOML");

    let codex_saved = parsed_toml.get("codexToken").and_then(|v| v.as_str()).expect("Missing codexToken");
    let copilot_saved = parsed_toml.get("copilotPat").and_then(|v| v.as_str()).expect("Missing copilotPat");
    assert!(parsed_toml.get("claudeKey").is_none());

    // Empty and whitespace should not be converted to enc:... because they are empty/whitespace
    assert_eq!(codex_saved, "");
    assert_eq!(copilot_saved, "   ");

    let loaded = get_app_config().expect("Failed to load config");
    assert_eq!(loaded.codex_token.as_deref(), Some(""));
    assert_eq!(loaded.copilot_pat.as_deref(), Some("   "));
    assert_eq!(loaded.claude_key, None);

    // -- Test Case 2: Very long credential key --
    // Verify that key XORing works with exceptionally long strings without overflow or errors.
    let mut config = AppConfig::default();
    let very_long_key = "a".repeat(4000);
    config.codex_token = Some(very_long_key.clone());

    save_app_config(config).expect("Failed to save long key config");

    let loaded = get_app_config().expect("Failed to load long key config");
    assert_eq!(loaded.codex_token.as_deref(), Some(very_long_key.as_str()));

    // -- Test Case 3: Unicode credentials --
    // Verify that credentials with multi-byte characters are safely obfuscated/deobfuscated.
    let mut config = AppConfig::default();
    let unicode_key = "🔑secret_한글_🚀";
    config.codex_token = Some(unicode_key.to_string());

    save_app_config(config).expect("Failed to save unicode key config");

    let loaded = get_app_config().expect("Failed to load unicode key config");
    assert_eq!(loaded.codex_token.as_deref(), Some(unicode_key));

    // -- Test Case 4: Raw strings with "enc:" prefix --
    // If a key already contains "enc:", save_app_config will obfuscate the entire string (including "enc:").
    // Reading it back will deobfuscate it exactly back to the "enc:..." value.
    let mut config = AppConfig::default();
    let raw_enc_prefixed = "enc:already_prefixed_raw_value";
    config.codex_token = Some(raw_enc_prefixed.to_string());

    save_app_config(config).expect("Failed to save pre-prefixed config");

    let toml_content = fs::read_to_string(&guard.config_path).expect("Failed to read TOML");
    let parsed_toml: toml::Value = toml::from_str(&toml_content).expect("Failed to parse TOML");
    let codex_saved = parsed_toml.get("codexToken").and_then(|v| v.as_str()).expect("Missing codexToken");
    
    // It should be double-encrypted (meaning it's obfuscated as a whole, starting with enc:)
    assert!(codex_saved.starts_with("enc:"));
    assert_ne!(codex_saved, raw_enc_prefixed);

    let loaded = get_app_config().expect("Failed to load pre-prefixed config");
    assert_eq!(loaded.codex_token.as_deref(), Some(raw_enc_prefixed));

    // -- Test Case 5: Malformed "enc:" value directly in the configuration file --
    // If someone manually edits the configuration file with a malformed enc: prefix (e.g. odd length hex),
    // get_app_config should return None for that field instead of crashing.
    let mut malformed_toml = AppConfig::default();
    let toml_str = toml::to_string_pretty(&malformed_toml).expect("Failed to serialize default TOML");
    let mut parsed: toml::Value = toml::from_str(&toml_str).expect("Failed to parse");
    
    // Set a malformed value (odd length hex string: 3 chars)
    if let Some(table) = parsed.as_table_mut() {
        table.insert("codexToken".to_string(), toml::Value::String("enc:123".to_string()));
    }
    let malformed_toml_str = toml::to_string(&parsed).expect("Failed to serialize malformed TOML");
    fs::write(&guard.config_path, malformed_toml_str).expect("Failed to write malformed TOML to config path");

    let loaded = get_app_config().expect("Failed to load malformed config");
    // Since "enc:123" is malformed (odd number of hex digits), it should be deobfuscated to None
    assert!(loaded.codex_token.is_none());
}

#[test]
fn test_unexpected_invalid_paths_robustness() {
    let guard = TestGuard::new();

    // Create a directory at the expected file path location to block file-based read/writes
    fs::create_dir(&guard.config_path).expect("Failed to create blocking directory");

    // 1. Reading should fail robustly and return a descriptive error
    let read_result = get_app_config();
    assert!(read_result.is_err());
    let err_msg = read_result.err().unwrap();
    assert!(
        err_msg.contains("Failed to read config file") || err_msg.contains("Failed to write default config"),
        "Unexpected error message: {}", err_msg
    );

    // 2. Writing should fail robustly and return a descriptive error
    let write_result = save_app_config(AppConfig::default());
    assert!(write_result.is_err());
    let err_msg = write_result.err().unwrap();
    assert!(
        err_msg.contains("Failed to write config"),
        "Unexpected error message: {}", err_msg
    );

    // 3. Clean up the blocking directory and verify standard behavior resumes
    fs::remove_dir(&guard.config_path).expect("Failed to remove blocking directory");
    let ok_config = get_app_config().expect("Should succeed now that directory is removed");
    assert!(guard.config_path.exists());
    assert_eq!(ok_config.height_ratio, 0.20);
}
