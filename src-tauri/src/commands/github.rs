use tauri_plugin_shell::ShellExt;

#[tauri::command]
pub async fn get_github_token(app: tauri::AppHandle) -> Result<String, String> {
    let output = app
        .shell()
        .command("gh")
        .args(["auth", "token"])
        .output()
        .await
        .map_err(|e| format!("Failed to run gh: {e}. Is GitHub CLI installed?"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "gh auth token failed: {stderr}. Run 'gh auth login' to authenticate."
        ));
    }

    let token = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if token.is_empty() {
        return Err("No GitHub token found. Run 'gh auth login' to authenticate.".to_string());
    }

    Ok(token)
}
