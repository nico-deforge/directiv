use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SkillSource {
    Global,
    Repo { repo_id: String },
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SkillInfo {
    pub name: String,
    pub description: Option<String>,
    pub path: String,
    pub source: SkillSource,
    pub files: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsResult {
    pub global_skills: Vec<SkillInfo>,
    pub repo_skills: Vec<SkillInfo>,
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

fn scan_skills_directory(skills_dir: &Path, source: SkillSource) -> Vec<SkillInfo> {
    let mut skills = Vec::new();

    if !skills_dir.exists() || !skills_dir.is_dir() {
        return skills;
    }

    let entries = match fs::read_dir(skills_dir) {
        Ok(e) => e,
        Err(_) => return skills,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let skill_md = path.join("SKILL.md");
        let (name, description) = if skill_md.exists() {
            match fs::read_to_string(&skill_md) {
                Ok(content) => parse_skill_frontmatter(&content),
                Err(_) => (None, None),
            }
        } else {
            (None, None)
        };

        let folder_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

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

        skills.push(SkillInfo {
            name: name.unwrap_or_else(|| folder_name.clone()),
            description,
            path: path.to_string_lossy().to_string(),
            source: source.clone(),
            files,
        });
    }

    skills
}

#[tauri::command]
pub async fn list_skills(repo_paths: Vec<(String, String)>) -> Result<SkillsResult, String> {
    let mut global_skills = Vec::new();
    let mut repo_skills = Vec::new();

    // 1. Read global skills from ~/.claude/skills/
    if let Some(home_dir) = dirs::home_dir() {
        let global_skills_dir = home_dir.join(".claude").join("skills");
        global_skills = scan_skills_directory(&global_skills_dir, SkillSource::Global);
    }

    // 2. Read repo-specific skills
    for (repo_id, repo_path) in repo_paths {
        let repo_skills_dir = PathBuf::from(&repo_path).join(".claude").join("skills");
        let skills = scan_skills_directory(
            &repo_skills_dir,
            SkillSource::Repo {
                repo_id: repo_id.clone(),
            },
        );
        repo_skills.extend(skills);
    }

    Ok(SkillsResult {
        global_skills,
        repo_skills,
    })
}

#[tauri::command]
pub async fn read_skill_file(skill_path: String, filename: String) -> Result<String, String> {
    let file_path = PathBuf::from(&skill_path).join(&filename);

    if !file_path.exists() {
        return Err(format!("File not found: {}", file_path.display()));
    }

    fs::read_to_string(&file_path).map_err(|e| format!("Failed to read file: {}", e))
}
