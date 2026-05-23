use std::env;
use std::fs;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tempfile::TempDir;

use tauri_app_lib::ai_quota::providers::{claude::get_claude_quota, copilot::get_copilot_quota};
use tauri_app_lib::ai_quota::types::{ProviderId, QuotaSource, QuotaReliability, QuotaWindowId, QuotaUnit};

// Thread-safe mutex to run tests sequentially, avoiding environment variable collision
fn get_test_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

struct TestContext {
    _temp_dir: TempDir,
    mock_home: PathBuf,
    mock_config: PathBuf,
    mock_data: PathBuf,
    bin_dir: PathBuf,
    original_env: HashMap<String, Option<String>>,
    _lock_guard: std::sync::MutexGuard<'static, ()>,
}

impl TestContext {
    fn new() -> Self {
        let lock_guard = get_test_lock().lock().unwrap();
        let temp_dir = tempfile::tempdir().expect("Failed to create temp dir");

        let mock_home = temp_dir.path().join("home");
        let mock_config = temp_dir.path().join("config");
        let mock_data = temp_dir.path().join("data");
        let bin_dir = temp_dir.path().join("bin");

        fs::create_dir_all(&mock_home).unwrap();
        fs::create_dir_all(&mock_config).unwrap();
        fs::create_dir_all(&mock_data).unwrap();
        fs::create_dir_all(&bin_dir).unwrap();

        // Capture original environment variables
        let env_vars = vec![
            "USERPROFILE",
            "HOME",
            "APPDATA",
            "LOCALAPPDATA",
            "CLAUDE_CONFIG_DIR",
            "CODEX_HOME",
            "OPENCODE_CONFIG_DIR",
            "OPENCODE_DATA_DIR",
            "COPILOT_GITHUB_TOKEN",
            "GH_TOKEN",
            "GITHUB_TOKEN",
            "PATH",
            "ProgramFiles",
            "ProgramFiles(x86)",
            "ProgramW6432",
        ];

        let mut original_env = HashMap::new();
        for var in env_vars {
            original_env.insert(var.to_string(), env::var(var).ok());
        }

        // Apply mocked environments pointing to isolation paths
        env::set_var("USERPROFILE", &mock_home);
        env::set_var("HOME", &mock_home);
        env::set_var("APPDATA", &mock_config);
        env::set_var("LOCALAPPDATA", &mock_data);

        // Explicit config directories for providers
        env::set_var("CLAUDE_CONFIG_DIR", mock_home.join(".claude"));
        env::set_var("CODEX_HOME", mock_home.join(".codex"));
        env::set_var("OPENCODE_CONFIG_DIR", mock_config.join("opencode"));
        env::set_var("OPENCODE_DATA_DIR", mock_data.join("opencode"));

        // Clear all token environment variables by default
        env::remove_var("COPILOT_GITHUB_TOKEN");
        env::remove_var("GH_TOKEN");
        env::remove_var("GITHUB_TOKEN");

        // Prevent leaking real system CLI locations during mocked path resolution
        env::remove_var("ProgramFiles");
        env::remove_var("ProgramFiles(x86)");
        env::remove_var("ProgramW6432");

        // Point PATH to the isolated bin folder so CLI tools are not resolved unless explicitly mocked
        env::set_var("PATH", &bin_dir);

        Self {
            _temp_dir: temp_dir,
            mock_home,
            mock_config,
            mock_data,
            bin_dir,
            original_env,
            _lock_guard: lock_guard,
        }
    }

    fn write_home_file(&self, path_parts: &[&str], content: &str) -> PathBuf {
        let mut full_path = self.mock_home.clone();
        for part in path_parts {
            full_path.push(part);
        }
        if let Some(parent) = full_path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(&full_path, content).unwrap();
        full_path
    }

    fn write_config_file(&self, path_parts: &[&str], content: &str) -> PathBuf {
        let mut full_path = self.mock_config.clone();
        for part in path_parts {
            full_path.push(part);
        }
        if let Some(parent) = full_path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(&full_path, content).unwrap();
        full_path
    }

    fn create_mock_cli(&self, name: &str, windows_content: &str, unix_content: &str) {
        #[cfg(windows)]
        {
            let file_path = self.bin_dir.join(format!("{}.cmd", name));
            fs::write(&file_path, windows_content).unwrap();
        }
        #[cfg(not(windows))]
        {
            use std::os::unix::fs::PermissionsExt;
            let file_path = self.bin_dir.join(name);
            fs::write(&file_path, unix_content).unwrap();
            let mut perms = fs::metadata(&file_path).unwrap().permissions();
            perms.set_mode(0o755);
            fs::set_permissions(&file_path, perms).unwrap();
        }
    }
}

