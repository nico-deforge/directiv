use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;
use tauri::Manager;

use super::config::find_config_file;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PluginSkillInfo {
    pub name: String,
    pub folder_name: String,
    pub description: Option<String>,
    pub files: Vec<String>,
    pub is_override: bool,
}

pub struct MergedPluginState {
    inner: Mutex<MergedPluginInner>,
}

#[derive(Default)]
struct MergedPluginInner {
    cached_dir: Option<PathBuf>,
    cached_mtime: Option<SystemTime>,
}

impl MergedPluginState {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(MergedPluginInner::default()),
        }
    }

    pub fn cleanup_all(&self) {
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(dir) = inner.cached_dir.take() {
            let _ = fs::remove_dir_all(&dir);
        }
        inner.cached_mtime = None;
    }
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

fn collect_files_recursive(base: &Path, dir: &Path) -> Vec<String> {
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

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| format!("Failed to create dir {}: {e}", dst.display()))?;
    let entries =
        fs::read_dir(src).map_err(|e| format!("Failed to read dir {}: {e}", src.display()))?;
    for entry in entries.flatten() {
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        let metadata = entry
            .metadata()
            .map_err(|e| format!("Failed to read metadata {}: {e}", src_path.display()))?;
        // Skip symlinks to avoid following links outside the skills dir
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_dir() {
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

/// Read `skillsDir` from `directiv.config.json` if present
fn skills_dir_from_config() -> Option<PathBuf> {
    let content = fs::read_to_string(find_config_file().ok()?).ok()?;
    let json: serde_json::Value = serde_json::from_str(&content).ok()?;
    let path = PathBuf::from(json.get("skillsDir")?.as_str()?);
    path.is_dir().then(|| path.canonicalize().ok())?
}

/// Resolve user skills directory: config `skillsDir` > `~/.directiv/skills/` > None
fn resolve_user_skills_dir() -> Option<PathBuf> {
    if let Some(dir) = skills_dir_from_config() {
        return Some(dir);
    }

    let default_dir = dirs::home_dir()?.join(".directiv").join("skills");
    default_dir
        .is_dir()
        .then(|| default_dir.canonicalize().ok())?
}

/// Compute max mtime across all files in a directory tree (detects file edits, not just dir changes)
fn max_mtime_recursive(dir: &Path) -> Option<SystemTime> {
    let mut max: Option<SystemTime> = fs::metadata(dir).ok().and_then(|m| m.modified().ok());
    fn walk(path: &Path, max: &mut Option<SystemTime>) {
        let Ok(entries) = fs::read_dir(path) else {
            return;
        };
        for entry in entries.flatten() {
            let p = entry.path();
            if let Ok(mt) = fs::metadata(&p).and_then(|m| m.modified()) {
                *max = Some(max.map_or(mt, |prev| prev.max(mt)));
            }
            if p.is_dir() {
                walk(&p, max);
            }
        }
    }
    walk(dir, &mut max);
    max
}

fn scan_skills_dir(skills_dir: &Path, is_override: bool) -> Vec<PluginSkillInfo> {
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

        let (name, description) = fs::read_to_string(path.join("SKILL.md"))
            .map(|content| parse_skill_frontmatter(&content))
            .unwrap_or_default();

        let files = collect_files_recursive(&path, &path);

        skills.push(PluginSkillInfo {
            name: name.unwrap_or_else(|| folder_name.clone()),
            folder_name,
            description,
            files,
            is_override,
        });
    }
    skills
}

fn create_merged_plugin_dir(
    app: &tauri::AppHandle,
    bundled: &Path,
    user_skills: &Path,
) -> Result<PathBuf, String> {
    let temp_base = app.path().temp_dir().map_err(|e| e.to_string())?;
    let merged_base = temp_base.join("directiv-plugins");
    let ts = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let merged_dir = merged_base.join(format!("merged-{ts}-{}", std::process::id()));

    copy_dir_recursive(bundled, &merged_dir)?;

    // Overlay: replace bundled skills with user versions
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
            let _ = fs::remove_dir_all(&target);
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

/// Read a file if it exists and is safely contained within `base_dir` (no path traversal)
fn read_file_safely(base_dir: &Path, skill_name: &str, filename: &str) -> Option<String> {
    let file_path = base_dir.join(skill_name).join(filename);
    if !file_path.exists() {
        return None;
    }
    let canonical = file_path.canonicalize().ok()?;
    let canonical_base = base_dir.canonicalize().ok()?;
    if !canonical.starts_with(&canonical_base) {
        return None;
    }
    fs::read_to_string(&canonical).ok()
}

#[tauri::command]
pub fn get_plugin_dir(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let Some(bundled) = resolve_plugin_dir(&app)? else {
        return Ok(None);
    };

    let Some(user_skills) = resolve_user_skills_dir() else {
        return Ok(Some(bundled.to_string_lossy().to_string()));
    };

    let state = app.state::<MergedPluginState>();
    let mut inner = state.inner.lock().unwrap_or_else(|e| e.into_inner());

    let current_mtime = max_mtime_recursive(&user_skills);

    if let (Some(ref cached_dir), Some(cached_mt)) = (&inner.cached_dir, inner.cached_mtime) {
        if cached_dir.exists() && current_mtime == Some(cached_mt) {
            return Ok(Some(cached_dir.to_string_lossy().to_string()));
        }
    }

    if let Some(old_dir) = inner.cached_dir.take() {
        let _ = fs::remove_dir_all(&old_dir);
    }

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

    let mut bundled_skills = if bundled_skills_dir.exists() && bundled_skills_dir.is_dir() {
        scan_skills_dir(&bundled_skills_dir, false)
    } else {
        Vec::new()
    };

    if let Some(user_skills_dir) = resolve_user_skills_dir() {
        let user_skills = scan_skills_dir(&user_skills_dir, true);
        let user_folders: HashSet<&str> =
            user_skills.iter().map(|s| s.folder_name.as_str()).collect();
        bundled_skills.retain(|s| !user_folders.contains(s.folder_name.as_str()));
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

    // Try user skills first, then fall back to bundled
    if let Some(user_skills_dir) = resolve_user_skills_dir() {
        if let Some(content) = read_file_safely(&user_skills_dir, &skill_name, &filename) {
            return Ok(content);
        }
    }

    let plugin_dir =
        resolve_plugin_dir(&app)?.ok_or_else(|| "Plugin directory not found".to_string())?;
    let skills_dir = plugin_dir.join("skills");

    read_file_safely(&skills_dir, &skill_name, &filename)
        .ok_or_else(|| format!("File not found: {}/{}", skill_name, filename))
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
