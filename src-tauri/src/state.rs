use crate::error::AppError;
use crate::index::ignore_set::IgnoreSet;
use crate::index::status::IndexStatus;
use crate::index::watcher::WatcherHandle;
use crate::settings::Settings;
use chrono::{DateTime, Utc};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::Manager;

pub type SetupError = Box<dyn std::error::Error>;

#[derive(Debug, Clone, Serialize)]
pub struct VaultHandle {
    pub path: PathBuf,
    pub opened_at: DateTime<Utc>,
}

pub struct AppState {
    pub vault: Mutex<Option<VaultHandle>>,
    pub settings_path: PathBuf,
    pub index: Arc<Mutex<IndexStatus>>,
    pub ignore_set: Arc<IgnoreSet>,
    pub watcher: Arc<Mutex<Option<WatcherHandle>>>,
    pub index_db_path: Arc<Mutex<Option<PathBuf>>>,
}

impl AppState {
    pub fn new(settings_path: PathBuf) -> Self {
        Self {
            vault: Mutex::new(None),
            settings_path,
            index: Arc::new(Mutex::new(IndexStatus::missing())),
            ignore_set: Arc::new(IgnoreSet::new()),
            watcher: Arc::new(Mutex::new(None)),
            index_db_path: Arc::new(Mutex::new(None)),
        }
    }

    pub fn load_settings(&self) -> Result<Settings, AppError> {
        Settings::load(&self.settings_path)
    }

    pub fn save_settings(&self, settings: &Settings) -> Result<(), AppError> {
        settings.save(&self.settings_path)
    }
}

pub fn vault_info_from(path: &Path) -> VaultInfo {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("vault")
        .to_string();
    // SAFETY: vault root is the one absolute path the frontend may see.
    // All other paths returned by IPC are relative to the vault root and
    // pass through paths::validate_relative_path. See docs/architecture.md
    // "Sandbox boundary exception" for the rationale.
    VaultInfo {
        name,
        path: path.display().to_string(),
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct VaultInfo {
    pub name: String,
    pub path: String,
}

pub fn init_app_state(app: &tauri::App) -> Result<(), SetupError> {
    let settings_path = crate::paths::settings_path()?;
    app.manage(AppState::new(settings_path));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vault_info_uses_last_path_segment_as_name() {
        let info = vault_info_from(Path::new("/home/me/notes"));
        assert_eq!(info.name, "notes");
        assert_eq!(info.path, "/home/me/notes");
    }

    #[test]
    fn vault_info_falls_back_when_no_file_name() {
        let info = vault_info_from(Path::new("/"));
        assert_eq!(info.name, "vault");
    }

    #[test]
    fn new_app_state_has_no_vault_and_missing_index() {
        let state = AppState::new(PathBuf::from("/tmp/x.json"));
        let guard = state.vault.lock().expect("lock");
        assert!(guard.is_none());
        let snap = state.index.lock().expect("index lock");
        assert_eq!(
            snap.state.state,
            crate::index::status::IndexStateKind::Missing
        );
        // New fields are also at their empty defaults.
        assert!(state.watcher.lock().expect("watcher lock").is_none());
        assert!(state.index_db_path.lock().expect("db path lock").is_none());
    }
}
