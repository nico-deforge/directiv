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
    let stdout = run_wt(&app, &["--version"]).await?;
    let version = String::from_utf8_lossy(&stdout).trim().to_string();
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

// --- wt_list command ---

#[tauri::command]
pub async fn wt_list(app: tauri::AppHandle, repo_path: String) -> Result<Vec<WtWorktreeInfo>, String> {
    let stdout = run_wt(&app, &["list", "--format=json", "-C", "--", &repo_path]).await?;

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
            let (ahead, behind, main_state) = entry
                .main
                .map(|m| (m.ahead.unwrap_or(0), m.behind.unwrap_or(0), m.state))
                .unwrap_or((0, 0, None));
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
