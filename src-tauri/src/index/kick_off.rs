use crate::index::db::IndexDb;
use crate::index::status::IndexStatus;
use crate::state::AppState;
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, Runtime};

pub fn kick_off_index_open<R: Runtime>(app: AppHandle<R>, vault_root: &Path) {
    let index_lock: Arc<Mutex<IndexStatus>> = {
        let state = app.state::<AppState>();
        state.index.clone()
    };
    {
        if let Ok(mut snap) = index_lock.lock() {
            *snap = IndexStatus::indexing();
        }
    }
    let root = vault_root.to_path_buf();
    tauri::async_runtime::spawn_blocking(move || {
        let next = match IndexDb::open(&root) {
            Ok(db) => match db.status() {
                Ok(s) => s,
                Err(e) => IndexStatus::failed(format!("status: {e}")),
            },
            Err(e) => IndexStatus::failed(format!("open: {e}")),
        };
        if let Ok(mut snap) = index_lock.lock() {
            *snap = next;
        }
    });
}

pub fn reset_index_status<R: Runtime>(app: &AppHandle<R>) {
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(mut snap) = state.index.lock() {
            *snap = IndexStatus::missing();
        }
    }
}
