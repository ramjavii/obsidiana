pub mod commands;
pub mod error;
pub mod fs;
pub mod index;
pub mod markdown;
pub mod paths;
pub mod settings;
pub mod state;

fn init_logging() {
    use log::{Level, LevelFilter, Metadata, Record};
    struct StderrLogger;
    impl log::Log for StderrLogger {
        fn enabled(&self, m: &Metadata) -> bool {
            m.level() <= Level::Warn
        }
        fn log(&self, record: &Record) {
            if self.enabled(record.metadata()) {
                eprintln!("[{}] {}: {}", record.level(), record.target(), record.args());
            }
        }
        fn flush(&self) {}
    }
    let _ = log::set_logger(&StderrLogger);
    log::set_max_level(LevelFilter::Warn);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_logging();
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
            commands::markdown::get_backlinks,
            commands::index::index_status,
            commands::index::rebuild_index,
            commands::graph::graph_snapshot,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
