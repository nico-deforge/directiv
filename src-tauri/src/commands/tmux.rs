use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct TmuxSession {
    pub name: String,
    pub attached: bool,
    pub windows: u32,
    pub created: String,
}

#[tauri::command]
pub async fn tmux_list_sessions(_app: tauri::AppHandle) -> Result<Vec<TmuxSession>, String> {
    Err("Not implemented".into())
}

#[tauri::command]
pub async fn tmux_create_session(
    _app: tauri::AppHandle,
    _name: String,
    _working_dir: Option<String>,
) -> Result<TmuxSession, String> {
    Err("Not implemented".into())
}

#[tauri::command]
pub async fn tmux_kill_session(
    _app: tauri::AppHandle,
    _name: String,
) -> Result<(), String> {
    Err("Not implemented".into())
}

#[tauri::command]
pub async fn tmux_send_keys(
    _app: tauri::AppHandle,
    _session: String,
    _keys: String,
) -> Result<(), String> {
    Err("Not implemented".into())
}

#[tauri::command]
pub async fn tmux_capture_pane(
    _app: tauri::AppHandle,
    _session: String,
) -> Result<String, String> {
    Err("Not implemented".into())
}
