use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use tauri::ipc::Channel;

/// Tmux detach key sequence: Ctrl+B followed by 'd'
const TMUX_DETACH_SEQ: &[u8] = b"\x02d";

#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data")]
pub enum PtyOutputEvent {
    Data { output: String },
    Exit { code: Option<u32> },
    Error { message: String },
}

struct PtySession {
    writer: Mutex<Box<dyn Write + Send>>,
    master: Mutex<Box<dyn MasterPty + Send>>,
    child: Mutex<Box<dyn Child + Send + Sync>>,
    shutdown: AtomicBool,
    tmux_session: String,
}

impl PtySession {
    /// Cleanly tear down the PTY: detach tmux, then kill the child process.
    fn teardown(&self) {
        self.shutdown.store(true, Ordering::Relaxed);
        if let Ok(mut writer) = self.writer.lock() {
            let _ = writer.write_all(TMUX_DETACH_SEQ);
            let _ = writer.flush();
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
        if let Ok(mut child) = self.child.lock() {
            let _ = child.kill();
        }
    }
}

fn pty_size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    }
}

pub struct PtyState {
    next_id: AtomicU32,
    sessions: RwLock<HashMap<u32, Arc<PtySession>>>,
}

impl PtyState {
    pub fn new() -> Self {
        Self {
            next_id: AtomicU32::new(1),
            sessions: RwLock::new(HashMap::new()),
        }
    }
}

#[tauri::command]
pub fn pty_spawn(
    state: tauri::State<'_, PtyState>,
    session: String,
    cols: u16,
    rows: u16,
    on_data: Channel<PtyOutputEvent>,
) -> Result<u32, String> {
    // Clean up any previous PTY for this tmux session (handles race between
    // async pty_close and pty_spawn when a tab is closed then immediately reopened).
    // Collect stale sessions then release the write lock before sleeping.
    let stale: Vec<Arc<PtySession>> = {
        let mut sessions = state.sessions.write().map_err(|e| e.to_string())?;
        let stale_handles: Vec<u32> = sessions
            .iter()
            .filter(|(_, s)| s.tmux_session == session)
            .map(|(h, _)| *h)
            .collect();
        stale_handles
            .iter()
            .filter_map(|h| sessions.remove(h))
            .collect()
    };
    for old in stale {
        old.teardown();
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(pty_size(cols, rows))
        .map_err(|e| format!("Failed to open PTY: {e}"))?;

    let mut cmd = CommandBuilder::new("tmux");
    cmd.args(["attach", "-t", &session]);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn tmux attach: {e}"))?;

    // Drop the slave immediately — we only need the master side
    drop(pair.slave);

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to take PTY writer: {e}"))?;

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone PTY reader: {e}"))?;

    let handle = state.next_id.fetch_add(1, Ordering::Relaxed);

    let pty_session = Arc::new(PtySession {
        writer: Mutex::new(writer),
        master: Mutex::new(pair.master),
        child: Mutex::new(child),
        shutdown: AtomicBool::new(false),
        tmux_session: session,
    });

    {
        let mut sessions = state.sessions.write().map_err(|e| e.to_string())?;
        sessions.insert(handle, pty_session.clone());
    }

    // Spawn reader thread — keep an Arc to access the shutdown flag
    let session_ref = pty_session.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            if session_ref.shutdown.load(Ordering::Relaxed) {
                break;
            }
            match reader.read(&mut buf) {
                Ok(0) => {
                    // EOF — mark as shut down so dedup allows re-spawn
                    session_ref.shutdown.store(true, Ordering::Relaxed);
                    let _ = on_data.send(PtyOutputEvent::Exit { code: None });
                    break;
                }
                Ok(n) => {
                    let output = String::from_utf8_lossy(&buf[..n]).to_string();
                    if on_data.send(PtyOutputEvent::Data { output }).is_err() {
                        session_ref.shutdown.store(true, Ordering::Relaxed);
                        break;
                    }
                }
                Err(e) => {
                    if !session_ref.shutdown.load(Ordering::Relaxed) {
                        session_ref.shutdown.store(true, Ordering::Relaxed);
                        let _ = on_data.send(PtyOutputEvent::Error {
                            message: e.to_string(),
                        });
                        let _ = on_data.send(PtyOutputEvent::Exit { code: None });
                    }
                    break;
                }
            }
        }
    });

    Ok(handle)
}

#[tauri::command]
pub fn pty_write(
    state: tauri::State<'_, PtyState>,
    handle: u32,
    data: String,
) -> Result<(), String> {
    let sessions = state.sessions.read().map_err(|e| e.to_string())?;
    let session = sessions
        .get(&handle)
        .ok_or_else(|| format!("PTY handle {handle} not found"))?;
    let mut writer = session.writer.lock().map_err(|e| e.to_string())?;
    writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("Failed to write to PTY: {e}"))?;
    writer
        .flush()
        .map_err(|e| format!("Failed to flush PTY: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn pty_resize(
    state: tauri::State<'_, PtyState>,
    handle: u32,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = state.sessions.read().map_err(|e| e.to_string())?;
    let session = sessions
        .get(&handle)
        .ok_or_else(|| format!("PTY handle {handle} not found"))?;
    let master = session.master.lock().map_err(|e| e.to_string())?;
    master
        .resize(pty_size(cols, rows))
        .map_err(|e| format!("Failed to resize PTY: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn pty_close(state: tauri::State<'_, PtyState>, handle: u32) -> Result<(), String> {
    let session = {
        let mut sessions = state.sessions.write().map_err(|e| e.to_string())?;
        sessions.remove(&handle)
    };

    if let Some(session) = session {
        session.teardown();
    }

    Ok(())
}
