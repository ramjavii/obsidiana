use crate::error::{AppError, AppResult};
use std::path::Path;

#[derive(Debug, Clone, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TreeNodeKind {
    Dir,
    File,
}

#[derive(Debug, Clone, serde::Serialize, PartialEq, Eq)]
pub struct TreeNode {
    pub name: String,
    pub path: String,
    pub kind: TreeNodeKind,
    pub extension: Option<String>,
}

const ALLOWED_EXTS: &[&str] = &["md", "markdown"];

pub fn is_hidden(name: &str) -> bool {
    name.starts_with('.')
}

pub fn file_extension_lower(name: &str) -> Option<String> {
    Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
}

pub fn is_allowed_note(name: &str, kind: &TreeNodeKind) -> bool {
    match kind {
        TreeNodeKind::Dir => true,
        TreeNodeKind::File => match file_extension_lower(name) {
            Some(ext) => ALLOWED_EXTS.contains(&ext.as_str()),
            None => false,
        },
    }
}

fn normalize_slashes(s: &str) -> String {
    s.replace('\\', "/")
}

fn build_child_path(parent: Option<&Path>, name: &str) -> String {
    match parent {
        Some(p) => {
            let p = p.to_string_lossy();
            let parent_str = normalize_slashes(p.as_ref()).trim_end_matches('/').to_string();
            if parent_str.is_empty() {
                name.to_string()
            } else {
                format!("{parent_str}/{name}")
            }
        }
        None => name.to_string(),
    }
}

