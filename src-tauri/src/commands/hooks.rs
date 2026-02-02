use tauri_plugin_shell::ShellExt;

#[tauri::command]
pub async fn run_hooks(
    app: tauri::AppHandle,
    commands: Vec<String>,
    working_dir: String,
) -> Result<(), String> {
    for cmd in &commands {
        let output = app
            .shell()
            .command("sh")
            .args(["-c", cmd])
            .current_dir(&working_dir)
            .output()
            .await
            .map_err(|e| format!("Failed to run hook `{cmd}`: {e}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Hook `{cmd}` failed: {stderr}"));
        }
    }

    Ok(())
}
