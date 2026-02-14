use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PluginSkillInfo {
    pub name: String,
    pub description: Option<String>,
    pub files: Vec<String>,
}

fn parse_skill_frontmatter(content: &str) -> (Option<String>, Option<String>) {
    let mut name = None;
    let mut description = None;

    if let Some(stripped) = content.strip_prefix("---") {
        if let Some(end) = stripped.find("---") {
            let frontmatter = &stripped[..end];
            for line in frontmatter.lines() {
                let line = line.trim();
                if let Some(rest) = line.strip_prefix("name:") {
                    name = Some(rest.trim().trim_matches('"').trim_matches('\'').to_string());
                } else if let Some(rest) = line.strip_prefix("description:") {
                    description =
                        Some(rest.trim().trim_matches('"').trim_matches('\'').to_string());
                }
            }
        }
    }

    (name, description)
}

fn resolve_plugin_dir(app: &tauri::AppHandle) -> Result<Option<PathBuf>, String> {
    let plugin_dir = app
        .path()
        .resolve("directiv-plugin", tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;

    if plugin_dir.exists() {
        Ok(Some(plugin_dir))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn get_plugin_dir(app: tauri::AppHandle) -> Result<Option<String>, String> {
    Ok(resolve_plugin_dir(&app)?.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn list_plugin_skills(app: tauri::AppHandle) -> Result<Vec<PluginSkillInfo>, String> {
    let Some(plugin_dir) = resolve_plugin_dir(&app)? else {
        return Ok(Vec::new());
    };
    let skills_dir = plugin_dir.join("skills");

    if !skills_dir.exists() || !skills_dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut skills = Vec::new();

    let entries = fs::read_dir(&skills_dir).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let folder_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        let skill_md = path.join("SKILL.md");
        let (name, description) = if skill_md.exists() {
            match fs::read_to_string(&skill_md) {
                Ok(content) => parse_skill_frontmatter(&content),
                Err(_) => (None, None),
            }
        } else {
            (None, None)
        };

        let files = match fs::read_dir(&path) {
            Ok(entries) => entries
                .flatten()
                .filter_map(|e| {
                    let p = e.path();
                    if p.is_file() {
                        p.file_name()
                            .and_then(|n| n.to_str())
                            .map(|s| s.to_string())
                    } else {
                        None
                    }
                })
                .collect(),
            Err(_) => Vec::new(),
        };

        skills.push(PluginSkillInfo {
            name: name.unwrap_or(folder_name),
            description,
            files,
        });
    }

    Ok(skills)
}

#[tauri::command]
pub fn read_plugin_skill_file(
    app: tauri::AppHandle,
    skill_name: String,
    filename: String,
) -> Result<String, String> {
    if skill_name.contains('/') || skill_name.contains('\\') || skill_name.contains('\0') {
        return Err("Invalid skill name".to_string());
    }
    if filename.contains('/') || filename.contains('\\') || filename.contains('\0') {
        return Err("Invalid filename".to_string());
    }

    let plugin_dir =
        resolve_plugin_dir(&app)?.ok_or_else(|| "Plugin directory not found".to_string())?;

    let skills_dir = plugin_dir.join("skills");
    let file_path = skills_dir.join(&skill_name).join(&filename);

    let canonical = file_path
        .canonicalize()
        .map_err(|_| format!("File not found: {}", file_path.display()))?;
    let canonical_skills = skills_dir
        .canonicalize()
        .map_err(|e| format!("Failed to resolve skills directory: {}", e))?;

    if !canonical.starts_with(&canonical_skills) {
        return Err("Invalid file path".to_string());
    }

    fs::read_to_string(&canonical).map_err(|e| format!("Failed to read file: {}", e))
}
