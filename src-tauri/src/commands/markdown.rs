use crate::error::AppResult;
use crate::fs::note::read_note_in;
use crate::markdown::types::WikilinkRef;
use crate::markdown::wikilink::extract_wikilinks as extract_wikilinks_from_content;
use crate::paths::validate_relative_path;
use crate::state::AppState;
use tauri::State;

use super::tree::require_vault_root;

pub fn extract_wikilinks_inner(
    state: State<'_, AppState>,
    path: String,
) -> AppResult<Vec<WikilinkRef>> {
    let vault_root = require_vault_root(&state)?;
    let relative = validate_relative_path(&path)?;
    let note = read_note_in(&vault_root, &relative)?;
    Ok(extract_wikilinks_from_content(&note.content))
}

#[tauri::command]
pub async fn extract_wikilinks(
    path: String,
    state: State<'_, AppState>,
) -> AppResult<Vec<WikilinkRef>> {
    extract_wikilinks_inner(state, path)
}
