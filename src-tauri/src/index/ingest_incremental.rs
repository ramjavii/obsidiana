use crate::error::{AppError, AppResult};
use crate::index::ingest::{index_file, relative_posix};
use rusqlite::Connection;
use std::path::Path;

pub fn apply_change(conn: &Connection, root: &Path, file: &Path) -> AppResult<()> {
    let rel = relative_posix(root, file);
    let indexed = index_file(root, file)?;
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| AppError::internal(format!("begin tx: {e}")))?;
    conn.execute(
        "DELETE FROM documents WHERE file_path = ?1",
        rusqlite::params![rel],
    )
    .map_err(|e| AppError::internal(format!("delete document {rel}: {e}")))?;
    conn.execute(
        "INSERT INTO documents (file_path, title, last_modified) VALUES (?1, ?2, ?3)",
        rusqlite::params![
            indexed.document.file_path,
            indexed.document.title,
            indexed.document.last_modified
        ],
    )
    .map_err(|e| AppError::internal(format!("insert document {rel}: {e}")))?;
    let doc_id: i64 = conn
        .query_row(
            "SELECT id FROM documents WHERE file_path = ?1",
            rusqlite::params![rel],
            |r| r.get(0),
        )
        .map_err(|e| AppError::internal(format!("lookup id for {rel}: {e}")))?;
    for c in &indexed.connections {
        conn.execute(
            "INSERT INTO connections (source_id, target_path, kind, block_id) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![doc_id, c.target_path, c.kind, c.block_id],
        )
        .map_err(|e| {
            AppError::internal(format!(
                "insert connection {} -> {}: {e}",
                rel, c.target_path
            ))
        })?;
    }
    for t in &indexed.tags {
        conn.execute(
            "INSERT INTO tags (document_id, tag_name) VALUES (?1, ?2)",
            rusqlite::params![doc_id, t.name],
        )
        .map_err(|e| {
            AppError::internal(format!("insert tag {} #{}: {e}", rel, t.name))
        })?;
    }
    tx.commit()
        .map_err(|e| AppError::internal(format!("commit: {e}")))?;
    Ok(())
}

pub fn apply_deletion(conn: &Connection, rel_path: &str) -> AppResult<()> {
    conn.execute(
        "DELETE FROM documents WHERE file_path = ?1",
        rusqlite::params![rel_path],
    )
    .map_err(|e| AppError::internal(format!("delete {rel_path}: {e}")))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn make_db() -> (tempfile::TempDir, std::path::PathBuf, Connection) {
        let tmp = tempfile::tempdir().expect("tempdir");
        let vault = tmp.path().join("v");
        fs::create_dir(&vault).expect("mkdir");
        let _db = crate::index::db::IndexDb::open(&vault).expect("open");
        // Open a second connection to the same file. WAL mode permits this
        // and lets us assert on the public API (`apply_change(conn, ...)`).
        let conn = Connection::open(vault.join(".obsidiana").join("index.db"))
            .expect("second conn");
        (tmp, vault, conn)
    }

    fn write_note(root: &Path, rel: &str, body: &str) -> std::path::PathBuf {
        let p = root.join(rel);
        if let Some(parent) = p.parent() {
            fs::create_dir_all(parent).expect("mkdir parents");
        }
        fs::write(&p, body).expect("write");
        p
    }

    #[test]
    fn apply_change_inserts_new_document_and_connections() {
        let (_tmp, vault, conn) = make_db();
        let file = write_note(&vault, "intro.md", "# Intro\n\nsee [[other]]\n");
        apply_change(&conn, &vault, &file).expect("apply");
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM documents", [], |r| r.get(0))
            .expect("count docs");
        assert_eq!(count, 1);
        let conn_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM connections", [], |r| r.get(0))
            .expect("count conns");
        assert_eq!(conn_count, 1);
    }

    #[test]
    fn apply_change_replaces_existing_document_atomically() {
        let (_tmp, vault, conn) = make_db();
        let file = write_note(&vault, "a.md", "# Original title\n");
        apply_change(&conn, &vault, &file).expect("first apply");
        // rewrite the file with a different title and re-apply
        fs::write(&file, "# New title\n\nbody [[b]]\n").expect("rewrite");
        apply_change(&conn, &vault, &file).expect("second apply");
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM documents", [], |r| r.get(0))
            .expect("count");
        assert_eq!(count, 1, "should have exactly one document row");
        let title: String = conn
            .query_row(
                "SELECT title FROM documents WHERE file_path = 'a.md'",
                [],
                |r| r.get(0),
            )
            .expect("title");
        assert_eq!(title, "New title");
    }

    #[test]
    fn apply_change_cascades_old_connections() {
        let (_tmp, vault, conn) = make_db();
        let file = write_note(&vault, "src.md", "# s\n\n[[a]] [[b]] [[c]]\n");
        apply_change(&conn, &vault, &file).expect("first");
        let first: i64 = conn
            .query_row("SELECT COUNT(*) FROM connections", [], |r| r.get(0))
            .expect("count");
        assert_eq!(first, 3);
        // rewrite to have one link
        fs::write(&file, "# s\n\n[[only]]\n").expect("rewrite");
        apply_change(&conn, &vault, &file).expect("second");
        let second: i64 = conn
            .query_row("SELECT COUNT(*) FROM connections", [], |r| r.get(0))
            .expect("count");
        assert_eq!(second, 1, "old connections should be gone after cascade");
    }

    #[test]
    fn apply_deletion_removes_document_and_cascades() {
        let (_tmp, vault, conn) = make_db();
        let file = write_note(&vault, "doomed.md", "# d\n\n[[x]]\n#tag1 #tag2\n");
        apply_change(&conn, &vault, &file).expect("apply");
        let before: i64 = conn
            .query_row("SELECT COUNT(*) FROM documents", [], |r| r.get(0))
            .expect("count");
        assert_eq!(before, 1);
        apply_deletion(&conn, "doomed.md").expect("delete");
        let docs: i64 = conn
            .query_row("SELECT COUNT(*) FROM documents", [], |r| r.get(0))
            .expect("count");
        let conns: i64 = conn
            .query_row("SELECT COUNT(*) FROM connections", [], |r| r.get(0))
            .expect("count");
        let tags: i64 = conn
            .query_row("SELECT COUNT(*) FROM tags", [], |r| r.get(0))
            .expect("count");
        assert_eq!(docs, 0);
        assert_eq!(conns, 0, "FK CASCADE should clear connections");
        assert_eq!(tags, 0, "FK CASCADE should clear tags");
    }

    #[test]
    fn apply_change_idempotent_on_no_op_rewrite() {
        let (_tmp, vault, conn) = make_db();
        let body = "# t\n\n#tag1 #tag2\n";
        let file = write_note(&vault, "note.md", body);
        apply_change(&conn, &vault, &file).expect("first");
        let before_tags: i64 = conn
            .query_row("SELECT COUNT(*) FROM tags", [], |r| r.get(0))
            .expect("count");
        let before_conns: i64 = conn
            .query_row("SELECT COUNT(*) FROM connections", [], |r| r.get(0))
            .expect("count");
        // No-op: write identical content, re-apply.
        fs::write(&file, body).expect("rewrite same");
        apply_change(&conn, &vault, &file).expect("second");
        let after_tags: i64 = conn
            .query_row("SELECT COUNT(*) FROM tags", [], |r| r.get(0))
            .expect("count");
        let after_conns: i64 = conn
            .query_row("SELECT COUNT(*) FROM connections", [], |r| r.get(0))
            .expect("count");
        assert_eq!(before_tags, after_tags);
        assert_eq!(before_conns, after_conns);
    }
}
