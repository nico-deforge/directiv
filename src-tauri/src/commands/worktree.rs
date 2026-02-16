use serde::Serialize;
use std::path::{Component, Path, PathBuf};
use tauri_plugin_shell::ShellExt;

/// Strip the `origin/` prefix from a branch ref, if present.
fn strip_origin(branch: &str) -> &str {
    branch.strip_prefix("origin/").unwrap_or(branch)
}

/// Resolve the worktree directory path for a given repo and issue ID.
fn resolve_worktree_path(repo: &Path, issue_id: &str) -> Result<PathBuf, String> {
    let repo_basename = repo
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid repo path")?;

    let worktrees_dir = format!("{repo_basename}-worktrees");
    let worktrees_base = repo
        .parent()
        .ok_or("Repo has no parent directory")?
        .join(&worktrees_dir);

    std::fs::create_dir_all(&worktrees_base)
        .map_err(|e| format!("Failed to create worktrees directory: {e}"))?;

    Ok(worktrees_base.join(issue_id))
}

/// Validate and collect copy paths, ensuring they exist in the source repo.
fn validate_copy_paths(
    repo: &Path,
    copy_paths: &Option<Vec<String>>,
) -> Result<Vec<String>, String> {
    let Some(paths) = copy_paths else {
        return Ok(Vec::new());
    };
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
    Ok(validated)
}

