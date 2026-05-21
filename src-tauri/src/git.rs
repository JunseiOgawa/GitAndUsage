use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub repo_name: String,
    pub current_branch: String,
    pub upstream: String,
    pub ahead: u32,
    pub behind: u32,
    pub modified: u32,
    pub staged: u32,
    pub untracked: u32,
    pub conflict: u32,
    pub commit_graph: String,
}

#[tauri::command]
pub fn get_git_status(repo_path: String) -> Result<GitStatus, String> {
    let path = std::path::Path::new(&repo_path);
    if !path.exists() || !path.is_dir() {
        return Ok(GitStatus {
            repo_name: "Directory does not exist".to_string(),
            current_branch: "".to_string(),
            upstream: "".to_string(),
            ahead: 0,
            behind: 0,
            modified: 0,
            staged: 0,
            untracked: 0,
            conflict: 0,
            commit_graph: "".to_string(),
        });
    }

    // 1. Get show-toplevel to see if it is a Git Repository and get the repo name
    let toplevel_output = Command::new("git")
        .args(["rev-parse", "--show-toplevel"])
        .current_dir(&repo_path)
        .output();

    let toplevel = match toplevel_output {
        Ok(out) if out.status.success() => {
            String::from_utf8_lossy(&out.stdout).trim().to_string()
        }
        _ => {
            // Safe fallback if not a git repository
            return Ok(GitStatus {
                repo_name: "Not a Git Repository".to_string(),
                current_branch: "".to_string(),
                upstream: "".to_string(),
                ahead: 0,
                behind: 0,
                modified: 0,
                staged: 0,
                untracked: 0,
                conflict: 0,
                commit_graph: "".to_string(),
            });
        }
    };

    let repo_name = std::path::Path::new(&toplevel)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Unknown")
        .to_string();

    // 2. Get current branch
    let branch_output = Command::new("git")
        .args(["branch", "--show-current"])
        .current_dir(&repo_path)
        .output();

    let current_branch = match branch_output {
        Ok(out) if out.status.success() => {
            String::from_utf8_lossy(&out.stdout).trim().to_string()
        }
        _ => "".to_string(),
    };

    // 3. Get upstream branch name
    let upstream_output = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "@{upstream}"])
        .current_dir(&repo_path)
        .output();

    let upstream = match upstream_output {
        Ok(out) if out.status.success() => {
            String::from_utf8_lossy(&out.stdout).trim().to_string()
        }
        _ => "".to_string(),
    };

    // 4. Get ahead/behind counts
    let rev_list_output = Command::new("git")
        .args(["rev-list", "--left-right", "--count", "HEAD...@{upstream}"])
        .current_dir(&repo_path)
        .output();

    let (ahead, behind) = match rev_list_output {
        Ok(out) if out.status.success() => {
            let out_str = String::from_utf8_lossy(&out.stdout);
            let parts: Vec<&str> = out_str.split_whitespace().collect();
            if parts.len() >= 2 {
                let ahead = parts[0].parse::<u32>().unwrap_or(0);
                let behind = parts[1].parse::<u32>().unwrap_or(0);
                (ahead, behind)
            } else {
                (0, 0)
            }
        }
        _ => (0, 0),
    };

    // 5. Parse staged, modified, untracked, conflict counts from porcelain status
    let status_output = Command::new("git")
        .args(["status", "--porcelain=v1"])
        .current_dir(&repo_path)
        .output();

    let mut staged = 0;
    let mut modified = 0;
    let mut untracked = 0;
    let mut conflict = 0;

    if let Ok(out) = status_output {
        if out.status.success() {
            let stdout = String::from_utf8_lossy(&out.stdout);
            for line in stdout.lines() {
                if line.len() < 3 {
                    continue;
                }
                let bytes = line.as_bytes();
                let x = bytes[0] as char;
                let y = bytes[1] as char;

                // Check for conflict
                if (x == 'D' && y == 'D')
                    || (x == 'A' && y == 'U')
                    || (x == 'U' && y == 'D')
                    || (x == 'U' && y == 'A')
                    || (x == 'D' && y == 'U')
                    || (x == 'A' && y == 'A')
                    || (x == 'U' && y == 'U')
                    || x == 'U'
                    || y == 'U'
                {
                    conflict += 1;
                } else if x == '?' && y == '?' {
                    untracked += 1;
                } else {
                    if x == 'M' || x == 'A' || x == 'D' || x == 'R' || x == 'C' {
                        staged += 1;
                    }
                    if y == 'M' || y == 'D' {
                        modified += 1;
                    }
                }
            }
        }
    }

    // 6. Get commit graph
    let log_output = Command::new("git")
        .args(["log", "--graph", "--oneline", "--decorate", "-n", "15"])
        .current_dir(&repo_path)
        .output();

    let commit_graph = match log_output {
        Ok(out) if out.status.success() => {
            String::from_utf8_lossy(&out.stdout).to_string()
        }
        _ => "".to_string(),
    };

    Ok(GitStatus {
        repo_name,
        current_branch,
        upstream,
        ahead,
        behind,
        modified,
        staged,
        untracked,
        conflict,
        commit_graph,
    })
}
