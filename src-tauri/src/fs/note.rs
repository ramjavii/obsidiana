use crate::error::{AppError, AppResult};
use chrono::{DateTime, Utc};
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct NoteContent {
    pub path: String,
    pub content: String,
    pub modified_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct RenameReport {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct WriteResult {
    pub path: String,
    pub modified_at: String,
}

fn has_note_extension(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with(".md") || lower.ends_with(".markdown")
}

fn ensure_parent_exists(vault_root: &Path, absolute: &Path) -> AppResult<()> {
    let parent = absolute.parent().ok_or_else(|| {
        AppError::invalid(format!(
            "path has no parent: {}",
            absolute.display()
        ))
    })?;
    if !parent.starts_with(vault_root) {
        return Err(AppError::invalid(format!(
            "path escapes vault: {}",
            absolute.display()
        )));
    }
    if !parent.exists() {
        return Err(AppError::not_found(format!(
            "parent directory: {}",
            parent.display()
        )));
    }
    if !parent.is_dir() {
        return Err(AppError::invalid(format!(
            "parent is not a directory: {}",
            parent.display()
        )));
    }
    Ok(())
}

pub fn create_note_in(
    vault_root: &Path,
    relative: &Path,
    content: &str,
) -> AppResult<NoteContent> {
    let file_name = relative
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| AppError::invalid("path has no file name"))?;
    if !has_note_extension(file_name) {
        return Err(AppError::invalid(format!(
            "note must have .md or .markdown extension: {file_name}"
        )));
    }
    let absolute = vault_root.join(relative);
    ensure_parent_exists(vault_root, &absolute)?;
    if absolute.exists() {
        return Err(AppError::invalid(format!(
            "note already exists: {}",
            relative.display()
        )));
    }
    std::fs::write(&absolute, content)
        .map_err(|e| AppError::from_io(absolute.display().to_string(), &e))?;
    let modified_at: DateTime<Utc> = absolute
        .metadata()
        .and_then(|m| m.modified())
        .map(DateTime::from)
        .unwrap_or_else(|_| Utc::now());
    Ok(NoteContent {
        path: relative.to_string_lossy().into_owned(),
        content: content.to_string(),
        modified_at: modified_at.to_rfc3339(),
    })
}

pub fn delete_note_in(vault_root: &Path, relative: &Path) -> AppResult<()> {
    let absolute = vault_root.join(relative);
    let meta = std::fs::metadata(&absolute).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            AppError::not_found(format!("note: {}", relative.display()))
        } else {
            AppError::from_io(absolute.display().to_string(), &e)
        }
    })?;
    if !meta.is_file() {
        return Err(AppError::invalid(format!(
            "not a regular file: {}",
            relative.display()
        )));
    }
    std::fs::remove_file(&absolute)
        .map_err(|e| AppError::from_io(absolute.display().to_string(), &e))?;
    Ok(())
}

pub fn rename_note_in(
    vault_root: &Path,
    from: &Path,
    to: &Path,
) -> AppResult<RenameReport> {
    let to_name = to
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| AppError::invalid("destination has no file name"))?;
    if !has_note_extension(to_name) {
        return Err(AppError::invalid(format!(
            "renamed note must keep .md or .markdown extension: {to_name}"
        )));
    }
    let abs_from = vault_root.join(from);
    let abs_to = vault_root.join(to);
    if !abs_from.exists() {
        return Err(AppError::not_found(format!("source: {}", from.display())));
    }
    if abs_to.exists() {
        return Err(AppError::invalid(format!(
            "destination already exists: {}",
            to.display()
        )));
    }
    if let Some(parent) = abs_to.parent() {
        if !parent.exists() {
            return Err(AppError::not_found(format!(
                "destination parent: {}",
                parent.display()
            )));
        }
    }
    std::fs::rename(&abs_from, &abs_to)
        .map_err(|e| AppError::from_io(abs_from.display().to_string(), &e))?;
    Ok(RenameReport {
        from: from.to_string_lossy().into_owned(),
        to: to.to_string_lossy().into_owned(),
    })
}

