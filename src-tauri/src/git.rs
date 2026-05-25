use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitFileInfo {
    pub path: String,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub author: String,
    pub email: String,
    pub date: String,
    pub relative_date: String,
    pub message: String,
    pub refs: Vec<String>,
    pub parent_hashes: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CommitDetail {
    pub hash: String,
    pub short_hash: String,
    pub author: String,
    pub email: String,
    pub date: String,
    pub relative_date: String,
    pub subject: String,
    pub body: String,
    pub files: Vec<GitFileInfo>,
}

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
    pub files: Vec<GitFileInfo>,
    pub branches: Vec<String>,
}

#[tauri::command]
pub fn open_folder_dialog() -> Result<String, String> {
    let folder = rfd::FileDialog::new().pick_folder();
    match folder {
        Some(path) => Ok(path.to_string_lossy().to_string()),
        None => Err("No folder selected".to_string()),
    }
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
            files: vec![],
            branches: vec![],
        });
    }

    // 1. Get show-toplevel to see if it is a Git Repository and get the repo name
    let toplevel_output = Command::new("git")
        .args(["rev-parse", "--show-toplevel"])
        .current_dir(&repo_path)
        .output();

    let toplevel = match toplevel_output {
        Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout).trim().to_string(),
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
                files: vec![],
                branches: vec![],
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
        Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout).trim().to_string(),
        _ => "".to_string(),
    };

    // 3. Get upstream branch name
    let upstream_output = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "@{upstream}"])
        .current_dir(&repo_path)
        .output();

    let upstream = match upstream_output {
        Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout).trim().to_string(),
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
    let mut files = Vec::new();

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

                // Parse GitFileInfo status and path
                let status_str = line[0..2].trim().to_string();
                let path_str = line[3..].to_string();
                files.push(GitFileInfo {
                    path: path_str,
                    status: status_str,
                });

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
        Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout).to_string(),
        _ => "".to_string(),
    };

    // 7. Get all branches
    let branches_output = Command::new("git")
        .args(["branch", "-a", "--format=%(refname:short)"])
        .current_dir(&repo_path)
        .output();

    let mut branches = Vec::new();
    if let Ok(out) = branches_output {
        if out.status.success() {
            let stdout = String::from_utf8_lossy(&out.stdout);
            for line in stdout.lines() {
                let mut line_trimmed = line.trim().to_string();
                if !line_trimmed.is_empty() {
                    if line_trimmed.starts_with("remotes/") {
                        line_trimmed = line_trimmed.replacen("remotes/", "", 1);
                    }
                    if !line_trimmed.contains("/HEAD") && !line_trimmed.contains("->") {
                        branches.push(line_trimmed);
                    }
                }
            }
        }
    }

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
        files,
        branches,
    })
}

