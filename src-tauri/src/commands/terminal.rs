use tauri_plugin_shell::ShellExt;

#[tauri::command]
pub async fn open_terminal(
    app: tauri::AppHandle,
    emulator: String,
    session: String,
) -> Result<(), String> {
    match emulator.as_str() {
        "ghostty" => {
            app.shell()
                .command("open")
                .args(["-n", "-a", "Ghostty", "--args", "-e", "tmux", "attach", "-t", &session])
                .spawn()
                .map_err(|e| format!("Failed to open Ghostty: {e}"))?;
        }
        "alacritty" => {
            app.shell()
                .command("open")
                .args(["-n", "-a", "Alacritty", "--args", "-e", "tmux", "attach", "-t", &session])
                .spawn()
                .map_err(|e| format!("Failed to open Alacritty: {e}"))?;
        }
        "iterm2" => {
            let script = format!(
                r#"tell application "iTerm"
    activate
    create window with default profile command "tmux attach -t {session}"
end tell"#
            );
            app.shell()
                .command("osascript")
                .args(["-e", &script])
                .spawn()
                .map_err(|e| format!("Failed to open iTerm2: {e}"))?;
        }
        "terminal" => {
            let script = format!(
                r#"tell application "Terminal"
    activate
    do script "tmux attach -t {session}"
end tell"#
            );
            app.shell()
                .command("osascript")
                .args(["-e", &script])
                .spawn()
                .map_err(|e| format!("Failed to open Terminal.app: {e}"))?;
        }
        _ => return Err(format!("Unknown terminal emulator: {emulator}")),
    }

    Ok(())
}
