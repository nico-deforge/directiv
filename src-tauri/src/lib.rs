#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    if cfg!(debug_assertions) {
        builder = builder.plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        );
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