#[tauri::command]
pub fn get_commit_log(repo_path: String) -> Result<Vec<CommitInfo>, String> {
    let sep = "\x1f"; // Unit Separator — won't appear in commit messages
    let format = format!(
        "%H{sep}%h{sep}%an{sep}%ae{sep}%aI{sep}%ar{sep}%s{sep}%D{sep}%P",
        sep = sep
    );

    let format_arg = format!("--format={}", format);
    let output = Command::new("git")
        .args(["log", &format_arg, "-n", "50"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(err);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut commits = Vec::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.splitn(9, sep).collect();
        if parts.len() < 9 {
            continue;
        }

        let hash = parts[0].to_string();
        let short_hash = parts[1].to_string();
        let author = parts[2].to_string();
        let email = parts[3].to_string();
        let date = parts[4].to_string();
        let relative_date = parts[5].to_string();
        let message = parts[6].to_string();
        let refs_raw = parts[7].trim().to_string();
        let parents_raw = parts[8].trim().to_string();

        // Parse refs — comma-separated, skip empty
        let refs: Vec<String> = if refs_raw.is_empty() {
            vec![]
        } else {
            refs_raw
                .split(',')
                .map(|r| r.trim().to_string())
                .filter(|r| !r.is_empty() && !r.contains("HEAD ->"))
                .collect()
        };

        // Add HEAD ref separately if present
        let mut final_refs = refs;
        if refs_raw.contains("HEAD") {
            // Extract the "HEAD -> branch" part cleanly
            if let Some(pos) = refs_raw.find("HEAD ->") {
                let after = refs_raw[pos..].trim();
                final_refs.insert(
                    0,
                    after.split(',').next().unwrap_or("HEAD").trim().to_string(),
                );
            } else {
                final_refs.insert(0, "HEAD".to_string());
            }
        }

        // Parse parent hashes
        let parent_hashes: Vec<String> = if parents_raw.is_empty() {
            vec![]
        } else {
            parents_raw
                .split_whitespace()
                .map(|h| h.to_string())
                .collect()
        };

        commits.push(CommitInfo {
            hash,
            short_hash,
            author,
            email,
            date,
            relative_date,
            message,
            refs: final_refs,
            parent_hashes,
        });
    }

    Ok(commits)
}

#[tauri::command]
pub fn checkout_branch(repo_path: String, branch_name: String) -> Result<(), String> {
    let target_branch = if branch_name.starts_with("remotes/") {
        branch_name.replacen("remotes/", "", 1)
    } else {
        branch_name
    };

    let output = Command::new("git")
        .args(["checkout", &target_branch])
        .current_dir(&repo_path)
        .output();

    match output {
        Ok(out) if out.status.success() => Ok(()),
        Ok(out) => {
            let err_msg = String::from_utf8_lossy(&out.stderr).trim().to_string();
            if target_branch.contains('/') {
                let parts: Vec<&str> = target_branch.splitn(2, '/').collect();
                if parts.len() == 2 {
                    let short_name = parts[1];
                    let retry_output = Command::new("git")
                        .args(["checkout", "-b", short_name, "--track", &target_branch])
                        .current_dir(&repo_path)
                        .output();
                    if let Ok(rout) = retry_output {
                        if rout.status.success() {
                            return Ok(());
                        }
                    }
                }
            }
            Err(err_msg)
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn get_commit_details(repo_path: String, commit_hash: String) -> Result<CommitDetail, String> {
    // 1. Get commit metadata via git show
    // We use a custom delimiter to safely extract the commit subject and body.
    let sep = "\x1f";
    let format = format!(
        "%H{sep}%h{sep}%an{sep}%ae{sep}%aI{sep}%ar{sep}%s{sep}%b",
        sep = sep
    );
    let format_arg = format!("--format={}", format);
    let output_meta = Command::new("git")
        .args(["show", &format_arg, "--no-patch", &commit_hash])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output_meta.status.success() {
        let err = String::from_utf8_lossy(&output_meta.stderr)
            .trim()
            .to_string();
        return Err(err);
    }

    let stdout_meta = String::from_utf8_lossy(&output_meta.stdout);
    let parts: Vec<&str> = stdout_meta.splitn(8, sep).collect();
    if parts.len() < 7 {
        return Err("Failed to parse commit metadata".to_string());
    }

    let hash = parts[0].to_string();
    let short_hash = parts[1].to_string();
    let author = parts[2].to_string();
    let email = parts[3].to_string();
    let date = parts[4].to_string();
    let relative_date = parts[5].to_string();
    let subject = parts[6].to_string();
    let body = if parts.len() > 7 {
        parts[7].trim().to_string()
    } else {
        "".to_string()
    };

    // 2. Get changed files via git diff-tree
    let output_files = Command::new("git")
        .args([
            "diff-tree",
            "--no-commit-id",
            "--name-status",
            "-r",
            &commit_hash,
        ])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| e.to_string())?;

    let mut files = Vec::new();
    if output_files.status.success() {
        let stdout_files = String::from_utf8_lossy(&output_files.stdout);
        for line in stdout_files.lines() {
            let line_parts: Vec<&str> = line.split_whitespace().collect();
            if line_parts.len() >= 2 {
                let status = line_parts[0].to_string();
                let path = line_parts[1..].join(" ");
                files.push(GitFileInfo { path, status });
            }
        }
    }

    Ok(CommitDetail {
        hash,
        short_hash,
        author,
        email,
        date,
        relative_date,
        subject,
        body,
        files,
    })
}
