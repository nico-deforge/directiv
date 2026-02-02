use serde::Serialize;
use tauri_plugin_shell::ShellExt;

#[derive(Debug, Serialize, Clone)]
pub struct TmuxSession {
    pub name: String,
    pub attached: bool,
    pub windows: u32,
    pub created: String,
}

#[tauri::command]
pub async fn tmux_list_sessions(app: tauri::AppHandle) -> Result<Vec<TmuxSession>, String> {
    let output = app
        .shell()
        .command("tmux")
        .args([
            "list-sessions",
            "-F",
            "#{session_name}|#{session_attached}|#{session_windows}|#{session_created}",
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to run tmux: {e}"))?;

    let stderr = String::from_utf8_lossy(&output.stderr);
    if !output.status.success() {
        if stderr.contains("no server running") || stderr.contains("no current client") {
            return Ok(vec![]);
        }
        return Err(format!("tmux list-sessions failed: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let sessions = stdout
        .lines()
        .filter(|line| !line.is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(4, '|').collect();
            if parts.len() < 4 {
                return None;
            }
            Some(TmuxSession {
                name: parts[0].to_string(),
                attached: parts[1] == "1",
                windows: parts[2].parse().unwrap_or(0),
                created: parts[3].to_string(),
            })
        })
        .collect();

    Ok(sessions)
}

#[tauri::command]
pub async fn tmux_create_session(
    app: tauri::AppHandle,
    name: String,
    working_dir: Option<String>,
) -> Result<TmuxSession, String> {
    let mut args = vec!["new-session".to_string(), "-d".to_string(), "-s".to_string(), name.clone()];

    if let Some(dir) = &working_dir {
        args.push("-c".to_string());
        args.push(dir.clone());
    }

    let output = app
        .shell()
        .command("tmux")
        .args(&args)
        .output()
        .await
        .map_err(|e| format!("Failed to run tmux: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("tmux new-session failed: {stderr}"));
    }

    Ok(TmuxSession {
        name,
        attached: false,
        windows: 1,
        created: String::new(),
    })
}

#[tauri::command]
pub async fn tmux_kill_session(app: tauri::AppHandle, name: String) -> Result<(), String> {
    let output = app
        .shell()
        .command("tmux")
        .args(["kill-session", "-t", &name])
        .output()
        .await
        .map_err(|e| format!("Failed to run tmux: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("tmux kill-session failed: {stderr}"));
    }

    Ok(())
}

#[tauri::command]
pub async fn tmux_send_keys(
    app: tauri::AppHandle,
    session: String,
    keys: String,
) -> Result<(), String> {
    let output = app
        .shell()
        .command("tmux")
        .args(["send-keys", "-t", &session, &keys, "Enter"])
        .output()
        .await
        .map_err(|e| format!("Failed to run tmux: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("tmux send-keys failed: {stderr}"));
    }

    Ok(())
}

#[tauri::command]
pub async fn tmux_capture_pane(app: tauri::AppHandle, session: String) -> Result<String, String> {
    let output = app
        .shell()
        .command("tmux")
        .args(["capture-pane", "-t", &session, "-p"])
        .output()
        .await
        .map_err(|e| format!("Failed to run tmux: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("tmux capture-pane failed: {stderr}"));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}
