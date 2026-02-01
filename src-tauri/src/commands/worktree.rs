use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct WorktreeInfo {
    pub branch: String,
    pub path: String,
    pub issue_id: Option<String>,
}

#[tauri::command]
pub async fn worktree_list(_app: tauri::AppHandle) -> Result<Vec<WorktreeInfo>, String> {
    Err("Not implemented".into())
}

#[tauri::command]
pub async fn worktree_create(
    _app: tauri::AppHandle,
    _issue_id: String,
) -> Result<WorktreeInfo, String> {
    Err("Not implemented".into())
}

#[tauri::command]
pub async fn worktree_remove(
    _app: tauri::AppHandle,
    _branch: String,
) -> Result<(), String> {
    Err("Not implemented".into())
}
