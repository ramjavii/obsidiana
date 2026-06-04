use obsidiana_lib::commands::tree;
use obsidiana_lib::error::AppError;
use obsidiana_lib::fs::tree::TreeNodeKind;
use obsidiana_lib::state::{AppState, VaultHandle};
use chrono::Utc;
use std::path::{Path, PathBuf};
use tauri::test::{mock_builder, mock_context, noop_assets};
use tauri::Manager;

fn build_app_with_vault(vault_dir: &Path) -> tauri::App<tauri::test::MockRuntime> {
    let canonical = std::fs::canonicalize(vault_dir).expect("canonicalize vault");
    let settings_path = vault_dir
        .parent()
        .map(|p| p.join("settings.json"))
        .unwrap_or_else(|| PathBuf::from("settings.json"));
    let app = mock_builder()
        .build(mock_context(noop_assets()))
        .expect("mock app should build");
    let state = AppState::new(settings_path);
    {
        let mut guard = state.vault.lock().expect("lock");
        *guard = Some(VaultHandle {
            path: canonical,
            opened_at: Utc::now(),
        });
    }
    app.manage(state);
    app
}

fn write(root: &Path, rel: &str) {
    let p = root.join(rel);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).expect("create parents");
    }
    std::fs::write(&p, b"# test\n").expect("write");
}

fn names(nodes: &[obsidiana_lib::fs::tree::TreeNode]) -> Vec<&str> {
    nodes.iter().map(|n| n.name.as_str()).collect()
}

#[test]
fn list_tree_returns_root_children_when_no_path() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    write(&vault, "todo.md");
    write(&vault, "notes/idea.md");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    let result = tree::list_tree_inner(state, None).expect("ok");
    assert_eq!(names(&result), vec!["notes", "todo.md"]);
    assert!(matches!(result[0].kind, TreeNodeKind::Dir));
    assert!(matches!(result[1].kind, TreeNodeKind::File));
}

#[test]
fn list_tree_returns_subfolder_children() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    write(&vault, "notes/a.md");
    write(&vault, "notes/b.md");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    let result = tree::list_tree_inner(state, Some("notes".to_string())).expect("ok");
    assert_eq!(names(&result), vec!["a.md", "b.md"]);
    assert_eq!(result[0].path, "notes/a.md");
    assert_eq!(result[0].extension.as_deref(), Some("md"));
}

#[test]
fn list_tree_filters_dotfiles_and_non_markdown() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    write(&vault, "visible.md");
    write(&vault, ".hidden.md");
    write(&vault, ".obsidian/config.json");
    write(&vault, "image.png");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    let result = tree::list_tree_inner(state, None).expect("ok");
    assert_eq!(names(&result), vec!["visible.md"]);
}

#[test]
fn list_tree_missing_subfolder_returns_not_found() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    let result = tree::list_tree_inner(state, Some("nope".to_string()));
    match result {
        Err(AppError::NotFound { .. }) => {}
        other => panic!("expected NotFound, got {other:?}"),
    }
}

#[test]
fn list_tree_rejects_path_with_parent_dir() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    let result = tree::list_tree_inner(state, Some("../etc".to_string()));
    match result {
        Err(AppError::InvalidArgument { .. }) => {}
        other => panic!("expected InvalidArgument, got {other:?}"),
    }
}

#[test]
fn list_tree_rejects_absolute_path() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    let result = tree::list_tree_inner(state, Some("/etc/passwd".to_string()));
    match result {
        Err(AppError::InvalidArgument { .. }) => {}
        other => panic!("expected InvalidArgument, got {other:?}"),
    }
}

#[test]
fn list_tree_without_open_vault_returns_invalid_argument() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let settings_path = tmp.path().join("settings.json");
    let app = mock_builder()
        .build(mock_context(noop_assets()))
        .expect("build");
    app.manage(AppState::new(settings_path));
    let state = app.state::<AppState>();
    let result = tree::list_tree_inner(state, None);
    match result {
        Err(AppError::InvalidArgument { .. }) => {}
        other => panic!("expected InvalidArgument, got {other:?}"),
    }
}

#[test]
fn create_note_writes_file_and_returns_content() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    let note = tree::create_note_inner(state, "hello.md".to_string(), Some("# hi\n".to_string()))
        .expect("ok");
    assert_eq!(note.path, "hello.md");
    assert_eq!(note.content, "# hi\n");
    let on_disk = std::fs::read_to_string(vault.join("hello.md")).expect("read");
    assert_eq!(on_disk, "# hi\n");
}

