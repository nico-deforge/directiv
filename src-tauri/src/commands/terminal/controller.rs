use super::types::{TerminalConfig, TerminalRef};

pub trait TerminalController {
    fn find_session(
        &self,
        app: &tauri::AppHandle,
        identifier: &str,
        worktree_path: &str,
    ) -> impl std::future::Future<Output = Result<Option<TerminalRef>, String>> + Send;

    fn focus(
        &self,
        app: &tauri::AppHandle,
        terminal_ref: &TerminalRef,
    ) -> impl std::future::Future<Output = Result<(), String>> + Send;

    /// Create a new terminal session.
    /// Returns `Some(TerminalRef)` if the backend can provide a direct reference
    /// to the created session (e.g. cmux returns the workspace ref), or `None`
    /// if a post-create `find_session` is needed (e.g. Ghostty, iTerm2).
    fn create(
        &self,
        app: &tauri::AppHandle,
        config: &TerminalConfig,
    ) -> impl std::future::Future<Output = Result<Option<TerminalRef>, String>> + Send;

    fn split(
        &self,
        app: &tauri::AppHandle,
        terminal_ref: &TerminalRef,
        worktree_path: &str,
    ) -> impl std::future::Future<Output = Result<(), String>> + Send;

    /// List all terminal sessions open in the emulator.
    /// Returns a Vec of (identifier, name_or_working_dir) pairs.
    fn list_sessions(
        &self,
        app: &tauri::AppHandle,
    ) -> impl std::future::Future<Output = Result<Vec<(String, String)>, String>> + Send;
}
