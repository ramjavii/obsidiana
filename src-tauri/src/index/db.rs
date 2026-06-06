use crate::error::{AppError, AppResult};
use crate::index::schema::run_migrations;
use crate::index::status::status_from_db;
use chrono::Utc;
use rusqlite::Connection;
use std::path::{Path, PathBuf};

const APP_DIR: &str = ".obsidiana";
const DB_FILE: &str = "index.db";

pub fn db_path(vault_root: &Path) -> PathBuf {
    vault_root.join(APP_DIR).join(DB_FILE)
}

pub fn ensure_app_dir(vault_root: &Path) -> AppResult<PathBuf> {
    let dir = vault_root.join(APP_DIR);
    if !dir.exists() {
        std::fs::create_dir_all(&dir)
            .map_err(|e| AppError::from_io(dir.display().to_string(), &e))?;
    }
    Ok(dir)
}

pub struct IndexDb {
    conn: Connection,
    path: PathBuf,
    broken_quarantine: Option<PathBuf>,
}

impl IndexDb {
    pub fn open(vault_root: &Path) -> AppResult<Self> {
        let path = db_path(vault_root);
        ensure_app_dir(vault_root)?;
        let broken_quarantine = if path.exists() {
            match Self::open_at(&path) {
                Ok(db) => return Ok(db),
                Err(e) => {
                    let ts = Utc::now().timestamp();
                    let broken = path.with_file_name(format!("index.db.broken-{ts}"));
                    std::fs::rename(&path, &broken)
                        .map_err(|io| AppError::from_io(path.display().to_string(), &io))?;
                    log::warn!(
                        "index integrity check failed ({}); quarantined to {}",
                        e,
                        broken.display()
                    );
                    Some(broken)
                }
            }
        } else {
            None
        };
        let db = Self::open_at(&path)?;
        Ok(Self {
            conn: db.conn,
            path: db.path,
            broken_quarantine,
        })
    }

    fn open_at(path: &Path) -> AppResult<Self> {
        let conn = Connection::open(path)
            .map_err(|e| AppError::internal(format!("open sqlite {}: {e}", path.display())))?;
        conn.pragma_update(None, "journal_mode", "WAL")
            .map_err(|e| AppError::internal(format!("set journal_mode: {e}")))?;
        conn.pragma_update(None, "synchronous", "NORMAL")
            .map_err(|e| AppError::internal(format!("set synchronous: {e}")))?;
        conn.pragma_update(None, "foreign_keys", "ON")
            .map_err(|e| AppError::internal(format!("set foreign_keys: {e}")))?;
        let ok: String = conn
            .query_row("PRAGMA integrity_check", [], |r| r.get(0))
            .map_err(|e| AppError::internal(format!("integrity_check: {e}")))?;
        if ok != "ok" {
            return Err(AppError::internal(format!(
                "sqlite integrity_check returned: {ok}"
            )));
        }
        run_migrations(&conn)?;
        Ok(Self {
            conn,
            path: path.to_path_buf(),
            broken_quarantine: None,
        })
    }

    pub fn rebuild(vault_root: &Path) -> AppResult<Self> {
        let path = db_path(vault_root);
        if path.exists() {
            std::fs::remove_file(&path)
                .map_err(|e| AppError::from_io(path.display().to_string(), &e))?;
        }
        Self::open(vault_root)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn conn(&self) -> &Connection {
        &self.conn
    }

    pub fn broken_quarantine(&self) -> Option<&Path> {
        self.broken_quarantine.as_deref()
    }

    pub fn status(&self) -> AppResult<crate::index::status::IndexStatus> {
        status_from_db(&self.conn)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::index::status::IndexStateKind;

    #[test]
    fn open_creates_file_and_app_dir() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let vault = tmp.path().join("v");
        std::fs::create_dir(&vault).expect("mkdir");
        let db = IndexDb::open(&vault).expect("open");
        assert!(db.path().exists(), "index file should exist on disk");
        assert!(db.path().parent().unwrap().ends_with(APP_DIR));
        assert!(db.broken_quarantine().is_none());
    }

    #[test]
    fn open_is_idempotent() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let vault = tmp.path().join("v");
        std::fs::create_dir(&vault).expect("mkdir");
        let db1 = IndexDb::open(&vault).expect("first");
        let path1 = db1.path().to_path_buf();
        drop(db1);
        let db2 = IndexDb::open(&vault).expect("second");
        assert_eq!(db2.path(), path1);
    }

    #[test]
    fn open_quarantines_corrupt_db_and_reopens() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let vault = tmp.path().join("v");
        std::fs::create_dir(&vault).expect("mkdir");
        let app_dir = vault.join(APP_DIR);
        std::fs::create_dir_all(&app_dir).expect("mkdir app");
        let db_file = app_dir.join(DB_FILE);
        std::fs::write(&db_file, b"not a sqlite database at all").expect("write garbage");
        let db = IndexDb::open(&vault).expect("open after corrupt");
        assert!(db.path().exists());
        assert!(db.broken_quarantine().is_some());
        let broken = db.broken_quarantine().unwrap();
        assert!(broken.exists());
        let name = broken.file_name().unwrap().to_str().unwrap();
        assert!(
            name.starts_with("index.db.broken-"),
            "expected broken- prefix, got {name}"
        );
    }

    #[test]
    fn rebuild_deletes_and_reopens_with_fresh_schema() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let vault = tmp.path().join("v");
        std::fs::create_dir(&vault).expect("mkdir");
        let db = IndexDb::open(&vault).expect("open");
        db.conn()
            .execute(
                "INSERT INTO documents (file_path, title) VALUES (?1, ?2)",
                rusqlite::params!["a.md", "a"],
            )
            .expect("insert");
        drop(db);
        let db2 = IndexDb::rebuild(&vault).expect("rebuild");
        let count: i64 = db2
            .conn()
            .query_row("SELECT COUNT(*) FROM documents", [], |r| r.get(0))
            .expect("count");
        assert_eq!(count, 0);
    }

    #[test]
    fn status_reports_count_after_insert() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let vault = tmp.path().join("v");
        std::fs::create_dir(&vault).expect("mkdir");
        let db = IndexDb::open(&vault).expect("open");
        db.conn()
            .execute(
                "INSERT INTO documents (file_path, title) VALUES (?1, ?2)",
                rusqlite::params!["a.md", "a"],
            )
            .expect("insert");
        let status = db.status().expect("status");
        assert_eq!(status.document_count, 1);
        assert_eq!(status.state.state, IndexStateKind::Ready);
    }

    #[test]
    fn pragmas_applied() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let vault = tmp.path().join("v");
        std::fs::create_dir(&vault).expect("mkdir");
        let db = IndexDb::open(&vault).expect("open");
        let journal: String = db
            .conn()
            .query_row("PRAGMA journal_mode", [], |r| r.get(0))
            .expect("journal_mode");
        assert_eq!(journal.to_lowercase(), "wal");
        let fk: i64 = db
            .conn()
            .query_row("PRAGMA foreign_keys", [], |r| r.get(0))
            .expect("foreign_keys");
        assert_eq!(fk, 1);
    }
}