impl Drop for TestContext {
    fn drop(&mut self) {
        // Restore original env
        for (var, val) in &self.original_env {
            if let Some(v) = val {
                env::set_var(var, v);
            } else {
                env::remove_var(var);
            }
        }
    }
}

// ==========================================
// Claude Provider Integration Tests
// ==========================================

#[test]
fn test_claude_no_cli_no_credentials() {
    let _ctx = TestContext::new();

    let quota = get_claude_quota();
    assert_eq!(quota.provider, ProviderId::Claude);
    assert_eq!(quota.cli_installed, false);
    assert_eq!(quota.logged_in, false);
    assert_eq!(quota.account_label, None);
    assert!(quota.windows.is_empty());
    assert_eq!(quota.source, QuotaSource::Unavailable);
    assert_eq!(quota.reliability, QuotaReliability::Low);
}

#[test]
fn test_claude_credentials_only_valid_email() {
    let ctx = TestContext::new();
    
    // Write a mock .credentials.json in Home Profile directory (.claude)
    ctx.write_home_file(&[".claude", ".credentials.json"], r#"{"email": "claude_user@example.com"}"#);

    let quota = get_claude_quota();
    assert_eq!(quota.cli_installed, false);
    assert_eq!(quota.logged_in, true);
    assert_eq!(quota.account_label, Some("claude_user@example.com".to_string()));
    assert_eq!(quota.source, QuotaSource::LocalFile);
    assert_eq!(quota.reliability, QuotaReliability::Medium);
}

#[test]
fn test_claude_credentials_only_valid_account() {
    let ctx = TestContext::new();
    
    // Write a mock .credentials.json in config / AppData directory (Claude)
    ctx.write_config_file(&["Claude", ".credentials.json"], r#"{"account": "claude_account@example.com"}"#);

    let quota = get_claude_quota();
    assert_eq!(quota.logged_in, true);
    assert_eq!(quota.account_label, Some("claude_account@example.com".to_string()));
}

#[test]
fn test_claude_credentials_empty() {
    let ctx = TestContext::new();
    ctx.write_home_file(&[".claude", ".credentials.json"], "");

    let quota = get_claude_quota();
    assert_eq!(quota.logged_in, true);
    assert_eq!(quota.account_label, None);
}

#[test]
fn test_claude_credentials_malformed() {
    let ctx = TestContext::new();
    ctx.write_home_file(&[".claude", ".credentials.json"], "not valid json string");

    let quota = get_claude_quota();
    assert_eq!(quota.logged_in, true);
    assert_eq!(quota.account_label, None);
}

#[test]
fn test_claude_quota_parsing_from_local_file_both_windows() {
    let ctx = TestContext::new();
    ctx.write_home_file(&[".claude", ".credentials.json"], r#"{"email": "claude_user@example.com"}"#);

    // Mock claude-quota.json inside .ai-usage-monitor
    ctx.write_home_file(
        &[".ai-usage-monitor", "claude-quota.json"],
        r#"{
            "fiveHourRemainingPercent": 85.5,
            "sevenDayRemainingPercent": 40.0,
            "fiveHourResetAt": "2026-05-23T15:00:00Z",
            "sevenDayResetAt": "2026-05-30T10:00:00Z"
        }"#
    );

    let quota = get_claude_quota();
    assert_eq!(quota.logged_in, true);
    assert_eq!(quota.source, QuotaSource::Statusline);
    assert_eq!(quota.reliability, QuotaReliability::High);
    assert_eq!(quota.windows.len(), 2);

    let win_5h = &quota.windows[0];
    assert_eq!(win_5h.id, QuotaWindowId::Window5h);
    assert_eq!(win_5h.label, "5-Hour Limit");
    assert_eq!(win_5h.remaining_percent, Some(85.5));
    assert_eq!(win_5h.unit, QuotaUnit::Percent);
    assert_eq!(win_5h.reset_at, Some("2026-05-23T15:00:00Z".to_string()));

    let win_7d = &quota.windows[1];
    assert_eq!(win_7d.id, QuotaWindowId::Window7d);
    assert_eq!(win_7d.label, "7-Day Limit");
    assert_eq!(win_7d.remaining_percent, Some(40.0));
    assert_eq!(win_7d.unit, QuotaUnit::Percent);
    assert_eq!(win_7d.reset_at, Some("2026-05-30T10:00:00Z".to_string()));
}

#[test]
fn test_claude_quota_parsing_from_local_file_only_five_hour() {
    let ctx = TestContext::new();
    ctx.write_home_file(&[".claude", ".credentials.json"], r#"{"email": "claude_user@example.com"}"#);

    // Mock quota.json inside ~/.claude/
    ctx.write_home_file(
        &[".claude", "quota.json"],
        r#"{
            "fiveHourRemainingPercent": 92.0,
            "fiveHourResetAt": "2026-05-23T16:00:00Z"
        }"#
    );

    let quota = get_claude_quota();
    assert_eq!(quota.windows.len(), 1);
    assert_eq!(quota.windows[0].id, QuotaWindowId::Window5h);
    assert_eq!(quota.windows[0].remaining_percent, Some(92.0));
    assert_eq!(quota.windows[0].reset_at, Some("2026-05-23T16:00:00Z".to_string()));
}

#[test]
fn test_claude_quota_parsing_malformed() {
    let ctx = TestContext::new();
    ctx.write_home_file(&[".claude", ".credentials.json"], r#"{"email": "claude_user@example.com"}"#);

    // Mock malformed quota.json
    ctx.write_home_file(
        &[".claude", "quota.json"],
        r#"{"fiveHourRemainingPercent": "should be a float but is a string"}"#
    );

    let quota = get_claude_quota();
    assert!(quota.windows.is_empty());
    assert_eq!(quota.warning, Some("Logged in, quota unavailable".to_string()));
}

#[test]
fn test_claude_cli_logged_in() {
    let ctx = TestContext::new();
    
    let windows_content = r#"@echo off
if "%1"=="auth" if "%2"=="status" (
    echo Logged in as cli_user@example.com
    exit /b 0
)
exit /b 1
"#;

    let unix_content = r#"#!/bin/sh
if [ "$1" = "auth" ] && [ "$2" = "status" ]; then
    echo "Logged in as cli_user@example.com"
    exit 0
fi
exit 1
"#;

    ctx.create_mock_cli("claude", windows_content, unix_content);

    let quota = get_claude_quota();
    assert_eq!(quota.cli_installed, true);
    assert_eq!(quota.logged_in, true);
    assert_eq!(quota.account_label, Some("cli_user@example.com".to_string()));
    assert_eq!(quota.source, QuotaSource::Cli);
    assert_eq!(quota.reliability, QuotaReliability::High);
}

#[test]
fn test_claude_cli_not_logged_in() {
    let ctx = TestContext::new();
    
    let windows_content = r#"@echo off
if "%1"=="auth" if "%2"=="status" (
    echo Not logged in
    exit /b 0
)
exit /b 1
"#;

    let unix_content = r#"#!/bin/sh
if [ "$1" = "auth" ] && [ "$2" = "status" ]; then
    echo "Not logged in"
    exit 0
fi
exit 1
"#;

    ctx.create_mock_cli("claude", windows_content, unix_content);

    let quota = get_claude_quota();
    assert_eq!(quota.cli_installed, true);
    assert_eq!(quota.logged_in, false);
    assert_eq!(quota.warning, Some("CLI installed, but login status not confirmed".to_string()));
}

#[test]
fn test_claude_cli_failed_with_credentials_fallback() {
    let ctx = TestContext::new();
    ctx.write_home_file(&[".claude", ".credentials.json"], r#"{"email": "fallback_user@example.com"}"#);
    
    let windows_content = r#"@echo off
echo Some execution error occurred >&2
exit /b 5
"#;

    let unix_content = r#"#!/bin/sh
echo "Some execution error occurred" >&2
exit 5
"#;

    ctx.create_mock_cli("claude", windows_content, unix_content);

    let quota = get_claude_quota();
    assert_eq!(quota.cli_installed, true);
    assert_eq!(quota.logged_in, true); // Fallback to credentials
    assert_eq!(quota.account_label, Some("fallback_user@example.com".to_string()));
    assert_eq!(quota.source, QuotaSource::LocalFile);
    
    // Should have warning due to CLI fail
    let warn_msg = quota.warning.expect("Warning should exist");
    println!("DEBUGLOG: Actual warning message: {}", warn_msg);
    assert!(
        warn_msg.contains("CLI status check failed"),
        "Expected 'CLI status check failed' in warning but got: '{}'",
        warn_msg
    );
}

// ==========================================
// Copilot Provider Integration Tests
// ==========================================

#[test]
fn test_copilot_uninstalled_no_credentials() {
    let _ctx = TestContext::new();

    let quota = get_copilot_quota();
    assert_eq!(quota.provider, ProviderId::Copilot);
    assert_eq!(quota.cli_installed, false);
    assert_eq!(quota.logged_in, false);
    assert_eq!(quota.account_label, None);
    assert!(quota.windows.is_empty());
    assert_eq!(quota.source, QuotaSource::Unavailable);
    assert_eq!(quota.reliability, QuotaReliability::Low);
}

#[test]
fn test_copilot_env_tokens_copilot_github_token() {
    let ctx = TestContext::new();
    env::set_var("COPILOT_GITHUB_TOKEN", "mock_copilot_env_token");

    let quota = get_copilot_quota();
    assert_eq!(quota.logged_in, true);
    assert_eq!(quota.source, QuotaSource::LocalFile);
    assert_eq!(quota.reliability, QuotaReliability::Medium);
}

#[test]
fn test_copilot_env_tokens_gh_token() {
    let ctx = TestContext::new();
    env::set_var("GH_TOKEN", "mock_gh_env_token");

    let quota = get_copilot_quota();
    assert_eq!(quota.logged_in, true);
    assert_eq!(quota.source, QuotaSource::LocalFile);
}

#[test]
fn test_copilot_env_tokens_github_token() {
    let ctx = TestContext::new();
    env::set_var("GITHUB_TOKEN", "mock_github_env_token");

    let quota = get_copilot_quota();
    assert_eq!(quota.logged_in, true);
    assert_eq!(quota.source, QuotaSource::LocalFile);
}

#[test]
fn test_copilot_env_tokens_empty_ignored() {
    let ctx = TestContext::new();
    env::set_var("COPILOT_GITHUB_TOKEN", "   ");

    let quota = get_copilot_quota();
    assert_eq!(quota.logged_in, false);
}

#[test]
fn test_copilot_config_json_valid_token_and_user() {
    let ctx = TestContext::new();
    ctx.write_home_file(
        &[".copilot", "config.json"],
        r#"{"token": "mock_config_token", "user": "copilot_user"}"#
    );

    let quota = get_copilot_quota();
    assert_eq!(quota.logged_in, true);
    assert_eq!(quota.account_label, Some("copilot_user".to_string()));
    assert_eq!(quota.source, QuotaSource::LocalFile);
}

#[test]
fn test_copilot_config_json_github_token_and_username() {
    let ctx = TestContext::new();
    ctx.write_home_file(
        &[".copilot", "config.json"],
        r#"{"github_token": "mock_config_token_2", "username": "copilot_username"}"#
    );

    let quota = get_copilot_quota();
    assert_eq!(quota.logged_in, true);
    assert_eq!(quota.account_label, Some("copilot_username".to_string()));
}

#[test]
fn test_copilot_config_json_empty() {
    let ctx = TestContext::new();
    ctx.write_home_file(&[".copilot", "config.json"], "");

    let quota = get_copilot_quota();
    assert_eq!(quota.logged_in, false);
    assert_eq!(quota.account_label, None);
}

#[test]
fn test_copilot_config_json_malformed() {
    let ctx = TestContext::new();
    ctx.write_home_file(&[".copilot", "config.json"], "bad json data");

    let quota = get_copilot_quota();
    assert_eq!(quota.logged_in, false);
    assert_eq!(quota.account_label, None);
}

#[test]
fn test_copilot_cli_only_auth() {
    let ctx = TestContext::new();
    
    let windows_content = r#"@echo off
if "%1"=="auth" if "%2"=="token" (
    echo mock_cli_token
    exit /b 0
)
if "%1"=="auth" if "%2"=="status" (
    echo Logged in to github.com as cli_copilot_user
    exit /b 0
)
exit /b 1
"#;

    let unix_content = r#"#!/bin/sh
if [ "$1" = "auth" ] && [ "$2" = "token" ]; then
    echo "mock_cli_token"
    exit 0
fi
if [ "$1" = "auth" ] && [ "$2" = "status" ]; then
    echo "Logged in to github.com as cli_copilot_user"
    exit 0
fi
exit 1
"#;

    ctx.create_mock_cli("gh", windows_content, unix_content);

    let quota = get_copilot_quota();
    assert_eq!(quota.cli_installed, true);
    assert_eq!(quota.logged_in, true);
    assert_eq!(quota.account_label, Some("cli_copilot_user".to_string()));
    assert_eq!(quota.source, QuotaSource::CliAuth);
    assert_eq!(quota.reliability, QuotaReliability::Medium);
}

// ==========================================
// General / Cross-cutting Error Handling
// ==========================================

#[test]
fn test_unreadable_status_files_error_handling() {
    let ctx = TestContext::new();
    
    // We make `.credentials.json` a directory instead of a file.
    // In Rust, fs::read_to_string on a directory will fail with an error.
    let path = ctx.mock_home.join(".claude");
    fs::create_dir_all(&path).unwrap();
    
    let cred_dir = path.join(".credentials.json");
    fs::create_dir_all(&cred_dir).unwrap(); // Creates directory blockers

    let quota = get_claude_quota();
    // It should handle the read failure gracefully, cli_installed is false,
    // logged_in is true (because find_existing_file checks if credentials_file.is_some()
    // but wait! find_existing_file checks `file_path.exists() && file_path.is_file()`.
    // Since it's a directory, `is_file()` returns `false`, so credentials_file will be None!
    // Resulting in logged_in = false. Let's assert this!
    assert_eq!(quota.logged_in, false);
}
