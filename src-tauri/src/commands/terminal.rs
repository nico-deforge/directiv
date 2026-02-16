use tauri_plugin_shell::ShellExt;

async fn has_attached_clients(app: &tauri::AppHandle, session: &str) -> bool {
    let result = app
        .shell()
        .command("tmux")
        .args(["list-clients", "-t", session])
        .output()
        .await;
    match result {
        Ok(output) => {
            output.status.success()
                && !String::from_utf8_lossy(&output.stdout).trim().is_empty()
        }
        Err(_) => false,
    }
}

async fn activate_terminal(app: &tauri::AppHandle, emulator: &str) -> Result<(), String> {
    match emulator {
        "ghostty" => {
            app.shell()
                .command("open")
                .args(["-a", "Ghostty"])
                .spawn()
                .map_err(|e| format!("Failed to activate Ghostty: {e}"))?;
        }
        "iterm2" => {
            app.shell()
                .command("osascript")
                .args(["-e", r#"tell application "iTerm" to activate"#])
                .spawn()
                .map_err(|e| format!("Failed to activate iTerm2: {e}"))?;
        }
        _ => return Err(format!("Unknown terminal emulator: {emulator}")),
    }
    Ok(())
}

#[tauri::command]
pub async fn open_terminal(
    app: tauri::AppHandle,
    emulator: String,
    session: String,
) -> Result<(), String> {
    if has_attached_clients(&app, &session).await {
        return activate_terminal(&app, &emulator).await;
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

    Ok(())
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
