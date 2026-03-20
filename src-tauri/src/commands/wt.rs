use serde::{Deserialize, Serialize};
use tauri_plugin_shell::ShellExt;

// --- Output types ---

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WtVersionInfo {
    pub version: String,
}

// --- Helpers ---

/// Execute a `wt` subcommand via the user's login shell and capture its output.
async fn run_wt(app: &tauri::AppHandle, args: &[&str]) -> Result<Vec<u8>, String> {
    let output = app
        .shell()
        .command("wt")
        .args(args)
        .output()
        .await
        .map_err(|e| {
            format!(
                "Failed to run wt: {e}. \
                 Make sure wt (Worktrunk) is installed and available on your PATH."
            )
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("wt exited with error: {stderr}"));
    }

    Ok(output.stdout)
}

// --- Commands ---

#[tauri::command]
pub async fn wt_version(app: tauri::AppHandle) -> Result<WtVersionInfo, String> {
    let output = app
        .shell()
        .command("wt")
        .args(["--version"])
        .output()
        .await
        .map_err(|e| {
            format!(
                "Failed to run wt: {e}. \
                 Make sure wt (Worktrunk) is installed and available on your PATH."
            )
        })?;

    // wt --version writes to stderr (common for clap-based CLIs)
    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let version = if version.is_empty() {
        String::from_utf8_lossy(&output.stderr).trim().to_string()
    } else {
        version
    };
    if version.is_empty() {
        return Err("wt returned an empty version string.".to_string());
    }
    Ok(WtVersionInfo { version })
}

// --- JSON types for wt list --format=json ---

#[derive(Debug, Deserialize)]
struct WtListEntry {
    branch: Option<String>,
    path: String,
    working_tree: Option<WtWorkingTree>,
    main: Option<WtMain>,
    main_state: Option<String>, // top-level field from wt list JSON
}

#[derive(Debug, Deserialize)]
struct WtWorkingTree {
    is_dirty: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct WtMain {
    ahead: Option<u32>,
    behind: Option<u32>,
    state: Option<String>,
}

// --- Public output type ---

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WtWorktreeInfo {
    pub branch: String,
    pub path: String,
    pub is_dirty: bool,
    pub ahead: u32,
    pub behind: u32,
    pub main_state: Option<String>,
}

// --- Output types for wt_switch_create ---

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WtSwitchCreateResult {
    pub path: String,
}

// --- wt_switch_create command ---

/// Create a worktree for `branch_name` rooted at `repo_path` using `wt switch --create`.
/// Returns the path of the newly created worktree.
#[tauri::command]
pub async fn wt_switch_create(
    app: tauri::AppHandle,
    repo_path: String,
    branch_name: String,
) -> Result<WtSwitchCreateResult, String> {
    let stdout = run_wt(
        &app,
        &[
            "switch",
            "--create",
            "--no-cd",
            "-C",
            &repo_path,
            &branch_name,
        ],
    )
    .await?;

    // wt switch --create --no-cd prints the worktree path on stdout.
    let path = String::from_utf8_lossy(&stdout).trim().to_string();

    if !path.is_empty() {
        return Ok(WtSwitchCreateResult { path });
    }

    // Fallback: resolve the path via `wt list --format=json`.
    let list_stdout = run_wt(&app, &["list", "--format=json", "-C", &repo_path]).await?;
    let entries: Vec<WtListEntry> = serde_json::from_slice(&list_stdout)
        .map_err(|e| format!("Failed to parse wt list output: {e}"))?;

    let entry = entries
        .into_iter()
        .find(|e| e.branch.as_deref() == Some(&branch_name))
        .ok_or_else(|| format!("Worktree for branch '{branch_name}' not found after creation"))?;

    Ok(WtSwitchCreateResult { path: entry.path })
}

// --- wt_remove command ---

/// Remove the worktree for `branch_name` rooted at `repo_path` using `wt remove`.
/// Deletes the worktree directory and its branch.
#[tauri::command]
pub async fn wt_remove(
    app: tauri::AppHandle,
    repo_path: String,
    branch_name: String,
) -> Result<(), String> {
    run_wt(&app, &["remove", "-C", &repo_path, "--yes", &branch_name]).await?;

    Ok(())
}

// --- wt_list command ---

#[tauri::command]
pub async fn wt_list(
    app: tauri::AppHandle,
    repo_path: String,
) -> Result<Vec<WtWorktreeInfo>, String> {
    let stdout = run_wt(&app, &["list", "--format=json", "-C", &repo_path]).await?;

    let entries: Vec<WtListEntry> = serde_json::from_slice(&stdout)
        .map_err(|e| format!("Failed to parse wt list output: {e}"))?;

    let worktrees = entries
        .into_iter()
        .filter_map(|entry| {
            // Filter out detached HEAD worktrees (no branch)
            let branch = entry.branch?;
            let is_dirty = entry
                .working_tree
                .and_then(|wt| wt.is_dirty)
                .unwrap_or(true);
            let main_state = entry
                .main_state
                .or_else(|| entry.main.as_ref().and_then(|m| m.state.clone()));
            let (ahead, behind) = entry
                .main
                .map(|m| (m.ahead.unwrap_or(0), m.behind.unwrap_or(0)))
                .unwrap_or((0, 0));
            Some(WtWorktreeInfo {
                branch,
                path: entry.path,
                is_dirty,
                ahead,
                behind,
                main_state,
            })
        })
        .collect();

    Ok(worktrees)
}
