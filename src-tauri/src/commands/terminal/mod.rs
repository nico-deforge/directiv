pub mod controller;
pub mod ghostty;
pub mod iterm;
pub mod types;

use controller::TerminalController;
use ghostty::GhosttyController;
use iterm::ITermController;
use tauri_plugin_shell::ShellExt;
use types::TerminalConfig;

#[tauri::command]
pub async fn open_terminal(
    app: tauri::AppHandle,
    emulator: String,
    session: String,
    identifier: String,
    worktree_path: String,
    layout: Option<types::TerminalLayout>,
) -> Result<bool, String> {
    let layout = layout.unwrap_or_default();

    match emulator.as_str() {
        "ghostty" => {
            dispatch_terminal(
                &app,
                GhosttyController,
                &session,
                &identifier,
                &worktree_path,
                layout,
            )
            .await
        }
        "iterm2" => {
            dispatch_terminal(
                &app,
                ITermController,
                &session,
                &identifier,
                &worktree_path,
                layout,
            )
            .await
        }
        _ => Err(format!("Unknown terminal emulator: {emulator}")),
    }
}

async fn dispatch_terminal(
    app: &tauri::AppHandle,
    controller: impl TerminalController,
    session: &str,
    identifier: &str,
    worktree_path: &str,
    layout: types::TerminalLayout,
) -> Result<bool, String> {
    if let Some(terminal_ref) = controller
        .find_session(app, identifier, worktree_path)
        .await?
    {
        match controller.focus(app, &terminal_ref).await {
            Ok(()) => return Ok(true),
            Err(e) => {
                eprintln!("Focus failed (stale ref?), creating new: {e}");
            }
        }
    }

    let env_vars = std::collections::HashMap::from([
        ("DIRECTIV_TASK".to_string(), identifier.to_string()),
        ("DIRECTIV_WORKTREE".to_string(), worktree_path.to_string()),
        ("DIRECTIV_SESSION".to_string(), session.to_string()),
    ]);

    let config = TerminalConfig {
        identifier: identifier.to_string(),
        session: session.to_string(),
        worktree_path: worktree_path.to_string(),
        env_vars,
        layout,
    };

    controller.create(app, &config).await?;
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
