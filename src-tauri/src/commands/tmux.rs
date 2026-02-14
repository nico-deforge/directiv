use serde::Serialize;
use std::time::Duration;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use tokio::time::timeout;

#[derive(Debug, Serialize, Clone)]
pub struct TmuxSession {
    pub name: String,
    pub attached: bool,
    pub windows: u32,
    pub created: String,
}

#[tauri::command]
pub async fn tmux_list_sessions(app: tauri::AppHandle) -> Result<Vec<TmuxSession>, String> {
    let output = app
        .shell()
        .command("tmux")
        .args([
            "list-sessions",
            "-F",
            "#{session_name}|#{session_attached}|#{session_windows}|#{session_created}",
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to run tmux: {e}"))?;

    let stderr = String::from_utf8_lossy(&output.stderr);
    if !output.status.success() {
        if stderr.contains("no server running")
            || stderr.contains("no current client")
            || stderr.contains("No such file or directory")
        {
            return Ok(vec![]);
        }
        return Err(format!("tmux list-sessions failed: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let sessions = stdout
        .lines()
        .filter(|line| !line.is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(4, '|').collect();
            if parts.len() < 4 {
                return None;
            }
            Some(TmuxSession {
                name: parts[0].to_string(),
                attached: parts[1] == "1",
                windows: parts[2].parse().unwrap_or(0),
                created: parts[3].to_string(),
            })
        })
        .collect();

    Ok(sessions)
}

#[tauri::command]
pub async fn tmux_create_session(
    app: tauri::AppHandle,
    name: String,
    working_dir: Option<String>,
) -> Result<TmuxSession, String> {
    let name: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let signal = format!("ready_{name}");
    let shell_cmd = format!("{shell} -ic 'tmux wait-for -S {signal}; exec {shell}'");

    let mut args = vec![
        "new-session".to_string(),
        "-d".to_string(),
        "-s".to_string(),
        name.clone(),
    ];

    if let Some(dir) = &working_dir {
        args.push("-c".to_string());
        args.push(dir.clone());
    }

    args.push(shell_cmd);

    let output = app
        .shell()
        .command("tmux")
        .args(&args)
        .output()
        .await
        .map_err(|e| format!("Failed to run tmux: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("tmux new-session failed: {stderr}"));
    }

    Ok(TmuxSession {
        name,
        attached: false,
        windows: 1,
        created: String::new(),
    })
}

#[tauri::command]
pub async fn tmux_kill_session(app: tauri::AppHandle, name: String) -> Result<(), String> {
    let output = app
        .shell()
        .command("tmux")
        .args(["kill-session", "-t", &name])
        .output()
        .await
        .map_err(|e| format!("Failed to run tmux: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("tmux kill-session failed: {stderr}"));
    }

    Ok(())
}

#[tauri::command]
pub async fn tmux_send_keys(
    app: tauri::AppHandle,
    session: String,
    keys: String,
) -> Result<(), String> {
    // Two-step send: literal text first, then Enter as a key name.
    // A single send-keys -l with embedded \n was attempted but reverted (d5a68f9 / e0d5b30)
    // because -l treats \n as literal text rather than a key press.
    let output = app
        .shell()
        .command("tmux")
        .args(["send-keys", "-t", &session, "-l", &keys])
        .output()
        .await
        .map_err(|e| format!("Failed to run tmux: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("tmux send-keys failed: {stderr}"));
    }

    let output = app
        .shell()
        .command("tmux")
        .args(["send-keys", "-t", &session, "Enter"])
        .output()
        .await
        .map_err(|e| format!("Failed to run tmux: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("tmux send-keys (Enter) failed: {stderr}"));
    }

    Ok(())
}

#[tauri::command]
pub async fn tmux_capture_pane(app: tauri::AppHandle, session: String) -> Result<String, String> {
    let output = app
        .shell()
        .command("tmux")
        .args(["capture-pane", "-t", &session, "-p"])
        .output()
        .await
        .map_err(|e| format!("Failed to run tmux: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("tmux capture-pane failed: {stderr}"));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
pub async fn tmux_wait_for_ready(
    app: tauri::AppHandle,
    session: String,
    timeout_ms: Option<u64>,
) -> Result<(), String> {
    let signal = format!("ready_{session}");
    let timeout_duration = Duration::from_millis(timeout_ms.unwrap_or(30_000));

    let (mut rx, child) = app
        .shell()
        .command("tmux")
        .args(["wait-for", &signal])
        .spawn()
        .map_err(|e| format!("Failed to spawn tmux wait-for: {e}"))?;

    let result = timeout(timeout_duration, async {
        while let Some(event) = rx.recv().await {
            if let CommandEvent::Terminated(status) = event {
                return if status.code == Some(0) {
                    Ok(())
                } else {
                    Err(format!("tmux wait-for exited with code {:?}", status.code))
                };
            }
        }
        Err("tmux wait-for process ended unexpectedly".to_string())
    })
    .await;

    match result {
        Ok(inner) => inner,
        Err(_) => {
            let _ = child.kill();
            Err(format!(
                "Shell init timed out after {}ms",
                timeout_duration.as_millis()
            ))
        }
    }
}
