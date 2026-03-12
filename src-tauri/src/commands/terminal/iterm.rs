use super::controller::TerminalController;
use super::types::{TerminalConfig, TerminalRef};
use tauri_plugin_shell::ShellExt;

pub struct ITermController;

/// Escape a string for safe interpolation into AppleScript double-quoted strings.
fn escape_applescript(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
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

/// Build an AppleScript that creates a new iTerm2 window with the default profile,
/// cds into the worktree path, attaches to the tmux session, and names the session.
fn build_create_script(config: &TerminalConfig) -> String {
    let display_name = format!("{} — {}", config.identifier, config.session);
    let worktree_path = escape_applescript(&config.worktree_path);
    let session = escape_applescript(&config.session);
    let display_name = escape_applescript(&display_name);
    format!(
        r#"tell application "iTerm2"
    activate
    set newWindow to (create window with default profile)
    tell current session of newWindow
        write text "cd {worktree_path} && tmux set-option allow-rename off \\; -CC attach -t {session}"
        set name to "{display_name}"
    end tell
end tell"#,
        worktree_path = worktree_path,
        session = session,
        display_name = display_name,
    )
}

/// Build an AppleScript that splits the session matching the identifier vertically.
fn build_split_script(identifier: &str) -> String {
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
                    tell theSession
                        split vertically with default profile
                    end tell
                    return "split"
                end if
            end repeat
        end repeat
    end repeat
    return "not_found"
end tell"#,
        identifier = identifier
    )
}

/// Build an AppleScript that sends text to the session matching the identifier.
fn build_send_text_script(identifier: &str, text: &str) -> String {
    let identifier = escape_applescript(identifier);
    let text = escape_applescript(text);
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
                        write text "{text}"
                    end tell
                    return "sent"
                end if
            end repeat
        end repeat
    end repeat
    return "not_found"
end tell"#,
        identifier = identifier,
        text = text,
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

impl TerminalController for ITermController {
    async fn find_session(
        &self,
        app: &tauri::AppHandle,
        worktree_path: &str,
    ) -> Result<Option<TerminalRef>, String> {
        // For iTerm2, we search by session name (identifier), not worktree_path.
        // The worktree_path parameter is used as the identifier for iTerm2 since
        // sessions are named with the task identifier at creation time.
        // The caller passes the identifier via worktree_path for now; this will
        // be refined when DIR-001.04 widens the signature.
        let script = build_find_script(worktree_path);
        let result = run_osascript(app, &script, "find_session").await?;

        if result == "not_found" {
            Ok(None)
        } else {
            Ok(Some(TerminalRef {
                identifier: worktree_path.to_string(),
                emulator: "iterm2".to_string(),
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

    async fn create(
        &self,
        app: &tauri::AppHandle,
        config: &TerminalConfig,
    ) -> Result<(), String> {
        let check = app
            .shell()
            .command("tmux")
            .args(["has-session", "-t", &config.session])
            .output()
            .await
            .map_err(|e| format!("Failed to check tmux session: {e}"))?;
        if !check.status.success() {
            return Err(format!(
                "tmux session '{}' does not exist",
                config.session
            ));
        }

        let script = build_create_script(config);
        run_osascript(app, &script, "create").await?;
        Ok(())
    }

    async fn split(
        &self,
        app: &tauri::AppHandle,
        terminal_ref: &TerminalRef,
    ) -> Result<(), String> {
        let script = build_split_script(&terminal_ref.identifier);
        let result = run_osascript(app, &script, "split").await?;

        if result == "not_found" {
            return Err(format!(
                "iTerm2 session not found for split: {}",
                terminal_ref.identifier
            ));
        }

        Ok(())
    }

    async fn send_text(
        &self,
        app: &tauri::AppHandle,
        terminal_ref: &TerminalRef,
        text: &str,
    ) -> Result<(), String> {
        let script = build_send_text_script(&terminal_ref.identifier, text);
        let result = run_osascript(app, &script, "send_text").await?;

        if result == "not_found" {
            return Err(format!(
                "iTerm2 session not found for send_text: {}",
                terminal_ref.identifier
            ));
        }

        Ok(())
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
    fn test_build_create_script_structure() {
        let config = TerminalConfig {
            identifier: "ACQ-145".to_string(),
            session: "acq-145".to_string(),
            worktree_path: "/path/to/worktree".to_string(),
            env_vars: HashMap::new(),
            layout: super::super::types::TerminalLayout::Focus,
        };
        let script = build_create_script(&config);
        assert!(script.contains("create window with default profile"));
        assert!(script.contains(r#"cd /path/to/worktree && tmux set-option allow-rename off \\; -CC attach -t acq-145"#));
        assert!(script.contains(r#"set name to "ACQ-145 — acq-145""#));
    }

    #[test]
    fn test_build_split_script_splits_vertically() {
        let script = build_split_script("ACQ-145");
        assert!(script.contains("split vertically with default profile"));
        assert!(script.contains(r#"starts with "ACQ-145""#));
    }

    #[test]
    fn test_build_send_text_script_writes_text() {
        let script = build_send_text_script("ACQ-145", "echo hello");
        assert!(script.contains(r#"write text "echo hello""#));
        assert!(script.contains(r#"starts with "ACQ-145""#));
    }

    #[test]
    fn test_build_send_text_script_escapes_quotes() {
        let script = build_send_text_script("ACQ-145", r#"echo "hello world""#);
        assert!(script.contains(r#"write text "echo \"hello world\"""#));
    }

    #[test]
    fn test_build_send_text_script_escapes_backslashes() {
        let script = build_send_text_script("ACQ-145", r#"echo \n"#);
        assert!(script.contains(r#"write text "echo \\n""#));
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
            worktree_path: r#"/path/"inject"#.to_string(),
            env_vars: HashMap::new(),
            layout: super::super::types::TerminalLayout::Focus,
        };
        let script = build_create_script(&config);
        assert!(script.contains(r#"cd /path/\"inject"#));
        assert!(script.contains(r#"tmux set-option allow-rename off \\; -CC attach -t sess\"inject"#));
        assert!(script.contains(r#"set name to "id\"inject — sess\"inject""#));
    }
}
