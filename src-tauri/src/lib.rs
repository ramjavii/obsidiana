pub mod commands;
pub mod error;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::ping::ping,
            commands::error_demo::ping_or_fail,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
