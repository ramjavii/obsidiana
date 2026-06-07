use crate::error::{AppError, AppResult};
use crate::index::{kick_off, watcher};
use crate::settings::{RecentVaultEntry, Settings};
use crate::state::{vault_info_from, AppState, VaultHandle, VaultInfo};
use chrono::Utc;
use std::path::PathBuf;
use tauri::{AppHandle, Runtime};
use tauri_plugin_dialog::DialogExt;

#[derive(Debug, Clone, serde::Serialize, PartialEq)]
pub struct RecentVault {
    pub name: String,
    pub path: String,
    pub last_opened: String,
    pub available: bool,
}

fn to_recent_vault(entry: &RecentVaultEntry) -> RecentVault {
    RecentVault {
        name: entry
            .path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("vault")
            .to_string(),
        path: entry.path.display().to_string(),
        last_opened: entry.last_opened.to_rfc3339(),
        available: entry.available,
    }
}

pub fn pick_folder_via_dialog<R: Runtime>(app: &AppHandle<R>) -> AppResult<Option<PathBuf>> {
    let (tx, rx) = std::sync::mpsc::channel::<Option<PathBuf>>();
    app.dialog()
        .file()
        .pick_folder(move |folder| {
            let p = folder.and_then(|fp| fp.into_path().ok());
            let _ = tx.send(p);
        });
    rx.recv().map_err(|e| AppError::internal(format!("dialog channel closed: {e}")))
}

pub fn pick_vault_inner<R, F>(
    app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
    picker: F,
) -> AppResult<Option<VaultInfo>>
where
    R: Runtime,
    F: FnOnce(&AppHandle<R>) -> AppResult<Option<PathBuf>>,
{
    let picked = picker(&app)?;
    let Some(picked) = picked else {
        return Ok(None);
    };
    let canonical = crate::paths::canonicalize_dir(&picked)?;
    let info = vault_info_from(&canonical);
    {
        let mut settings = state.load_settings()?;
        settings.record_open(&canonical);
        state.save_settings(&settings)?;
    }
    let now = Utc::now();
    let mut guard = state.vault.lock().map_err(|e| AppError::internal(format!("vault lock: {e}")))?;
    *guard = Some(VaultHandle {
        path: canonical,
        opened_at: now,
    });
    Ok(Some(info))
}

#[tauri::command]
pub async fn pick_vault(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> AppResult<Option<VaultInfo>> {
    let result = pick_vault_inner(app.clone(), state.clone(), pick_folder_via_dialog)?;
    if let Some(info) = &result {
        start_kick_off_and_watcher(&app, &state, PathBuf::from(&info.path));
    }
    Ok(result)
}

pub fn open_vault_inner(
    state: tauri::State<'_, AppState>,
    path_str: String,
    force: bool,
) -> AppResult<VaultInfo> {
    if path_str.is_empty() {
        return Err(AppError::invalid("vault path is empty"));
    }
    if path_str.contains('\0') {
        return Err(AppError::invalid("vault path contains a null byte"));
    }
    let input = PathBuf::from(&path_str);
    let canonical = crate::paths::canonicalize_dir(&input)?;
    {
        let guard = state
            .vault
            .lock()
            .map_err(|e| AppError::internal(format!("vault lock: {e}")))?;
        if guard.is_some() && !force {
            return Err(AppError::busy("another vault is already open"));
        }
    }
    {
        let mut settings = state.load_settings()?;
        settings.record_open(&canonical);
        state.save_settings(&settings)?;
    }
    let now = Utc::now();
    let mut guard = state
        .vault
        .lock()
        .map_err(|e| AppError::internal(format!("vault lock: {e}")))?;
    *guard = Some(VaultHandle {
        path: canonical.clone(),
        opened_at: now,
    });
    Ok(vault_info_from(&canonical))
}

#[tauri::command]
pub async fn open_vault(
    path: String,
    state: tauri::State<'_, AppState>,
    app: AppHandle,
) -> AppResult<VaultInfo> {
    let info = open_vault_inner(state.clone(), path, false)?;
    start_kick_off_and_watcher(&app, &state, PathBuf::from(&info.path));
    Ok(info)
}

#[tauri::command]
pub async fn open_vault_force(
    path: String,
    state: tauri::State<'_, AppState>,
    app: AppHandle,
) -> AppResult<VaultInfo> {
    let info = open_vault_inner(state.clone(), path, true)?;
    start_kick_off_and_watcher(&app, &state, PathBuf::from(&info.path));
    Ok(info)
}

pub fn close_vault_inner(state: tauri::State<'_, AppState>) -> AppResult<()> {
    {
        let mut guard = state
            .vault
            .lock()
            .map_err(|e| AppError::internal(format!("vault lock: {e}")))?;
        if guard.is_none() {
            return Ok(());
        }
        *guard = None;
    }
    let mut settings = state.load_settings()?;
    settings.record_close();
    state.save_settings(&settings)?;
    Ok(())
}

#[tauri::command]
pub async fn close_vault(state: tauri::State<'_, AppState>, app: AppHandle) -> AppResult<()> {
    // Stop the watcher first so its worker thread is joined before
    // we reset the index status. Order matters: the watcher reads
    // state.index_db_path during event handling; we want the watch
    // gone before we clear the path.
    if let Ok(mut g) = state.watcher.lock() {
        if let Some(h) = g.take() {
            watcher::stop(h);
        }
    }
    close_vault_inner(state)?;
    kick_off::reset_index_status(&app);
    Ok(())
}

pub fn list_recent_vaults_inner(
    state: tauri::State<'_, AppState>,
) -> AppResult<Vec<RecentVault>> {
    let mut settings = state.load_settings()?;
    settings.reconcile();
    state.save_settings(&settings)?;
    Ok(settings.recent_vaults.iter().map(to_recent_vault).collect())
}

#[tauri::command]
pub async fn list_recent_vaults(
    state: tauri::State<'_, AppState>,
) -> AppResult<Vec<RecentVault>> {
    list_recent_vaults_inner(state)
}

pub fn get_open_vault_inner(state: tauri::State<'_, AppState>) -> AppResult<Option<VaultInfo>> {
    let guard = state
        .vault
        .lock()
        .map_err(|e| AppError::internal(format!("vault lock: {e}")))?;
    Ok(guard.as_ref().map(|h| vault_info_from(&h.path)))
}

#[tauri::command]
pub async fn get_open_vault(
    state: tauri::State<'_, AppState>,
) -> AppResult<Option<VaultInfo>> {
    get_open_vault_inner(state)
}

pub fn list_settings_for_test(path: &std::path::Path) -> AppResult<Settings> {
    Settings::load(path)
}

fn start_kick_off_and_watcher(
    app: &AppHandle,
    state: &tauri::State<'_, AppState>,
    root: PathBuf,
) {
    // Stop any existing watcher before we kick off a new one. This
    // covers the open-vault-while-vault-is-open case (force open).
    if let Ok(mut g) = state.watcher.lock() {
        if let Some(h) = g.take() {
            watcher::stop(h);
        }
    }
    kick_off::kick_off_index_open(app.clone(), &root);
    match watcher::start(
        app.clone(),
        &root,
        state.index_db_path.clone(),
        state.ignore_set.clone(),
    ) {
        Ok(handle) => {
            if let Ok(mut g) = state.watcher.lock() {
                *g = Some(handle);
            }
        }
        Err(e) => {
            log::warn!("watcher: start failed: {e}");
        }
    }
}
