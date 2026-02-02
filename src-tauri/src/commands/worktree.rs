use serde::Serialize;
use std::path::Path;
use tauri_plugin_shell::ShellExt;

#[derive(Debug, Serialize, Clone)]
pub struct WorktreeInfo {
    pub branch: String,
    pub path: String,
    pub issue_id: Option<String>,
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
    let mut worktrees: Vec<WorktreeInfo> = Vec::new();
    let mut current_path = String::new();
    let mut current_branch = String::new();

    for line in stdout.lines() {
        if let Some(path) = line.strip_prefix("worktree ") {
            current_path = path.to_string();
            current_branch = String::new();
        } else if let Some(branch_ref) = line.strip_prefix("branch ") {
            // branch refs/heads/ACQ-145 -> ACQ-145
            current_branch = branch_ref
                .strip_prefix("refs/heads/")
                .unwrap_or(branch_ref)
                .to_string();
        } else if line.is_empty() && !current_path.is_empty() {
            let issue_id = if current_branch.is_empty() {
                None
            } else {
                Some(current_branch.clone())
            };
            worktrees.push(WorktreeInfo {
                branch: current_branch.clone(),
                path: current_path.clone(),
                issue_id,
            });
            current_path = String::new();
            current_branch = String::new();
        }
    }

    // Handle last block (porcelain output may not end with blank line)
    if !current_path.is_empty() {
        let issue_id = if current_branch.is_empty() {
            None
        } else {
            Some(current_branch.clone())
        };
        worktrees.push(WorktreeInfo {
            branch: current_branch,
            path: current_path,
            issue_id,
        });
    }

    Ok(worktrees)
}

#[tauri::command]
pub async fn worktree_create(
    app: tauri::AppHandle,
    repo_path: String,
    issue_id: String,
) -> Result<WorktreeInfo, String> {
    let repo = Path::new(&repo_path);
    let repo_basename = repo
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid repo path")?;

    let worktree_dir = format!("{}-{}", repo_basename, issue_id);
    let worktree_path = repo
        .parent()
        .ok_or("Repo has no parent directory")?
        .join(&worktree_dir);
    let worktree_path_str = worktree_path
        .to_str()
        .ok_or("Invalid worktree path")?
        .to_string();

    // Try creating a new branch first
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

    Ok(WorktreeInfo {
        branch: issue_id.clone(),
        path: worktree_path_str,
        issue_id: Some(issue_id),
    })
}

#[tauri::command]
pub async fn worktree_remove(
    app: tauri::AppHandle,
    repo_path: String,
    worktree_path: String,
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

    Ok(())
}