/// Copy validated relative paths from the source repo into the worktree.
fn copy_validated_paths(repo: &Path, worktree: &Path, paths: &[String]) -> Result<(), String> {
    for rel in paths {
        copy_path(&repo.join(rel), &worktree.join(rel))?;
    }
    Ok(())
}

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
    pub base_branch: Option<String>,
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

    // Batch-read all stored base branches
    let base_branches = read_all_base_branches(&app, &repo_path).await;

    // Second pass: enrich each worktree with health data
    let mut worktrees: Vec<WorktreeInfo> = Vec::new();
    for (i, rw) in raw.iter().enumerate() {
        let issue_id = (!rw.branch.is_empty()).then(|| rw.branch.clone());

        // Skip health checks for the main worktree (first entry)
        let (is_dirty, ahead, behind) = if i == 0 {
            (false, 0, 0)
        } else {
            get_worktree_health(&app, &rw.path, &rw.branch).await
        };

        let base_branch = base_branches.get(&rw.branch).cloned();

        worktrees.push(WorktreeInfo {
            branch: rw.branch.clone(),
            path: rw.path.clone(),
            issue_id,
            is_dirty,
            ahead,
            behind,
            base_branch,
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

    // Check ahead/behind: try upstream tracking branch, then fall back to origin/<branch>
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
        _ => {
            // No upstream set — fall back to origin/<branch> for branches that haven't been pushed
            let fallback_arg = format!("{branch}...origin/{branch}");
            match app
                .shell()
                .command("git")
                .args([
                    "-C",
                    worktree_path,
                    "rev-list",
                    "--left-right",
                    "--count",
                    &fallback_arg,
                ])
                .output()
                .await
            {
                Ok(out) if out.status.success() => {
                    parse_ahead_behind(&String::from_utf8_lossy(&out.stdout))
                }
                _ => (0, 0),
            }
        }
    };

    (is_dirty, ahead, behind)
}

/// Read the stored base branch for a single branch from git config.
async fn read_base_branch(app: &tauri::AppHandle, repo_path: &str, branch: &str) -> Option<String> {
    let key = format!("branch.{branch}.directiv-base");
    if let Ok(out) = app
        .shell()
        .command("git")
        .args(["-C", repo_path, "config", "--get", &key])
        .output()
        .await
    {
        if out.status.success() {
            let val = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !val.is_empty() {
                return Some(val);
            }
        }
    }
    None
}

/// Batch-read all stored directiv-base config entries into a HashMap.
async fn read_all_base_branches(
    app: &tauri::AppHandle,
    repo_path: &str,
) -> std::collections::HashMap<String, String> {
    let mut map = std::collections::HashMap::new();
    if let Ok(out) = app
        .shell()
        .command("git")
        .args([
            "-C",
            repo_path,
            "config",
            "--get-regexp",
            r"^branch\..*\.directiv-base$",
        ])
        .output()
        .await
    {
        if out.status.success() {
            let stdout = String::from_utf8_lossy(&out.stdout);
            for line in stdout.lines() {
                // Format: "branch.<name>.directiv-base <value>"
                let parts: Vec<&str> = line.splitn(2, ' ').collect();
                if parts.len() == 2 {
                    let key = parts[0];
                    let value = parts[1].trim().to_string();
                    // Extract branch name from "branch.<name>.directiv-base"
                    if let Some(rest) = key.strip_prefix("branch.") {
                        if let Some(branch_name) = rest.strip_suffix(".directiv-base") {
                            map.insert(branch_name.to_string(), value);
                        }
                    }
                }
            }
        }
    }
    map
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
    let worktree_path = resolve_worktree_path(repo, &issue_id)?;
    let worktree_path_str = worktree_path
        .to_str()
        .ok_or("Invalid worktree path")?
        .to_string();
    let validated_paths = validate_copy_paths(repo, &copy_paths)?;

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
                    // Read stored base branch from git config
                    let stored_base = read_base_branch(&app, &repo_path, &issue_id).await;
                    return Ok(WorktreeInfo {
                        branch: issue_id.clone(),
                        path: worktree_path_str,
                        issue_id: Some(issue_id),
                        is_dirty,
                        ahead,
                        behind,
                        base_branch: stored_base,
                    });
                }
            }
        }

        // Path exists but is not a valid worktree on the expected branch → remove it
        std::fs::remove_dir_all(&worktree_path)
            .map_err(|e| format!("Cannot clean stale directory {}: {e}", worktree_path_str))?;
    }

    // Resolve the raw base branch name (without origin/ prefix)
    let raw_base = match base_branch {
        Some(ref b) if !b.is_empty() => strip_origin(b).to_string(),
        _ => strip_origin(&detect_default_branch(&app, &repo_path).await).to_string(),
    };

    // Resolve the ref to branch from: prefer origin/<base>, fall back to local <base>
    let remote_ref = format!("origin/{raw_base}");
    let base_ref = {
        let check_remote = app
            .shell()
            .command("git")
            .args(["-C", &repo_path, "rev-parse", "--verify", &remote_ref])
            .output()
            .await;
        if matches!(&check_remote, Ok(out) if out.status.success()) {
            remote_ref.clone()
        } else {
            // Try local branch
            let check_local = app
                .shell()
                .command("git")
                .args(["-C", &repo_path, "rev-parse", "--verify", &raw_base])
                .output()
                .await;
            if matches!(&check_local, Ok(out) if out.status.success()) {
                raw_base.clone()
            } else {
                return Err(format!("BASE_NOT_FOUND:{raw_base}"));
            }
        }
    };

    // Try creating a new branch from the resolved base ref
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
            &base_ref,
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to run git: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("already exists") {
            return Err(format!("BRANCH_EXISTS:{issue_id}"));
        }
        return Err(format!("git worktree add failed: {stderr}"));
    }

    // Persist base branch metadata in git config
    let _ = app
        .shell()
        .command("git")
        .args([
            "-C",
            &repo_path,
            "config",
            &format!("branch.{issue_id}.directiv-base"),
            &raw_base,
        ])
        .output()
        .await;

    copy_validated_paths(repo, &worktree_path, &validated_paths)?;

    Ok(WorktreeInfo {
        branch: issue_id.clone(),
        path: worktree_path_str,
        issue_id: Some(issue_id),
        is_dirty: false,
        ahead: 0,
        behind: 0,
        base_branch: Some(raw_base),
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
        // Path is gone from disk — prune stale git worktree entries
        let prune_output = app
            .shell()
            .command("git")
            .args(["-C", &repo_path, "worktree", "prune"])
            .output()
            .await
            .map_err(|e| format!("Failed to run git worktree prune: {e}"))?;

        if !prune_output.status.success() {
            let stderr = String::from_utf8_lossy(&prune_output.stderr);
            return Err(format!("git worktree prune failed: {stderr}"));
        }
    } else {
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

        // Prune stale worktree metadata after force-remove
        let _ = app
            .shell()
            .command("git")
            .args(["-C", &repo_path, "worktree", "prune"])
            .output()
            .await;
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
    base_branch: Option<String>,
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

    // Method 2: Check if merged into the specific base branch (for branch-on-branch)
    if let Some(ref base) = base_branch {
        let origin_base = format!("origin/{base}");
        let base_check = app
            .shell()
            .command("git")
            .args([
                "-C",
                &repo_path,
                "merge-base",
                "--is-ancestor",
                &branch,
                &origin_base,
            ])
            .output()
            .await;
        // For stacked branches, only the specified base is meaningful
        return Ok(matches!(&base_check, Ok(out) if out.status.success()));
    }

    // Method 3: Fallback to merge-base check against default branch (no base_branch specified)
    let detected = detect_default_branch(&app, &repo_path).await;
    let default_base = strip_origin(&detected).to_string();

    let output = app
        .shell()
        .command("git")
        .args([
            "-C",
            &repo_path,
            "merge-base",
            "--is-ancestor",
            &branch,
            &default_base,
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to run git: {e}"))?;

    // Exit code 0 = is ancestor (merged), non-zero = not merged
    Ok(output.status.success())
}

/// Create a worktree using an existing branch, with optional reset to base.
#[tauri::command]
pub async fn worktree_create_existing_branch(
    app: tauri::AppHandle,
    repo_path: String,
    issue_id: String,
    copy_paths: Option<Vec<String>>,
    base_branch: Option<String>,
    reset_to_base: bool,
    force_reset: Option<bool>,
) -> Result<WorktreeInfo, String> {
    let repo = Path::new(&repo_path);
    let worktree_path = resolve_worktree_path(repo, &issue_id)?;
    let worktree_path_str = worktree_path
        .to_str()
        .ok_or("Invalid worktree path")?
        .to_string();
    let validated_paths = validate_copy_paths(repo, &copy_paths)?;

    if reset_to_base {
        if force_reset != Some(true) {
            let is_synced = check_branch_synced_inner(&app, &repo_path, &issue_id).await?;
            if !is_synced {
                return Err(format!("BRANCH_HAS_UNPUSHED:{issue_id}"));
            }
        }

        let raw_base = strip_origin(base_branch.as_deref().unwrap_or("main"));
        let target_ref = format!("origin/{raw_base}");
        let reset_output = app
            .shell()
            .command("git")
            .args(["-C", &repo_path, "branch", "-f", &issue_id, &target_ref])
            .output()
            .await
            .map_err(|e| format!("Failed to run git branch -f: {e}"))?;

        if !reset_output.status.success() {
            let stderr = String::from_utf8_lossy(&reset_output.stderr);
            return Err(format!("git branch -f failed: {stderr}"));
        }
    }

    let output = app
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

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git worktree add failed: {stderr}"));
    }

    // Persist base branch in git config and compute stored value
    let stored_base = if let Some(ref base) = base_branch {
        let raw_base = strip_origin(base).to_string();
        let _ = app
            .shell()
            .command("git")
            .args([
                "-C",
                &repo_path,
                "config",
                &format!("branch.{issue_id}.directiv-base"),
                &raw_base,
            ])
            .output()
            .await;
        Some(raw_base)
    } else {
        None
    };

    copy_validated_paths(repo, &worktree_path, &validated_paths)?;

    Ok(WorktreeInfo {
        branch: issue_id.clone(),
        path: worktree_path_str,
        issue_id: Some(issue_id),
        is_dirty: false,
        ahead: 0,
        behind: 0,
        base_branch: stored_base,
    })
}

/// Internal helper: check if a branch has unpushed commits relative to origin.
async fn check_branch_synced_inner(
    app: &tauri::AppHandle,
    repo_path: &str,
    branch: &str,
) -> Result<bool, String> {
    // Check if origin/<branch> exists
    let remote_ref = format!("origin/{branch}");
    let remote_check = app
        .shell()
        .command("git")
        .args(["-C", repo_path, "rev-parse", "--verify", &remote_ref])
        .output()
        .await
        .map_err(|e| format!("Failed to run git: {e}"))?;

    if !remote_check.status.success() {
        // No remote branch — not synced (has unpushed commits)
        return Ok(false);
    }

    // Count commits in local branch that aren't in remote
    let range = format!("{remote_ref}..{branch}");
    let count_output = app
        .shell()
        .command("git")
        .args(["-C", repo_path, "rev-list", "--count", &range])
        .output()
        .await
        .map_err(|e| format!("Failed to run git: {e}"))?;

    if !count_output.status.success() {
        return Ok(false);
    }

    let count: u32 = String::from_utf8_lossy(&count_output.stdout)
        .trim()
        .parse()
        .unwrap_or(1);

    Ok(count == 0)
}

/// Check if a branch has unpushed commits (not synced with origin).
#[tauri::command]
pub async fn worktree_check_branch_synced(
    app: tauri::AppHandle,
    repo_path: String,
    branch: String,
) -> Result<bool, String> {
    check_branch_synced_inner(&app, &repo_path, &branch).await
}
