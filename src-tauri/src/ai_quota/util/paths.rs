use std::env;
use std::path::PathBuf;

/// Resolves standard candidates for Claude Code configuration directories
pub fn get_claude_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    // 1. Env Var CLAUDE_CONFIG_DIR
    if let Ok(env_val) = env::var("CLAUDE_CONFIG_DIR") {
        if !env_val.is_empty() {
            paths.push(PathBuf::from(env_val));
        }
    }

    // 2. User profile /.claude
    if let Some(home) = dirs::home_dir() {
        paths.push(home.join(".claude"));
    }

    // 3. AppData / config directories
    if let Some(config) = dirs::config_dir() {
        paths.push(config.join("Claude"));
        paths.push(config.join("claude"));
    }

    paths
}

/// Resolves candidates for Codex CLI directories
pub fn get_codex_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    // 1. Env Var CODEX_HOME
    if let Ok(env_val) = env::var("CODEX_HOME") {
        if !env_val.is_empty() {
            paths.push(PathBuf::from(env_val));
        }
    }

    // 2. ~/.codex
    if let Some(home) = dirs::home_dir() {
        paths.push(home.join(".codex"));
    }

    // 3. Config dirs
    if let Some(config) = dirs::config_dir() {
        paths.push(config.join("codex"));
    }

    // 4. Data local/share dirs
    if let Some(data) = dirs::data_dir() {
        paths.push(data.join("codex"));
    }
    if let Some(data_local) = dirs::data_local_dir() {
        paths.push(data_local.join("codex"));
    }

    paths
}

/// Resolves candidates for GitHub Copilot config directories
pub fn get_copilot_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    // 1. ~/.copilot
    if let Some(home) = dirs::home_dir() {
        paths.push(home.join(".copilot"));
    }

    // 2. Config & Data directories
    if let Some(config) = dirs::config_dir() {
        paths.push(config.join("copilot"));
    }
    if let Some(data) = dirs::data_dir() {
        paths.push(data.join("copilot"));
    }
    if let Some(data_local) = dirs::data_local_dir() {
        paths.push(data_local.join("copilot"));
    }

    paths
}

/// Resolves candidates for OpenCode CLI directories
pub fn get_opencode_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    // 1. Env variables
    if let Ok(env_val) = env::var("OPENCODE_CONFIG_DIR") {
        if !env_val.is_empty() {
            paths.push(PathBuf::from(env_val));
        }
    }
    if let Ok(env_val) = env::var("OPENCODE_DATA_DIR") {
        if !env_val.is_empty() {
            paths.push(PathBuf::from(env_val));
        }
    }

    // 2. ~/.config/opencode and ~/.local/share/opencode
    if let Some(home) = dirs::home_dir() {
        paths.push(home.join(".config").join("opencode"));
        paths.push(home.join(".local").join("share").join("opencode"));
    }

    // 3. System Config / Data directories
    if let Some(config) = dirs::config_dir() {
        paths.push(config.join("opencode"));
    }
    if let Some(data) = dirs::data_dir() {
        paths.push(data.join("opencode"));
    }
    if let Some(data_local) = dirs::data_local_dir() {
        paths.push(data_local.join("opencode"));
    }

    paths
}

/// Find the first file candidate that exists across all search paths
pub fn find_existing_file(paths: &[PathBuf], filename: &str) -> Option<PathBuf> {
    for path in paths {
        let file_path = path.join(filename);
        if file_path.exists() && file_path.is_file() {
            return Some(file_path);
        }
    }
    None
}
