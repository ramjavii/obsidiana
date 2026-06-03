use crate::error::AppError;
use crate::settings::Settings;
use chrono::{DateTime, Utc};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
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
}

impl AppState {
    pub fn new(settings_path: PathBuf) -> Self {
        Self {
            vault: Mutex::new(None),
            settings_path,
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
    use std::path::PathBuf;

    #[test]
    fn vault_info_uses_last_path_segment_as_name() {
        let info = vault_info_from(&PathBuf::from("/home/me/notes"));
        assert_eq!(info.name, "notes");
        assert_eq!(info.path, "/home/me/notes");
    }

    #[test]
    fn vault_info_falls_back_when_no_file_name() {
        let info = vault_info_from(&PathBuf::from("/"));
        assert_eq!(info.name, "vault");
    }

    #[test]
    fn new_app_state_has_no_vault() {
        let state = AppState::new(PathBuf::from("/tmp/x.json"));
        let guard = state.vault.lock().expect("lock");
        assert!(guard.is_none());
    }
}
