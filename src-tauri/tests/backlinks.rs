use obsidiana_lib::index::db::IndexDb;
use obsidiana_lib::index::ingest::ingest_all;
use rusqlite::Connection;
use std::fs;
use std::path::Path;

fn write_note(root: &Path, rel: &str, body: &str) {
    let path = root.join(rel);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("mkdir");
    }
    fs::write(&path, body).expect("write note");
}

fn query_backlinks(conn: &Connection, target_path: &str) -> Vec<(String, String, String, Option<String>)> {
    let mut stmt = conn
        .prepare(
            "SELECT d.file_path, d.title, c.kind, c.block_id
             FROM connections c
             JOIN documents d ON d.id = c.source_id
             WHERE c.target_path = ?1",
        )
        .expect("prepare");
    stmt.query_map(rusqlite::params![target_path], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<String>>(3)?,
        ))
    })
    .expect("query_map")
    .filter_map(|r| r.ok())
    .collect()
}

#[test]
fn backlinks_returns_sources_that_link_to_target() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("v");
    fs::create_dir(&vault).expect("mkdir");

    write_note(&vault, "alpha.md", "# Alpha\nLink to [[beta]].\n");
    write_note(&vault, "beta.md", "# Beta\nLink to [[gamma]].\n");
    write_note(&vault, "gamma.md", "# Gamma\nNo links.\n");

    let db = IndexDb::open(&vault).expect("open");
    ingest_all(db.conn(), &vault, |_, _| {}).expect("ingest");

    let backlinks_to_beta = query_backlinks(db.conn(), "beta");
    assert_eq!(backlinks_to_beta.len(), 1);
    assert_eq!(backlinks_to_beta[0].0, "alpha.md");
    assert_eq!(backlinks_to_beta[0].1, "Alpha");
    assert_eq!(backlinks_to_beta[0].2, "wikilink");

    let backlinks_to_gamma = query_backlinks(db.conn(), "gamma");
    assert_eq!(backlinks_to_gamma.len(), 1);
    assert_eq!(backlinks_to_gamma[0].0, "beta.md");
    assert_eq!(backlinks_to_gamma[0].1, "Beta");

    let backlinks_to_alpha = query_backlinks(db.conn(), "alpha");
    assert_eq!(backlinks_to_alpha.len(), 0, "no note links to alpha");
}

#[test]
fn backlinks_returns_multiple_sources_for_shared_target() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("v");
    fs::create_dir(&vault).expect("mkdir");

    write_note(&vault, "a.md", "# A\nLink to [[shared]].\n");
    write_note(&vault, "b.md", "# B\nLink to [[shared]] too.\n");
    write_note(&vault, "shared.md", "# Shared\n");

    let db = IndexDb::open(&vault).expect("open");
    ingest_all(db.conn(), &vault, |_, _| {}).expect("ingest");

    let backlinks = query_backlinks(db.conn(), "shared");
    assert_eq!(backlinks.len(), 2);
    let sources: Vec<&str> = backlinks.iter().map(|r| r.0.as_str()).collect();
    assert!(sources.contains(&"a.md"));
    assert!(sources.contains(&"b.md"));
}

#[test]
fn backlinks_returns_empty_when_no_links_exist_to_target() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("v");
    fs::create_dir(&vault).expect("mkdir");

    write_note(&vault, "lonely.md", "# Lonely\n");

    let db = IndexDb::open(&vault).expect("open");
    ingest_all(db.conn(), &vault, |_, _| {}).expect("ingest");

    let backlinks = query_backlinks(db.conn(), "lonely");
    assert!(backlinks.is_empty());
}

#[test]
fn backlinks_returns_empty_for_unknown_path() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("v");
    fs::create_dir(&vault).expect("mkdir");

    write_note(&vault, "a.md", "# A\nLink to [[known]].\n");
    write_note(&vault, "known.md", "# Known\n");

    let db = IndexDb::open(&vault).expect("open");
    ingest_all(db.conn(), &vault, |_, _| {}).expect("ingest");

    let backlinks = query_backlinks(db.conn(), "nonexistent.md");
    assert!(backlinks.is_empty());
}
