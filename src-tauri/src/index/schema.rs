use crate::error::AppResult;
use rusqlite::Connection;

pub const INDEX_SCHEMA_VER: u32 = 1;

pub const SCHEMA_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS documents (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path         TEXT    UNIQUE NOT NULL,
    title             TEXT    NOT NULL,
    last_modified     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    frontmatter_json  TEXT    NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_title ON documents(title);
CREATE INDEX IF NOT EXISTS idx_documents_path  ON documents(file_path);

CREATE TABLE IF NOT EXISTS connections (
    source_id          INTEGER NOT NULL,
    target_path        TEXT    NOT NULL,
    resolved_target_id INTEGER NULL,
    kind               TEXT    NOT NULL,
    block_id           TEXT    NULL,
    PRIMARY KEY (source_id, target_path, block_id),
    FOREIGN KEY (source_id)          REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (resolved_target_id) REFERENCES documents(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_connections_target ON connections(resolved_target_id);

CREATE TABLE IF NOT EXISTS tags (
    document_id  INTEGER NOT NULL,
    tag_name     TEXT    NOT NULL,
    PRIMARY KEY (document_id, tag_name),
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(tag_name);

CREATE TABLE IF NOT EXISTS vault_meta (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    schema_ver  INTEGER NOT NULL,
    opened_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"#;

pub fn run_migrations(conn: &Connection) -> AppResult<()> {
    let current: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    let current_u32 = u32::try_from(current).map_err(|_| {
        crate::error::AppError::internal(format!(
            "user_version {current} is negative or out of u32 range"
        ))
    })?;
    if current_u32 == INDEX_SCHEMA_VER {
        return Ok(());
    }
    if current_u32 > INDEX_SCHEMA_VER {
        return Err(crate::error::AppError::internal(format!(
            "index schema_ver {current_u32} is newer than this build supports ({INDEX_SCHEMA_VER})"
        )));
    }
    conn.execute_batch(SCHEMA_SQL)?;
    conn.execute_batch(&format!("PRAGMA user_version = {INDEX_SCHEMA_VER};"))?;
    conn.execute(
        "INSERT OR IGNORE INTO vault_meta (id, schema_ver) VALUES (1, ?1)",
        rusqlite::params![INDEX_SCHEMA_VER],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn open_memory() -> Connection {
        Connection::open_in_memory().expect("open in-memory db")
    }

    #[test]
    fn migrations_create_all_tables_on_fresh_db() {
        let conn = open_memory();
        run_migrations(&conn).expect("migrations");
        let names: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','index') ORDER BY name")
            .expect("prepare")
            .query_map([], |r| r.get::<_, String>(0))
            .expect("map")
            .filter_map(Result::ok)
            .collect();
        for required in [
            "documents",
            "connections",
            "tags",
            "vault_meta",
            "idx_documents_title",
            "idx_documents_path",
            "idx_connections_target",
            "idx_tags_name",
        ] {
            assert!(
                names.iter().any(|n| n == required),
                "missing {required}; have {names:?}"
            );
        }
    }

    #[test]
    fn migrations_are_idempotent() {
        let conn = open_memory();
        run_migrations(&conn).expect("first");
        run_migrations(&conn).expect("second");
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .expect("user_version");
        assert_eq!(version, INDEX_SCHEMA_VER as i64);
    }

    #[test]
    fn migrations_advance_user_version() {
        let conn = open_memory();
        run_migrations(&conn).expect("migrations");
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .expect("user_version");
        assert_eq!(version, INDEX_SCHEMA_VER as i64);
    }

    #[test]
    fn migrations_reject_newer_schema() {
        let conn = open_memory();
        conn.execute_batch(&format!("PRAGMA user_version = {};", INDEX_SCHEMA_VER + 1))
            .expect("set");
        let err = run_migrations(&conn).expect_err("should reject");
        assert!(matches!(err, crate::error::AppError::Internal { .. }));
    }

    #[test]
    fn migrations_ensure_vault_meta_singleton_row() {
        let conn = open_memory();
        run_migrations(&conn).expect("migrations");
        let (id, schema_ver): (i64, i64) = conn
            .query_row("SELECT id, schema_ver FROM vault_meta", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .expect("vault_meta row");
        assert_eq!(id, 1);
        assert_eq!(schema_ver, INDEX_SCHEMA_VER as i64);
    }
}
