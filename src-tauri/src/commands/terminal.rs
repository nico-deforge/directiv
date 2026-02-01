#[tauri::command]
pub async fn open_terminal(
    _app: tauri::AppHandle,
    _emulator: String,
    _session: String,
) -> Result<(), String> {
    Err("Not implemented".into())
}