pub fn list_children(vault_root: &Path, relative: Option<&Path>) -> AppResult<Vec<TreeNode>> {
    let target = match relative {
        Some(r) => vault_root.join(r),
        None => vault_root.to_path_buf(),
    };
    let meta = std::fs::metadata(&target).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            AppError::not_found(format!("directory: {}", target.display()))
        } else {
            AppError::from_io(target.display().to_string(), &e)
        }
    })?;
    if !meta.is_dir() {
        return Err(AppError::not_found(format!(
            "not a directory: {}",
            target.display()
        )));
    }

    let read = std::fs::read_dir(&target)
        .map_err(|e| AppError::from_io(target.display().to_string(), &e))?;

    let mut nodes: Vec<TreeNode> = Vec::new();
    for entry in read {
        let entry = entry.map_err(|e| AppError::from_io(target.display().to_string(), &e))?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if is_hidden(&name) {
            continue;
        }
        let file_type = entry
            .file_type()
            .map_err(|e| AppError::from_io(target.display().to_string(), &e))?;
        let kind = if file_type.is_dir() {
            TreeNodeKind::Dir
        } else if file_type.is_file() {
            TreeNodeKind::File
        } else {
            continue;
        };
        if !is_allowed_note(&name, &kind) {
            continue;
        }
        let extension = match kind {
            TreeNodeKind::File => file_extension_lower(&name),
            TreeNodeKind::Dir => None,
        };
        nodes.push(TreeNode {
            path: build_child_path(relative, &name),
            name,
            kind,
            extension,
        });
    }

    nodes.sort_by(|a, b| match (&a.kind, &b.kind) {
        (TreeNodeKind::Dir, TreeNodeKind::File) => std::cmp::Ordering::Less,
        (TreeNodeKind::File, TreeNodeKind::Dir) => std::cmp::Ordering::Greater,
        _ => a.name.to_ascii_lowercase().cmp(&b.name.to_ascii_lowercase()),
    });

    Ok(nodes)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_vault() -> tempfile::TempDir {
        tempfile::tempdir().expect("tempdir")
    }

    fn write(root: &Path, rel: &str) {
        let p = root.join(rel);
        if let Some(parent) = p.parent() {
            std::fs::create_dir_all(parent).expect("create parents");
        }
        std::fs::write(&p, b"# test\n").expect("write");
    }

    fn names(nodes: &[TreeNode]) -> Vec<&str> {
        nodes.iter().map(|n| n.name.as_str()).collect()
    }

    #[test]
    fn root_returns_immediate_children() {
        let tmp = make_vault();
        write(tmp.path(), "todo.md");
        write(tmp.path(), "notes/idea.md");
        write(tmp.path(), "notes/work.md");
        let result = list_children(tmp.path(), None).expect("ok");
        assert_eq!(names(&result), vec!["notes", "todo.md"]);
    }

    #[test]
    fn subfolder_returns_its_children_alpha() {
        let tmp = make_vault();
        write(tmp.path(), "notes/idea.md");
        write(tmp.path(), "notes/work.md");
        write(tmp.path(), "todo.md");
        let result = list_children(tmp.path(), Some(Path::new("notes"))).expect("ok");
        assert_eq!(names(&result), vec!["idea.md", "work.md"]);
    }

    #[test]
    fn hides_dotfiles_and_dotdirs() {
        let tmp = make_vault();
        write(tmp.path(), "visible.md");
        write(tmp.path(), ".hidden.md");
        write(tmp.path(), ".obsidian/config.json");
        let result = list_children(tmp.path(), None).expect("ok");
        assert_eq!(names(&result), vec!["visible.md"]);
    }

    #[test]
    fn hides_non_markdown_files_but_shows_dirs() {
        let tmp = make_vault();
        write(tmp.path(), "todo.md");
        write(tmp.path(), "image.png");
        write(tmp.path(), "doc.pdf");
        write(tmp.path(), "mixed/photo.jpg");
        let result = list_children(tmp.path(), None).expect("ok");
        assert_eq!(names(&result), vec!["mixed", "todo.md"]);
    }

    #[test]
    fn accepts_markdown_extension() {
        let tmp = make_vault();
        write(tmp.path(), "readme.markdown");
        let result = list_children(tmp.path(), None).expect("ok");
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].extension.as_deref(), Some("markdown"));
    }

    #[test]
    fn extension_match_is_case_insensitive() {
        let tmp = make_vault();
        write(tmp.path(), "TODO.MD");
        write(tmp.path(), "Note.Md");
        let result = list_children(tmp.path(), None).expect("ok");
        assert_eq!(result.len(), 2);
    }

    #[test]
    fn sorts_dirs_first_then_files_alpha_case_insensitive() {
        let tmp = make_vault();
        write(tmp.path(), "zebra.md");
        write(tmp.path(), "apple.md");
        write(tmp.path(), "zoo/note.md");
        write(tmp.path(), "alpha/note.md");
        let result = list_children(tmp.path(), None).expect("ok");
        assert_eq!(names(&result), vec!["alpha", "zoo", "apple.md", "zebra.md"]);
    }

    #[test]
    fn empty_dir_returns_empty_vec() {
        let tmp = make_vault();
        std::fs::create_dir(tmp.path().join("empty")).expect("mkdir");
        let result = list_children(tmp.path(), Some(Path::new("empty"))).expect("ok");
        assert!(result.is_empty());
    }

    #[test]
    fn missing_subfolder_returns_not_found() {
        let tmp = make_vault();
        let result = list_children(tmp.path(), Some(Path::new("nope")));
        match result {
            Err(AppError::NotFound { .. }) => {}
            other => panic!("expected NotFound, got {other:?}"),
        }
    }

    #[test]
    fn file_path_returns_not_found() {
        let tmp = make_vault();
        write(tmp.path(), "todo.md");
        let result = list_children(tmp.path(), Some(Path::new("todo.md")));
        match result {
            Err(AppError::NotFound { .. }) => {}
            other => panic!("expected NotFound, got {other:?}"),
        }
    }

    #[test]
    fn child_path_is_relative_to_vault_root() {
        let tmp = make_vault();
        write(tmp.path(), "a/b/c.md");
        let result = list_children(tmp.path(), Some(Path::new("a/b"))).expect("ok");
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].path, "a/b/c.md");
        assert_eq!(result[0].name, "c.md");
        assert_eq!(result[0].kind, TreeNodeKind::File);
        assert_eq!(result[0].extension.as_deref(), Some("md"));
    }

    #[test]
    fn file_kind_serializes_as_lowercase() {
        let node = TreeNode {
            name: "x.md".to_string(),
            path: "x.md".to_string(),
            kind: TreeNodeKind::File,
            extension: Some("md".to_string()),
        };
        let value = serde_json::to_value(&node).expect("serialize");
        assert_eq!(value["kind"], "file");
        assert_eq!(value["name"], "x.md");
        assert_eq!(value["path"], "x.md");
        assert_eq!(value["extension"], "md");
    }

    #[test]
    fn dir_kind_serializes_as_lowercase() {
        let node = TreeNode {
            name: "notes".to_string(),
            path: "notes".to_string(),
            kind: TreeNodeKind::Dir,
            extension: None,
        };
        let value = serde_json::to_value(&node).expect("serialize");
        assert_eq!(value["kind"], "dir");
        assert_eq!(value["extension"], serde_json::Value::Null);
    }

    #[test]
    fn helper_normalize_slashes_converts_backslashes() {
        assert_eq!(normalize_slashes("a\\b\\c"), "a/b/c");
        assert_eq!(normalize_slashes("a/b"), "a/b");
    }

    #[test]
    fn helper_build_child_path_handles_root_and_nested() {
        assert_eq!(build_child_path(None, "x.md"), "x.md");
        assert_eq!(build_child_path(Some(Path::new("notes")), "a.md"), "notes/a.md");
        assert_eq!(build_child_path(Some(Path::new("a/b")), "c.md"), "a/b/c.md");
        assert_eq!(
            build_child_path(Some(Path::new("a\\b")), "c.md"),
            "a/b/c.md"
        );
    }

    #[test]
    fn helper_is_hidden_detects_dot_prefix() {
        assert!(is_hidden(".git"));
        assert!(is_hidden(".obsidian"));
        assert!(is_hidden(".hidden.md"));
        assert!(!is_hidden("visible.md"));
        assert!(!is_hidden("notes"));
    }

    #[test]
    fn helper_file_extension_lower_handles_edge_cases() {
        assert_eq!(file_extension_lower("todo.md"), Some("md".to_string()));
        assert_eq!(file_extension_lower("TODO.MD"), Some("md".to_string()));
        assert_eq!(
            file_extension_lower("readme.markdown"),
            Some("markdown".to_string())
        );
        assert_eq!(file_extension_lower("noext"), None);
        assert_eq!(file_extension_lower("dotfile."), Some("".to_string()));
    }
}
