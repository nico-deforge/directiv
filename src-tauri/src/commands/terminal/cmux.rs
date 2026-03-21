use super::controller::TerminalController;
use super::format_display_name;
use super::types::{Emulator, TerminalConfig, TerminalRef};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::OnceLock;
use tauri_plugin_shell::ShellExt;

pub struct CmuxController;

/// Known locations where cmux may be installed on macOS.
/// GUI apps don't inherit the user's shell PATH, so we check these explicitly.
const CMUX_KNOWN_PATHS: &[&str] = &[
    "/usr/local/bin/cmux",
    "/Applications/cmux.app/Contents/Resources/bin/cmux",
    "/opt/homebrew/bin/cmux",
];

/// Cached resolved path to the cmux binary.
static CMUX_PATH: OnceLock<String> = OnceLock::new();

/// Resolve the cmux binary path, checking known locations if "cmux" isn't in PATH.
/// Caches the result for subsequent calls.
pub fn resolve_cmux_path() -> &'static str {
    CMUX_PATH.get_or_init(|| {
        // Check known absolute paths first (most reliable for GUI apps)
        for path in CMUX_KNOWN_PATHS {
            if Path::new(path).exists() {
                return path.to_string();
            }
        }
        // Fallback to bare name (relies on PATH)
        "cmux".to_string()
    })
}

/// Run a cmux CLI command and return stdout trimmed.
/// If cmux is not running, returns an Err with a clear message.
async fn run_cmux(
    app: &tauri::AppHandle,
    args: &[&str],
    operation: &str,
) -> Result<String, String> {
    let output = app
        .shell()
        .command(resolve_cmux_path())
        .args(args)
        .output()
        .await
        .map_err(|e| {
            format!(
                "cmux {operation}: failed to execute '{}': {e}",
                resolve_cmux_path()
            )
        })?;

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
        .command(resolve_cmux_path())
        .args(["ping"])
        .output()
        .await
        .map_err(|e| {
            format!(
                "cmux is not installed ({e}). Please install cmux to use it as a terminal backend."
            )
        })?;

    if !output.status.success() {
        return Err(
            "cmux is not running. Please launch cmux before using it as a terminal backend."
                .to_string(),
        );
    }

    Ok(())
}

/// Shape of a workspace from `cmux tree --all --json`.
/// Workspaces use `ref` (e.g. "workspace:18") and `title` (the display name).
#[derive(Deserialize)]
struct CmuxWorkspace {
    #[serde(rename = "ref")]
    ws_ref: String,
    title: String,
}

/// Top-level structure of `cmux tree --all --json`.
#[derive(Deserialize)]
struct CmuxTree {
    windows: Vec<CmuxWindow>,
}

#[derive(Deserialize)]
struct CmuxWindow {
    workspaces: Vec<CmuxWorkspace>,
}

/// List all workspaces via `cmux tree --all --json`.
async fn list_cmux_workspaces(app: &tauri::AppHandle) -> Result<Vec<CmuxWorkspace>, String> {
    let json = run_cmux(app, &["tree", "--all", "--json"], "list_workspaces").await?;

    if json.is_empty() {
        return Ok(vec![]);
    }

    let tree: CmuxTree = serde_json::from_str(&json)
        .map_err(|e| format!("cmux list_workspaces: failed to parse tree: {e}"))?;

    Ok(tree
        .windows
        .into_iter()
        .flat_map(|w| w.workspaces)
        .collect())
}

/// Check if a workspace title matches an identifier.
///
/// Supports both the old format (title == identifier, e.g. "ACQ-145")
/// and the new format with task title (e.g. "ACQ-145 — Fix login timeout").
fn title_matches_identifier(title: &str, identifier: &str) -> bool {
    if title == identifier {
        return true;
    }
    title
        .strip_prefix(identifier)
        .is_some_and(|rest| rest.starts_with(" \u{2014} "))
}

/// Resolve an identifier to its cmux workspace ref by prefix-matching titles.
///
/// Used by sidebar operations (set-status, set-progress, log, etc.) that receive
/// the identifier from the frontend but need the workspace ref (or full name) to
/// target the workspace after it was renamed to include the task title.
async fn resolve_workspace_ref_by_identifier(
    app: &tauri::AppHandle,
    identifier: &str,
) -> Option<String> {
    let workspaces = match list_cmux_workspaces(app).await {
        Ok(ws) => ws,
        Err(e) => {
            eprintln!(
                "resolve_workspace_ref_by_identifier: failed to list workspaces for '{identifier}': {e}"
            );
            return None;
        }
    };
    workspaces
        .into_iter()
        .find(|ws| title_matches_identifier(&ws.title, identifier))
        .map(|ws| ws.ws_ref)
}

