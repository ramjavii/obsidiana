pub mod commands;
pub mod error;
pub mod fs;
pub mod markdown;
pub mod paths;
pub mod settings;
pub mod state;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            state::init_app_state(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::ping::ping,
            commands::error_demo::ping_or_fail,
            commands::vault::pick_vault,
            commands::vault::open_vault,
            commands::vault::open_vault_force,
            commands::vault::close_vault,
            commands::vault::list_recent_vaults,
            commands::vault::get_open_vault,
            commands::tree::list_tree,
            commands::tree::create_note,
            commands::tree::delete_note,
            commands::tree::rename_note,
            commands::tree::read_note,
            commands::tree::write_note,
            commands::markdown::extract_wikilinks,
            commands::markdown::resolve_wikilink,
            commands::markdown::render_markdown,
            commands::markdown::get_tags_for_note,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
