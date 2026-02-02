mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default().plugin(tauri_plugin_shell::init());

    if cfg!(debug_assertions) {
        builder = builder.plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        );
    }

    builder
        .invoke_handler(tauri::generate_handler![
            commands::worktree::worktree_list,
            commands::worktree::worktree_create,
            commands::worktree::worktree_remove,
            commands::worktree::worktree_check_merged,
            commands::tmux::tmux_list_sessions,
            commands::tmux::tmux_create_session,
            commands::tmux::tmux_kill_session,
            commands::tmux::tmux_send_keys,
            commands::tmux::tmux_capture_pane,
            commands::terminal::open_terminal,
            commands::hooks::run_hooks,
            commands::config::load_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