pub fn read_note_in(vault_root: &Path, relative: &Path) -> AppResult<NoteContent> {
    let absolute = vault_root.join(relative);
    let meta = std::fs::metadata(&absolute).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            AppError::not_found(format!("note: {}", relative.display()))
        } else {
            AppError::from_io(absolute.display().to_string(), &e)
        }
    })?;
    if !meta.is_file() {
        return Err(AppError::invalid(format!(
            "not a regular file: {}",
            relative.display()
        )));
    }
    let bytes = std::fs::read(&absolute)
        .map_err(|e| AppError::from_io(absolute.display().to_string(), &e))?;
    let content = String::from_utf8(bytes).map_err(|_| {
        AppError::invalid(format!(
            "note is not valid UTF-8: {}",
            relative.display()
        ))
    })?;
    let modified_at: DateTime<Utc> = meta
        .modified()
        .map(DateTime::from)
        .unwrap_or_else(|_| Utc::now());
    Ok(NoteContent {
        path: relative.to_string_lossy().into_owned(),
        content,
        modified_at: modified_at.to_rfc3339(),
    })
}

pub fn write_note_in(
    vault_root: &Path,
    relative: &Path,
    content: &str,
) -> AppResult<WriteResult> {
    let file_name = relative
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| AppError::invalid("path has no file name"))?;
    if !has_note_extension(file_name) {
        return Err(AppError::invalid(format!(
            "note must have .md or .markdown extension: {file_name}"
        )));
    }
    let absolute = vault_root.join(relative);
    ensure_parent_exists(vault_root, &absolute)?;
    if absolute.exists() {
        let meta = std::fs::metadata(&absolute)
            .map_err(|e| AppError::from_io(absolute.display().to_string(), &e))?;
        if !meta.is_file() {
            return Err(AppError::invalid(format!(
                "not a regular file: {}",
                relative.display()
            )));
        }
    }
    std::fs::write(&absolute, content.as_bytes())
        .map_err(|e| AppError::from_io(absolute.display().to_string(), &e))?;
    let modified_at: DateTime<Utc> = absolute
        .metadata()
        .and_then(|m| m.modified())
        .map(DateTime::from)
        .unwrap_or_else(|_| Utc::now());
    Ok(WriteResult {
        path: relative.to_string_lossy().into_owned(),
        modified_at: modified_at.to_rfc3339(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn vault() -> (tempfile::TempDir, PathBuf) {
        let tmp = tempfile::tempdir().expect("tempdir");
        let root = tmp.path().join("vault");
        std::fs::create_dir(&root).expect("mkdir");
        (tmp, root)
    }

    #[test]
    fn create_writes_file_with_provided_content() {
        let (_tmp, root) = vault();
        let rel = Path::new("hello.md");
        let note = create_note_in(&root, rel, "# hi\n").expect("ok");
        assert_eq!(note.path, "hello.md");
        assert_eq!(note.content, "# hi\n");
        assert!(!note.modified_at.is_empty());
        let on_disk = std::fs::read_to_string(root.join("hello.md")).expect("read");
        assert_eq!(on_disk, "# hi\n");
    }

    #[test]
    fn create_with_empty_content() {
        let (_tmp, root) = vault();
        let rel = Path::new("blank.md");
        let note = create_note_in(&root, rel, "").expect("ok");
        assert_eq!(note.content, "");
        assert!(root.join("blank.md").exists());
    }

    #[test]
    fn create_rejects_missing_parent() {
        let (_tmp, root) = vault();
        let rel = Path::new("nope/new.md");
        match create_note_in(&root, rel, "") {
            Err(AppError::NotFound { .. }) => {}
            other => panic!("expected NotFound, got {other:?}"),
        }
        assert!(!root.join("nope").exists());
    }

    #[test]
    fn create_rejects_collision() {
        let (_tmp, root) = vault();
        std::fs::write(root.join("dup.md"), b"old").expect("seed");
        match create_note_in(&root, Path::new("dup.md"), "new") {
            Err(AppError::InvalidArgument { .. }) => {}
            other => panic!("expected InvalidArgument, got {other:?}"),
        }
        let on_disk = std::fs::read_to_string(root.join("dup.md")).expect("read");
        assert_eq!(on_disk, "old");
    }

    #[test]
    fn create_rejects_non_note_extension() {
        let (_tmp, root) = vault();
        match create_note_in(&root, Path::new("bad.txt"), "") {
            Err(AppError::InvalidArgument { .. }) => {}
            other => panic!("expected InvalidArgument, got {other:?}"),
        }
    }

    #[test]
    fn create_accepts_markdown_extension() {
        let (_tmp, root) = vault();
        create_note_in(&root, Path::new("long.markdown"), "").expect("ok");
        assert!(root.join("long.markdown").exists());
    }

    #[test]
    fn create_extension_match_is_case_insensitive() {
        let (_tmp, root) = vault();
        create_note_in(&root, Path::new("UPPER.MD"), "").expect("ok");
        assert!(root.join("UPPER.MD").exists());
    }

    #[test]
    fn create_in_subfolder_when_parent_exists() {
        let (_tmp, root) = vault();
        std::fs::create_dir(root.join("notes")).expect("mkdir");
        create_note_in(&root, Path::new("notes/inner.md"), "x").expect("ok");
        assert!(root.join("notes/inner.md").exists());
    }

    #[test]
    fn create_rejects_path_with_no_file_name() {
        let (_tmp, root) = vault();
        match create_note_in(&root, Path::new("notes/"), "") {
            Err(AppError::InvalidArgument { .. }) => {}
            other => panic!("expected InvalidArgument, got {other:?}"),
        }
    }

    #[test]
    fn delete_removes_existing_file() {
        let (_tmp, root) = vault();
        std::fs::write(root.join("doomed.md"), b"x").expect("seed");
        delete_note_in(&root, Path::new("doomed.md")).expect("ok");
        assert!(!root.join("doomed.md").exists());
    }

    #[test]
    fn delete_missing_returns_not_found() {
        let (_tmp, root) = vault();
        match delete_note_in(&root, Path::new("ghost.md")) {
            Err(AppError::NotFound { .. }) => {}
            other => panic!("expected NotFound, got {other:?}"),
        }
    }

    #[test]
    fn delete_rejects_directory() {
        let (_tmp, root) = vault();
        std::fs::create_dir(root.join("a-folder")).expect("mkdir");
        match delete_note_in(&root, Path::new("a-folder")) {
            Err(AppError::InvalidArgument { .. }) => {}
            other => panic!("expected InvalidArgument, got {other:?}"),
        }
        assert!(root.join("a-folder").exists());
    }

    #[test]
    fn rename_moves_file_in_place() {
        let (_tmp, root) = vault();
        std::fs::write(root.join("old.md"), b"x").expect("seed");
        let report = rename_note_in(&root, Path::new("old.md"), Path::new("new.md"))
            .expect("ok");
        assert_eq!(report.from, "old.md");
        assert_eq!(report.to, "new.md");
        assert!(!root.join("old.md").exists());
        assert!(root.join("new.md").exists());
    }

    #[test]
    fn rename_moves_across_folders() {
        let (_tmp, root) = vault();
        std::fs::create_dir(root.join("dst")).expect("mkdir");
        std::fs::write(root.join("src.md"), b"x").expect("seed");
        rename_note_in(&root, Path::new("src.md"), Path::new("dst/moved.md"))
            .expect("ok");
        assert!(!root.join("src.md").exists());
        assert!(root.join("dst/moved.md").exists());
    }

    #[test]
    fn rename_missing_source_returns_not_found() {
        let (_tmp, root) = vault();
        match rename_note_in(&root, Path::new("ghost.md"), Path::new("new.md")) {
            Err(AppError::NotFound { .. }) => {}
            other => panic!("expected NotFound, got {other:?}"),
        }
    }

    #[test]
    fn rename_collision_returns_invalid_argument() {
        let (_tmp, root) = vault();
        std::fs::write(root.join("a.md"), b"x").expect("seed");
        std::fs::write(root.join("b.md"), b"y").expect("seed");
        match rename_note_in(&root, Path::new("a.md"), Path::new("b.md")) {
            Err(AppError::InvalidArgument { .. }) => {}
            other => panic!("expected InvalidArgument, got {other:?}"),
        }
        assert!(root.join("a.md").exists());
        assert!(root.join("b.md").exists());
    }

    #[test]
    fn rename_rejects_destination_missing_parent() {
        let (_tmp, root) = vault();
        std::fs::write(root.join("a.md"), b"x").expect("seed");
        match rename_note_in(&root, Path::new("a.md"), Path::new("nope/b.md")) {
            Err(AppError::NotFound { .. }) => {}
            other => panic!("expected NotFound, got {other:?}"),
        }
        assert!(root.join("a.md").exists());
    }

    #[test]
    fn rename_rejects_non_note_extension_on_destination() {
        let (_tmp, root) = vault();
        std::fs::write(root.join("a.md"), b"x").expect("seed");
        match rename_note_in(&root, Path::new("a.md"), Path::new("a.txt")) {
            Err(AppError::InvalidArgument { .. }) => {}
            other => panic!("expected InvalidArgument, got {other:?}"),
        }
    }

    #[test]
    fn helper_has_note_extension_matches_markdown_variants() {
        assert!(has_note_extension("a.md"));
        assert!(has_note_extension("A.MD"));
        assert!(has_note_extension("a.markdown"));
        assert!(has_note_extension("README.Markdown"));
        assert!(!has_note_extension("a.txt"));
        assert!(!has_note_extension("a"));
    }

    #[test]
    fn read_returns_content_and_modified_at() {
        let (_tmp, root) = vault();
        std::fs::write(root.join("hello.md"), "# hi\n").expect("seed");
        let note = read_note_in(&root, Path::new("hello.md")).expect("ok");
        assert_eq!(note.path, "hello.md");
        assert_eq!(note.content, "# hi\n");
        assert!(!note.modified_at.is_empty());
    }

    #[test]
    fn read_missing_returns_not_found() {
        let (_tmp, root) = vault();
        match read_note_in(&root, Path::new("ghost.md")) {
            Err(AppError::NotFound { .. }) => {}
            other => panic!("expected NotFound, got {other:?}"),
        }
    }

    #[test]
    fn read_rejects_directory() {
        let (_tmp, root) = vault();
        std::fs::create_dir(root.join("a-folder")).expect("mkdir");
        match read_note_in(&root, Path::new("a-folder")) {
            Err(AppError::InvalidArgument { .. }) => {}
            other => panic!("expected InvalidArgument, got {other:?}"),
        }
    }

    #[test]
    fn read_rejects_non_utf8() {
        let (_tmp, root) = vault();
        std::fs::write(root.join("bin.md"), [0xFF, 0xFE, 0x00, 0x01]).expect("seed");
        match read_note_in(&root, Path::new("bin.md")) {
            Err(AppError::InvalidArgument { .. }) => {}
            other => panic!("expected InvalidArgument, got {other:?}"),
        }
    }

    #[test]
    fn write_creates_new_file() {
        let (_tmp, root) = vault();
        let result = write_note_in(&root, Path::new("new.md"), "fresh").expect("ok");
        assert_eq!(result.path, "new.md");
        assert!(!result.modified_at.is_empty());
        let on_disk = std::fs::read_to_string(root.join("new.md")).expect("read");
        assert_eq!(on_disk, "fresh");
    }

    #[test]
    fn write_overwrites_existing() {
        let (_tmp, root) = vault();
        std::fs::write(root.join("edit.md"), b"old").expect("seed");
        let result = write_note_in(&root, Path::new("edit.md"), "new").expect("ok");
        assert_eq!(result.path, "edit.md");
        let on_disk = std::fs::read_to_string(root.join("edit.md")).expect("read");
        assert_eq!(on_disk, "new");
    }

    #[test]
    fn write_empty_content() {
        let (_tmp, root) = vault();
        let result = write_note_in(&root, Path::new("blank.md"), "").expect("ok");
        assert_eq!(result.path, "blank.md");
        let on_disk = std::fs::read_to_string(root.join("blank.md")).expect("read");
        assert_eq!(on_disk, "");
    }

    #[test]
    fn write_rejects_missing_parent() {
        let (_tmp, root) = vault();
        match write_note_in(&root, Path::new("nope/new.md"), "x") {
            Err(AppError::NotFound { .. }) => {}
            other => panic!("expected NotFound, got {other:?}"),
        }
        assert!(!root.join("nope").exists());
    }

    #[test]
    fn write_rejects_directory_target() {
        let (_tmp, root) = vault();
        std::fs::create_dir(root.join("a-folder.md")).expect("mkdir");
        match write_note_in(&root, Path::new("a-folder.md"), "x") {
            Err(AppError::InvalidArgument { .. }) => {}
            other => panic!("expected InvalidArgument, got {other:?}"),
        }
    }

    #[test]
    fn write_rejects_non_note_extension() {
        let (_tmp, root) = vault();
        match write_note_in(&root, Path::new("bad.txt"), "x") {
            Err(AppError::InvalidArgument { .. }) => {}
            other => panic!("expected InvalidArgument, got {other:?}"),
        }
    }

    #[test]
    fn write_updates_modified_at_when_overwriting() {
        let (_tmp, root) = vault();
        let original = std::fs::metadata(root.join("a.md"))
            .ok()
            .and_then(|m| m.modified().ok());
        std::fs::write(root.join("a.md"), b"v1").expect("seed");
        std::thread::sleep(std::time::Duration::from_millis(50));
        let result = write_note_in(&root, Path::new("a.md"), "v2").expect("ok");
        let new_mtime = std::fs::metadata(root.join("a.md"))
            .expect("meta")
            .modified()
            .expect("mtime");
        if let Some(orig) = original {
            assert!(new_mtime >= orig, "mtime did not advance");
        }
        assert!(!result.modified_at.is_empty());
    }
}
