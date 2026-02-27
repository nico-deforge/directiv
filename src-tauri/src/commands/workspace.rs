use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Deserialize, Serialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SkillOverrides {
    pub code: Option<String>,
    pub plan: Option<String>,
    pub fix_ci: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredRepo {
    pub id: String,
    pub path: String,
    pub copy_paths: Vec<String>,
    pub on_start: Vec<String>,
    pub before_remove: Vec<String>,
    pub fetch_before: bool,
    pub config_warning: Option<String>,
    pub skills: Option<SkillOverrides>,
    pub github_nwo: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct RepoConfig {
    #[serde(default)]
    copy_paths: Vec<String>,
    #[serde(default)]
    on_start: Vec<String>,
    #[serde(default)]
    before_remove: Vec<String>,
    #[serde(default = "default_fetch_before")]
    fetch_before: bool,
    #[serde(default)]
    skills: Option<SkillOverrides>,
}

fn default_fetch_before() -> bool {
    true
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

        // Try to read .directiv.json from the repo
        let config_path = entry_path.join(".directiv.json");
        let (config, config_warning) = if config_path.exists() {
            match fs::read_to_string(&config_path) {
                Ok(content) => match serde_json::from_str(&content) {
                    Ok(config) => (config, None),
                    Err(e) => {
                        let msg = format!("Failed to parse {}: {e}", config_path.display());
                        log::warn!("{msg}");
                        (RepoConfig::default(), Some(msg))
                    }
                },
                Err(e) => {
                    let msg = format!("Failed to read {}: {e}", config_path.display());
                    log::warn!("{msg}");
                    (RepoConfig::default(), Some(msg))
                }
            }
        } else {
            (RepoConfig::default(), None)
        };

        let github_nwo = get_github_nwo(&repo_path);

        repos.push(DiscoveredRepo {
            id,
            path: repo_path,
            copy_paths: config.copy_paths,
            on_start: config.on_start,
            before_remove: config.before_remove,
            fetch_before: config.fetch_before,
            config_warning,
            skills: config.skills,
            github_nwo,
        });
    }

    // Sort repos by id for consistent ordering
    repos.sort_by(|a, b| a.id.cmp(&b.id));

    Ok(repos)
}