/// Parse a workspace ref from `cmux new-workspace` output.
/// Output format: "OK workspace:N"
fn parse_workspace_ref(output: &str) -> Option<String> {
    output
        .split_whitespace()
        .find(|w| w.starts_with("workspace:"))
        .map(|s| s.to_string())
}

impl TerminalController for CmuxController {
    /// Find an existing cmux workspace by identifier.
    ///
    /// Strategy: list all workspaces via `cmux tree --all --json` and search
    /// for a match by title prefix (supports both "ACQ-145" and "ACQ-145 — Title").
    async fn find_session(
        &self,
        app: &tauri::AppHandle,
        identifier: &str,
        _worktree_path: &str,
    ) -> Result<Option<TerminalRef>, String> {
        check_cmux_available(app).await?;

        let workspaces = list_cmux_workspaces(app).await?;

        for ws in &workspaces {
            if title_matches_identifier(&ws.title, identifier) {
                return Ok(Some(TerminalRef {
                    identifier: ws.ws_ref.clone(),
                    emulator: Emulator::Cmux,
                }));
            }
        }

        Ok(None)
    }

    /// Focus an existing cmux workspace and bring cmux to the foreground.
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

        // Bring cmux app to the foreground
        match app
            .shell()
            .command("open")
            .args(["-a", "cmux"])
            .output()
            .await
        {
            Ok(out) if !out.status.success() => {
                let stderr = String::from_utf8_lossy(&out.stderr);
                eprintln!("cmux focus: 'open -a cmux' failed: {stderr}");
            }
            Err(e) => eprintln!("cmux focus: failed to run 'open': {e}"),
            _ => {}
        }

