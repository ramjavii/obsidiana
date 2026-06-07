use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum WatcherEvent {
    Changed { rel_path: String, mtime: i64 },
    Deleted { rel_path: String },
}

impl WatcherEvent {
    pub fn emit<R: Runtime>(&self, app: &AppHandle<R>) {
        if let Err(e) = app.emit("obsidiana://fs-change", self) {
            log::warn!("watcher: emit failed: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn changed_serializes_with_camel_case() {
        let ev = WatcherEvent::Changed {
            rel_path: "notes/idea.md".to_string(),
            mtime: 1_700_000_000,
        };
        let value = serde_json::to_value(&ev).expect("serialize");
        assert_eq!(value["kind"], "changed");
        assert_eq!(value["relPath"], "notes/idea.md");
        assert_eq!(value["mtime"], 1_700_000_000);
    }

    #[test]
    fn deleted_serializes_with_camel_case() {
        let ev = WatcherEvent::Deleted {
            rel_path: "notes/old.md".to_string(),
        };
        let value = serde_json::to_value(&ev).expect("serialize");
        assert_eq!(value["kind"], "deleted");
        assert_eq!(value["relPath"], "notes/old.md");
        assert!(value.get("mtime").is_none(), "Deleted should not include mtime");
    }
}
