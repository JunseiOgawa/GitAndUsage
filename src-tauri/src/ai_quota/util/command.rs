use std::process::{Command, Stdio};
use std::time::Duration;
use std::path::{Path, PathBuf};
use crate::ai_quota::util::redact::redact_secret;

/// Check if a CLI command is installed in the system PATH or candidate directories
pub fn check_cli_installed(cmd: &str) -> bool {
    resolve_cli_path(cmd).is_some()
}

/// Resolve command's executable absolute path
pub fn resolve_cli_path(command_name: &str) -> Option<PathBuf> {
    // 1. First search in system PATH env variable
    if let Ok(path_env) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path_env) {
            let candidate = check_extensions(&dir, command_name);
            if candidate.is_some() {
                return candidate;
            }
        }
    }

    // 2. Search candidate directories
    let mut candidates = Vec::new();

    #[cfg(windows)]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            candidates.push(PathBuf::from(appdata).join("npm"));
        }
        if let Ok(localappdata) = std::env::var("LOCALAPPDATA") {
            candidates.push(PathBuf::from(localappdata).join("pnpm"));
        }
        if let Ok(userprofile) = std::env::var("USERPROFILE") {
            candidates.push(PathBuf::from(&userprofile).join("scoop").join("shims"));
            candidates.push(PathBuf::from(&userprofile).join(".bun").join("bin"));
            candidates.push(PathBuf::from(&userprofile).join(".cargo").join("bin"));
        }
        if let Ok(progfiles) = std::env::var("ProgramFiles") {
            candidates.push(PathBuf::from(&progfiles).join("GitHub CLI"));
            candidates.push(PathBuf::from(&progfiles).join("nodejs"));
        }
    }

    #[cfg(not(windows))]
    {
        if let Some(home) = dirs::home_dir() {
            candidates.push(home.join(".local").join("bin"));
            candidates.push(home.join(".npm-global").join("bin"));
            candidates.push(home.join(".bun").join("bin"));
            candidates.push(home.join(".cargo").join("bin"));
        }
        candidates.push(PathBuf::from("/usr/local/bin"));
        candidates.push(PathBuf::from("/usr/bin"));
    }

    for dir in candidates {
        let candidate = check_extensions(&dir, command_name);
        if candidate.is_some() {
            return candidate;
        }
    }

    None
}

fn check_extensions(dir: &Path, name: &str) -> Option<PathBuf> {
    #[cfg(windows)]
    {
        // On Windows, executables or scripts might have extensions
        let exts = vec!["exe", "cmd", "bat", "ps1"];
        for ext in exts {
            let file_path = dir.join(format!("{}.{}", name, ext));
            if file_path.exists() && file_path.is_file() {
                return Some(file_path);
            }
        }
        // Fallback without extension
        let file_path = dir.join(name);
        if file_path.exists() && file_path.is_file() {
            return Some(file_path);
        }
    }
    #[cfg(not(windows))]
    {
        let file_path = dir.join(name);
        if file_path.exists() && file_path.is_file() {
            return Some(file_path);
        }
    }
    None
}

/// Execute a CLI command with a strict timeout and return the stdout
pub fn run_command_with_timeout(
    cmd_path: &Path,
    args: &[&str],
    timeout: Duration,
) -> Result<String, String> {
    let start = std::time::Instant::now();

    let mut child = Command::new(cmd_path)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| redact_secret(&format!("failed to spawn: {}", e)))?;

    loop {
        if let Some(status) = child.try_wait().map_err(|e| redact_secret(&e.to_string()))? {
            let output = child.wait_with_output().map_err(|e| redact_secret(&e.to_string()))?;
            if status.success() {
                return Ok(String::from_utf8_lossy(&output.stdout).to_string());
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                return Err(redact_secret(&stderr));
            }
        }

        if start.elapsed() > timeout {
            let _ = child.kill();
            return Err(redact_secret(&format!("command timed out after {}s", timeout.as_secs())));
        }

        std::thread::sleep(Duration::from_millis(50));
    }
}
