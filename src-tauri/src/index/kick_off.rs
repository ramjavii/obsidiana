use crate::index::db::{db_path, IndexDb};
use crate::index::ingest::ingest_all;
use crate::index::status::IndexStatus;
use crate::state::AppState;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, Runtime};

pub fn kick_off_index_open<R: Runtime>(app: AppHandle<R>, vault_root: &Path) {
    let state = app.state::<AppState>();
    let index_lock: Arc<Mutex<IndexStatus>> = state.index.clone();
    let db_path_arc: Arc<Mutex<Option<PathBuf>>> = state.index_db_path.clone();
    {
        if let Ok(mut snap) = index_lock.lock() {
            *snap = IndexStatus::indexing(0, 0);
        }
    }
    let root = vault_root.to_path_buf();
    let cb_lock = index_lock.clone();
    let db_path_for_open = db_path(&root);
    let db_path_for_set = db_path_for_open.clone();
    tauri::async_runtime::spawn_blocking(move || {
        // Publish the DB path BEFORE the open completes so the watcher
        // (if started immediately after this function returns) can find it.
        if let Ok(mut g) = db_path_arc.lock() {
            *g = Some(db_path_for_set);
        }
        let next = match IndexDb::open(&root) {
            Ok(db) => match ingest_all(db.conn(), &root, |indexed, total| {
                if let Ok(mut snap) = cb_lock.lock() {
                    *snap = IndexStatus::indexing(indexed, total);
                }
            }) {
                Ok(_) => match db.status() {
                    Ok(s) => s,
                    Err(e) => IndexStatus::failed(format!("status: {e}")),
                },
                Err(e) => IndexStatus::failed(format!("ingest: {e}")),
            },
            Err(e) => IndexStatus::failed(format!("open: {e}")),
        };
        if let Ok(mut snap) = cb_lock.lock() {
            *snap = next;
        }
    });
}

pub fn reset_index_status<R: Runtime>(app: &AppHandle<R>) {
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(mut snap) = state.index.lock() {
            *snap = IndexStatus::missing();
        }
        if let Ok(mut p) = state.index_db_path.lock() {
            *p = None;
        }
    }
}
