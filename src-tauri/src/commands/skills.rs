use serde::Serialize;
use std::fs;
use tauri::Manager;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BundledSkillInfo {
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

#[tauri::command]
pub fn get_plugin_dir(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    let plugin_dir = resource_dir.join("claude-skills-plugin");
    if plugin_dir.exists() {
        Ok(Some(plugin_dir.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn list_bundled_skills(app: tauri::AppHandle) -> Result<Vec<BundledSkillInfo>, String> {
    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    let skills_dir = resource_dir.join("claude-skills-plugin").join("skills");

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

        skills.push(BundledSkillInfo {
            name: name.unwrap_or(folder_name),
            description,
            files,
        });
    }

    Ok(skills)
}