        Ok(())
    }

    /// Create a new cmux workspace, rename it, cd into the worktree, and launch the startup command.
    ///
    /// Flow:
    /// 1. `cmux new-workspace --cwd <worktree_path>` → returns "OK workspace:N"
    /// 2. `cmux rename-workspace --workspace <ref> <display_name>` → set display name (identifier + optional title)
    /// 3. Inject env vars via `cmux send`
    /// 4. If `config.command` is set: `cmux send --workspace <ref> "<command>\r"` → run it
    async fn create(&self, app: &tauri::AppHandle, config: &TerminalConfig) -> Result<(), String> {
        check_cmux_available(app).await?;

        // Create the workspace with --cwd to start in the worktree directory
        let output = run_cmux(
            app,
            &["new-workspace", "--cwd", &config.worktree_path],
            "create",
        )
        .await?;

        // Parse workspace ref from "OK workspace:N" output
        let ws_ref = parse_workspace_ref(&output)
            .ok_or_else(|| format!("cmux create: unexpected output: {output}"))?;

        // Rename the workspace to include the task title (e.g., "ACQ-145 — Fix login timeout")
        let display_name = format_display_name(&config.identifier, config.title.as_deref());
        run_cmux(
            app,
            &["rename-workspace", "--workspace", &ws_ref, &display_name],
            "create:rename",
        )
        .await?;

        // Inject DIRECTIV env vars before launching the command
        for (key, value) in &config.env_vars {
            let export_cmd = format!("export {}={}\r", shell_escape(key), shell_escape(value));
            run_cmux(
                app,
                &["send", "--workspace", &ws_ref, &export_cmd],
                "create:env",
            )
            .await?;
        }

        // Send the startup command if provided.
        // cmux send passes raw text to the terminal — no shell escaping needed.
        if let Some(cmd) = &config.command {
            let cmd_with_enter = format!("{cmd}\r");
            run_cmux(
                app,
                &["send", "--workspace", &ws_ref, &cmd_with_enter],
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
    /// Returns a vec of (workspace_ref, workspace_title) pairs.
    async fn list_sessions(&self, app: &tauri::AppHandle) -> Result<Vec<(String, String)>, String> {
        check_cmux_available(app).await?;

        let workspaces = list_cmux_workspaces(app).await?;

        Ok(workspaces
            .into_iter()
            .map(|ws| (ws.ws_ref, ws.title))
            .collect())
    }
}

/// Close a cmux workspace by identifier. Finds the workspace by identifier prefix and closes it.
/// Used by the `cmux_close_workspace` Tauri command as the cmux equivalent of tmux kill-session.
pub async fn close_workspace(app: &tauri::AppHandle, name: &str) -> Result<(), String> {
    check_cmux_available(app).await?;

    let workspaces = list_cmux_workspaces(app).await?;

    let ws_ref = workspaces
        .into_iter()
        .find(|ws| title_matches_identifier(&ws.title, name))
        .map(|ws| ws.ws_ref);

    let Some(r) = ws_ref else {
        return Ok(());
    };

    run_cmux(
        app,
        &["close-workspace", "--workspace", &r],
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
    /// Note: `Attention` is never produced by this method — it can only come from cmux's
    /// structured category field. Text-based fallback defaults to `Waiting`.
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
/// Accepts the task identifier (e.g. "ACQ-145") and resolves it to the workspace
/// ref via prefix matching, supporting both old ("ACQ-145") and new
/// ("ACQ-145 — Fix login timeout") workspace names.
pub async fn set_status(
    app: &tauri::AppHandle,
    workspace_name: &str,
    key: &str,
    value: &str,
) -> Result<(), String> {
    if !is_cmux_available(app).await {
        return Ok(());
    }

    let target = resolve_workspace_ref_by_identifier(app, workspace_name)
        .await
        .unwrap_or_else(|| workspace_name.to_string());

    run_cmux(
        app,
        &["set-status", "--workspace", &target, key, value],
        "set_status",
    )
    .await?;

    Ok(())
}

/// Helper: check if cmux is available, returning false without error when not running.
/// Used by best-effort sidebar commands (progress, log) to skip silently.
async fn is_cmux_available(app: &tauri::AppHandle) -> bool {
    check_cmux_available(app).await.is_ok()
}

/// Set the progress bar in a cmux workspace.
///
/// Value is a float 0.0–1.0 (e.g. 0.4 = 40%).
/// Accepts the task identifier and resolves it to the workspace ref.
/// Best-effort: no-ops when cmux is not running.
pub async fn set_progress(
    app: &tauri::AppHandle,
    workspace_name: &str,
    value: f64,
) -> Result<(), String> {
    if !is_cmux_available(app).await {
        return Ok(());
    }

    let target = resolve_workspace_ref_by_identifier(app, workspace_name)
        .await
        .unwrap_or_else(|| workspace_name.to_string());

    let value_str = format!("{value:.2}");
    run_cmux(
        app,
        &["set-progress", "--workspace", &target, &value_str],
        "set_progress",
    )
    .await?;

    Ok(())
}

/// Append a log entry to the cmux workspace log panel.
///
/// Level is one of: info, success, warning, error.
/// Accepts the task identifier and resolves it to the workspace ref.
/// Best-effort: no-ops when cmux is not running.
pub async fn log_entry(
    app: &tauri::AppHandle,
    workspace_name: &str,
    level: &str,
    message: &str,
) -> Result<(), String> {
    if !is_cmux_available(app).await {
        return Ok(());
    }

    let target = resolve_workspace_ref_by_identifier(app, workspace_name)
        .await
        .unwrap_or_else(|| workspace_name.to_string());

    run_cmux(
        app,
        &["log", "--workspace", &target, "--level", level, message],
        "log",
    )
    .await?;

    Ok(())
}

/// Clear the progress bar in a cmux workspace.
///
/// Accepts the task identifier and resolves it to the workspace ref.
/// Best-effort: no-ops when cmux is not running.
pub async fn clear_progress(app: &tauri::AppHandle, workspace_name: &str) -> Result<(), String> {
    if !is_cmux_available(app).await {
        return Ok(());
    }

    let target = resolve_workspace_ref_by_identifier(app, workspace_name)
        .await
        .unwrap_or_else(|| workspace_name.to_string());

    run_cmux(
        app,
        &["clear-progress", "--workspace", &target],
        "clear_progress",
    )
    .await?;

    Ok(())
}

/// Clear the log panel in a cmux workspace.
///
/// Accepts the task identifier and resolves it to the workspace ref.
/// Best-effort: no-ops when cmux is not running.
pub async fn clear_log(app: &tauri::AppHandle, workspace_name: &str) -> Result<(), String> {
    if !is_cmux_available(app).await {
        return Ok(());
    }

    let target = resolve_workspace_ref_by_identifier(app, workspace_name)
        .await
        .unwrap_or_else(|| workspace_name.to_string());

    run_cmux(app, &["clear-log", "--workspace", &target], "clear_log").await?;

    Ok(())
}

/// Open a URL in the cmux browser pane of a workspace identified by name.
///
/// Flow:
/// 1. Check cmux is available
/// 2. Find the workspace by title (name match)
/// 3. Open the URL in its browser pane via `cmux browser open <url> --workspace <ref>`
/// 4. Focus the workspace and bring cmux to the foreground
///
/// Returns `Ok(true)` if the URL was opened in cmux, `Ok(false)` if no matching workspace
/// was found (caller should fall back to the system browser).
pub async fn browser_open(
    app: &tauri::AppHandle,
    workspace_name: &str,
    url: &str,
) -> Result<bool, String> {
    if !is_cmux_available(app).await {
        eprintln!("cmux browser_open: cmux not available, deferring to system browser");
        return Ok(false);
    }

    let workspaces = list_cmux_workspaces(app).await?;
    let Some(ws) = workspaces
        .into_iter()
        .find(|ws| title_matches_identifier(&ws.title, workspace_name))
    else {
        eprintln!(
            "cmux browser_open: no workspace named '{workspace_name}', deferring to system browser"
        );
        return Ok(false);
    };
    let r = ws.ws_ref;

    run_cmux(
        app,
        &["browser", "open", url, "--workspace", &r],
        "browser_open",
    )
    .await?;

    // Focus the workspace and bring cmux to the foreground
    run_cmux(
        app,
        &["select-workspace", "--workspace", &r],
        "browser_open:focus",
    )
    .await?;

    match app
        .shell()
        .command("open")
        .args(["-a", "cmux"])
        .output()
        .await
    {
        Ok(out) if !out.status.success() => {
            let stderr = String::from_utf8_lossy(&out.stderr);
            eprintln!("cmux browser_open: 'open -a cmux' failed: {stderr}");
        }
        Err(e) => eprintln!("cmux browser_open: failed to run 'open': {e}"),
        _ => {}
    }

    Ok(true)
}

/// Shell-escape a string by wrapping it in single quotes and escaping internal single quotes.
fn shell_escape(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_workspace_ref_standard() {
        assert_eq!(
            parse_workspace_ref("OK workspace:25"),
            Some("workspace:25".to_string())
        );
    }

    #[test]
    fn test_parse_workspace_ref_with_whitespace() {
        assert_eq!(
            parse_workspace_ref("  OK workspace:7  \n"),
            Some("workspace:7".to_string())
        );
    }

    #[test]
    fn test_parse_workspace_ref_no_match() {
        assert_eq!(parse_workspace_ref("ERROR something"), None);
    }

    #[test]
    fn test_parse_workspace_ref_empty() {
        assert_eq!(parse_workspace_ref(""), None);
    }

    #[test]
    fn test_parse_tree_json() {
        let json = r#"{"windows": [{"workspaces": [
            {"ref": "workspace:1", "title": "ACQ-145", "index": 0, "selected": true, "active": true, "pinned": false, "panes": []},
            {"ref": "workspace:2", "title": "ACQ-146", "index": 1, "selected": false, "active": false, "pinned": false, "panes": []}
        ]}]}"#;
        let tree: CmuxTree = serde_json::from_str(json).unwrap();
        let workspaces: Vec<CmuxWorkspace> = tree
            .windows
            .into_iter()
            .flat_map(|w| w.workspaces)
            .collect();
        assert_eq!(workspaces.len(), 2);
        assert_eq!(workspaces[0].ws_ref, "workspace:1");
        assert_eq!(workspaces[0].title, "ACQ-145");
        assert_eq!(workspaces[1].ws_ref, "workspace:2");
        assert_eq!(workspaces[1].title, "ACQ-146");
    }

    #[test]
    fn test_parse_tree_json_empty() {
        let json = r#"{"windows": [{"workspaces": []}]}"#;
        let tree: CmuxTree = serde_json::from_str(json).unwrap();
        let workspaces: Vec<CmuxWorkspace> = tree
            .windows
            .into_iter()
            .flat_map(|w| w.workspaces)
            .collect();
        assert!(workspaces.is_empty());
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

    // --- Title matching tests ---

    #[test]
    fn test_title_matches_identifier_exact() {
        assert!(title_matches_identifier("ACQ-145", "ACQ-145"));
    }

    #[test]
    fn test_title_matches_identifier_with_title() {
        assert!(title_matches_identifier(
            "ACQ-145 \u{2014} Fix login timeout",
            "ACQ-145"
        ));
    }

    #[test]
    fn test_title_matches_identifier_no_match() {
        assert!(!title_matches_identifier("ACQ-146", "ACQ-145"));
    }

    #[test]
    fn test_title_matches_identifier_partial_no_match() {
        // "ACQ-14" should not match "ACQ-145 — ..."
        assert!(!title_matches_identifier(
            "ACQ-145 \u{2014} Fix login",
            "ACQ-14"
        ));
    }

    #[test]
    fn test_title_matches_identifier_prefix_without_separator() {
        // "ACQ-145X" should not match "ACQ-145"
        assert!(!title_matches_identifier("ACQ-145X", "ACQ-145"));
    }
}
