use obsidiana_lib::index::db::IndexDb;
use obsidiana_lib::index::ingest::ingest_all;
use std::fs;
use std::path::Path;

fn write_note(root: &Path, rel: &str, body: &str) {
    let path = root.join(rel);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("mkdir");
    }
    fs::write(&path, body).expect("write note");
}

#[test]
fn ingest_all_on_empty_vault_writes_zero_documents() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("v");
    fs::create_dir(&vault).expect("mkdir");
    let db = IndexDb::open(&vault).expect("open");
    let mut progress_calls = 0u64;
    let report = ingest_all(db.conn(), &vault, |_, _| progress_calls += 1).expect("ingest");
    assert_eq!(report.documents_indexed, 0);
    assert_eq!(report.connections_extracted, 0);
    assert_eq!(report.tags_extracted, 0);
    assert_eq!(report.files_skipped, 0);
    let count: i64 = db
        .conn()
        .query_row("SELECT COUNT(*) FROM documents", [], |r| r.get(0))
        .expect("count");
    assert_eq!(count, 0);
}

#[test]
fn ingest_all_indexes_three_notes_with_wikilinks_and_tags() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("v");
    fs::create_dir(&vault).expect("mkdir");
    write_note(
        &vault,
        "intro.md",
        "# Introduction\n\nSee [[chapter-one]] and [[chapter-two]] for context.\n",
    );
    write_note(
        &vault,
        "chapter-one.md",
        "# Chapter One\n\nBack to [[intro]] and forward to [[chapter-two#Section]].\n\n#draft #philosophy\n",
    );
    write_note(
        &vault,
        "chapter-two.md",
        "---\ntitle: Custom\n---\n\n# Chapter Two\n\nTags: #essay #philosophy\n",
    );
    let db = IndexDb::open(&vault).expect("open");
    let report = ingest_all(db.conn(), &vault, |_, _| {}).expect("ingest");
    assert_eq!(report.documents_indexed, 3);
    assert!(
        report.connections_extracted >= 4,
        "expected >=4 wikilink connections, got {}",
        report.connections_extracted
    );
    assert!(
        report.tags_extracted >= 3,
        "expected >=3 unique tag rows, got {}",
        report.tags_extracted
    );
    assert_eq!(report.files_skipped, 0);

    let doc_count: i64 = db
        .conn()
        .query_row("SELECT COUNT(*) FROM documents", [], |r| r.get(0))
        .expect("count");
    assert_eq!(doc_count, 3);

    let title: String = db
        .conn()
        .query_row(
            "SELECT title FROM documents WHERE file_path = ?1",
            rusqlite::params!["intro.md"],
            |r| r.get(0),
        )
        .expect("title intro");
    assert_eq!(title, "Introduction");

    let title_custom: String = db
        .conn()
        .query_row(
            "SELECT title FROM documents WHERE file_path = ?1",
            rusqlite::params!["chapter-two.md"],
            |r| r.get(0),
        )
        .expect("title chapter two");
    assert_eq!(title_custom, "Chapter Two");

    let conn_count: i64 = db
        .conn()
        .query_row("SELECT COUNT(*) FROM connections", [], |r| r.get(0))
        .expect("conn count");
    assert_eq!(conn_count as u64, report.connections_extracted);

    let tag_rows: i64 = db
        .conn()
        .query_row("SELECT COUNT(*) FROM tags", [], |r| r.get(0))
        .expect("tag count");
    assert_eq!(tag_rows as u64, report.tags_extracted);
}

#[test]
fn ingest_all_is_idempotent_under_repeat_runs() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("v");
    fs::create_dir(&vault).expect("mkdir");
    write_note(&vault, "a.md", "# A\n\nLink to [[b]].\n");
    write_note(&vault, "b.md", "# B\n\nLink to [[a]].\n");
    let db = IndexDb::open(&vault).expect("open");
    let first = ingest_all(db.conn(), &vault, |_, _| {}).expect("first");
    let second = ingest_all(db.conn(), &vault, |_, _| {}).expect("second");
    assert_eq!(first.documents_indexed, second.documents_indexed);
    assert_eq!(first.connections_extracted, second.connections_extracted);
    assert_eq!(first.tags_extracted, second.tags_extracted);
    let count: i64 = db
        .conn()
        .query_row("SELECT COUNT(*) FROM documents", [], |r| r.get(0))
        .expect("count");
    assert_eq!(count, 2);
    let conn_count: i64 = db
        .conn()
        .query_row("SELECT COUNT(*) FROM connections", [], |r| r.get(0))
        .expect("conn count");
    assert_eq!(conn_count as u64, second.connections_extracted);
}

#[test]
fn ingest_all_drops_documents_for_files_removed_between_runs() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("v");
    fs::create_dir(&vault).expect("mkdir");
    write_note(&vault, "kept.md", "# Kept\n");
    write_note(&vault, "doomed.md", "# Doomed\n");
    let db = IndexDb::open(&vault).expect("open");
    let first = ingest_all(db.conn(), &vault, |_, _| {}).expect("first");
    assert_eq!(first.documents_indexed, 2);
    fs::remove_file(vault.join("doomed.md")).expect("remove doomed");
    let second = ingest_all(db.conn(), &vault, |_, _| {}).expect("second");
    assert_eq!(second.documents_indexed, 1);
    let count: i64 = db
        .conn()
        .query_row("SELECT COUNT(*) FROM documents", [], |r| r.get(0))
        .expect("count");
    assert_eq!(count, 1);
    let surviving: String = db
        .conn()
        .query_row("SELECT file_path FROM documents", [], |r| r.get(0))
        .expect("survivor");
    assert_eq!(surviving, "kept.md");
}

#[test]
fn ingest_all_skips_unreadable_files_and_continues() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("v");
    fs::create_dir(&vault).expect("mkdir");
    write_note(&vault, "ok.md", "# OK\n");
    let bad = vault.join("bad.md");
    fs::write(&bad, [0xFF, 0xFE, 0xFD, 0x00, 0x01]).expect("write bad");
    let db = IndexDb::open(&vault).expect("open");
    let report = ingest_all(db.conn(), &vault, |_, _| {}).expect("ingest");
    assert_eq!(report.documents_indexed, 1);
    assert_eq!(report.files_skipped, 1);
    let count: i64 = db
        .conn()
        .query_row("SELECT COUNT(*) FROM documents", [], |r| r.get(0))
        .expect("count");
    assert_eq!(count, 1);
}

#[test]
fn ingest_all_progress_callback_fires_for_each_file() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("v");
    fs::create_dir(&vault).expect("mkdir");
    write_note(&vault, "a.md", "# A\n");
    write_note(&vault, "b.md", "# B\n");
    write_note(&vault, "c.md", "# C\n");
    let db = IndexDb::open(&vault).expect("open");
    let mut progress: Vec<(u64, u64)> = Vec::new();
    let _ = ingest_all(db.conn(), &vault, |indexed, total| {
        progress.push((indexed, total));
    })
    .expect("ingest");
    assert_eq!(progress.len(), 3);
    assert_eq!(progress[0], (1, 3));
    assert_eq!(progress[1], (2, 3));
    assert_eq!(progress[2], (3, 3));
    assert!(
        progress.iter().all(|(_, t)| *t == 3),
        "total must remain stable across callbacks"
    );
}
