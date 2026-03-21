use super::controller::TerminalController;
use super::types::{Emulator, TerminalConfig, TerminalRef};
use std::sync::OnceLock;
use tauri_plugin_shell::ShellExt;
const MIN_VERSION: (u32, u32, u32) = (1, 3, 0);

static VERSION_CHECK: OnceLock<Result<(), String>> = OnceLock::new();

pub struct GhosttyController;

fn escape_applescript(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

fn parse_version(version_str: &str) -> Option<(u32, u32, u32)> {
    let parts: Vec<&str> = version_str.split('.').collect();
    if parts.len() >= 3 {
        Some((
            parts[0].parse().ok()?,
            parts[1].parse().ok()?,
            parts[2].parse().ok()?,
        ))
    } else if parts.len() == 2 {
        Some((parts[0].parse().ok()?, parts[1].parse().ok()?, 0))
    } else {
        None
    }
}

async fn check_ghostty_version_uncached(app: &tauri::AppHandle) -> Result<(), String> {
    let output = app
        .shell()
        .command("osascript")
        .args(["-e", r#"tell application "Ghostty" to get version"#])
        .output()
        .await
        .map_err(|e| format!("Failed to check Ghostty version: {e}"))?;

    if !output.status.success() {
        return Err(
            "Ghostty is not installed or not responding. Please install Ghostty >= 1.3.0."
                .to_string(),
        );
    }

    let version_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let version = parse_version(&version_str)
        .ok_or_else(|| format!("Could not parse Ghostty version: \"{version_str}\""))?;

    if version < MIN_VERSION {
        return Err(format!(
            "Ghostty >= {}.{}.{} required for AppleScript integration (found {version_str})",
            MIN_VERSION.0, MIN_VERSION.1, MIN_VERSION.2,
        ));
    }

    Ok(())
}

async fn check_ghostty_version(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(result) = VERSION_CHECK.get() {
        return result.clone();
    }

    let result = check_ghostty_version_uncached(app).await;
    if result.is_ok() {
        let _ = VERSION_CHECK.set(result.clone());
    }
    result
}

fn build_find_script(worktree_path: &str) -> String {
    let path = escape_applescript(worktree_path);
    format!(
        r#"tell application "Ghostty"
    set matches to every terminal whose working directory contains "{path}"
    if (count of matches) > 0 then
        return id of (item 1 of matches)
    else
        return ""
    end if
end tell"#
    )
}

fn build_focus_script(identifier: &str) -> String {
    let id = escape_applescript(identifier);
    format!(
        r#"tell application "Ghostty"
    activate
    set matches to every terminal whose id is "{id}"
    if (count of matches) > 0 then
        focus (item 1 of matches)
        return "focused"
    else
        return "not_found"
    end if
end tell"#
    )
}

fn build_create_script(config: &TerminalConfig) -> String {
    let worktree_path = escape_applescript(&config.worktree_path);
    let session = escape_applescript(&config.session);
    let tmux_cmd = format!("tmux attach -t {session}");

    let env_line = if config.env_vars.is_empty() {
        String::new()
    } else {
        let mut pairs: Vec<String> = config
            .env_vars
            .iter()
            .map(|(k, v)| format!("\"{}={}\"", escape_applescript(k), escape_applescript(v)))
            .collect();
        pairs.sort();
        format!(
            "\n    set environment variables of cfg to {{{}}}",
            pairs.join(", ")
        )
    };

    format!(
        r#"tell application "Ghostty"
    activate
    set cfg to new surface configuration
    set initial working directory of cfg to "{worktree_path}"{env_line}
    set win to new window with configuration cfg
    delay 0.5
    set term to terminal 1 of selected tab of win
    input text "{tmux_cmd}" to term
    send key "enter" to term
    focus term
end tell"#
    )
}

fn build_split_script(identifier: &str) -> String {
    let id = escape_applescript(identifier);
    format!(
        r#"tell application "Ghostty"
    set matches to every terminal whose id is "{id}"
    if (count of matches) > 0 then
        tell (item 1 of matches)
            split right
        end tell
        return "split"
    else
        return "not_found"
    end if
end tell"#
    )
}

fn build_list_sessions_script() -> String {
    r#"tell application "Ghostty"
    set output to ""
    set allTerminals to every terminal
    repeat with t in allTerminals
        set tid to id of t
        set ttitle to title of t
        set output to output & tid & "|" & ttitle & linefeed
    end repeat
    return output
end tell"#
        .to_string()
}

impl TerminalController for GhosttyController {
    async fn find_session(
        &self,
        app: &tauri::AppHandle,
        _identifier: &str,
        worktree_path: &str,
    ) -> Result<Option<TerminalRef>, String> {
        check_ghostty_version(app).await?;
        let script = build_find_script(worktree_path);
        let output = app
            .shell()
            .command("osascript")
            .args(["-e", &script])
            .output()
            .await
            .map_err(|e| format!("Ghostty find_session failed: {e}"))?;

        if !output.status.success() {
            return Err(format!(
                "Ghostty find_session failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if stdout.is_empty() {
            Ok(None)
        } else {
            Ok(Some(TerminalRef {
                identifier: stdout,
                emulator: Emulator::Ghostty,
            }))
        }
    }

    async fn focus(
        &self,
        app: &tauri::AppHandle,
        terminal_ref: &TerminalRef,
    ) -> Result<(), String> {
        let script = build_focus_script(&terminal_ref.identifier);
        let output = app
            .shell()
            .command("osascript")
            .args(["-e", &script])
            .output()
            .await
            .map_err(|e| format!("Ghostty focus failed: {e}"))?;

        if !output.status.success() {
            return Err(format!(
                "Ghostty focus failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if stdout == "not_found" {
            return Err(format!(
                "Ghostty terminal not found: {}",
                terminal_ref.identifier
            ));
        }

        Ok(())
    }

    async fn create(&self, app: &tauri::AppHandle, config: &TerminalConfig) -> Result<(), String> {
        check_ghostty_version(app).await?;
        let script = build_create_script(config);
        let output = app
            .shell()
            .command("osascript")
            .args(["-e", &script])
            .output()
            .await
            .map_err(|e| format!("Ghostty create failed: {e}"))?;

        if !output.status.success() {
            return Err(format!(
                "Ghostty create failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        Ok(())
    }

    async fn split(
        &self,
        app: &tauri::AppHandle,
        terminal_ref: &TerminalRef,
        _worktree_path: &str,
    ) -> Result<(), String> {
        let script = build_split_script(&terminal_ref.identifier);
        let output = app
            .shell()
            .command("osascript")
            .args(["-e", &script])
            .output()
            .await
            .map_err(|e| format!("Ghostty split failed: {e}"))?;

        if !output.status.success() {
            return Err(format!(
                "Ghostty split failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if stdout == "not_found" {
            return Err(format!(
                "Ghostty terminal not found for split: {}",
                terminal_ref.identifier
            ));
        }

        Ok(())
    }

    async fn list_sessions(&self, app: &tauri::AppHandle) -> Result<Vec<(String, String)>, String> {
        check_ghostty_version(app).await?;
        let script = build_list_sessions_script();
        let output = app
            .shell()
            .command("osascript")
            .args(["-e", &script])
            .output()
            .await
            .map_err(|e| format!("Ghostty list_sessions failed: {e}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if stderr.contains("Not running") || stderr.contains("not running") {
                return Ok(vec![]);
            }
            return Err(format!("Ghostty list_sessions failed: {stderr}"));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let sessions = stdout
            .lines()
            .filter(|line| !line.is_empty())
            .filter_map(|line| {
                let (id, title) = line.split_once('|')?;
                Some((id.trim().to_string(), title.trim().to_string()))
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
    fn test_escape_applescript() {
        assert_eq!(escape_applescript("hello"), "hello");
        assert_eq!(escape_applescript(r#"say "hi""#), r#"say \"hi\""#);
        assert_eq!(escape_applescript(r"path\to"), r"path\\to");
    }

    #[test]
    fn test_escape_applescript_order() {
        // Backslashes must be escaped before quotes to avoid double-escaping
        assert_eq!(escape_applescript(r#"a\"b"#), r#"a\\\"b"#);
    }

    #[test]
    fn test_build_find_script() {
        let script = build_find_script("/path/to/worktree");
        assert!(script.contains(r#"tell application "Ghostty""#));
        assert!(script
            .contains(r#"every terminal whose working directory contains "/path/to/worktree""#));
        assert!(script.contains("return id of (item 1 of matches)"));
        assert!(script.contains(r#"return """#));
    }

    #[test]
    fn test_build_find_script_escapes_path() {
        let script = build_find_script(r#"/path/with "quotes"/dir"#);
        assert!(script.contains(r#"contains "/path/with \"quotes\"/dir""#));
    }

    #[test]
    fn test_build_focus_script() {
        let script = build_focus_script("terminal-123");
        assert!(script.contains(r#"tell application "Ghostty""#));
        assert!(script.contains("activate"));
        assert!(script.contains(r#"every terminal whose id is "terminal-123""#));
        assert!(script.contains("focus (item 1 of matches)"));
        assert!(script.contains(r#"return "focused""#));
        assert!(script.contains(r#"return "not_found""#));
    }

    #[test]
    fn test_build_create_script() {
        let config = TerminalConfig {
            identifier: "ACQ-145".to_string(),
            session: "ACQ-145".to_string(),
            command: None,
            title: None,
            worktree_path: "/path/to/worktree".to_string(),
            env_vars: HashMap::from([
                ("DIRECTIV_TASK".to_string(), "ACQ-145".to_string()),
                (
                    "DIRECTIV_WORKTREE".to_string(),
                    "/path/to/worktree".to_string(),
                ),
                ("DIRECTIV_SESSION".to_string(), "ACQ-145".to_string()),
            ]),
        };
        let script = build_create_script(&config);
        assert!(script.contains(r#"tell application "Ghostty""#));
        assert!(script.contains("activate"));
        assert!(script.contains("set cfg to new surface configuration"));
        assert!(script.contains(r#"set initial working directory of cfg to "/path/to/worktree""#));
        assert!(script.contains("new window with configuration cfg"));
        // After window creation, sends tmux command via input text + send key
        assert!(script.contains(r#"input text "tmux attach -t ACQ-145" to term"#));
        assert!(script.contains(r#"send key "enter" to term"#));
        assert!(script.contains("focus term"));
        // Env vars use native Ghostty surface configuration property, sorted alphabetically
        assert!(script.contains(r#"set environment variables of cfg to {"DIRECTIV_SESSION=ACQ-145", "DIRECTIV_TASK=ACQ-145", "DIRECTIV_WORKTREE=/path/to/worktree"}"#));
        // Should not contain shell wrapper or env prefix
        assert!(!script.contains("env "));
        assert!(!script.contains("set command of cfg"));
    }

    #[test]
    fn test_build_create_script_no_env_vars() {
        let config = TerminalConfig {
            identifier: "ACQ-145".to_string(),
            session: "ACQ-145".to_string(),
            command: None,
            title: None,
            worktree_path: "/path/to/worktree".to_string(),
            env_vars: HashMap::new(),
        };
        let script = build_create_script(&config);
        // No environment variables line when env_vars is empty
        assert!(!script.contains("environment variables"));
        assert!(script.contains(r#"input text "tmux attach -t ACQ-145" to term"#));
        assert!(script.contains(r#"send key "enter" to term"#));
        assert!(script.contains("focus term"));
    }

    #[test]
    fn test_build_create_script_env_vars_special_chars() {
        let config = TerminalConfig {
            identifier: "ACQ-145".to_string(),
            session: "ACQ-145".to_string(),
            command: None,
            title: None,
            worktree_path: "/path/to/worktree".to_string(),
            env_vars: HashMap::from([
                (
                    "DIRECTIV_TASK".to_string(),
                    r#"task "with quotes""#.to_string(),
                ),
                (
                    "DIRECTIV_WORKTREE".to_string(),
                    r"path\with\backslashes".to_string(),
                ),
            ]),
        };
        let script = build_create_script(&config);
        // Values are AppleScript-escaped in the environment variables list
        assert!(script.contains(r#""DIRECTIV_TASK=task \"with quotes\"""#));
        assert!(script.contains(r#""DIRECTIV_WORKTREE=path\\with\\backslashes""#));
    }

    #[test]
    fn test_build_create_script_escapes_values() {
        let config = TerminalConfig {
            identifier: r#"task "special""#.to_string(),
            session: "session-1".to_string(),
            command: None,
            title: None,
            worktree_path: r#"/path/with "quotes""#.to_string(),
            env_vars: HashMap::new(),
        };
        let script = build_create_script(&config);
        assert!(
            script.contains(r#"set initial working directory of cfg to "/path/with \"quotes\"""#)
        );
    }

    #[test]
    fn test_build_split_script() {
        let script = build_split_script("terminal-123");
        assert!(script.contains(r#"every terminal whose id is "terminal-123""#));
        assert!(script.contains("split right"));
        assert!(script.contains(r#"return "split""#));
        assert!(script.contains(r#"return "not_found""#));
    }

    #[test]
    fn test_parse_version_full() {
        assert_eq!(parse_version("1.3.0"), Some((1, 3, 0)));
        assert_eq!(parse_version("2.10.5"), Some((2, 10, 5)));
    }

    #[test]
    fn test_parse_version_two_parts() {
        assert_eq!(parse_version("1.3"), Some((1, 3, 0)));
    }

    #[test]
    fn test_parse_version_invalid() {
        assert_eq!(parse_version("abc"), None);
        assert_eq!(parse_version(""), None);
    }

    #[test]
    fn test_version_comparison() {
        assert!((1, 3, 0) >= MIN_VERSION);
        assert!((1, 4, 0) >= MIN_VERSION);
        assert!((2, 0, 0) >= MIN_VERSION);
        assert!((1, 2, 9) < MIN_VERSION);
        assert!((0, 9, 0) < MIN_VERSION);
    }

    #[test]
    fn test_build_list_sessions_script() {
        let script = build_list_sessions_script();
        assert!(script.contains(r#"tell application "Ghostty""#));
        assert!(script.contains("every terminal"));
        assert!(script.contains("id of t"));
        assert!(script.contains("title of t"));
    }
}
