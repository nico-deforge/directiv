use tauri_plugin_shell::ShellExt;

async fn has_attached_clients(app: &tauri::AppHandle, session: &str) -> bool {
    app.shell()
        .command("tmux")
        .args(["list-clients", "-t", session])
        .output()
        .await
        .is_ok_and(|output| {
            output.status.success() && !String::from_utf8_lossy(&output.stdout).trim().is_empty()
        })
}

#[tauri::command]
pub async fn open_terminal(
    app: tauri::AppHandle,
    emulator: String,
    session: String,
    layout: Option<String>,
) -> Result<bool, String> {
    let _layout = match layout.as_deref() {
        Some("focus") => "focus",
        _ => "side-by-side",
    };

    if has_attached_clients(&app, &session).await {
        return Ok(true);
    }

    let user_shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let tmux_cmd = format!("tmux attach -t {session}");

    match emulator.as_str() {
        "ghostty" => {
            app.shell()
                .command("open")
                .args([
                    "-n",
                    "-a",
                    "Ghostty",
                    "--args",
                    "-e",
                    &user_shell,
                    "-lc",
                    &tmux_cmd,
                ])
                .spawn()
                .map_err(|e| format!("Failed to open Ghostty: {e}"))?;
        }
        "iterm2" => {
            let script = format!(
                r#"tell application "iTerm"
    activate
    create window with default profile
    tell current session of current window
        write text "tmux -CC attach -t {session}"
    end tell
end tell"#
            );
            app.shell()
                .command("osascript")
                .args(["-e", &script])
                .spawn()
                .map_err(|e| format!("Failed to open iTerm2: {e}"))?;
        }
        _ => return Err(format!("Unknown terminal emulator: {emulator}")),
    }

    Ok(false)
}

#[tauri::command]
pub async fn open_editor(
    app: tauri::AppHandle,
    editor: String,
    path: String,
) -> Result<(), String> {
    match editor.as_str() {
        "zed" => {
            app.shell()
                .command("zed")
                .arg(&path)
                .spawn()
                .map_err(|e| format!("Failed to open Zed: {e}"))?;
        }
        "cursor" => {
            app.shell()
                .command("cursor")
                .arg(&path)
                .spawn()
                .map_err(|e| format!("Failed to open Cursor: {e}"))?;
        }
        "vscode" | "code" => {
            app.shell()
                .command("code")
                .arg(&path)
                .spawn()
                .map_err(|e| format!("Failed to open VS Code: {e}"))?;
        }
        _ => return Err(format!("Unknown editor: {editor}")),
    }
    Ok(())
}
