use crate::error::{AppError, AppResult};
use crate::fs::note::{
    create_note_in, delete_note_in, read_note_in, rename_note_in, write_note_in, NoteContent,
    RenameReport, WriteResult,
};
use crate::fs::tree::{list_children, TreeNode};
use crate::paths::validate_relative_path;
use crate::state::AppState;
use std::path::PathBuf;
use tauri::State;

pub(crate) fn require_vault_root(state: &State<'_, AppState>) -> AppResult<PathBuf> {
    let guard = state
        .vault
        .lock()
        .map_err(|e| AppError::internal(format!("vault lock: {e}")))?;
    let handle = guard
        .as_ref()
        .ok_or_else(|| AppError::invalid("no vault is open"))?;
    Ok(handle.path.clone())
}

pub fn list_tree_inner(
    state: State<'_, AppState>,
    path: Option<String>,
) -> AppResult<Vec<TreeNode>> {
    let vault_root = require_vault_root(&state)?;
    let relative = match path.as_deref() {
        Some(p) => {
            let validated = validate_relative_path(p)?;
            Some(validated)
        }
        None => None,
    };
    list_children(&vault_root, relative.as_deref())
}

#[tauri::command]
pub async fn list_tree(
    path: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<Vec<TreeNode>> {
    list_tree_inner(state, path)
}

pub fn create_note_inner(
    state: State<'_, AppState>,
    path: String,
    template: Option<String>,
) -> AppResult<NoteContent> {
    let vault_root = require_vault_root(&state)?;
    let relative = validate_relative_path(&path)?;
    let content = template.unwrap_or_default();
    create_note_in(&vault_root, &state.ignore_set, &relative, &content)
}

#[tauri::command]
pub async fn create_note(
    path: String,
    template: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<NoteContent> {
    create_note_inner(state, path, template)
}

pub fn delete_note_inner(state: State<'_, AppState>, path: String) -> AppResult<()> {
    let vault_root = require_vault_root(&state)?;
    let relative = validate_relative_path(&path)?;
    delete_note_in(&vault_root, &state.ignore_set, &relative)
}

#[tauri::command]
pub async fn delete_note(path: String, state: State<'_, AppState>) -> AppResult<()> {
    delete_note_inner(state, path)
}

pub fn rename_note_inner(
    state: State<'_, AppState>,
    from: String,
    to: String,
) -> AppResult<RenameReport> {
    let vault_root = require_vault_root(&state)?;
    let rel_from = validate_relative_path(&from)?;
    let rel_to = validate_relative_path(&to)?;
    rename_note_in(&vault_root, &state.ignore_set, &rel_from, &rel_to)
}

#[tauri::command]
pub async fn rename_note(
    from: String,
    to: String,
    state: State<'_, AppState>,
) -> AppResult<RenameReport> {
    rename_note_inner(state, from, to)
}

pub fn read_note_inner(state: State<'_, AppState>, path: String) -> AppResult<NoteContent> {
    let vault_root = require_vault_root(&state)?;
    let relative = validate_relative_path(&path)?;
    read_note_in(&vault_root, &relative)
}

#[tauri::command]
pub async fn read_note(
    path: String,
    state: State<'_, AppState>,
) -> AppResult<NoteContent> {
    read_note_inner(state, path)
}

pub fn write_note_inner(
    state: State<'_, AppState>,
    path: String,
    content: String,
) -> AppResult<WriteResult> {
    let vault_root = require_vault_root(&state)?;
    let relative = validate_relative_path(&path)?;
    write_note_in(&vault_root, &state.ignore_set, &relative, &content)
}

#[tauri::command]
pub async fn write_note(
    path: String,
    content: String,
    state: State<'_, AppState>,
) -> AppResult<WriteResult> {
    write_note_inner(state, path, content)
}
