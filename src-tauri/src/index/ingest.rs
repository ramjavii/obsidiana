use std::path::{Path, PathBuf};

use walkdir::WalkDir;

use crate::error::{AppError, AppResult};
use crate::fs::tree::{is_allowed_note, is_hidden, TreeNodeKind};
use crate::index::extract::{content_hash, extract_title};
use crate::markdown::tag::extract_tags;
use crate::markdown::wikilink::extract_wikilinks;

pub fn scan_vault(root: &Path) -> AppResult<Vec<PathBuf>> {
    if !root.exists() {
        return Err(AppError::not_found(format!(
            "vault root: {}",
            root.display()
        )));
    }
    if !root.is_dir() {
        return Err(AppError::not_found(format!(
            "not a directory: {}",
            root.display()
        )));
    }
    let mut out: Vec<PathBuf> = Vec::new();
    let walker = WalkDir::new(root).follow_links(false).into_iter();
    for entry in walker.filter_entry(|e| {
        if e.depth() == 0 {
            return true;
        }
        let name = e.file_name().to_string_lossy();
        !is_hidden(name.as_ref())
    }) {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        if !entry.file_type().is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if is_hidden(&name) {
            continue;
        }
        if !is_allowed_note(&name, &TreeNodeKind::File) {
            continue;
        }
        out.push(entry.path().to_path_buf());
    }
    out.sort();
    Ok(out)
}

