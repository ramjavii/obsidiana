use crate::error::AppResult;
use crate::fs::note::read_note_in;
use crate::markdown::render::render_markdown as render_markdown_inner_fn;
use crate::markdown::resolve::resolve_wikilink as resolve_wikilink_inner_fn;
use crate::markdown::tag::extract_tags as extract_tags_from_content;
use crate::markdown::types::{RenderedNote, ResolvedLink, TagRef, WikilinkRef};
use crate::markdown::wikilink::extract_wikilinks as extract_wikilinks_from_content;
use crate::paths::validate_relative_path;
use crate::state::AppState;
use std::path::Path;
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
