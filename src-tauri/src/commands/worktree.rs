use serde::Serialize;
use std::path::{Component, Path, PathBuf};
use tauri_plugin_shell::ShellExt;

/// Auto-detect the default branch on `origin`.
///
/// 1. `git symbolic-ref refs/remotes/origin/HEAD` → parse branch name
/// 2. Fallback: check if `origin/main` exists
/// 3. Fallback: check if `origin/master` exists
/// 4. Last resort: return `"origin/main"` (git will give a clear error)
async fn detect_default_branch(app: &tauri::AppHandle, repo_path: &str) -> String {
    // Try symbolic-ref first (most reliable when set)
    if let Ok(out) = app
        .shell()
        .command("git")
        .args(["-C", repo_path, "symbolic-ref", "refs/remotes/origin/HEAD"])
        .output()
        .await
    {
        if out.status.success() {
            let raw = String::from_utf8_lossy(&out.stdout);
            let trimmed = raw.trim();
            // "refs/remotes/origin/main" → "origin/main"
            if let Some(branch) = trimmed.strip_prefix("refs/remotes/") {
                return branch.to_string();
            }
        }
    }

    // Fallback: check origin/main
    if let Ok(out) = app
        .shell()
        .command("git")
        .args(["-C", repo_path, "rev-parse", "--verify", "origin/main"])
        .output()
        .await
    {
        if out.status.success() {
            return "origin/main".to_string();
        }
    }

    // Fallback: check origin/master
    if let Ok(out) = app
        .shell()
        .command("git")
        .args(["-C", repo_path, "rev-parse", "--verify", "origin/master"])
        .output()
        .await
    {
        if out.status.success() {
            return "origin/master".to_string();
        }
    }

    // Last resort
    "origin/main".to_string()
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeInfo {
    pub branch: String,
    pub path: String,
    pub issue_id: Option<String>,
    pub is_dirty: bool,
    pub ahead: u32,
    pub behind: u32,
}

#[tauri::command]
pub async fn worktree_list(
    app: tauri::AppHandle,
    repo_path: String,
) -> Result<Vec<WorktreeInfo>, String> {
    let output = app
        .shell()
        .command("git")
        .args(["-C", &repo_path, "worktree", "list", "--porcelain"])
        .output()
        .await
        .map_err(|e| format!("Failed to run git: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git worktree list failed: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    // First pass: collect basic worktree info (path + branch)
    // Note: tauri-plugin-shell may insert extra blank lines in stdout,
    // so we push entries when we encounter the next "worktree" line or end of input.
    struct RawWorktree {
        path: String,
        branch: String,
    }
    let mut raw: Vec<RawWorktree> = Vec::new();
    let mut current_path = String::new();
    let mut current_branch = String::new();

    for line in stdout.lines() {
        if line.is_empty() {
            continue;
        }
        if let Some(path) = line.strip_prefix("worktree ") {
            // Flush previous block if any
            if !current_path.is_empty() {
                raw.push(RawWorktree {
                    path: current_path.clone(),
                    branch: current_branch.clone(),
                });
            }
            current_path = path.to_string();
            current_branch = String::new();
        } else if let Some(branch_ref) = line.strip_prefix("branch ") {
            // branch refs/heads/ACQ-145 -> ACQ-145
            current_branch = branch_ref
                .strip_prefix("refs/heads/")
                .unwrap_or(branch_ref)
                .to_string();
        }
    }

    // Flush last block
    if !current_path.is_empty() {
        raw.push(RawWorktree {
            path: current_path,
            branch: current_branch,
        });
    }

    // Second pass: enrich each worktree with health data
    let mut worktrees: Vec<WorktreeInfo> = Vec::new();
    for (i, rw) in raw.iter().enumerate() {
        let issue_id = if rw.branch.is_empty() {
            None
        } else {
            Some(rw.branch.clone())
        };

        // Skip health checks for the main worktree (first entry)
        let (is_dirty, ahead, behind) = if i == 0 {
            (false, 0, 0)
        } else {
            get_worktree_health(&app, &rw.path, &rw.branch).await
        };

        worktrees.push(WorktreeInfo {
            branch: rw.branch.clone(),
            path: rw.path.clone(),
            issue_id,
            is_dirty,
            ahead,
            behind,
        });
    }

    Ok(worktrees)
}

async fn get_worktree_health(
    app: &tauri::AppHandle,
    worktree_path: &str,
    branch: &str,
) -> (bool, u32, u32) {
    // Check dirty state: git status --porcelain
    let is_dirty = match app
        .shell()
        .command("git")
        .args(["-C", worktree_path, "status", "--porcelain"])
        .output()
        .await
    {
        Ok(out) if out.status.success() => !String::from_utf8_lossy(&out.stdout).trim().is_empty(),
        _ => false,
    };

    // Check ahead/behind: git rev-list --left-right --count <branch>...origin/<base>
    // We try against the upstream tracking branch first, then fall back to origin/main
    let revlist_arg = format!("{branch}...{branch}@{{upstream}}");
    let (ahead, behind) = match app
        .shell()
        .command("git")
        .args([
            "-C",
            worktree_path,
            "rev-list",
            "--left-right",
            "--count",
            &revlist_arg,
        ])
        .output()
        .await
    {
        Ok(out) if out.status.success() => {
            parse_ahead_behind(&String::from_utf8_lossy(&out.stdout))
        }
        _ => (0, 0),
    };

    (is_dirty, ahead, behind)
}

fn parse_ahead_behind(output: &str) -> (u32, u32) {
    let parts: Vec<&str> = output.trim().split('\t').collect();
    if parts.len() == 2 {
        let ahead = parts[0].parse::<u32>().unwrap_or(0);
        let behind = parts[1].parse::<u32>().unwrap_or(0);
        (ahead, behind)
    } else {
        (0, 0)
    }
}

fn validate_relative_path(rel: &str) -> Result<(), String> {
    if rel.is_empty() {
        return Err("copyPaths: empty path is not allowed".to_string());
    }

    let path = PathBuf::from(rel);

    if path.is_absolute() {
        return Err(format!("copyPaths: absolute path not allowed: {rel}"));
    }

    for component in path.components() {
        if matches!(component, Component::ParentDir) {
            return Err(format!(
                "copyPaths: parent traversal (..) not allowed: {rel}"
            ));
        }
    }

    Ok(())
}

fn copy_path(src: &Path, dst: &Path) -> Result<(), String> {
    let meta = std::fs::symlink_metadata(src)
        .map_err(|e| format!("Failed to read metadata for {}: {e}", src.display()))?;

    if meta.is_symlink() {
        let target = std::fs::read_link(src)
            .map_err(|e| format!("Failed to read symlink {}: {e}", src.display()))?;
        if let Some(parent) = dst.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory {}: {e}", parent.display()))?;
        }
        #[cfg(unix)]
        std::os::unix::fs::symlink(&target, dst)
            .map_err(|e| format!("Failed to create symlink {}: {e}", dst.display()))?;
        return Ok(());
    }

    if meta.is_file() {
        if let Some(parent) = dst.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory {}: {e}", parent.display()))?;
        }
        std::fs::copy(src, dst)
            .map_err(|e| format!("Failed to copy {} to {}: {e}", src.display(), dst.display()))?;
        return Ok(());
    }

    if meta.is_dir() {
        std::fs::create_dir_all(dst)
            .map_err(|e| format!("Failed to create directory {}: {e}", dst.display()))?;
        let entries = std::fs::read_dir(src)
            .map_err(|e| format!("Failed to read directory {}: {e}", src.display()))?;
        for entry in entries {
            let entry =
                entry.map_err(|e| format!("Failed to read entry in {}: {e}", src.display()))?;
            let child_src = entry.path();
            let child_dst = dst.join(entry.file_name());
            copy_path(&child_src, &child_dst)?;
        }
        return Ok(());
    }

    Ok(())
}

#[tauri::command]
pub async fn worktree_create(
    app: tauri::AppHandle,
    repo_path: String,
    issue_id: String,
    copy_paths: Option<Vec<String>>,
    base_branch: Option<String>,
    fetch_before: Option<bool>,
) -> Result<WorktreeInfo, String> {
    let repo = Path::new(&repo_path);
    let repo_basename = repo
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid repo path")?;

    let worktrees_dir = format!("{}-worktrees", repo_basename);
    let worktrees_base = repo
        .parent()
        .ok_or("Repo has no parent directory")?
        .join(&worktrees_dir);

    // Create the worktrees directory if it doesn't exist
    std::fs::create_dir_all(&worktrees_base)
        .map_err(|e| format!("Failed to create worktrees directory: {e}"))?;

    let worktree_path = worktrees_base.join(&issue_id);
    let worktree_path_str = worktree_path
        .to_str()
        .ok_or("Invalid worktree path")?
        .to_string();

    // Validate all copy_paths BEFORE creating the worktree
    let validated_paths = if let Some(ref paths) = copy_paths {
        let mut validated = Vec::new();
        for rel in paths {
            validate_relative_path(rel)?;
            let src = repo.join(rel);
            if !src.exists() {
                return Err(format!(
                    "copyPaths: source does not exist: {}",
                    src.display()
                ));
            }
            validated.push(rel.clone());
        }
        validated
    } else {
        Vec::new()
    };

    // Fetch from origin before creating worktree (default: true)
    if fetch_before != Some(false) {
        let fetch_output = app
            .shell()
            .command("git")
            .args(["-C", &repo_path, "fetch", "origin"])
            .output()
            .await;
        match fetch_output {
            Ok(out) if !out.status.success() => {
                log::warn!(
                    "git fetch origin failed (continuing): {}",
                    String::from_utf8_lossy(&out.stderr)
                );
            }
            Err(e) => {
                log::warn!("git fetch origin failed (continuing): {e}");
            }
            _ => {}
        }
    }

    // Prune stale worktree entries (safe no-op if nothing to prune)
    let _ = app
        .shell()
        .command("git")
        .args(["-C", &repo_path, "worktree", "prune"])
        .output()
        .await;

    // If the worktree path already exists with a valid checkout on the right branch, return it
    if worktree_path.exists() {
        let check = app
            .shell()
            .command("git")
            .args([
                "-C",
                &worktree_path_str,
                "rev-parse",
                "--abbrev-ref",
                "HEAD",
            ])
            .output()
            .await;

        if let Ok(out) = check {
            if out.status.success() {
                let current_branch = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if current_branch == issue_id {
                    // Valid worktree on the correct branch → return directly (idempotent)
                    let (is_dirty, ahead, behind) =
                        get_worktree_health(&app, &worktree_path_str, &issue_id).await;
                    return Ok(WorktreeInfo {
                        branch: issue_id.clone(),
                        path: worktree_path_str,
                        issue_id: Some(issue_id),
                        is_dirty,
                        ahead,
                        behind,
                    });
                }
            }
        }

        // Path exists but is not a valid worktree on the expected branch → remove it
        std::fs::remove_dir_all(&worktree_path)
            .map_err(|e| format!("Cannot clean stale directory {}: {e}", worktree_path_str))?;
    }

    let base = match base_branch {
        Some(ref b) if !b.is_empty() => b.clone(),
        _ => detect_default_branch(&app, &repo_path).await,
    };

    // Try creating a new branch from base_branch
    let output = app
        .shell()
        .command("git")
        .args([
            "-C",
            &repo_path,
            "worktree",
            "add",
            &worktree_path_str,
            "-b",
            &issue_id,
            &base,
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to run git: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);

        // Branch already exists — checkout the existing branch instead
        if stderr.contains("already exists") {
            let output2 = app
                .shell()
                .command("git")
                .args([
                    "-C",
                    &repo_path,
                    "worktree",
                    "add",
                    &worktree_path_str,
                    &issue_id,
                ])
                .output()
                .await
                .map_err(|e| format!("Failed to run git: {e}"))?;

            if !output2.status.success() {
                let stderr2 = String::from_utf8_lossy(&output2.stderr);
                return Err(format!("git worktree add failed: {stderr2}"));
            }
        } else {
            return Err(format!("git worktree add failed: {stderr}"));
        }
    }

    // Copy validated paths into the worktree
    for rel in &validated_paths {
        let src = repo.join(rel);
        let dst = worktree_path.join(rel);
        copy_path(&src, &dst)?;
    }

    Ok(WorktreeInfo {
        branch: issue_id.clone(),
        path: worktree_path_str,
        issue_id: Some(issue_id),
        is_dirty: false,
        ahead: 0,
        behind: 0,
    })
}

#[tauri::command]
pub async fn worktree_remove(
    app: tauri::AppHandle,
    repo_path: String,
    worktree_path: String,
    branch: Option<String>,
    delete_branch: Option<bool>,
) -> Result<(), String> {
    if !Path::new(&worktree_path).exists() {
        return Err(format!("No worktree found at: {worktree_path}"));
    }

    let output = app
        .shell()
        .command("git")
        .args([
            "-C",
            &repo_path,
            "worktree",
            "remove",
            "--force",
            &worktree_path,
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to run git: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git worktree remove failed: {stderr}"));
    }

    // Optionally delete the branch after worktree removal
    if delete_branch == Some(true) {
        if let Some(branch_name) = branch {
            let del_output = app
                .shell()
                .command("git")
                .args(["-C", &repo_path, "branch", "-D", &branch_name])
                .output()
                .await;
            match del_output {
                Ok(out) if !out.status.success() => {
                    log::warn!(
                        "git branch -D {} failed: {}",
                        branch_name,
                        String::from_utf8_lossy(&out.stderr)
                    );
                }
                Err(e) => {
                    log::warn!("git branch -D {} failed: {e}", branch_name);
                }
                _ => {}
            }
        }
    }

    Ok(())
}

/// Fetch and prune remote tracking branches
#[tauri::command]
pub async fn git_fetch_prune(app: tauri::AppHandle, repo_path: String) -> Result<(), String> {
    let output = app
        .shell()
        .command("git")
        .args(["-C", &repo_path, "fetch", "--prune", "origin"])
        .output()
        .await
        .map_err(|e| format!("Failed to run git fetch --prune: {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "git fetch --prune failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(())
}

#[tauri::command]
pub async fn worktree_check_merged(
    app: tauri::AppHandle,
    repo_path: String,
    branch: String,
) -> Result<bool, String> {
    // Method 1: Check if the remote tracking branch has been deleted
    // This handles squash-and-merge workflows where the commit hash changes
    let remote_branch = format!("origin/{}", branch);
    let remote_check = app
        .shell()
        .command("git")
        .args(["-C", &repo_path, "rev-parse", "--verify", &remote_branch])
        .output()
        .await
        .map_err(|e| format!("Failed to run git: {e}"))?;

    // If remote branch doesn't exist, it was likely deleted after merge
    if !remote_check.status.success() {
        return Ok(true);
    }

    // Method 2: Fallback to merge-base check for regular merges
    let detected = detect_default_branch(&app, &repo_path).await;
    let base = detected
        .strip_prefix("origin/")
        .unwrap_or(&detected)
        .to_string();

    let output = app
        .shell()
        .command("git")
        .args([
            "-C",
            &repo_path,
            "merge-base",
            "--is-ancestor",
            &branch,
            &base,
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to run git: {e}"))?;

    // Exit code 0 = is ancestor (merged), non-zero = not merged
    Ok(output.status.success())
}
