use super::controller::TerminalController;
use super::types::{Emulator, TerminalConfig, TerminalRef};
use serde::{Deserialize, Serialize};
use tauri_plugin_shell::ShellExt;

pub struct CmuxController;

/// Run a cmux CLI command and return stdout trimmed.
/// If cmux is not running, returns an Err with a clear message.
async fn run_cmux(
    app: &tauri::AppHandle,
    args: &[&str],
    operation: &str,
) -> Result<String, String> {
    let output = app
        .shell()
        .command("cmux")
        .args(args)
        .output()
        .await
        .map_err(|e| format!("cmux {operation}: failed to execute: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("cmux {operation} failed: {stderr}"));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Check that cmux is installed and running via `cmux ping`.
/// Used in `find_session`, `create`, `focus`, and `list_sessions` to surface a clear error
/// instead of a cryptic "command not found".
async fn check_cmux_available(app: &tauri::AppHandle) -> Result<(), String> {
    let output = app
        .shell()
        .command("cmux")
        .args(["ping"])
        .output()
        .await
        .map_err(|_| {
            "cmux is not installed. Please install cmux to use it as a terminal backend."
                .to_string()
        })?;

    if !output.status.success() {
        return Err(
            "cmux is not running. Please launch cmux before using it as a terminal backend."
                .to_string(),
        );
    }

    Ok(())
}

/// Shape of a single workspace returned by `cmux list-workspaces --json`.
/// The `working_directory` field uses serde rename to handle the camelCase JSON key.
/// cmux may use either "workingDirectory" or "path" for the working directory.
#[derive(Deserialize)]
struct CmuxWorkspace {
    id: String,
    name: String,
    #[serde(alias = "workingDirectory", alias = "path", default)]
    working_directory: String,
}

/// Shape of a single workspace returned by `cmux new-workspace --json`.
#[derive(Deserialize)]
struct CmuxNewWorkspace {
    id: String,
}

impl TerminalController for CmuxController {
    /// Find an existing cmux workspace by name (identifier) or working directory.
    ///
    /// Strategy: list all workspaces via `cmux list-workspaces --json` and search
    /// for a match by name first, then by working directory prefix.
    async fn find_session(
        &self,
        app: &tauri::AppHandle,
        identifier: &str,
        worktree_path: &str,
    ) -> Result<Option<TerminalRef>, String> {
        check_cmux_available(app).await?;

        let json = match run_cmux(app, &["list-workspaces", "--json"], "find_session").await {
            Ok(s) => s,
            Err(e) => {
                // If no workspaces exist, cmux may return an error or empty array.
                if e.contains("no workspaces") || e.contains("empty") {
                    return Ok(None);
                }
                return Err(e);
            }
        };

        if json.is_empty() || json == "[]" || json == "null" {
            return Ok(None);
        }

        let workspaces: Vec<CmuxWorkspace> = serde_json::from_str(&json)
            .map_err(|e| format!("cmux find_session: failed to parse workspace list: {e}"))?;

        // Match by name first (exact match with identifier)
        for ws in &workspaces {
            if ws.name == identifier {
                return Ok(Some(TerminalRef {
                    identifier: ws.id.clone(),
                    emulator: Emulator::Cmux,
                }));
            }
        }

        // Fallback: match by working directory.
        // Only check if the workspace's working dir starts with the target path,
        // not the reverse — avoids matching parent directories of the worktree.
        for ws in &workspaces {
            if ws.working_directory.starts_with(worktree_path) {
                return Ok(Some(TerminalRef {
                    identifier: ws.id.clone(),
                    emulator: Emulator::Cmux,
                }));
            }
        }

        Ok(None)
    }

    /// Focus an existing cmux workspace by its workspace ID.
    async fn focus(
        &self,
        app: &tauri::AppHandle,
        terminal_ref: &TerminalRef,
    ) -> Result<(), String> {
        check_cmux_available(app).await?;

        run_cmux(
            app,
            &["select-workspace", "--workspace", &terminal_ref.identifier],
            "focus",
        )
        .await?;
        Ok(())
    }

    /// Create a new cmux workspace, cd into the worktree, and launch the startup command.
    ///
    /// Flow:
    /// 1. `cmux new-workspace --name <identifier> --json` → captures workspace ID
    /// 2. Wait 200ms for shell readiness (`.zshrc` etc.) — no cmux equivalent of `tmux wait-for`
    /// 3. `cmux send --workspace <id> "cd <worktree_path>\r"` → navigate to worktree
    /// 4. If `config.command` is set: `cmux send --workspace <id> "<command>\r"` → run it
    ///
    /// # Assumptions
    /// - `cmux new-workspace --name <name> --json` returns a JSON object with `"id"` field.
    /// - `cmux send --workspace <uuid>` correctly targets the named workspace.
    /// - 200ms is sufficient for shell readiness after workspace creation (configurable if needed).
    async fn create(&self, app: &tauri::AppHandle, config: &TerminalConfig) -> Result<(), String> {
        check_cmux_available(app).await?;

        // Create the workspace and capture its ID
        let json = run_cmux(
            app,
            &["new-workspace", "--name", &config.identifier, "--json"],
            "create",
        )
        .await?;

        // Extract workspace UUID from JSON output.
        // Fall back to the identifier (name) if the output is not valid JSON
        // (e.g., cmux returns a raw ID string without JSON wrapping).
        let workspace_id = serde_json::from_str::<CmuxNewWorkspace>(&json)
            .map(|ws| ws.id)
            .unwrap_or_else(|_| {
                let trimmed = json.trim().to_string();
                if !trimmed.is_empty() && !trimmed.starts_with('{') {
                    trimmed
                } else {
                    config.identifier.clone()
                }
            });

        // Wait for shell readiness — cmux new-workspace is synchronous but the shell
        // (zsh/bash with .zshrc) needs a moment to finish initialization.
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;

        // Inject DIRECTIV env vars before cd/claude so the shell has them set.
        for (key, value) in &config.env_vars {
            let export_cmd = format!("export {}={}\r", shell_escape(key), shell_escape(value));
            run_cmux(
                app,
                &["send", "--workspace", &workspace_id, &export_cmd],
                "create:env",
            )
            .await?;
        }

        // Navigate to the worktree directory
        let cd_cmd = format!("cd {}\r", shell_escape(&config.worktree_path));
        run_cmux(
            app,
            &["send", "--workspace", &workspace_id, &cd_cmd],
            "create:cd",
        )
        .await?;

        // Send the startup command if provided. The command is shell-escaped to prevent
        // injection via untrusted input (e.g., a worktree path with special characters).
        if let Some(cmd) = &config.command {
            let escaped_cmd = format!("{}\r", shell_escape(cmd));
            run_cmux(
                app,
                &["send", "--workspace", &workspace_id, &escaped_cmd],
                "create:command",
            )
            .await?;
        }

        Ok(())
    }

    /// Split a cmux workspace. cmux workspaces are single-pane by design — splits
    /// are not supported. Log a message and succeed silently.
    async fn split(
        &self,
        _app: &tauri::AppHandle,
        terminal_ref: &TerminalRef,
        _worktree_path: &str,
    ) -> Result<(), String> {
        // cmux does not support pane splitting in its CLI as of the design doc.
        // Log and succeed — dispatch_terminal handles the case where split is a no-op.
        eprintln!(
            "cmux split: workspace {} does not support pane splitting, skipping",
            terminal_ref.identifier
        );
        Ok(())
    }

    /// List all active cmux workspaces.
    ///
    /// Returns a vec of (workspace_id, workspace_name) pairs.
    /// The workspace_id is the UUID used for targeting; workspace_name matches
    /// the identifier used when creating the workspace (e.g., "ACQ-145").
    async fn list_sessions(&self, app: &tauri::AppHandle) -> Result<Vec<(String, String)>, String> {
        check_cmux_available(app).await?;

        let json = match run_cmux(app, &["list-workspaces", "--json"], "list_sessions").await {
            Ok(s) => s,
            Err(e) => {
                if e.contains("not running") || e.contains("Not running") {
                    return Ok(vec![]);
                }
                return Err(e);
            }
        };

        if json.is_empty() || json == "[]" || json == "null" {
            return Ok(vec![]);
        }

        let workspaces: Vec<CmuxWorkspace> = serde_json::from_str(&json)
            .map_err(|e| format!("cmux list_sessions: failed to parse workspace list: {e}"))?;

        let sessions = workspaces.into_iter().map(|ws| (ws.id, ws.name)).collect();

        Ok(sessions)
    }
}

/// Close a cmux workspace by name. Finds the workspace by name and closes it.
/// Used by the `cmux_close_workspace` Tauri command as the cmux equivalent of tmux kill-session.
pub async fn close_workspace(app: &tauri::AppHandle, name: &str) -> Result<(), String> {
    check_cmux_available(app).await?;

    let json = run_cmux(app, &["list-workspaces", "--json"], "close_workspace").await?;

    if json.is_empty() || json == "[]" || json == "null" {
        return Ok(());
    }

    let workspaces: Vec<CmuxWorkspace> = serde_json::from_str(&json)
        .map_err(|e| format!("cmux close_workspace: failed to parse workspace list: {e}"))?;

    let workspace_id = workspaces
        .into_iter()
        .find(|ws| ws.name == name)
        .map(|ws| ws.id);

    let Some(id) = workspace_id else {
        return Ok(());
    };

    run_cmux(
        app,
        &["close-workspace", "--workspace", &id],
        "close_workspace",
    )
    .await?;

    Ok(())
}

/// Notification category as classified by cmux.
///
/// cmux hooks (pre-tool-use, notification, stop) classify agent states:
/// - Permission: Claude is requesting permission to run a tool
/// - Question: Claude is asking the user a question
/// - Error: Claude encountered an error
/// - Completed: Claude finished its task
/// - Waiting: Claude is waiting for user input (generic)
/// - Attention: Claude needs attention (other)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum NotificationCategory {
    Permission,
    Question,
    Error,
    Completed,
    Waiting,
    Attention,
}

impl NotificationCategory {
    /// Derive category from notification title/body when cmux does not expose it structurally.
    /// Mirrors the keyword classification logic used by cmux internally.
    fn from_text(title: &str, body: Option<&str>) -> Self {
        let text = format!(
            "{} {}",
            title.to_lowercase(),
            body.unwrap_or("").to_lowercase()
        );
        if text.contains("permission") || text.contains("allow") || text.contains("approve") {
            NotificationCategory::Permission
        } else if text.contains("error") || text.contains("failed") || text.contains("failure") {
            NotificationCategory::Error
        } else if text.contains("complete") || text.contains("finished") || text.contains("done") {
            NotificationCategory::Completed
        } else if text.contains("question") || text.contains("?") {
            NotificationCategory::Question
        } else {
            NotificationCategory::Waiting
        }
    }
}

/// A notification returned by `cmux list-notifications --json`.
///
/// The `category` field may or may not be present in the JSON depending on the cmux version.
/// When absent, it is derived from `title` and `body` using keyword matching.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawCmuxNotification {
    #[serde(default)]
    title: String,
    subtitle: Option<String>,
    body: Option<String>,
    #[serde(alias = "workspaceId", default)]
    workspace_id: String,
    /// Structured category from cmux — present only if cmux exposes it.
    category: Option<NotificationCategory>,
}

/// Parsed notification ready for the frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CmuxNotification {
    pub title: String,
    pub subtitle: Option<String>,
    pub body: Option<String>,
    pub workspace_id: String,
    pub category: NotificationCategory,
}

