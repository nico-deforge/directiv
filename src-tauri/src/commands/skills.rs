use log;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
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

fn collect_files_recursive(base: &PathBuf, dir: &PathBuf) -> Vec<String> {
    let mut files = Vec::new();
    let Ok(entries) = fs::read_dir(dir) else {
        return files;
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_file() {
            if let Ok(rel) = p.strip_prefix(base) {
                files.push(rel.to_string_lossy().to_string());
            }
        } else if p.is_dir() {
            files.extend(collect_files_recursive(base, &p));
        }
    }
    files
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

        let files = collect_files_recursive(&path, &path);

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
    if filename.contains('\\') || filename.contains('\0') || filename.contains("..") {
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

// --- Discover all Claude skills ---

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "lowercase")]
pub enum SkillSource {
    User,
    Plugin,
    Directiv,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeSkillEntry {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub source: SkillSource,
    pub plugin_name: Option<String>,
}

#[derive(Deserialize)]
struct InstalledPluginsFile {
    plugins: HashMap<String, Vec<InstalledPluginEntry>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstalledPluginEntry {
    install_path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClaudeSettings {
    enabled_plugins: Option<HashMap<String, bool>>,
}

/// Scan a directory of skill folders (each with SKILL.md) and return entries.
fn scan_skill_dirs(
    dir: &PathBuf,
    source: SkillSource,
    prefix: Option<&str>,
) -> Vec<ClaudeSkillEntry> {
    let mut results = Vec::new();
    let Ok(entries) = fs::read_dir(dir) else {
        return results;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let folder_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };

        let skill_md = path.join("SKILL.md");
        let (name, description) = if skill_md.exists() {
            match fs::read_to_string(&skill_md) {
                Ok(content) => parse_skill_frontmatter(&content),
                Err(e) => {
                    log::warn!("Failed to read {}: {}", skill_md.display(), e);
                    (None, None)
                }
            }
        } else {
            (None, None)
        };

        let id = match prefix {
            Some(p) => format!("{p}:{folder_name}"),
            None => folder_name.clone(),
        };

        results.push(ClaudeSkillEntry {
            id,
            name: name.unwrap_or(folder_name),
            description,
            source: source.clone(),
            plugin_name: prefix.map(|s| s.to_string()),
        });
    }
    results
}

/// Scan a directory of command .md files (flat, no subdirs) and return entries.
fn scan_command_files(dir: &PathBuf, source: SkillSource, prefix: &str) -> Vec<ClaudeSkillEntry> {
    let mut results = Vec::new();
    let Ok(entries) = fs::read_dir(dir) else {
        return results;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext = path.extension().and_then(|e| e.to_str());
        if ext != Some("md") {
            continue;
        }
        let stem = match path.file_stem().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };

        let (name, description) = match fs::read_to_string(&path) {
            Ok(content) => parse_skill_frontmatter(&content),
            Err(e) => {
                log::warn!("Failed to read {}: {}", path.display(), e);
                (None, None)
            }
        };

        results.push(ClaudeSkillEntry {
            id: format!("{prefix}:{stem}"),
            name: name.unwrap_or_else(|| stem.clone()),
            description,
            source: source.clone(),
            plugin_name: Some(prefix.to_string()),
        });
    }
    results
}

#[tauri::command]
pub fn list_all_claude_skills(app: tauri::AppHandle) -> Result<Vec<ClaudeSkillEntry>, String> {
    let mut all_skills = Vec::new();

    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let claude_dir = home.join(".claude");

    // 1. User standalone skills: ~/.claude/skills/<name>/SKILL.md
    let user_skills_dir = claude_dir.join("skills");
    if user_skills_dir.is_dir() {
        all_skills.extend(scan_skill_dirs(&user_skills_dir, SkillSource::User, None));
    }

    // 2. Installed plugins (only enabled ones)
    let enabled = load_enabled_plugins(&claude_dir);
    let installed_path = claude_dir.join("plugins").join("installed_plugins.json");
    match fs::read_to_string(&installed_path) {
        Ok(content) => match serde_json::from_str::<InstalledPluginsFile>(&content) {
            Ok(installed) => {
                for (plugin_key, entries) in &installed.plugins {
                    if !enabled.contains(plugin_key.as_str()) {
                        continue;
                    }
                    let plugin_name = plugin_key.split('@').next().unwrap_or(plugin_key);
                    if let Some(entry) = entries.first() {
                        let install_path = PathBuf::from(&entry.install_path);
                        let skills_dir = install_path.join("skills");
                        if skills_dir.is_dir() {
                            all_skills.extend(scan_skill_dirs(
                                &skills_dir,
                                SkillSource::Plugin,
                                Some(plugin_name),
                            ));
                        }
                        let commands_dir = install_path.join("commands");
                        if commands_dir.is_dir() {
                            all_skills.extend(scan_command_files(
                                &commands_dir,
                                SkillSource::Plugin,
                                plugin_name,
                            ));
                        }
                    }
                }
            }
            Err(e) => {
                log::warn!("Failed to parse {}: {}", installed_path.display(), e);
            }
        },
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => {
            log::warn!("Failed to read {}: {}", installed_path.display(), e);
        }
        _ => {}
    }

    // 3. Directiv bundled plugin
    if let Ok(Some(plugin_dir)) = resolve_plugin_dir(&app) {
        let skills_dir = plugin_dir.join("skills");
        if skills_dir.is_dir() {
            all_skills.extend(scan_skill_dirs(
                &skills_dir,
                SkillSource::Directiv,
                Some("directiv"),
            ));
        }
    }

    all_skills.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(all_skills)
}

fn load_enabled_plugins(claude_dir: &std::path::Path) -> HashSet<String> {
    let settings_path = claude_dir.join("settings.json");
    let content = match fs::read_to_string(&settings_path) {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return HashSet::new(),
        Err(e) => {
            log::warn!("Failed to read {}: {}", settings_path.display(), e);
            return HashSet::new();
        }
    };
    match serde_json::from_str::<ClaudeSettings>(&content) {
        Ok(settings) => settings
            .enabled_plugins
            .unwrap_or_default()
            .into_iter()
            .filter(|(_, enabled)| *enabled)
            .map(|(key, _)| key)
            .collect(),
        Err(e) => {
            log::warn!("Failed to parse {}: {}", settings_path.display(), e);
            HashSet::new()
        }
    }
}
