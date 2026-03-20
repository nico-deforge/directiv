use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TerminalLayout {
    Focus,
    #[default]
    SideBySide,
}

#[derive(Debug, Clone)]
pub struct TerminalConfig {
    pub identifier: String,
    /// tmux session name (or equivalent concept for other backends)
    pub session: String,
    /// Optional startup command to run after navigating to the worktree.
    /// For cmux, this is the Claude command. If None, no command is sent.
    pub command: Option<String>,
    pub worktree_path: String,
    pub env_vars: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Emulator {
    Ghostty,
    Iterm2,
    Cmux,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalRef {
    pub identifier: String,
    pub emulator: Emulator,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalStatus {
    pub session_name: String,
    pub identifier: String,
    pub active: bool,
}
