use super::controller::TerminalController;
use super::types::{Emulator, TerminalConfig, TerminalRef};
use tauri_plugin_shell::ShellExt;

pub struct CmuxController;

/// Run a cmux CLI command and return (stdout, success).
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
/// Used in `find_session`, `create`, and `list_sessions` to surface a clear error
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

/// Parse the output of `cmux list-workspaces --json`.
///
/// # Assumptions (CLI validation skipped — see design doc)
/// Based on the cmux design doc, `cmux list-workspaces --json` returns a JSON array
/// of workspace objects. Each object has at least:
///   - `"id"`: UUID of the workspace
///   - `"name"`: name given at creation time
///   - `"workingDirectory"` or `"path"`: the working directory
///
/// The exact field names are documented assumptions. If cmux changes its JSON schema,
/// update the field names in `parse_workspace_id_from_json` and `parse_workspaces_from_json`.
fn parse_workspace_id_from_json(json: &str) -> Option<String> {
    // Look for `"id": "..."` in the JSON output of `cmux new-workspace --json`.
    // This handles simple single-object JSON. We avoid pulling in serde_json to
    // keep the dependency surface minimal — cmux.rs is the only caller.
    parse_json_string_field(json, "id")
}

fn parse_json_string_field(json: &str, field: &str) -> Option<String> {
    // Find `"<field>": "` and extract the value up to the closing `"`.
    let needle = format!("\"{field}\": \"");
    let start = json.find(&needle)? + needle.len();
    let rest = &json[start..];
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}

/// Parse `cmux list-workspaces --json` output into a vec of (workspace_id, workspace_name, working_dir).
fn parse_workspaces_from_json(json: &str) -> Vec<(String, String, String)> {
    // The output is a JSON array: [{"id":"...","name":"...","workingDirectory":"..."}, ...]
    // We parse it without serde_json by splitting on object boundaries.
    let mut results = Vec::new();

    // Split on `},{` to get individual objects (tolerating whitespace via trim)
    // Works for flat JSON arrays of flat objects (no nested objects in the fields we care about).
    let trimmed = json.trim().trim_start_matches('[').trim_end_matches(']');
    for obj in split_json_objects(trimmed) {
        let id = parse_json_string_field(obj, "id").unwrap_or_default();
        let name = parse_json_string_field(obj, "name").unwrap_or_default();
        // cmux may use "workingDirectory" or "path" — try both.
        let working_dir = parse_json_string_field(obj, "workingDirectory")
            .or_else(|| parse_json_string_field(obj, "path"))
            .unwrap_or_default();

        if !id.is_empty() {
            results.push((id, name, working_dir));
        }
    }

    results
}

