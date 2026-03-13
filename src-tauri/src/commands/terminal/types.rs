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
    pub session: String,
    pub worktree_path: String,
    pub env_vars: HashMap<String, String>,
    pub layout: TerminalLayout,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Emulator {
    Ghostty,
    Iterm2,
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
