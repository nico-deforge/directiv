use super::controller::TerminalController;
use super::types::{TerminalConfig, TerminalRef};
use tauri_plugin_shell::ShellExt;

const EMULATOR: &str = "ghostty";

pub struct GhosttyController;

fn build_find_script(worktree_path: &str) -> String {
    format!(
        r#"tell application "Ghostty"
    set matches to every terminal whose working directory contains "{worktree_path}"
    if (count of matches) > 0 then
        return id of (item 1 of matches)
    else
        return ""
    end if
end tell"#
    )
}

fn build_focus_script(identifier: &str) -> String {
    format!(
        r#"tell application "Ghostty"
    activate
    set matches to every terminal whose id is "{identifier}"
    if (count of matches) > 0 then
        focus (item 1 of matches)
    end if
end tell"#
    )
}

fn build_create_script(config: &TerminalConfig) -> String {
    let user_shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let tmux_cmd = format!("tmux attach -t {}", config.session);

    format!(
        r#"tell application "Ghostty"
    activate
    set cfg to new surface configuration
    set initial working directory of cfg to "{worktree_path}"
    set command of cfg to "{shell} -lc '{tmux_cmd}'"
    new window with cfg
end tell"#,
        worktree_path = config.worktree_path,
        shell = user_shell,
        tmux_cmd = tmux_cmd,
    )
}

fn build_split_script(identifier: &str) -> String {
    format!(
        r#"tell application "Ghostty"
    set matches to every terminal whose id is "{identifier}"
    if (count of matches) > 0 then
        tell (item 1 of matches)
            split right
        end tell
    end if
end tell"#
    )
}

fn build_send_text_script(identifier: &str, text: &str) -> String {
    let escaped = text.replace('\\', "\\\\").replace('"', "\\\"");
    format!(
        r#"tell application "Ghostty"
    set matches to every terminal whose id is "{identifier}"
    if (count of matches) > 0 then
        tell (item 1 of matches)
            input text "{escaped}"
        end tell
    end if
end tell"#
    )
}

impl TerminalController for GhosttyController {
    async fn find_session(
        &self,
        app: &tauri::AppHandle,
        worktree_path: &str,
    ) -> Result<Option<TerminalRef>, String> {
        let script = build_find_script(worktree_path);
        let output = app
            .shell()
            .command("osascript")
            .args(["-e", &script])
            .output()
            .await
            .map_err(|e| format!("Failed to run osascript: {e}"))?;

        if !output.status.success() {
            return Err(format!(
                "osascript failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if stdout.is_empty() {
            Ok(None)
        } else {
            Ok(Some(TerminalRef {
                identifier: stdout,
                emulator: EMULATOR.to_string(),
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
            .map_err(|e| format!("Failed to run osascript: {e}"))?;

        if !output.status.success() {
            return Err(format!(
                "osascript failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        Ok(())
    }

    async fn create(
        &self,
        app: &tauri::AppHandle,
        config: &TerminalConfig,
    ) -> Result<(), String> {
        let script = build_create_script(config);
        let output = app
            .shell()
            .command("osascript")
            .args(["-e", &script])
            .output()
            .await
            .map_err(|e| format!("Failed to run osascript: {e}"))?;

        if !output.status.success() {
            return Err(format!(
                "osascript failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        Ok(())
    }

    async fn split(
        &self,
        app: &tauri::AppHandle,
        terminal_ref: &TerminalRef,
    ) -> Result<(), String> {
        let script = build_split_script(&terminal_ref.identifier);
        let output = app
            .shell()
            .command("osascript")
            .args(["-e", &script])
            .output()
            .await
            .map_err(|e| format!("Failed to run osascript: {e}"))?;

        if !output.status.success() {
            return Err(format!(
                "osascript failed: {}",
                String::from_utf8_lossy(&output.stderr)
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
        let output = app
            .shell()
            .command("osascript")
            .args(["-e", &script])
            .output()
            .await
            .map_err(|e| format!("Failed to run osascript: {e}"))?;

        if !output.status.success() {
            return Err(format!(
                "osascript failed: {}",
                String::from_utf8_lossy(&output.stderr)
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
    fn test_build_find_script() {
        let script = build_find_script("/path/to/worktree");
        assert!(script.contains(r#"tell application "Ghostty""#));
        assert!(script.contains(r#"every terminal whose working directory contains "/path/to/worktree""#));
        assert!(script.contains("return id of (item 1 of matches)"));
        assert!(script.contains(r#"return """#));
    }

    #[test]
    fn test_build_focus_script() {
        let script = build_focus_script("terminal-123");
        assert!(script.contains(r#"tell application "Ghostty""#));
        assert!(script.contains("activate"));
        assert!(script.contains(r#"every terminal whose id is "terminal-123""#));
        assert!(script.contains("focus (item 1 of matches)"));
    }

    #[test]
    fn test_build_create_script() {
        let config = TerminalConfig {
            identifier: "ACQ-145".to_string(),
            session: "ACQ-145".to_string(),
            worktree_path: "/path/to/worktree".to_string(),
            env_vars: HashMap::new(),
            layout: super::super::types::TerminalLayout::Focus,
        };
        let script = build_create_script(&config);
        assert!(script.contains(r#"tell application "Ghostty""#));
        assert!(script.contains("activate"));
        assert!(script.contains("set cfg to new surface configuration"));
        assert!(script.contains(r#"set initial working directory of cfg to "/path/to/worktree""#));
        assert!(script.contains("tmux attach -t ACQ-145"));
        assert!(script.contains("new window with cfg"));
    }

    #[test]
    fn test_build_split_script() {
        let script = build_split_script("terminal-123");
        assert!(script.contains(r#"every terminal whose id is "terminal-123""#));
        assert!(script.contains("split right"));
    }

    #[test]
    fn test_build_send_text_script() {
        let script = build_send_text_script("terminal-123", "hello world");
        assert!(script.contains(r#"every terminal whose id is "terminal-123""#));
        assert!(script.contains(r#"input text "hello world""#));
    }

    #[test]
    fn test_build_send_text_script_escapes_quotes() {
        let script = build_send_text_script("terminal-123", r#"say "hello""#);
        assert!(script.contains(r#"input text "say \"hello\"""#));
    }
}
