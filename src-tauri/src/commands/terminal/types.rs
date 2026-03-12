use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TerminalLayout {
    Focus,
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
pub struct TerminalRef {
    pub identifier: String,
    pub emulator: String,
}
