use tauri_plugin_shell::ShellExt;

/// Resolve the user's login shell from $SHELL, falling back to /bin/zsh.
fn user_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
}

#[tauri::command]
pub async fn run_hooks(
    app: tauri::AppHandle,
    commands: Vec<String>,
    working_dir: String,
) -> Result<(), String> {
    let shell = user_shell();
    for cmd in &commands {
        let output = app
            .shell()
            .command(&shell)
            .args(["-lc", cmd])
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