impl From<RawCmuxNotification> for CmuxNotification {
    fn from(raw: RawCmuxNotification) -> Self {
        let category = raw
            .category
            .unwrap_or_else(|| NotificationCategory::from_text(&raw.title, raw.body.as_deref()));
        CmuxNotification {
            title: raw.title,
            subtitle: raw.subtitle,
            body: raw.body,
            workspace_id: raw.workspace_id,
            category,
        }
    }
}

/// Query `cmux list-notifications --json` and return structured notifications.
///
/// Returns an empty vec if cmux is not running, not installed, or there are no notifications.
/// The JSON format assumption: cmux returns a JSON array of notification objects.
/// Category is parsed structurally if present, otherwise derived via keyword matching.
pub async fn list_notifications(app: &tauri::AppHandle) -> Result<Vec<CmuxNotification>, String> {
    check_cmux_available(app).await?;

    let json = match run_cmux(app, &["list-notifications", "--json"], "list_notifications").await {
        Ok(s) => s,
        Err(e) => {
            // No notifications or empty list is not an error
            if e.contains("no notifications") || e.contains("empty") || e.contains("not found") {
                return Ok(vec![]);
            }
            return Err(e);
        }
    };

    if json.is_empty() || json == "[]" || json == "null" {
        return Ok(vec![]);
    }

    let raw: Vec<RawCmuxNotification> = serde_json::from_str(&json)
        .map_err(|e| format!("cmux list_notifications: failed to parse notification list: {e}"))?;

    Ok(raw.into_iter().map(CmuxNotification::from).collect())
}

