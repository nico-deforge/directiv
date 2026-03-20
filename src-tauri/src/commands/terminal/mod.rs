pub mod cmux;
pub mod controller;
pub mod ghostty;
pub mod iterm;
pub mod types;

use cmux::{CmuxController, CmuxNotification};
use controller::TerminalController;
use ghostty::GhosttyController;
use iterm::ITermController;
use tauri_plugin_shell::ShellExt;
use types::{TerminalConfig, TerminalStatus};

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
        "cmux" => {
            dispatch_terminal(
                &app,
                CmuxController,
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

    let should_split = matches!(layout, types::TerminalLayout::SideBySide);

    let env_vars = std::collections::HashMap::from([
        ("DIRECTIV_TASK".to_string(), identifier.to_string()),
        ("DIRECTIV_WORKTREE".to_string(), worktree_path.to_string()),
        ("DIRECTIV_SESSION".to_string(), session.to_string()),
    ]);

    let config = TerminalConfig {
        identifier: identifier.to_string(),
        session: session.to_string(),
        // The session string doubles as a startup command for cmux workspaces.
        // Other controllers (Ghostty, iTerm2) use the session field directly.
        command: Some(session.to_string()),
        worktree_path: worktree_path.to_string(),
        env_vars,
    };

    controller.create(app, &config).await?;

    if should_split {
        // Give the terminal time to register before looking it up
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;

        match controller
            .find_session(app, identifier, worktree_path)
            .await
        {
            Ok(Some(terminal_ref)) => {
                if let Err(e) = controller.split(app, &terminal_ref, worktree_path).await {
                    eprintln!("split failed (non-fatal): {e}");
                }
            }
            Ok(None) => {
                eprintln!("split: session not found after delay, skipping for {identifier}");
            }
            Err(e) => {
                eprintln!("split: find_session failed (non-fatal): {e}");
            }
        }
    }

    Ok(false)
}

#[tauri::command]
pub async fn query_terminals(
    app: tauri::AppHandle,
    emulator: String,
) -> Result<Vec<TerminalStatus>, String> {
    // cmux manages its own sessions — query them directly without tmux
    if emulator == "cmux" {
        let sessions = CmuxController.list_sessions(&app).await?;
        let statuses = sessions
            .into_iter()
            .map(|(id, name)| TerminalStatus {
                session_name: name.clone(),
                identifier: id,
                // cmux workspaces are always considered active: they persist until explicitly
                // closed, unlike tmux sessions which can die without emulator cleanup.
                active: true,
            })
            .collect();
        return Ok(statuses);
    }

    // Get tmux sessions to know which Directiv sessions exist
    let tmux_output = app
        .shell()
        .command("tmux")
        .args(["list-sessions", "-F", "#{session_name}"])
        .output()
        .await
        .map_err(|e| format!("Failed to run tmux: {e}"))?;

    let tmux_sessions: std::collections::HashSet<String> = if tmux_output.status.success() {
        String::from_utf8_lossy(&tmux_output.stdout)
            .lines()
            .filter(|l| !l.is_empty())
            .map(|l| l.to_string())
            .collect()
    } else {
        std::collections::HashSet::new()
    };

    if tmux_sessions.is_empty() {
        return Ok(vec![]);
    }

    // Get emulator sessions
    let emulator_sessions: Vec<(String, String)> = match emulator.as_str() {
        "ghostty" => GhosttyController.list_sessions(&app).await?,
        "iterm2" => ITermController.list_sessions(&app).await?,
        _ => return Err(format!("Unknown terminal emulator: {emulator}")),
    };

    // Build a set of tmux session names that have a matching emulator terminal.
    // For Ghostty: the title is set to the identifier (task id), which matches the tmux session name.
    // For iTerm2: the name is "identifier — session", so we check if it starts with the session name.
    let mut active_in_emulator: std::collections::HashSet<String> =
        std::collections::HashSet::new();
    for (_emu_id, emu_name) in &emulator_sessions {
        for tmux_name in &tmux_sessions {
            if emu_name == tmux_name || emu_name.starts_with(&format!("{tmux_name} — ")) {
                active_in_emulator.insert(tmux_name.clone());
            }
        }
    }

    // Build result: one TerminalStatus per tmux session
    let statuses = tmux_sessions
        .into_iter()
        .map(|session_name| {
            let active = active_in_emulator.contains(&session_name);
            let identifier = emulator_sessions
                .iter()
                .find(|(_id, name)| {
                    name == &session_name || name.starts_with(&format!("{session_name} — "))
                })
                .map(|(id, _)| id.clone())
                .unwrap_or_default();
            TerminalStatus {
                session_name,
                identifier,
                active,
            }
        })
        .collect();

    Ok(statuses)
}

#[tauri::command]
pub async fn cmux_close_workspace(app: tauri::AppHandle, name: String) -> Result<(), String> {
    cmux::close_workspace(&app, &name).await
}

/// List all pending cmux notifications returned by `cmux list-notifications --json`.
///
/// Each notification includes title, subtitle, body, workspace_id, and a parsed category.
/// If no notifications exist or cmux is not running, returns an empty array.
/// The category is parsed structurally from the JSON; if absent, it is derived via keyword
/// matching on title/body (mirrors cmux's internal classification logic).
#[tauri::command]
pub async fn cmux_list_notifications(
    app: tauri::AppHandle,
) -> Result<Vec<CmuxNotification>, String> {
    cmux::list_notifications(&app).await
}

/// Set a sidebar status pill in a cmux workspace.
///
/// Calls `cmux set-status --workspace <workspace_id> <key> <value>`.
/// The key identifies the pill (e.g. "linear", "pr", "ci") and value is the display text.
/// This is a best-effort call — errors are silently swallowed so the app never crashes
/// due to a sidebar update failure. If cmux is not running, this is a no-op.
///
/// # Assumed CLI syntax
/// `cmux set-status --workspace <id> <key> <value>`
/// The workspace is targeted by ID (UUID returned by new-workspace) or by name.
/// We use the workspace name (= identifier / issue ID) for simplicity.
#[tauri::command]
pub async fn cmux_set_status(
    app: tauri::AppHandle,
    workspace_name: String,
    key: String,
    value: String,
) -> Result<(), String> {
    cmux::set_status(&app, &workspace_name, &key, &value).await
}

/// Set the progress bar value in a cmux workspace.
///
/// Calls `cmux set-progress --workspace <workspace_name> <value>` where value is 0.0–1.0.
/// Best-effort — silently no-ops when cmux is not running.
#[tauri::command]
pub async fn cmux_set_progress(
    app: tauri::AppHandle,
    workspace_name: String,
    value: f64,
) -> Result<(), String> {
    cmux::set_progress(&app, &workspace_name, value).await
}

/// Append a log entry to the cmux workspace log panel.
///
/// Calls `cmux log --workspace <workspace_name> --level <level> <message>`.
/// Level: "info" | "success" | "warning" | "error"
/// Best-effort — silently no-ops when cmux is not running.
#[tauri::command]
pub async fn cmux_log(
    app: tauri::AppHandle,
    workspace_name: String,
    level: String,
    message: String,
) -> Result<(), String> {
    cmux::log_entry(&app, &workspace_name, &level, &message).await
}

/// Clear the progress bar in a cmux workspace.
///
/// Calls `cmux clear-progress --workspace <workspace_name>`.
/// Called when a task is stopped.
#[tauri::command]
pub async fn cmux_clear_progress(
    app: tauri::AppHandle,
    workspace_name: String,
) -> Result<(), String> {
    cmux::clear_progress(&app, &workspace_name).await
}

/// Clear the log panel in a cmux workspace.
///
/// Calls `cmux clear-log --workspace <workspace_name>`.
/// Called when a task is stopped.
#[tauri::command]
pub async fn cmux_clear_log(app: tauri::AppHandle, workspace_name: String) -> Result<(), String> {
    cmux::clear_log(&app, &workspace_name).await
}

/// Check whether cmux is installed and running via `cmux ping`.
/// Returns true if cmux is available, false if not installed or not running.
#[tauri::command]
pub async fn cmux_ping(app: tauri::AppHandle) -> Result<bool, String> {
    let output = app.shell().command("cmux").args(["ping"]).output().await;

    match output {
        Ok(out) => Ok(out.status.success()),
        Err(_) => Ok(false), // cmux not installed
    }
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
