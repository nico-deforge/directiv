mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init());

    if cfg!(debug_assertions) {
        builder = builder.plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        );
    }

    builder
        .invoke_handler(tauri::generate_handler![
            commands::tmux::tmux_list_sessions,
            commands::tmux::tmux_create_session,
            commands::tmux::tmux_kill_session,
            commands::tmux::tmux_send_keys,
            commands::tmux::tmux_capture_pane,
            commands::tmux::tmux_wait_for_ready,
            commands::terminal::open_terminal,
            commands::terminal::query_terminals,
            commands::terminal::cmux_close_workspace,
            commands::terminal::cmux_browser_open,
            commands::terminal::cmux_set_status,
            commands::terminal::cmux_set_progress,
            commands::terminal::cmux_log,
            commands::terminal::cmux_clear_progress,
            commands::terminal::cmux_clear_log,
            commands::terminal::cmux_ping,
            commands::terminal::cmux_capture_pane,
            commands::terminal::cmux_list_notifications,
            commands::terminal::open_editor,
            commands::config::load_config,
            commands::config::save_config,
            commands::skills::get_plugin_dir,
            commands::skills::list_plugin_skills,
            commands::skills::read_plugin_skill_file,
            commands::skills::list_all_claude_skills,
            commands::workspace::scan_workspace,
            commands::oauth::linear_oauth_start,
            commands::oauth::linear_oauth_refresh,
            commands::oauth::linear_get_valid_token,
            commands::oauth::linear_oauth_status,
            commands::oauth::linear_oauth_disconnect,
            commands::github::gh_auth_status,
            commands::github::gh_list_my_open_prs,
            commands::github::gh_list_review_requests,
            commands::github::gh_check_repo_access,
            commands::wt::wt_version,
            commands::wt::wt_list,
            commands::wt::wt_switch_create,
            commands::wt::wt_remove,
            commands::wt::wt_merge,
            commands::wt::git_fetch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
