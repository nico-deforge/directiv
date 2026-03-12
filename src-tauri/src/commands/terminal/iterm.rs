use super::controller::TerminalController;
use super::types::{TerminalConfig, TerminalRef};

pub struct ITermController;

impl TerminalController for ITermController {
    async fn find_session(
        &self,
        _app: &tauri::AppHandle,
        _worktree_path: &str,
    ) -> Result<Option<TerminalRef>, String> {
        todo!()
    }

    async fn focus(
        &self,
        _app: &tauri::AppHandle,
        _terminal_ref: &TerminalRef,
    ) -> Result<(), String> {
        todo!()
    }

    async fn create(
        &self,
        _app: &tauri::AppHandle,
        _config: &TerminalConfig,
    ) -> Result<(), String> {
        todo!()
    }

    async fn split(
        &self,
        _app: &tauri::AppHandle,
        _terminal_ref: &TerminalRef,
    ) -> Result<(), String> {
        todo!()
    }

    async fn send_text(
        &self,
        _app: &tauri::AppHandle,
        _terminal_ref: &TerminalRef,
        _text: &str,
    ) -> Result<(), String> {
        todo!()
    }
}
