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
use types::{Emulator, TerminalConfig, TerminalStatus};

/// Build a human-readable display name from an identifier and optional task title.
///
/// Returns `"ACQ-145 — Fix login timeout"` when a title is provided,
/// or just `"ACQ-145"` when it is `None` or empty.
/// Titles are sanitized (control chars stripped) and truncated to 50 characters
/// (with an ellipsis appended when truncated).
pub fn format_display_name(identifier: &str, title: Option<&str>) -> String {
    match title {
        Some(t) if !t.is_empty() => {
            let sanitized: String = t.chars().filter(|c| !c.is_control()).collect();
            let char_count = sanitized.chars().count();
            let truncated = if char_count > 50 {
                let end = sanitized
                    .char_indices()
                    .nth(50)
                    .map(|(i, _)| i)
                    .unwrap_or(sanitized.len());
                format!("{}…", &sanitized[..end])
            } else {
                sanitized
            };
            format!("{identifier} — {truncated}")
        }
        _ => identifier.to_string(),
    }
}

#[tauri::command]
pub async fn open_terminal(
    app: tauri::AppHandle,
    emulator: Emulator,
    session: String,
    identifier: String,
    worktree_path: String,
    title: Option<String>,
    layout: Option<types::TerminalLayout>,
) -> Result<bool, String> {
    let layout = layout.unwrap_or_default();

    match emulator {
        Emulator::Ghostty => {
            dispatch_terminal(
                &app,
                GhosttyController,
                &session,
                &identifier,
                &worktree_path,
                title.as_deref(),
                layout,
                &emulator,
            )
            .await
        }
        Emulator::Iterm2 => {
            dispatch_terminal(
                &app,
                ITermController,
                &session,
                &identifier,
                &worktree_path,
                title.as_deref(),
                layout,
                &emulator,
            )
            .await
        }
        Emulator::Cmux => {
            dispatch_terminal(
                &app,
                CmuxController,
                &session,
                &identifier,
                &worktree_path,
                title.as_deref(),
                layout,
                &emulator,
            )
            .await
        }
    }
}

