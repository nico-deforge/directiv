use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredRepo {
    pub id: String,
    pub path: String,
    pub github_nwo: Option<String>,
    pub config_warning: Option<String>,
}

fn parse_github_nwo(url: &str) -> Option<String> {
    let url = url.trim_end_matches(".git");
    url.strip_prefix("git@github.com:")
        .or_else(|| url.strip_prefix("https://github.com/"))
        .map(|s| s.to_string())
}

fn get_github_nwo(repo_path: &str) -> Option<String> {
    let output = std::process::Command::new("git")
        .args(["-C", repo_path, "remote", "get-url", "origin"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
    parse_github_nwo(&url)
}

#[tauri::command]
pub async fn scan_workspace(workspace_path: String) -> Result<Vec<DiscoveredRepo>, String> {
    let path = Path::new(&workspace_path);

    if !path.exists() {
        return Err(format!("Workspace path does not exist: {}", workspace_path));
    }

    if !path.is_dir() {
        return Err(format!(
            "Workspace path is not a directory: {}",
            workspace_path
        ));
    }

    let entries =
        fs::read_dir(path).map_err(|e| format!("Failed to read workspace directory: {}", e))?;

    let mut repos = Vec::new();

    for entry in entries.flatten() {
        let entry_path = entry.path();

        // Skip non-directories
        if !entry_path.is_dir() {
            continue;
        }

        // Check if it's a git repo
        let git_dir = entry_path.join(".git");
        if !git_dir.exists() {
            continue;
        }

        // Get repo id from folder name
        let id = entry_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        let repo_path = entry_path.to_str().unwrap_or("").to_string();

        // Warn if a legacy .directiv.json exists so users know to migrate
        let config_warning = if entry_path.join(".directiv.json").exists() {
            Some(format!(
                "{}: .directiv.json found — migrate to .config/wt.toml",
                entry_path.display()
            ))
        } else {
            None
        };

        let github_nwo = get_github_nwo(&repo_path);

        repos.push(DiscoveredRepo {
            id,
            path: repo_path,
            github_nwo,
            config_warning,
        });
    }

    // Sort repos by id for consistent ordering
    repos.sort_by(|a, b| a.id.cmp(&b.id));

    Ok(repos)
}
