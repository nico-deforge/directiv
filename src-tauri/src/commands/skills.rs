use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::SystemTime;
use tauri::Manager;

use super::config::find_config_file;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PluginSkillInfo {
    pub name: String,
    pub description: Option<String>,
    pub files: Vec<String>,
    pub is_override: bool,
}

// --- Merged plugin state for temp dir lifecycle ---

pub struct MergedPluginState {
    inner: Mutex<MergedPluginInner>,
}

struct MergedPluginInner {
    cached_dir: Option<PathBuf>,
    cached_mtime: Option<SystemTime>,
}

impl MergedPluginState {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(MergedPluginInner {
                cached_dir: None,
                cached_mtime: None,
            }),
        }
    }

    pub fn cleanup_all(&self) {
        let mut inner = self.inner.lock().unwrap();
        if let Some(dir) = inner.cached_dir.take() {
            let _ = fs::remove_dir_all(&dir);
        }
        inner.cached_mtime = None;
    }
}

// --- Helpers ---

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

fn copy_dir_recursive(src: &PathBuf, dst: &PathBuf) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| format!("Failed to create dir {}: {e}", dst.display()))?;
    let entries =
        fs::read_dir(src).map_err(|e| format!("Failed to read dir {}: {e}", src.display()))?;
    for entry in entries.flatten() {
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path).map_err(|e| {
                format!(
                    "Failed to copy {} -> {}: {e}",
                    src_path.display(),
                    dst_path.display()
                )
            })?;
        }
    }
    Ok(())
}

/// Resolve user skills directory: config `skillsDir` > ~/.directiv/skills/ > None
fn resolve_user_skills_dir() -> Option<PathBuf> {
    // Try reading skillsDir from config
    if let Ok(config_path) = find_config_file() {
        if let Ok(content) = fs::read_to_string(&config_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(skills_dir) = json.get("skillsDir").and_then(|v| v.as_str()) {
                    let path = PathBuf::from(skills_dir);
                    if path.is_dir() {
                        return Some(path);
                    }
                }
            }
        }
    }

    // Fallback: ~/.directiv/skills/
    if let Some(home) = dirs::home_dir() {
        let default_dir = home.join(".directiv").join("skills");
        if default_dir.is_dir() {
            return Some(default_dir);
        }
    }

    None
}

/// Get the mtime of a directory (modification time of the dir itself)
fn dir_mtime(path: &PathBuf) -> Option<SystemTime> {
    fs::metadata(path).ok().and_then(|m| m.modified().ok())
}

/// Scan a skills directory and return PluginSkillInfo entries
fn scan_skills_dir(skills_dir: &PathBuf, is_override: bool) -> Vec<PluginSkillInfo> {
    let mut skills = Vec::new();
    let Ok(entries) = fs::read_dir(skills_dir) else {
        return skills;
    };
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
            is_override,
        });
    }
    skills
}

