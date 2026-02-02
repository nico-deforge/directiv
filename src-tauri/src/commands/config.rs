use std::fs;
use std::path::PathBuf;

#[tauri::command]
pub async fn load_config() -> Result<String, String> {
    let path = find_config_file()?;
    fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {e}", path.display()))
}

fn find_config_file() -> Result<PathBuf, String> {
    let cwd = std::env::current_dir().map_err(|e| format!("Cannot get cwd: {e}"))?;

    // Walk up from cwd to find linair.config.json
    let mut dir = cwd.as_path();
    loop {
        let candidate = dir.join("linair.config.json");
        if candidate.exists() {
            return Ok(candidate);
        }
        match dir.parent() {
            Some(parent) => dir = parent,
            None => break,
        }
    }

    Err("linair.config.json not found".into())
}
