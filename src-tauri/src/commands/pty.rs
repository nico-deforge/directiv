use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::Duration;
use tauri::ipc::Channel;

/// Tmux detach key sequence: Ctrl+B followed by 'd'
const TMUX_DETACH_SEQ: &[u8] = b"\x02d";

/// Flush batched PTY output at ~30fps to reduce IPC message frequency
const OUTPUT_FLUSH_INTERVAL: Duration = Duration::from_millis(33);
/// Hard cap per flush to bound memory usage during heavy output
const MAX_OUTPUT_BATCH_SIZE: usize = 128 * 1024;
/// Read buffer size — larger than default 2KB to reduce syscall overhead with batching
const PTY_READ_BUF_SIZE: usize = 8192;

/// Internal message from reader thread to flusher thread.
enum ReaderMsg {
    Data(Vec<u8>),
    Error(String),
    Eof,
}

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

/// Flush accumulated PTY output bytes as a single Data event.
/// Returns `false` if the channel is dead and the flusher should stop.
fn flush_batch(batch: &mut Vec<u8>, channel: &Channel<PtyOutputEvent>) -> bool {
    if batch.is_empty() {
        return true;
    }
    let output = String::from_utf8_lossy(batch).to_string();
    batch.clear();
    channel.send(PtyOutputEvent::Data { output }).is_ok()
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

    // Reader + flusher threads: the reader pushes raw bytes into an mpsc channel,
    // the flusher batches them and sends to the Tauri Channel at ~30fps or 128KB.
    let (tx, rx) = std::sync::mpsc::channel::<ReaderMsg>();

    // Reader thread — reads from PTY, pushes raw chunks into mpsc
    let session_reader = pty_session.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; PTY_READ_BUF_SIZE];
        loop {
            if session_reader.shutdown.load(Ordering::Relaxed) {
                break;
            }
            match reader.read(&mut buf) {
                Ok(0) => {
                    session_reader.shutdown.store(true, Ordering::Relaxed);
                    let _ = tx.send(ReaderMsg::Eof);
                    break;
                }
                Ok(n) => {
                    if tx.send(ReaderMsg::Data(buf[..n].to_vec())).is_err() {
                        session_reader.shutdown.store(true, Ordering::Relaxed);
                        break; // Flusher dropped — channel closed
                    }
                }
                Err(e) => {
                    session_reader.shutdown.store(true, Ordering::Relaxed);
                    let _ = tx.send(ReaderMsg::Error(e.to_string()));
                    break;
                }
            }
        }
    });

    // Flusher thread — batches data chunks and flushes at ~30fps or 128KB.
    // Owns on_data (Tauri Channel) exclusively — all events go through here.
    std::thread::spawn(move || {
        let mut batch = Vec::with_capacity(MAX_OUTPUT_BATCH_SIZE);

        /// Process a single message. Returns `true` to continue, `false` to exit.
        fn handle_msg(
            msg: ReaderMsg,
            batch: &mut Vec<u8>,
            channel: &Channel<PtyOutputEvent>,
        ) -> bool {
            match msg {
                ReaderMsg::Data(chunk) => {
                    batch.extend_from_slice(&chunk);
                    true
                }
                ReaderMsg::Error(message) => {
                    flush_batch(batch, channel);
                    let _ = channel.send(PtyOutputEvent::Error { message });
                    let _ = channel.send(PtyOutputEvent::Exit { code: None });
                    false
                }
                ReaderMsg::Eof => {
                    flush_batch(batch, channel);
                    let _ = channel.send(PtyOutputEvent::Exit { code: None });
                    false
                }
            }
        }

        loop {
            match rx.recv_timeout(OUTPUT_FLUSH_INTERVAL) {
                Ok(msg) => {
                    if !handle_msg(msg, &mut batch, &on_data) {
                        return;
                    }
                    if batch.len() >= MAX_OUTPUT_BATCH_SIZE && !flush_batch(&mut batch, &on_data) {
                        return;
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    if !flush_batch(&mut batch, &on_data) {
                        return;
                    }
                    continue;
                }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    flush_batch(&mut batch, &on_data);
                    let _ = on_data.send(PtyOutputEvent::Exit { code: None });
                    return;
                }
            }
            // Drain remaining messages without blocking
            while let Ok(msg) = rx.try_recv() {
                if !handle_msg(msg, &mut batch, &on_data) {
                    return;
                }
                if batch.len() >= MAX_OUTPUT_BATCH_SIZE && !flush_batch(&mut batch, &on_data) {
                    return;
                }
            }
            if !flush_batch(&mut batch, &on_data) {
                return;
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
