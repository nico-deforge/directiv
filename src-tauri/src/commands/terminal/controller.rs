use super::types::{TerminalConfig, TerminalRef};

pub trait TerminalController {
    fn find_session(
        &self,
        app: &tauri::AppHandle,
        worktree_path: &str,
    ) -> impl std::future::Future<Output = Result<Option<TerminalRef>, String>> + Send;

    fn focus(
        &self,
        app: &tauri::AppHandle,
        terminal_ref: &TerminalRef,
    ) -> impl std::future::Future<Output = Result<(), String>> + Send;

    fn create(
        &self,
        app: &tauri::AppHandle,
        config: &TerminalConfig,
    ) -> impl std::future::Future<Output = Result<(), String>> + Send;

    fn split(
        &self,
        app: &tauri::AppHandle,
        terminal_ref: &TerminalRef,
    ) -> impl std::future::Future<Output = Result<(), String>> + Send;

    fn send_text(
        &self,
        app: &tauri::AppHandle,
        terminal_ref: &TerminalRef,
        text: &str,
    ) -> impl std::future::Future<Output = Result<(), String>> + Send;
}
