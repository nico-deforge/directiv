use std::fs;
use std::path::{Path, PathBuf};

/// Canonical config location: `<config_dir>/directiv/config[.dev].json`
/// macOS: ~/Library/Application Support/directiv/config.json (release)
///        ~/Library/Application Support/directiv/config.dev.json (dev)
fn config_path() -> Result<PathBuf, String> {
    let base = dirs::config_dir().ok_or("Cannot determine config directory")?;
    let filename = if cfg!(debug_assertions) {
        "config.dev.json"
    } else {
        "config.json"
    };
    Ok(base.join("directiv").join(filename))
}

/// Walk up from cwd looking for `directiv.config.json` (legacy location).
/// Used only for one-time migration to the new path.
fn find_legacy_config() -> Option<PathBuf> {
    let cwd = std::env::current_dir().ok()?;
    let mut dir = cwd.as_path();
    loop {
        let candidate = dir.join("directiv.config.json");
        if candidate.exists() {
            return Some(candidate);
        }
        dir = dir.parent()?;
    }
}

#[tauri::command]
pub async fn load_config() -> Result<String, String> {
    let path = config_path()?;

    // 1. Try canonical location first
    if path.exists() {
        return fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read {}: {e}", path.display()));
    }

    // 2. Try legacy walk-up location for one-time migration
    if let Some(legacy) = find_legacy_config() {
        let content = fs::read_to_string(&legacy)
            .map_err(|e| format!("Failed to read legacy config {}: {e}", legacy.display()))?;

        // Migrate: write to new location
        if let Err(e) = write_config(&path, &content) {
            log::warn!(
                "Config migration failed ({} → {}): {e}",
                legacy.display(),
                path.display()
            );
        }

        return Ok(content);
    }

    // 3. No config found — return empty object (frontend fills defaults)
    Ok("{}".to_string())
}

#[tauri::command]
pub async fn save_config(json: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&json)
        .map_err(|e| format!("Invalid config JSON: {e}"))?;
    let path = config_path()?;
    write_config(&path, &json)
}

fn write_config(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
    }

    fs::write(path, content).map_err(|e| format!("Failed to write {}: {e}", path.display()))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Err(e) = fs::set_permissions(path, fs::Permissions::from_mode(0o600)) {
            log::warn!("Failed to set permissions on {}: {e}", path.display());
        }
    }

    Ok(())
}