#[test]
fn create_note_with_no_template_writes_empty_file() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    let note = tree::create_note_inner(state, "blank.md".to_string(), None).expect("ok");
    assert_eq!(note.content, "");
    let on_disk = std::fs::read_to_string(vault.join("blank.md")).expect("read");
    assert_eq!(on_disk, "");
}

#[test]
fn create_note_rejects_collision() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    std::fs::write(vault.join("dup.md"), b"old").expect("seed");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    match tree::create_note_inner(state, "dup.md".to_string(), Some("new".to_string())) {
        Err(AppError::InvalidArgument { .. }) => {}
        other => panic!("expected InvalidArgument, got {other:?}"),
    }
    let on_disk = std::fs::read_to_string(vault.join("dup.md")).expect("read");
    assert_eq!(on_disk, "old");
}

#[test]
fn create_note_rejects_dotdot_path() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    match tree::create_note_inner(state, "../escape.md".to_string(), None) {
        Err(AppError::InvalidArgument { .. }) => {}
        other => panic!("expected InvalidArgument, got {other:?}"),
    }
}

#[test]
fn create_note_rejects_null_byte() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    match tree::create_note_inner(state, "bad\0.md".to_string(), None) {
        Err(AppError::InvalidArgument { .. }) => {}
        other => panic!("expected InvalidArgument, got {other:?}"),
    }
}

#[test]
fn delete_note_removes_existing_file() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    std::fs::write(vault.join("doomed.md"), b"x").expect("seed");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    tree::delete_note_inner(state, "doomed.md".to_string()).expect("ok");
    assert!(!vault.join("doomed.md").exists());
}

#[test]
fn delete_note_missing_returns_not_found() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    match tree::delete_note_inner(state, "ghost.md".to_string()) {
        Err(AppError::NotFound { .. }) => {}
        other => panic!("expected NotFound, got {other:?}"),
    }
}

#[test]
fn delete_note_rejects_dotdot_path() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    match tree::delete_note_inner(state, "../etc/passwd".to_string()) {
        Err(AppError::InvalidArgument { .. }) => {}
        other => panic!("expected InvalidArgument, got {other:?}"),
    }
}

#[test]
fn rename_note_renames_in_place() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    std::fs::write(vault.join("old.md"), b"x").expect("seed");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    let report = tree::rename_note_inner(
        state,
        "old.md".to_string(),
        "new.md".to_string(),
    )
    .expect("ok");
    assert_eq!(report.from, "old.md");
    assert_eq!(report.to, "new.md");
    assert!(!vault.join("old.md").exists());
    assert!(vault.join("new.md").exists());
}

#[test]
fn rename_note_moves_across_folders() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    std::fs::create_dir(vault.join("dst")).expect("mkdir");
    std::fs::write(vault.join("src.md"), b"x").expect("seed");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    tree::rename_note_inner(
        state,
        "src.md".to_string(),
        "dst/moved.md".to_string(),
    )
    .expect("ok");
    assert!(!vault.join("src.md").exists());
    assert!(vault.join("dst/moved.md").exists());
}

#[test]
fn rename_note_collision_returns_invalid_argument() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    std::fs::write(vault.join("a.md"), b"x").expect("seed");
    std::fs::write(vault.join("b.md"), b"y").expect("seed");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    match tree::rename_note_inner(state, "a.md".to_string(), "b.md".to_string()) {
        Err(AppError::InvalidArgument { .. }) => {}
        other => panic!("expected InvalidArgument, got {other:?}"),
    }
    assert!(vault.join("a.md").exists());
    assert!(vault.join("b.md").exists());
}

#[test]
fn rename_note_missing_source_returns_not_found() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    match tree::rename_note_inner(state, "ghost.md".to_string(), "new.md".to_string()) {
        Err(AppError::NotFound { .. }) => {}
        other => panic!("expected NotFound, got {other:?}"),
    }
}

#[test]
fn rename_note_rejects_dotdot_in_destination() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    std::fs::write(vault.join("a.md"), b"x").expect("seed");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    match tree::rename_note_inner(state, "a.md".to_string(), "../escape.md".to_string()) {
        Err(AppError::InvalidArgument { .. }) => {}
        other => panic!("expected InvalidArgument, got {other:?}"),
    }
}
