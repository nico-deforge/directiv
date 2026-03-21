use super::controller::TerminalController;
use super::format_display_name;
use super::types::{TerminalConfig, TerminalRef};
use tauri_plugin_shell::ShellExt;

pub struct ITermController;

/// Escape a string for safe interpolation into AppleScript double-quoted strings.
fn escape_applescript(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// Build an AppleScript that iterates all iTerm2 windows, tabs, and sessions
/// looking for a session whose `name` starts with the given identifier.
/// Returns "window_index,tab_index,session_index" if found, or "not_found".
fn build_find_script(identifier: &str) -> String {
    let identifier = escape_applescript(identifier);
    format!(
        r#"tell application "iTerm2"
    set winCount to count of windows
    repeat with w from 1 to winCount
        set theWindow to window w
        set tabCount to count of tabs of theWindow
        repeat with t from 1 to tabCount
            set theTab to tab t of theWindow
            set sessCount to count of sessions of theTab
            repeat with s from 1 to sessCount
                set theSession to session s of theTab
                if name of theSession starts with "{identifier}" then
                    return (w as text) & "," & (t as text) & "," & (s as text)
                end if
            end repeat
        end repeat
    end repeat
    return "not_found"
end tell"#,
        identifier = identifier
    )
}

/// Build an AppleScript that activates iTerm2 and focuses the window/tab
/// containing the session with the given identifier.
fn build_focus_script(identifier: &str) -> String {
    let identifier = escape_applescript(identifier);
    format!(
        r#"tell application "iTerm2"
    activate
    set winCount to count of windows
    repeat with w from 1 to winCount
        set theWindow to window w
        set tabCount to count of tabs of theWindow
        repeat with t from 1 to tabCount
            set theTab to tab t of theWindow
            set sessCount to count of sessions of theTab
            repeat with s from 1 to sessCount
                set theSession to session s of theTab
                if name of theSession starts with "{identifier}" then
                    select theWindow
                    tell theWindow
                        select theTab
                    end tell
                    tell theTab
                        select theSession
                    end tell
                    return "focused"
                end if
            end repeat
        end repeat
    end repeat
    return "not_found"
end tell"#,
        identifier = identifier
    )
}

/// Build a string of `KEY='VALUE'` pairs from the config's env_vars, suitable for
/// passing to the `env` command. Values are shell-quoted then AppleScript-escaped.
fn build_env_string(env_vars: &std::collections::HashMap<String, String>) -> String {
    let mut pairs: Vec<_> = env_vars.iter().collect();
    pairs.sort_by(|(a, _), (b, _)| a.cmp(b));
    pairs
        .iter()
        .map(|(k, v)| {
            let quoted = shell_quote(v);
            format!("{}={}", escape_applescript(k), escape_applescript(&quoted))
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Build an AppleScript that creates a new iTerm2 window with the default profile,
/// cds into the worktree path, attaches to the tmux session, and names the session.
/// If env_vars are present, they are injected via the `env` command wrapper.
fn build_create_script(config: &TerminalConfig) -> String {
    let display_name = format_display_name(&config.identifier, config.title.as_deref());
    let worktree_path = escape_applescript(&config.worktree_path);
    let session = escape_applescript(&config.session);
    let display_name = escape_applescript(&display_name);

    let tmux_cmd = format!("tmux -CC set-option allow-rename off \\\\; attach -t {session}");

    let command = if config.env_vars.is_empty() {
        tmux_cmd
    } else {
        let env_str = build_env_string(&config.env_vars);
        format!("env {env_str} {tmux_cmd}")
    };

    format!(
        r#"tell application "iTerm2"
    activate
    set newWindow to (create window with default profile)
    tell current session of newWindow
        write text "cd {worktree_path} && {command}"
        set name to "{display_name}"
    end tell
end tell"#,
        worktree_path = worktree_path,
        command = command,
        display_name = display_name,
    )
}

/// Build an AppleScript that splits the session matching the identifier vertically.
/// After splitting, `cd` into `worktree_path` in the new pane (iTerm2 split panes
/// don't always inherit the working directory).
fn build_split_script(identifier: &str, worktree_path: &str) -> String {
    let identifier = escape_applescript(identifier);
    let quoted_path = escape_applescript(&shell_quote(worktree_path));
    format!(
        r#"tell application "iTerm2"
    set winCount to count of windows
    repeat with w from 1 to winCount
        set theWindow to window w
        set tabCount to count of tabs of theWindow
        repeat with t from 1 to tabCount
            set theTab to tab t of theWindow
            set sessCount to count of sessions of theTab
            repeat with s from 1 to sessCount
                set theSession to session s of theTab
                if name of theSession starts with "{identifier}" then
                    tell theSession
                        set newSession to (split vertically with default profile)
                    end tell
                    tell newSession
                        write text "cd {quoted_path}"
                    end tell
                    return "split"
                end if
            end repeat
        end repeat
    end repeat
    return "not_found"
end tell"#,
        identifier = identifier,
        quoted_path = quoted_path,
    )
}

/// Execute an AppleScript via osascript and return the trimmed stdout.
/// The `operation` parameter is included in error messages for context.
async fn run_osascript(
    app: &tauri::AppHandle,
    script: &str,
    operation: &str,
) -> Result<String, String> {
    let output = app
        .shell()
        .command("osascript")
        .args(["-e", script])
        .output()
        .await
        .map_err(|e| format!("iTerm2 {operation}: failed to execute osascript: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("iTerm2 {operation}: osascript error: {stderr}"));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Build an AppleScript that lists all iTerm2 sessions with their unique IDs and names.
/// Returns lines of "window,tab,session|name".
fn build_list_sessions_script() -> String {
    r#"tell application "iTerm2"
    set output to ""
    set winCount to count of windows
    repeat with w from 1 to winCount
        set theWindow to window w
        set tabCount to count of tabs of theWindow
        repeat with t from 1 to tabCount
            set theTab to tab t of theWindow
            set sessCount to count of sessions of theTab
            repeat with s from 1 to sessCount
                set theSession to session s of theTab
                set sessName to name of theSession
                set sessId to (w as text) & "," & (t as text) & "," & (s as text)
                set output to output & sessId & "|" & sessName & linefeed
            end repeat
        end repeat
    end repeat
    return output
end tell"#
        .to_string()
}

impl TerminalController for ITermController {
    async fn find_session(
        &self,
        app: &tauri::AppHandle,
        identifier: &str,
        _worktree_path: &str,
    ) -> Result<Option<TerminalRef>, String> {
        let script = build_find_script(identifier);
        let result = run_osascript(app, &script, "find_session").await?;

        if result == "not_found" {
            Ok(None)
        } else {
            Ok(Some(TerminalRef {
                identifier: identifier.to_string(),
                emulator: super::types::Emulator::Iterm2,
            }))
        }
    }

    async fn focus(
        &self,
        app: &tauri::AppHandle,
        terminal_ref: &TerminalRef,
    ) -> Result<(), String> {
        let script = build_focus_script(&terminal_ref.identifier);
        let result = run_osascript(app, &script, "focus").await?;

        if result == "not_found" {
            return Err(format!(
                "iTerm2 session not found for identifier: {}",
                terminal_ref.identifier
            ));
        }

        Ok(())
    }

    async fn create(&self, app: &tauri::AppHandle, config: &TerminalConfig) -> Result<(), String> {
        let check = app
            .shell()
            .command("tmux")
            .args(["has-session", "-t", &config.session])
            .output()
            .await
            .map_err(|e| format!("Failed to check tmux session: {e}"))?;
        if !check.status.success() {
            return Err(format!("tmux session '{}' does not exist", config.session));
        }

        let script = build_create_script(config);
        run_osascript(app, &script, "create").await?;
        Ok(())
    }

    async fn split(
        &self,
        app: &tauri::AppHandle,
        terminal_ref: &TerminalRef,
        worktree_path: &str,
    ) -> Result<(), String> {
        let script = build_split_script(&terminal_ref.identifier, worktree_path);
        let result = run_osascript(app, &script, "split").await?;

        if result == "not_found" {
            return Err(format!(
                "iTerm2 session not found for split: {}",
                terminal_ref.identifier
            ));
        }

        Ok(())
    }

    async fn list_sessions(&self, app: &tauri::AppHandle) -> Result<Vec<(String, String)>, String> {
        let script = build_list_sessions_script();
        let result = run_osascript(app, &script, "list_sessions");

        let stdout = match result.await {
            Ok(s) => s,
            Err(e) => {
                if e.contains("not running") || e.contains("Not running") {
                    return Ok(vec![]);
                }
                return Err(e);
            }
        };

        let sessions = stdout
            .lines()
            .filter(|line| !line.is_empty())
            .filter_map(|line| {
                let (id, name) = line.split_once('|')?;
                Some((id.trim().to_string(), name.trim().to_string()))
            })
            .collect();

        Ok(sessions)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn test_build_find_script_contains_identifier() {
        let script = build_find_script("ACQ-145");
        assert!(script.contains(r#"tell application "iTerm2""#));
        assert!(script.contains(r#"starts with "ACQ-145""#));
        assert!(script.contains(r#"return "not_found""#));
        assert!(script.contains("every session") || script.contains("sessions"));
    }

    #[test]
    fn test_build_focus_script_activates_and_selects() {
        let script = build_focus_script("ACQ-145");
        assert!(script.contains("activate"));
        assert!(script.contains(r#"starts with "ACQ-145""#));
        assert!(script.contains("select theWindow"));
        assert!(script.contains("select theTab"));
        assert!(script.contains("select theSession"));
    }

    #[test]
    fn test_build_create_script_no_env_vars() {
        let config = TerminalConfig {
            identifier: "ACQ-145".to_string(),
            session: "acq-145".to_string(),
            command: None,
            title: None,
            worktree_path: "/path/to/worktree".to_string(),
            env_vars: HashMap::new(),
        };
        let script = build_create_script(&config);
        assert!(script.contains("create window with default profile"));
        assert!(script.contains(
            r#"cd /path/to/worktree && tmux -CC set-option allow-rename off \\; attach -t acq-145"#
        ));
        assert!(script.contains(r#"set name to "ACQ-145""#));
        // No env command when env_vars is empty
        assert!(!script.contains("env "));
    }

    #[test]
    fn test_build_create_script_with_env_vars() {
        let mut env_vars = HashMap::new();
        env_vars.insert("DIRECTIV_TASK".to_string(), "ACQ-145".to_string());
        env_vars.insert(
            "DIRECTIV_WORKTREE".to_string(),
            "/path/to/worktree".to_string(),
        );
        env_vars.insert("DIRECTIV_SESSION".to_string(), "acq-145".to_string());
        let config = TerminalConfig {
            identifier: "ACQ-145".to_string(),
            session: "acq-145".to_string(),
            command: None,
            title: None,
            worktree_path: "/path/to/worktree".to_string(),
            env_vars,
        };
        let script = build_create_script(&config);
        assert!(script.contains("create window with default profile"));
        // env vars are shell-quoted and sorted alphabetically
        assert!(script.contains("env DIRECTIV_SESSION='acq-145' DIRECTIV_TASK='ACQ-145' DIRECTIV_WORKTREE='/path/to/worktree' tmux -CC set-option allow-rename off"));
        assert!(script.contains(r#"set name to "ACQ-145""#));
        // set name must come AFTER the write text (tmux command)
        let write_pos = script.find("write text").unwrap();
        let name_pos = script.find("set name to").unwrap();
        assert!(write_pos < name_pos, "set name must come after write text");
    }

    #[test]
    fn test_build_create_script_env_vars_special_chars() {
        let mut env_vars = HashMap::new();
        env_vars.insert(
            "MY_VAR".to_string(),
            r#"value with "quotes" and \backslash"#.to_string(),
        );
        let config = TerminalConfig {
            identifier: "ACQ-145".to_string(),
            session: "acq-145".to_string(),
            command: None,
            title: None,
            worktree_path: "/path/to/worktree".to_string(),
            env_vars,
        };
        let script = build_create_script(&config);
        // Values are shell-quoted, then AppleScript-escaped
        assert!(script.contains(r#"MY_VAR='value with \"quotes\" and \\backslash'"#));
        assert!(script.contains("env "));
    }

    #[test]
    fn test_build_split_script_splits_vertically() {
        let script = build_split_script("ACQ-145", "/path/to/worktree");
        assert!(script.contains("split vertically with default profile"));
        assert!(script.contains(r#"starts with "ACQ-145""#));
        // Path is shell-quoted for safe cd
        assert!(script.contains(r#"write text "cd '/path/to/worktree'""#));
    }

    #[test]
    fn test_build_split_script_path_with_spaces() {
        let script = build_split_script("ACQ-145", "/Users/me/my projects/worktree");
        assert!(script.contains(r#"write text "cd '/Users/me/my projects/worktree'""#));
    }

    #[test]
    fn test_escape_applescript_basic() {
        assert_eq!(escape_applescript("hello"), "hello");
        assert_eq!(escape_applescript(r#"say "hi""#), r#"say \"hi\""#);
        assert_eq!(escape_applescript(r"path\to"), r"path\\to");
        assert_eq!(escape_applescript(r#"a\"b"#), r#"a\\\"b"#);
    }

    #[test]
    fn test_find_script_escapes_identifier() {
        let script = build_find_script(r#"malicious" & do shell script "rm -rf /""#);
        assert!(script.contains(r#"starts with "malicious\" & do shell script \"rm -rf /\""#));
    }

    #[test]
    fn test_create_script_escapes_all_values() {
        let config = TerminalConfig {
            identifier: r#"id"inject"#.to_string(),
            session: r#"sess"inject"#.to_string(),
            command: None,
            title: None,
            worktree_path: r#"/path/"inject"#.to_string(),
            env_vars: HashMap::new(),
        };
        let script = build_create_script(&config);
        assert!(script.contains(r#"cd /path/\"inject"#));
        assert!(
            script.contains(r#"tmux -CC set-option allow-rename off \\; attach -t sess\"inject"#)
        );
        assert!(script.contains(r#"set name to "id\"inject""#));
    }

    #[test]
    fn test_build_env_string_sorted_and_escaped() {
        let mut env_vars = HashMap::new();
        env_vars.insert("Z_VAR".to_string(), "last".to_string());
        env_vars.insert("A_VAR".to_string(), "first".to_string());
        let result = build_env_string(&env_vars);
        assert_eq!(result, "A_VAR='first' Z_VAR='last'");
    }

    #[test]
    fn test_build_env_string_empty() {
        let env_vars = HashMap::new();
        let result = build_env_string(&env_vars);
        assert_eq!(result, "");
    }

    #[test]
    fn test_build_list_sessions_script() {
        let script = build_list_sessions_script();
        assert!(script.contains(r#"tell application "iTerm2""#));
        assert!(script.contains("name of theSession"));
        assert!(script.contains("count of windows"));
        assert!(script.contains("count of tabs"));
        assert!(script.contains("count of sessions"));
    }

    #[test]
    fn test_build_create_script_with_title() {
        let config = TerminalConfig {
            identifier: "ACQ-145".to_string(),
            session: "acq-145".to_string(),
            command: None,
            title: Some("Fix login timeout".to_string()),
            worktree_path: "/path/to/worktree".to_string(),
            env_vars: HashMap::new(),
        };
        let script = build_create_script(&config);
        assert!(
            script.contains(r#"set name to "ACQ-145 — Fix login timeout""#),
            "Display name should include the task title"
        );
    }
}
