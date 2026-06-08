use crate::error::{AppError, AppResult};
use crate::state::AppState;
use rusqlite::Connection;
use serde::Serialize;
use std::path::PathBuf;

use super::tree::require_vault_root;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    pub id: String,
    pub title: String,
    pub is_empty: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphLink {
    pub source: String,
    pub target: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphData {
    pub nodes: Vec<GraphNode>,
    pub links: Vec<GraphLink>,
}

#[tauri::command]
pub async fn graph_snapshot(state: tauri::State<'_, AppState>) -> AppResult<GraphData> {
    let _vault_root = require_vault_root(&state)?;

    let db_path: Option<PathBuf> = {
        let guard = state
            .index_db_path
            .lock()
            .map_err(|e| AppError::internal(format!("index_db_path lock: {e}")))?;
        guard.clone()
    };

    tauri::async_runtime::spawn_blocking(move || {
        let Some(db_path) = db_path else {
            return Ok(GraphData {
                nodes: vec![],
                links: vec![],
            });
        };

        let conn = Connection::open(&db_path)
            .map_err(|e| AppError::internal(format!("open index db: {e}")))?;

        let mut node_stmt = conn
            .prepare("SELECT file_path, title, content_size FROM documents")
            .map_err(|e| AppError::internal(format!("prepare nodes: {e}")))?;
        let nodes: Vec<GraphNode> = node_stmt
            .query_map([], |row| {
                let content_size: i64 = row.get(2)?;
                Ok(GraphNode {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    is_empty: content_size == 0,
                })
            })
            .map_err(|e| AppError::internal(format!("query nodes: {e}")))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| AppError::internal(format!("collect nodes: {e}")))?;

        let mut link_stmt = conn
            .prepare(
                "SELECT src.file_path, COALESCE(tgt.file_path, tgt2.file_path, c.target_path)
                 FROM connections c
                 JOIN documents src ON src.id = c.source_id
                 LEFT JOIN documents tgt ON tgt.file_path = c.target_path
                 LEFT JOIN documents tgt2 ON tgt2.file_path = c.target_path || '.md'",
            )
            .map_err(|e| AppError::internal(format!("prepare links: {e}")))?;
        let links: Vec<GraphLink> = link_stmt
            .query_map([], |row| {
                Ok(GraphLink {
                    source: row.get(0)?,
                    target: row.get(1)?,
                })
            })
            .map_err(|e| AppError::internal(format!("query links: {e}")))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| AppError::internal(format!("collect links: {e}")))?;

        Ok(GraphData { nodes, links })
    })
    .await
    .map_err(|e| AppError::internal(format!("spawn_blocking: {e}")))?
}