/// Set a sidebar status pill in a cmux workspace.
///
/// Calls `cmux set-status --workspace <workspace_name> <key> <value>`.
///
/// # Assumptions
/// - cmux set-status accepts: `--workspace <name_or_id> <key> <value>`
/// - Errors are surfaced to the caller but treated as best-effort by the Tauri command layer.
/// - Workspace is targeted by name (the identifier / issue ID used at workspace creation).
pub async fn set_status(
    app: &tauri::AppHandle,
    workspace_name: &str,
    key: &str,
    value: &str,
) -> Result<(), String> {
    // If cmux is not available, skip silently — sidebar status is best-effort.
    if !is_cmux_available(app).await {
        return Ok(());
    }

    // `cmux set-status --workspace <name> <key> <value>`
    run_cmux(
        app,
        &["set-status", "--workspace", workspace_name, key, value],
        "set_status",
    )
    .await?;

    Ok(())
}

/// Helper: check if cmux is available, returning false without error when not running.
/// Used by best-effort sidebar commands (progress, log) to skip silently.
async fn is_cmux_available(app: &tauri::AppHandle) -> bool {
    app.shell()
        .command("cmux")
        .args(["ping"])
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Set the progress bar in a cmux workspace.
///
/// Calls `cmux set-progress --workspace <workspace_name> <value>`.
/// Value is a float in the range 0.0–1.0 (e.g. 0.4 = 40%).
///
/// # Assumptions
/// - `cmux set-progress --workspace <name> <value>` accepts a decimal fraction.
/// - Best-effort: silently no-ops when cmux is not running.
pub async fn set_progress(
    app: &tauri::AppHandle,
    workspace_name: &str,
    value: f64,
) -> Result<(), String> {
    if !is_cmux_available(app).await {
        return Ok(());
    }

    let value_str = format!("{value:.2}");
    run_cmux(
        app,
        &["set-progress", "--workspace", workspace_name, &value_str],
        "set_progress",
    )
    .await?;

    Ok(())
}

/// Append a log entry to the cmux workspace log panel.
///
/// Calls `cmux log --workspace <workspace_name> --level <level> <message>`.
/// Level is one of: info, success, warning, error.
///
/// # Assumptions
/// - `cmux log --workspace <name> --level <level> <message>` appends to the log panel.
/// - Best-effort: silently no-ops when cmux is not running.
pub async fn log_entry(
    app: &tauri::AppHandle,
    workspace_name: &str,
    level: &str,
    message: &str,
) -> Result<(), String> {
    if !is_cmux_available(app).await {
        return Ok(());
    }

    run_cmux(
        app,
        &[
            "log",
            "--workspace",
            workspace_name,
            "--level",
            level,
            message,
        ],
        "log",
    )
    .await?;

    Ok(())
}

/// Clear the progress bar in a cmux workspace.
///
/// Calls `cmux clear-progress --workspace <workspace_name>`.
/// Used when a task is stopped or completed.
pub async fn clear_progress(app: &tauri::AppHandle, workspace_name: &str) -> Result<(), String> {
    if !is_cmux_available(app).await {
        return Ok(());
    }

    run_cmux(
        app,
        &["clear-progress", "--workspace", workspace_name],
        "clear_progress",
    )
    .await?;

    Ok(())
}

/// Clear the log panel in a cmux workspace.
///
/// Calls `cmux clear-log --workspace <workspace_name>`.
/// Used when a task is stopped or completed.
pub async fn clear_log(app: &tauri::AppHandle, workspace_name: &str) -> Result<(), String> {
    if !is_cmux_available(app).await {
        return Ok(());
    }

    run_cmux(
        app,
        &["clear-log", "--workspace", workspace_name],
        "clear_log",
    )
    .await?;

    Ok(())
}

/// Shell-escape a string by wrapping it in single quotes and escaping internal single quotes.
fn shell_escape(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_workspace_id_from_json_standard() {
        let json = r#"{"id": "abc-123", "name": "ACQ-145"}"#;
        let ws: CmuxNewWorkspace = serde_json::from_str(json).unwrap();
        assert_eq!(ws.id, "abc-123");
    }

    #[test]
    fn test_parse_workspace_id_from_json_uuid() {
        let json = r#"{"id": "550e8400-e29b-41d4-a716-446655440000", "name": "test"}"#;
        let ws: CmuxNewWorkspace = serde_json::from_str(json).unwrap();
        assert_eq!(ws.id, "550e8400-e29b-41d4-a716-446655440000");
    }

    #[test]
    fn test_parse_workspace_id_from_json_missing() {
        let json = r#"{"name": "ACQ-145"}"#;
        let result: Result<CmuxNewWorkspace, _> = serde_json::from_str(json);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_workspace_id_from_json_empty() {
        let result: Result<CmuxNewWorkspace, _> = serde_json::from_str("");
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_workspaces_from_json_single() {
        let json =
            r#"[{"id": "abc-123", "name": "ACQ-145", "workingDirectory": "/path/to/worktree"}]"#;
        let workspaces: Vec<CmuxWorkspace> = serde_json::from_str(json).unwrap();
        assert_eq!(workspaces.len(), 1);
        assert_eq!(workspaces[0].id, "abc-123");
        assert_eq!(workspaces[0].name, "ACQ-145");
        assert_eq!(workspaces[0].working_directory, "/path/to/worktree");
    }

    #[test]
    fn test_parse_workspaces_from_json_multiple() {
        let json = r#"[
            {"id": "id-1", "name": "ACQ-145", "workingDirectory": "/path/a"},
            {"id": "id-2", "name": "ACQ-146", "workingDirectory": "/path/b"}
        ]"#;
        let workspaces: Vec<CmuxWorkspace> = serde_json::from_str(json).unwrap();
        assert_eq!(workspaces.len(), 2);
        assert_eq!(workspaces[0].id, "id-1");
        assert_eq!(workspaces[0].name, "ACQ-145");
        assert_eq!(workspaces[1].id, "id-2");
        assert_eq!(workspaces[1].name, "ACQ-146");
    }

    #[test]
    fn test_parse_workspaces_from_json_empty_array() {
        let json = "[]";
        let workspaces: Vec<CmuxWorkspace> = serde_json::from_str(json).unwrap();
        assert!(workspaces.is_empty());
    }

    #[test]
    fn test_parse_workspaces_from_json_fallback_path_field() {
        // cmux may use "path" instead of "workingDirectory"
        let json = r#"[{"id": "abc-123", "name": "ACQ-145", "path": "/alt/path"}]"#;
        let workspaces: Vec<CmuxWorkspace> = serde_json::from_str(json).unwrap();
        assert_eq!(workspaces.len(), 1);
        assert_eq!(workspaces[0].working_directory, "/alt/path");
    }

    #[test]
    fn test_shell_escape_plain() {
        assert_eq!(shell_escape("/path/to/worktree"), "'/path/to/worktree'");
    }

    #[test]
    fn test_shell_escape_with_spaces() {
        assert_eq!(
            shell_escape("/path with spaces/dir"),
            "'/path with spaces/dir'"
        );
    }

    #[test]
    fn test_shell_escape_with_single_quote() {
        // Single quotes in path are escaped: it's → 'it'\''s'
        assert_eq!(shell_escape("/path/it's/dir"), "'/path/it'\\''s/dir'");
    }

    // --- Notification tests ---

    #[test]
    fn test_parse_notification_with_structured_category() {
        let json = r#"[{
            "title": "Permission Request",
            "body": "Allow bash command?",
            "workspaceId": "ws-123",
            "category": "permission"
        }]"#;
        let raw: Vec<RawCmuxNotification> = serde_json::from_str(json).unwrap();
        let notifications: Vec<CmuxNotification> =
            raw.into_iter().map(CmuxNotification::from).collect();
        assert_eq!(notifications.len(), 1);
        assert_eq!(notifications[0].category, NotificationCategory::Permission);
        assert_eq!(notifications[0].workspace_id, "ws-123");
    }

    #[test]
    fn test_parse_notification_category_fallback_permission() {
        let json = r#"[{
            "title": "Tool permission needed",
            "body": "approve this?",
            "workspaceId": "ws-1"
        }]"#;
        let raw: Vec<RawCmuxNotification> = serde_json::from_str(json).unwrap();
        let n = CmuxNotification::from(raw.into_iter().next().unwrap());
        assert_eq!(n.category, NotificationCategory::Permission);
    }

    #[test]
    fn test_parse_notification_category_fallback_error() {
        let json = r#"[{
            "title": "Task failed",
            "body": "An error occurred",
            "workspaceId": "ws-2"
        }]"#;
        let raw: Vec<RawCmuxNotification> = serde_json::from_str(json).unwrap();
        let n = CmuxNotification::from(raw.into_iter().next().unwrap());
        assert_eq!(n.category, NotificationCategory::Error);
    }

    #[test]
    fn test_parse_notification_category_fallback_completed() {
        let json = r#"[{
            "title": "Task complete",
            "workspaceId": "ws-3"
        }]"#;
        let raw: Vec<RawCmuxNotification> = serde_json::from_str(json).unwrap();
        let n = CmuxNotification::from(raw.into_iter().next().unwrap());
        assert_eq!(n.category, NotificationCategory::Completed);
    }

    #[test]
    fn test_parse_notification_category_fallback_waiting() {
        let json = r#"[{
            "title": "Awaiting input",
            "workspaceId": "ws-4"
        }]"#;
        let raw: Vec<RawCmuxNotification> = serde_json::from_str(json).unwrap();
        let n = CmuxNotification::from(raw.into_iter().next().unwrap());
        assert_eq!(n.category, NotificationCategory::Waiting);
    }

    #[test]
    fn test_parse_notification_empty_array() {
        let json = "[]";
        let raw: Vec<RawCmuxNotification> = serde_json::from_str(json).unwrap();
        assert!(raw.is_empty());
    }

    #[test]
    fn test_parse_notification_optional_fields() {
        let json = r#"[{"title": "hello", "workspaceId": "ws-5"}]"#;
        let raw: Vec<RawCmuxNotification> = serde_json::from_str(json).unwrap();
        let n = CmuxNotification::from(raw.into_iter().next().unwrap());
        assert!(n.subtitle.is_none());
        assert!(n.body.is_none());
    }
}