#[allow(clippy::too_many_arguments)]
async fn dispatch_terminal(
    app: &tauri::AppHandle,
    controller: impl TerminalController,
    session: &str,
    identifier: &str,
    worktree_path: &str,
    title: Option<&str>,
    layout: types::TerminalLayout,
    emulator: &Emulator,
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
        title: title.map(|t| t.to_string()),
        worktree_path: worktree_path.to_string(),
        env_vars,
    };

    controller.create(app, &config).await?;

    // After creation, find and focus the new session (brings the app to the foreground)
    match controller
        .find_session(app, identifier, worktree_path)
        .await
    {
        Ok(Some(terminal_ref)) => {
            if let Err(e) = controller.focus(app, &terminal_ref).await {
                eprintln!("post-create focus failed (non-fatal): {e}");
            }
        }
        Ok(None) => {
            eprintln!("post-create find_session returned None for {identifier}");
        }
        Err(e) => {
            eprintln!("post-create find_session failed (non-fatal): {e}");
        }
    }

    if should_split {
        // Ghostty/iTerm2 need time for the emulator to register the session.
        // cmux's new-workspace is synchronous — the workspace is ready immediately.
        if !matches!(emulator, Emulator::Cmux) {
            tokio::time::sleep(std::time::Duration::from_millis(150)).await;
        }

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
                eprintln!("split: session not found, skipping for {identifier}");
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
    emulator: Emulator,
) -> Result<Vec<TerminalStatus>, String> {
    // cmux manages its own sessions — query them directly without tmux
    if matches!(emulator, Emulator::Cmux) {
        let sessions = CmuxController.list_sessions(&app).await?;
        let statuses = sessions
            .into_iter()
            .map(|(id, name)| {
                // Extract the identifier from the display name.
                // Display names follow the format "ACQ-145 — Fix login timeout";
                // split on the em-dash separator to get the identifier part.
                let session_name = name
                    .split_once(" \u{2014} ")
                    .map(|(ident, _)| ident.to_string())
                    .unwrap_or(name);
                TerminalStatus {
                    session_name,
                    identifier: id,
                    // cmux workspaces are always considered active: they persist until explicitly
                    // closed, unlike tmux sessions which can die without emulator cleanup.
                    active: true,
                }
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
    let emulator_sessions: Vec<(String, String)> = match emulator {
        Emulator::Ghostty => GhosttyController.list_sessions(&app).await?,
        Emulator::Iterm2 => ITermController.list_sessions(&app).await?,
        Emulator::Cmux => unreachable!(),
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

/// Open a URL in the cmux browser pane of a workspace identified by name.
///
/// Returns `true` if the URL was opened in cmux, `false` if no matching workspace
/// was found (the frontend should fall back to the system browser).
#[tauri::command]
pub async fn cmux_browser_open(
    app: tauri::AppHandle,
    workspace_name: String,
    url: String,
) -> Result<bool, String> {
    cmux::browser_open(&app, &workspace_name, &url).await
}

/// List all pending cmux notifications from `cmux list-notifications`.
///
/// Parses the pipe-separated output, maps workspace UUIDs to titles, and derives
/// notification categories via keyword matching on title/body.
#[tauri::command]
pub async fn cmux_list_notifications(
    app: tauri::AppHandle,
) -> Result<Vec<CmuxNotification>, String> {
    cmux::list_notifications(&app).await
}

/// Set a sidebar status pill in a cmux workspace.
///
/// The key identifies the pill (e.g. "linear", "pr", "ci") and value is the display text.
/// Accepts the task identifier — the inner function resolves it to the workspace ref
/// via prefix matching on workspace titles. If cmux is not running, this is a no-op.
#[tauri::command]
pub async fn cmux_set_status(
    app: tauri::AppHandle,
    workspace_name: String,
    key: String,
    value: String,
) -> Result<(), String> {
    cmux::set_status(&app, &workspace_name, &key, &value).await
}

/// Set the progress bar value in a cmux workspace (0.0–1.0).
///
/// Accepts the task identifier — resolved to workspace ref internally.
/// Best-effort — no-ops when cmux is not running.
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

/// Read the terminal pane content for a cmux workspace.
///
/// Looks up the workspace by name, then reads the last 50 lines via `cmux read-screen`.
/// Returns empty string if cmux is not running or the workspace is not found.
#[tauri::command]
pub async fn cmux_capture_pane(
    app: tauri::AppHandle,
    workspace_name: String,
) -> Result<String, String> {
    cmux::capture_pane(&app, &workspace_name).await
}

/// Check whether cmux is installed and running via `cmux ping`.
/// Returns true if cmux is available, false if not installed or not running.
#[tauri::command]
pub async fn cmux_ping(app: tauri::AppHandle) -> Result<bool, String> {
    let output = app
        .shell()
        .command(cmux::resolve_cmux_path())
        .args(["ping"])
        .output()
        .await;

    match output {
        Ok(out) => Ok(out.status.success()),
        Err(_) => Ok(false), // cmux binary not found or not executable
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_display_name_with_title() {
        assert_eq!(
            format_display_name("ACQ-145", Some("Fix login timeout")),
            "ACQ-145 — Fix login timeout"
        );
    }

    #[test]
    fn test_format_display_name_no_title() {
        assert_eq!(format_display_name("ACQ-145", None), "ACQ-145");
    }

    #[test]
    fn test_format_display_name_empty_title() {
        assert_eq!(format_display_name("ACQ-145", Some("")), "ACQ-145");
    }

    #[test]
    fn test_format_display_name_strips_control_chars() {
        assert_eq!(
            format_display_name("ACQ-145", Some("Fix\x00bug\nhere")),
            "ACQ-145 — Fixbughere"
        );
    }

    #[test]
    fn test_format_display_name_truncates_long_title() {
        let long_title = "a".repeat(60);
        let result = format_display_name("ACQ-145", Some(&long_title));
        // 50 chars + ellipsis
        assert!(result.starts_with("ACQ-145 — "));
        assert!(result.ends_with('…'));
        // "ACQ-145 — " (10 chars) + 50 'a's + '…' (1 char)
        let suffix = &result["ACQ-145 — ".len()..];
        assert_eq!(suffix.chars().count(), 51); // 50 + ellipsis
    }

    #[test]
    fn test_format_display_name_unicode_not_truncated() {
        // 30 CJK characters — should NOT be truncated (under 50 char limit)
        let title = "\u{3042}".repeat(30);
        let result = format_display_name("ACQ-145", Some(&title));
        assert!(
            !result.contains('…'),
            "30-char Unicode title should not be truncated"
        );
    }

    #[test]
    fn test_format_display_name_unicode_truncated() {
        // 60 CJK characters — should be truncated to 50 + ellipsis
        let title = "\u{3042}".repeat(60);
        let result = format_display_name("ACQ-145", Some(&title));
        assert!(
            result.ends_with('…'),
            "60-char Unicode title should be truncated"
        );
    }
}