pub fn relative_posix(root: &Path, file: &Path) -> String {
    file.strip_prefix(root)
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|_| file.to_path_buf())
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/")
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentRow {
    pub file_path: String,
    pub title: String,
    pub last_modified: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConnectionRow {
    pub source_path: String,
    pub target_path: String,
    pub kind: String,
    pub block_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TagRow {
    pub path: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndexedFile {
    pub document: DocumentRow,
    pub connections: Vec<ConnectionRow>,
    pub tags: Vec<TagRow>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct IngestReport {
    pub documents_indexed: u64,
    pub connections_extracted: u64,
    pub tags_extracted: u64,
    pub files_skipped: u64,
    pub duration_ms: u64,
}

pub fn ingest_all(
    conn: &rusqlite::Connection,
    root: &Path,
    mut on_progress: impl FnMut(u64, u64),
) -> AppResult<IngestReport> {
    use std::time::Instant;
    let start = Instant::now();
    let files = scan_vault(root)?;
    let total = files.len() as u64;
    let mut report = IngestReport {
        documents_indexed: 0,
        connections_extracted: 0,
        tags_extracted: 0,
        files_skipped: 0,
        duration_ms: 0,
    };

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| AppError::internal(format!("begin transaction: {e}")))?;

    conn.execute("DELETE FROM documents", [])
        .map_err(|e| AppError::internal(format!("truncate documents: {e}")))?;

    for (i, file) in files.iter().enumerate() {
        let indexed = match index_file(root, file) {
            Ok(idx) => idx,
            Err(e) => {
                log::warn!(
                    "ingest: skipping {}: {e}",
                    file.display()
                );
                report.files_skipped += 1;
                on_progress(i as u64, total);
                continue;
            }
        };

        conn.execute(
            "INSERT OR REPLACE INTO documents (file_path, title, last_modified) VALUES (?1, ?2, ?3)",
            rusqlite::params![
                indexed.document.file_path,
                indexed.document.title,
                indexed.document.last_modified
            ],
        )
        .map_err(|e| {
            AppError::internal(format!(
                "insert document {}: {e}",
                indexed.document.file_path
            ))
        })?;
        let doc_id: i64 = conn
            .query_row(
                "SELECT id FROM documents WHERE file_path = ?1",
                rusqlite::params![indexed.document.file_path],
                |r| r.get(0),
            )
            .map_err(|e| {
                AppError::internal(format!(
                    "lookup document id for {}: {e}",
                    indexed.document.file_path
                ))
            })?;

        for c in &indexed.connections {
            conn.execute(
                "INSERT OR IGNORE INTO connections (source_id, target_path, kind, block_id) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![doc_id, c.target_path, c.kind, c.block_id],
            )
            .map_err(|e| {
                AppError::internal(format!(
                    "insert connection {} -> {}: {e}",
                    indexed.document.file_path, c.target_path
                ))
            })?;
        }
        for t in &indexed.tags {
            conn.execute(
                "INSERT OR IGNORE INTO tags (document_id, tag_name) VALUES (?1, ?2)",
                rusqlite::params![doc_id, t.name],
            )
            .map_err(|e| {
                AppError::internal(format!(
                    "insert tag {} #{}: {e}",
                    indexed.document.file_path, t.name
                ))
            })?;
        }

        report.documents_indexed += 1;
        report.connections_extracted += indexed.connections.len() as u64;
        report.tags_extracted += indexed.tags.len() as u64;
        on_progress(report.documents_indexed, total);
    }

    tx.commit()
        .map_err(|e| AppError::internal(format!("commit transaction: {e}")))?;

    report.duration_ms = start.elapsed().as_millis() as u64;
    Ok(report)
}

pub fn index_file(root: &Path, file: &Path) -> AppResult<IndexedFile> {
    let meta = std::fs::metadata(file)
        .map_err(|e| AppError::from_io(file.display().to_string(), &e))?;
    let content = std::fs::read_to_string(file)
        .map_err(|e| AppError::from_io(file.display().to_string(), &e))?;
    let rel = relative_posix(root, file);
    let fallback_title = file
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(&rel)
        .to_string();
    let title = extract_title(&content, &fallback_title);
    let last_modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let _ = content_hash(&content);

    let mut connections: Vec<ConnectionRow> = Vec::new();
    for wl in extract_wikilinks(&content) {
        connections.push(ConnectionRow {
            source_path: rel.clone(),
            target_path: wl.target,
            kind: "wikilink".to_string(),
            block_id: None,
        });
    }

    let tags: Vec<TagRow> = extract_tags(&content)
        .into_iter()
        .map(|t| TagRow {
            path: rel.clone(),
            name: t.name,
        })
        .collect();

    Ok(IndexedFile {
        document: DocumentRow {
            file_path: rel,
            title,
            last_modified,
        },
        connections,
        tags,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn make_vault() -> tempfile::TempDir {
        tempfile::tempdir().expect("tempdir")
    }

    fn write(root: &Path, rel: &str, content: &str) {
        let p = root.join(rel);
        if let Some(parent) = p.parent() {
            fs::create_dir_all(parent).expect("mkdir parents");
        }
        fs::write(&p, content).expect("write");
    }

    #[test]
    fn relative_posix_converts_backslashes_and_strips_prefix() {
        let root = Path::new("/tmp/vault");
        let file = Path::new("/tmp/vault/notes/idea.md");
        assert_eq!(relative_posix(root, file), "notes/idea.md");
    }

    #[test]
    fn relative_posix_handles_root_level_file() {
        let root = Path::new("/tmp/vault");
        let file = Path::new("/tmp/vault/todo.md");
        assert_eq!(relative_posix(root, file), "todo.md");
    }

    #[test]
    fn scan_vault_finds_markdown_files_recursively() {
        let tmp = make_vault();
        write(tmp.path(), "todo.md", "# todo");
        write(tmp.path(), "notes/idea.md", "# idea");
        write(tmp.path(), "notes/work/note.md", "# note");
        let files = scan_vault(tmp.path()).expect("scan");
        let rels: Vec<String> = files
            .iter()
            .map(|p| relative_posix(tmp.path(), p))
            .collect();
        assert_eq!(rels, vec!["notes/idea.md", "notes/work/note.md", "todo.md"]);
    }

    #[test]
    fn scan_vault_ignores_dotfiles_and_dotdirs() {
        let tmp = make_vault();
        write(tmp.path(), "visible.md", "# v");
        write(tmp.path(), ".hidden.md", "# h");
        write(tmp.path(), ".obsidian/config.json", "{}");
        write(tmp.path(), ".trash/old.md", "# old");
        write(tmp.path(), "notes/.secret.md", "# s");
        let files = scan_vault(tmp.path()).expect("scan");
        let rels: Vec<String> = files
            .iter()
            .map(|p| relative_posix(tmp.path(), p))
            .collect();
        assert_eq!(rels, vec!["visible.md"]);
    }

    #[test]
    fn scan_vault_ignores_non_markdown_files() {
        let tmp = make_vault();
        write(tmp.path(), "todo.md", "# t");
        write(tmp.path(), "image.png", "binary");
        write(tmp.path(), "doc.pdf", "binary");
        write(tmp.path(), "notes/photo.jpg", "binary");
        let files = scan_vault(tmp.path()).expect("scan");
        let rels: Vec<String> = files
            .iter()
            .map(|p| relative_posix(tmp.path(), p))
            .collect();
        assert_eq!(rels, vec!["todo.md"]);
    }

    #[test]
    fn scan_vault_accepts_markdown_extension() {
        let tmp = make_vault();
        write(tmp.path(), "readme.markdown", "# r");
        let files = scan_vault(tmp.path()).expect("scan");
        assert_eq!(files.len(), 1);
    }

    #[test]
    fn scan_vault_extension_match_is_case_insensitive() {
        let tmp = make_vault();
        write(tmp.path(), "TODO.MD", "# t");
        write(tmp.path(), "Note.Md", "# n");
        let files = scan_vault(tmp.path()).expect("scan");
        assert_eq!(files.len(), 2);
    }

    #[test]
    fn scan_vault_empty_dir_returns_empty() {
        let tmp = make_vault();
        let files = scan_vault(tmp.path()).expect("scan");
        assert!(files.is_empty());
    }

    #[test]
    fn scan_vault_missing_root_returns_not_found() {
        let tmp = make_vault();
        let missing = tmp.path().join("nope");
        let err = scan_vault(&missing).expect_err("should error");
        assert!(matches!(err, AppError::NotFound { .. }));
    }

    #[test]
    fn scan_vault_root_is_file_returns_not_found() {
        let tmp = make_vault();
        let file = tmp.path().join("solo.md");
        fs::write(&file, "# x").expect("write");
        let err = scan_vault(&file).expect_err("should error");
        assert!(matches!(err, AppError::NotFound { .. }));
    }

    #[test]
    fn index_file_returns_document_row_with_title() {
        let tmp = make_vault();
        write(tmp.path(), "idea.md", "# My idea\n\nbody [[other]]\n");
        let file = tmp.path().join("idea.md");
        let indexed = index_file(tmp.path(), &file).expect("index");
        assert_eq!(indexed.document.file_path, "idea.md");
        assert_eq!(indexed.document.title, "My idea");
    }

    #[test]
    fn index_file_uses_filename_stem_fallback_when_no_h1() {
        let tmp = make_vault();
        write(tmp.path(), "plain.md", "no heading here\n");
        let file = tmp.path().join("plain.md");
        let indexed = index_file(tmp.path(), &file).expect("index");
        assert_eq!(indexed.document.title, "plain");
    }

    #[test]
    fn index_file_extracts_wikilink_connections() {
        let tmp = make_vault();
        write(
            tmp.path(),
            "src.md",
            "# s\n\nsee [[other]] and [[third|alias]]\n",
        );
        let file = tmp.path().join("src.md");
        let indexed = index_file(tmp.path(), &file).expect("index");
        assert_eq!(indexed.connections.len(), 2);
        let targets: Vec<&str> = indexed
            .connections
            .iter()
            .map(|c| c.target_path.as_str())
            .collect();
        assert!(targets.contains(&"other"));
        assert!(targets.contains(&"third"));
        for c in &indexed.connections {
            assert_eq!(c.kind, "wikilink");
            assert!(c.block_id.is_none());
            assert_eq!(c.source_path, "src.md");
        }
    }

    #[test]
    fn index_file_extracts_tags() {
        let tmp = make_vault();
        write(
            tmp.path(),
            "tagged.md",
            "# t\n\n#idea #project/2-8\n\nmore text #idea\n",
        );
        let file = tmp.path().join("tagged.md");
        let indexed = index_file(tmp.path(), &file).expect("index");
        let names: Vec<&str> = indexed.tags.iter().map(|t| t.name.as_str()).collect();
        assert!(names.contains(&"idea"));
        assert!(names.contains(&"project/2-8"));
        for t in &indexed.tags {
            assert_eq!(t.path, "tagged.md");
        }
    }

    #[test]
    fn index_file_omits_connections_when_no_wikilinks() {
        let tmp = make_vault();
        write(tmp.path(), "lonely.md", "# l\n\nno links here\n");
        let file = tmp.path().join("lonely.md");
        let indexed = index_file(tmp.path(), &file).expect("index");
        assert!(indexed.connections.is_empty());
    }
}