/// Naive JSON object splitter: splits a JSON array body on `},{` boundaries.
/// Does not handle nested objects — sufficient for flat cmux workspace objects.
fn split_json_objects(s: &str) -> Vec<&str> {
    // We need to split on `}` followed by `,` then `{` (with optional whitespace).
    // Since cmux objects are flat, we can split on `},{` patterns.
    let mut results = Vec::new();
    let mut depth = 0i32;
    let mut start = 0;

    for (i, ch) in s.char_indices() {
        match ch {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    let slice = s[start..=i].trim();
                    if !slice.is_empty() {
                        results.push(slice);
                    }
                    start = i + 1;
                }
            }
            _ => {}
        }
    }

    results
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

        let workspaces = parse_workspaces_from_json(&json);

        // Match by name first (exact match with identifier)
        for (id, name, _) in &workspaces {
            if name == identifier {
                return Ok(Some(TerminalRef {
                    identifier: id.clone(),
                    emulator: Emulator::Cmux,
                }));
            }
        }

        // Fallback: match by working directory
        for (id, _, working_dir) in &workspaces {
            if working_dir.starts_with(worktree_path)
                || worktree_path.starts_with(working_dir.as_str())
            {
                return Ok(Some(TerminalRef {
                    identifier: id.clone(),
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
        run_cmux(
            app,
            &["select-workspace", "--workspace", &terminal_ref.identifier],
            "focus",
        )
        .await?;
        Ok(())
    }

    /// Create a new cmux workspace, cd into the worktree, and launch Claude.
    ///
    /// Flow:
    /// 1. `cmux new-workspace --name <identifier> --json` → captures workspace ID
    /// 2. Wait 200ms for shell readiness (`.zshrc` etc.) — no cmux equivalent of `tmux wait-for`
    /// 3. `cmux send --workspace <id> "cd <worktree_path>\r"` → navigate to worktree
    /// 4. `cmux send --workspace <id> "<claude_command>\r"` → launch Claude
    ///
    /// # Assumptions
    /// - `cmux new-workspace --name <name> --json` returns a JSON object with `"id"` field.
    /// - `cmux send --workspace <uuid>` correctly targets the named workspace.
    /// - 200ms is sufficient for shell readiness after workspace creation (configurable if needed).
    /// - The `session` field in `TerminalConfig` contains the Claude command to run.
    async fn create(&self, app: &tauri::AppHandle, config: &TerminalConfig) -> Result<(), String> {
        check_cmux_available(app).await?;

        // Create the workspace and capture its ID
        let json = run_cmux(
            app,
            &["new-workspace", "--name", &config.identifier, "--json"],
            "create",
        )
        .await?;

        // Extract workspace UUID from JSON output
        // If `--json` is not supported or returns a plain UUID string, fall back to using the
        // name for targeting (which works if cmux supports name-based --workspace targeting).
        let workspace_id = parse_workspace_id_from_json(&json).unwrap_or_else(|| {
            // Fallback: cmux may return the raw ID without JSON wrapping,
            // or may not return anything. Use the identifier (name) as target.
            let trimmed = json.trim().to_string();
            if !trimmed.is_empty() && !trimmed.starts_with('{') {
                trimmed
            } else {
                config.identifier.clone()
            }
        });

        // Wait for shell readiness — cmux new-workspace is synchronous but the shell
        // (zsh/bash with .zshrc) needs a moment to finish initialization.
        // 200ms default, per design doc (R3 mitigation).
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

        // Build the Claude command from the session field.
        // In the standard Directiv flow, workflows.ts passes the full claude invocation
        // as the session parameter (consistent with how tmux.rs uses it).
        // We send it with a carriage return to execute immediately.
        let claude_cmd = format!("{}\r", config.session);
        run_cmux(
            app,
            &["send", "--workspace", &workspace_id, &claude_cmd],
            "create:claude",
        )
        .await?;

        Ok(())
    }

    /// Split a cmux workspace. cmux workspaces are single-pane by design — splits
    /// are not supported. This is a no-op for cmux; the design doc does not list
    /// split support as a cmux requirement (M1 scope).
    async fn split(
        &self,
        _app: &tauri::AppHandle,
        _terminal_ref: &TerminalRef,
        _worktree_path: &str,
    ) -> Result<(), String> {
        // cmux does not support pane splitting in its CLI as of the design doc.
        // Silently succeed — dispatch_terminal handles the case where split is a no-op.
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

        let workspaces = parse_workspaces_from_json(&json);
        let sessions = workspaces
            .into_iter()
            .map(|(id, name, _)| (id, name))
            .collect();

        Ok(sessions)
    }
}

/// Close a cmux workspace by name. Finds the workspace by name and closes it.
/// Used by the `cmux_close_workspace` Tauri command as the cmux equivalent of tmux kill-session.
pub async fn close_workspace(app: &tauri::AppHandle, name: &str) -> Result<(), String> {
    check_cmux_available(app).await?;

    // Find the workspace ID by name
    let json = run_cmux(app, &["list-workspaces", "--json"], "close_workspace").await?;

    if json.is_empty() || json == "[]" || json == "null" {
        // Nothing to close
        return Ok(());
    }

    let workspaces = parse_workspaces_from_json(&json);
    let workspace_id = workspaces
        .into_iter()
        .find(|(_, ws_name, _)| ws_name == name)
        .map(|(id, _, _)| id);

    let Some(id) = workspace_id else {
        // Workspace not found — treat as already gone
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

/// Shell-escape a path by wrapping it in single quotes and escaping internal single quotes.
fn shell_escape(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_workspace_id_from_json_standard() {
        let json = r#"{"id": "abc-123", "name": "ACQ-145"}"#;
        assert_eq!(
            parse_workspace_id_from_json(json),
            Some("abc-123".to_string())
        );
    }

    #[test]
    fn test_parse_workspace_id_from_json_uuid() {
        let json = r#"{"id": "550e8400-e29b-41d4-a716-446655440000", "name": "test"}"#;
        assert_eq!(
            parse_workspace_id_from_json(json),
            Some("550e8400-e29b-41d4-a716-446655440000".to_string())
        );
    }

    #[test]
    fn test_parse_workspace_id_from_json_missing() {
        let json = r#"{"name": "ACQ-145"}"#;
        assert_eq!(parse_workspace_id_from_json(json), None);
    }

    #[test]
    fn test_parse_workspace_id_from_json_empty() {
        assert_eq!(parse_workspace_id_from_json(""), None);
    }

    #[test]
    fn test_parse_workspaces_from_json_single() {
        let json =
            r#"[{"id": "abc-123", "name": "ACQ-145", "workingDirectory": "/path/to/worktree"}]"#;
        let result = parse_workspaces_from_json(json);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].0, "abc-123");
        assert_eq!(result[0].1, "ACQ-145");
        assert_eq!(result[0].2, "/path/to/worktree");
    }

    #[test]
    fn test_parse_workspaces_from_json_multiple() {
        let json = r#"[
            {"id": "id-1", "name": "ACQ-145", "workingDirectory": "/path/a"},
            {"id": "id-2", "name": "ACQ-146", "workingDirectory": "/path/b"}
        ]"#;
        let result = parse_workspaces_from_json(json);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].0, "id-1");
        assert_eq!(result[0].1, "ACQ-145");
        assert_eq!(result[1].0, "id-2");
        assert_eq!(result[1].1, "ACQ-146");
    }

    #[test]
    fn test_parse_workspaces_from_json_empty_array() {
        let json = "[]";
        let result = parse_workspaces_from_json(json);
        assert!(result.is_empty());
    }

    #[test]
    fn test_parse_workspaces_from_json_fallback_path_field() {
        // cmux may use "path" instead of "workingDirectory"
        let json = r#"[{"id": "abc-123", "name": "ACQ-145", "path": "/alt/path"}]"#;
        let result = parse_workspaces_from_json(json);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].2, "/alt/path");
    }

    #[test]
    fn test_parse_json_string_field_basic() {
        let json = r#"{"key": "value", "other": "stuff"}"#;
        assert_eq!(
            parse_json_string_field(json, "key"),
            Some("value".to_string())
        );
        assert_eq!(
            parse_json_string_field(json, "other"),
            Some("stuff".to_string())
        );
        assert_eq!(parse_json_string_field(json, "missing"), None);
    }

    #[test]
    fn test_split_json_objects_single() {
        let input = r#"{"id": "1", "name": "a"}"#;
        let result = split_json_objects(input);
        assert_eq!(result.len(), 1);
    }

    #[test]
    fn test_split_json_objects_multiple() {
        let input = r#"{"id": "1"}, {"id": "2"}, {"id": "3"}"#;
        let result = split_json_objects(input);
        assert_eq!(result.len(), 3);
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
}
