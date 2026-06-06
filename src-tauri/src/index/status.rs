use crate::error::AppResult;
use chrono::{DateTime, Utc};
use serde::Serialize;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum IndexStateKind {
    #[default]
    Missing,
    Indexing,
    Ready,
    Broken,
    Failed,
}

#[derive(Debug, Clone, Serialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct IndexState {
    pub state: IndexStateKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quarantined_to: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct IndexStatus {
    #[serde(flatten)]
    pub state: IndexState,
    pub schema_ver: u32,
    pub document_count: u64,
    pub last_rebuilt_at: Option<DateTime<Utc>>,
}

impl IndexStatus {
    pub fn missing() -> Self {
        Self {
            state: IndexState {
                state: IndexStateKind::Missing,
                ..Default::default()
            },
            schema_ver: 0,
            document_count: 0,
            last_rebuilt_at: None,
        }
    }

    pub fn indexing() -> Self {
        Self {
            state: IndexState {
                state: IndexStateKind::Indexing,
                ..Default::default()
            },
            schema_ver: 0,
            document_count: 0,
            last_rebuilt_at: None,
        }
    }

    pub fn ready(schema_ver: u32, document_count: u64) -> Self {
        Self {
            state: IndexState {
                state: IndexStateKind::Ready,
                ..Default::default()
            },
            schema_ver,
            document_count,
            last_rebuilt_at: Some(Utc::now()),
        }
    }

    pub fn broken(quarantined_to: impl Into<String>) -> Self {
        Self {
            state: IndexState {
                state: IndexStateKind::Broken,
                quarantined_to: Some(quarantined_to.into()),
                message: None,
            },
            schema_ver: 0,
            document_count: 0,
            last_rebuilt_at: None,
        }
    }

    pub fn failed(message: impl Into<String>) -> Self {
        Self {
            state: IndexState {
                state: IndexStateKind::Failed,
                quarantined_to: None,
                message: Some(message.into()),
            },
            schema_ver: 0,
            document_count: 0,
            last_rebuilt_at: None,
        }
    }
}

pub fn status_from_db(conn: &rusqlite::Connection) -> AppResult<IndexStatus> {
    let schema_ver: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM documents", [], |r| r.get(0))?;
    Ok(IndexStatus::ready(
        u32::try_from(schema_ver).unwrap_or(0),
        count.max(0) as u64,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_state_serializes_with_state_discriminator() {
        let s = IndexStatus::missing();
        let v = serde_json::to_value(&s).expect("serialize");
        assert_eq!(v["state"], "missing");
        assert_eq!(v["schemaVer"], 0);
        assert_eq!(v["documentCount"], 0);
        assert!(v.get("quarantinedTo").is_none());
        assert!(v.get("message").is_none());
    }

    #[test]
    fn indexing_state_serializes() {
        let s = IndexStatus::indexing();
        let v = serde_json::to_value(&s).expect("serialize");
        assert_eq!(v["state"], "indexing");
    }

    #[test]
    fn ready_state_serializes_with_count() {
        let s = IndexStatus::ready(1, 42);
        let v = serde_json::to_value(&s).expect("serialize");
        assert_eq!(v["state"], "ready");
        assert_eq!(v["schemaVer"], 1);
        assert_eq!(v["documentCount"], 42);
        assert!(v["lastRebuiltAt"].is_string());
    }

    #[test]
    fn broken_state_serializes_with_quarantine_path() {
        let s = IndexStatus::broken("/vault/.obsidiana/index.db.broken-1700000000");
        let v = serde_json::to_value(&s).expect("serialize");
        assert_eq!(v["state"], "broken");
        assert_eq!(
            v["quarantinedTo"],
            "/vault/.obsidiana/index.db.broken-1700000000"
        );
    }

    #[test]
    fn failed_state_serializes_with_message() {
        let s = IndexStatus::failed("permission denied");
        let v = serde_json::to_value(&s).expect("serialize");
        assert_eq!(v["state"], "failed");
        assert_eq!(v["message"], "permission denied");
    }
}