/// Create a merged plugin dir: copy bundled, then overlay user skills
fn create_merged_plugin_dir(
    app: &tauri::AppHandle,
    bundled: &PathBuf,
    user_skills: &PathBuf,
) -> Result<PathBuf, String> {
    let temp_base = app.path().temp_dir().map_err(|e| e.to_string())?;
    let merged_base = temp_base.join("directiv-plugins");
    let ts = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let merged_dir = merged_base.join(format!("merged-{ts}"));

    // Copy entire bundled plugin to temp
    copy_dir_recursive(bundled, &merged_dir)?;

    // Overlay user skills: for each user skill dir, replace the corresponding bundled one
    let merged_skills = merged_dir.join("skills");
    let Ok(entries) = fs::read_dir(user_skills) else {
        return Ok(merged_dir);
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        if let Some(name) = path.file_name() {
            let target = merged_skills.join(name);
            // Remove bundled skill if it exists
            let _ = fs::remove_dir_all(&target);
            // Copy user skill
            copy_dir_recursive(&path, &target)?;
        }
    }

    Ok(merged_dir)
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

// --- Tauri commands ---

#[tauri::command]
pub fn get_plugin_dir(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let Some(bundled) = resolve_plugin_dir(&app)? else {
        return Ok(None);
    };

    let Some(user_skills) = resolve_user_skills_dir() else {
        // No user overrides: return bundled directly (zero overhead)
        return Ok(Some(bundled.to_string_lossy().to_string()));
    };

    // Check cache in MergedPluginState
    let state = app.state::<MergedPluginState>();
    let mut inner = state.inner.lock().unwrap();

    let current_mtime = dir_mtime(&user_skills);

    if let (Some(ref cached_dir), Some(cached_mt)) = (&inner.cached_dir, inner.cached_mtime) {
        if cached_dir.exists() && current_mtime == Some(cached_mt) {
            return Ok(Some(cached_dir.to_string_lossy().to_string()));
        }
    }

    // Clean up previous cached dir if any
    if let Some(old_dir) = inner.cached_dir.take() {
        let _ = fs::remove_dir_all(&old_dir);
    }

    // Create new merged dir
    let merged = create_merged_plugin_dir(&app, &bundled, &user_skills)?;
    inner.cached_dir = Some(merged.clone());
    inner.cached_mtime = current_mtime;

    Ok(Some(merged.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn list_plugin_skills(app: tauri::AppHandle) -> Result<Vec<PluginSkillInfo>, String> {
    let Some(plugin_dir) = resolve_plugin_dir(&app)? else {
        return Ok(Vec::new());
    };
    let bundled_skills_dir = plugin_dir.join("skills");

    // Scan bundled skills
    let mut bundled_skills = if bundled_skills_dir.exists() && bundled_skills_dir.is_dir() {
        scan_skills_dir(&bundled_skills_dir, false)
    } else {
        Vec::new()
    };

    // If user overrides exist, overlay them
    if let Some(user_skills_dir) = resolve_user_skills_dir() {
        let user_skills = scan_skills_dir(&user_skills_dir, true);
        let user_names: std::collections::HashSet<&str> =
            user_skills.iter().map(|s| s.name.as_str()).collect();
        // Remove bundled skills that are overridden
        bundled_skills.retain(|s| !user_names.contains(s.name.as_str()));
        bundled_skills.extend(user_skills);
    }

    Ok(bundled_skills)
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

    // Try user skills first
    if let Some(user_skills_dir) = resolve_user_skills_dir() {
        let user_file = user_skills_dir.join(&skill_name).join(&filename);
        if user_file.exists() {
            if let Ok(canonical) = user_file.canonicalize() {
                if let Ok(canonical_base) = user_skills_dir.canonicalize() {
                    if canonical.starts_with(&canonical_base) {
                        return fs::read_to_string(&canonical)
                            .map_err(|e| format!("Failed to read file: {e}"));
                    }
                }
            }
        }
    }

    // Fallback to bundled
    let plugin_dir =
        resolve_plugin_dir(&app)?.ok_or_else(|| "Plugin directory not found".to_string())?;

    let skills_dir = plugin_dir.join("skills");
    let file_path = skills_dir.join(&skill_name).join(&filename);

    let canonical = file_path
        .canonicalize()
        .map_err(|_| format!("File not found: {}", file_path.display()))?;
    let canonical_skills = skills_dir
        .canonicalize()
        .map_err(|e| format!("Failed to resolve skills directory: {e}"))?;

    if !canonical.starts_with(&canonical_skills) {
        return Err("Invalid file path".to_string());
    }

    fs::read_to_string(&canonical).map_err(|e| format!("Failed to read file: {e}"))
}

#[tauri::command]
pub fn get_user_skills_dir() -> Option<String> {
    resolve_user_skills_dir().map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn cleanup_merged_plugins(app: tauri::AppHandle) {
    let state = app.state::<MergedPluginState>();
    state.cleanup_all();
}
