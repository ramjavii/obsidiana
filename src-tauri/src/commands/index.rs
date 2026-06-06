use crate::error::AppResult;
use crate::index::{db::IndexDb, status::IndexStatus};
use crate::state::AppState;
use tauri::{AppHandle, Manager, Runtime, State};

pub fn index_status_inner(state: State<'_, AppState>) -> AppResult<IndexStatus> {
    let snap = state
        .index
        .lock()
        .map_err(|e| crate::error::AppError::internal(format!("index status lock: {e}")))?;
    Ok(snap.clone())
}

#[tauri::command]
pub async fn index_status(state: State<'_, AppState>) -> AppResult<IndexStatus> {
    index_status_inner(state)
}

pub fn rebuild_index_inner<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let vault_root = {
        let guard = state
            .vault
            .lock()
            .map_err(|e| crate::error::AppError::internal(format!("vault lock: {e}")))?;
        guard.as_ref().map(|h| h.path.clone())
    };
    let Some(vault_root) = vault_root else {
        return Err(crate::error::AppError::invalid("no vault is open"));
    };
    {
        let mut snap = state
            .index
            .lock()
            .map_err(|e| crate::error::AppError::internal(format!("index status lock: {e}")))?;
        *snap = IndexStatus::indexing();
    }
    let index_lock = {
        let state_handle = app.state::<AppState>();
        state_handle.index.clone()
    };
    tauri::async_runtime::spawn_blocking(move || {
        let next = match IndexDb::rebuild(&vault_root) {
            Ok(db) => match db.status() {
                Ok(s) => s,
                Err(e) => IndexStatus::failed(format!("status: {e}")),
            },
            Err(e) => IndexStatus::failed(format!("rebuild: {e}")),
        };
        if let Ok(mut snap) = index_lock.lock() {
            *snap = next;
        }
    });
    Ok(())
}

#[tauri::command]
pub async fn rebuild_index(app: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    rebuild_index_inner(app, state)
}
