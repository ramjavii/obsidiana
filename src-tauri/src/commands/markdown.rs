use crate::error::{AppError, AppResult};
use crate::fs::note::read_note_in;
use crate::markdown::render::render_markdown as render_markdown_inner_fn;
use crate::markdown::resolve::resolve_wikilink as resolve_wikilink_inner_fn;
use crate::markdown::tag::extract_tags as extract_tags_from_content;
use crate::markdown::types::{RenderedNote, ResolvedLink, TagRef, WikilinkRef};
use crate::markdown::wikilink::extract_wikilinks as extract_wikilinks_from_content;
use crate::paths::validate_relative_path;
use crate::state::AppState;
use rusqlite::Connection;
use serde::Serialize;
use std::path::Path;
use tauri::State;

use super::tree::require_vault_root;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BacklinkRef {
    pub source_path: String,
    pub source_title: String,
    pub kind: String,
    pub block_id: Option<String>,
}

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

pub fn resolve_wikilink_inner(
    state: State<'_, AppState>,
    source_path: String,
    target: String,
    alias: Option<String>,
) -> AppResult<ResolvedLink> {
    let vault_root = require_vault_root(&state)?;
    let relative_source = validate_relative_path(&source_path)?;
    resolve_wikilink_inner_fn(
        &vault_root,
        Path::new(&relative_source),
        &target,
        alias.as_deref(),
    )
}

#[tauri::command]
pub async fn resolve_wikilink(
    source_path: String,
    target: String,
    alias: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<ResolvedLink> {
    resolve_wikilink_inner(state, source_path, target, alias)
}

pub fn render_markdown_inner(
    state: State<'_, AppState>,
    path: String,
) -> AppResult<RenderedNote> {
    let vault_root = require_vault_root(&state)?;
    let relative = validate_relative_path(&path)?;
    let note = read_note_in(&vault_root, &relative)?;
    let source_path = relative;
    let resolver = |target: &str| -> Option<String> {
        resolve_wikilink_inner_fn(
            &vault_root,
            Path::new(&source_path),
            target,
            None,
        )
        .ok()
        .and_then(|r| match r {
            crate::markdown::types::ResolvedLink::Resolved { resolved_path, .. } => {
                Some(resolved_path)
            }
            crate::markdown::types::ResolvedLink::Broken { .. } => None,
        })
    };
    render_markdown_inner_fn(&note.content, resolver)
}

#[tauri::command]
pub async fn render_markdown(
    path: String,
    state: State<'_, AppState>,
) -> AppResult<RenderedNote> {
    render_markdown_inner(state, path)
}

pub fn get_tags_for_note_inner(
    state: State<'_, AppState>,
    path: String,
) -> AppResult<Vec<TagRef>> {
    let vault_root = require_vault_root(&state)?;
    let relative = validate_relative_path(&path)?;
    let note = read_note_in(&vault_root, &relative)?;
    Ok(extract_tags_from_content(&note.content))
}

#[tauri::command]
pub async fn get_tags_for_note(
    path: String,
    state: State<'_, AppState>,
) -> AppResult<Vec<TagRef>> {
    get_tags_for_note_inner(state, path)
}

pub fn get_backlinks_inner(
    state: State<'_, AppState>,
    path: String,
) -> AppResult<Vec<BacklinkRef>> {
    require_vault_root(&state)?;
    let relative = validate_relative_path(&path)?;

    let db_path = {
        let guard = state
            .index_db_path
            .lock()
            .map_err(|e| AppError::internal(format!("index_db_path lock: {e}")))?;
        guard.clone()
    };
    let Some(db_path) = db_path else {
        return Ok(Vec::new());
    };

    let conn = Connection::open(&db_path)
        .map_err(|e| AppError::internal(format!("open index db: {e}")))?;

    let relative_str = relative.to_string_lossy().to_string();

    let mut stmt = conn.prepare(
        "SELECT d.file_path, d.title, c.kind, c.block_id
         FROM connections c
         JOIN documents d ON d.id = c.source_id
         WHERE c.target_path = ?1",
    )?;

    let rows = stmt.query_map(rusqlite::params![relative_str], |row| {
        Ok(BacklinkRef {
            source_path: row.get(0)?,
            source_title: row.get(1)?,
            kind: row.get(2)?,
            block_id: row.get(3)?,
        })
    })?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }
    Ok(results)
}

#[tauri::command]
pub async fn get_backlinks(
    path: String,
    state: State<'_, AppState>,
) -> AppResult<Vec<BacklinkRef>> {
    get_backlinks_inner(state, path)
}
