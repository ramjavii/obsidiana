use obsidiana_lib::commands::tree;
use obsidiana_lib::error::AppError;
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

fn build_app_without_vault() -> tauri::App<tauri::test::MockRuntime> {
    let app = mock_builder()
        .build(mock_context(noop_assets()))
        .expect("mock app should build");
    let state = AppState::new(PathBuf::from("settings.json"));
    app.manage(state);
    app
}

#[test]
fn read_note_returns_content() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    std::fs::write(vault.join("hello.md"), "# title\n\nbody").expect("seed");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    let note = tree::read_note_inner(state, "hello.md".into()).expect("ok");
    assert_eq!(note.path, "hello.md");
    assert_eq!(note.content, "# title\n\nbody");
    assert!(!note.modified_at.is_empty());
}

#[test]
fn read_note_missing_file_returns_not_found() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    match tree::read_note_inner(state, "ghost.md".into()) {
        Err(AppError::NotFound { .. }) => {}
        other => panic!("expected NotFound, got {other:?}"),
    }
}

#[test]
fn read_note_rejects_dotdot_path() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    match tree::read_note_inner(state, "../etc/passwd".into()) {
        Err(AppError::InvalidArgument { .. }) => {}
        other => panic!("expected InvalidArgument, got {other:?}"),
    }
}

#[test]
fn read_note_with_no_vault_open_returns_invalid_argument() {
    let app = build_app_without_vault();
    let state = app.state::<AppState>();
    match tree::read_note_inner(state, "any.md".into()) {
        Err(AppError::InvalidArgument { .. }) => {}
        other => panic!("expected InvalidArgument, got {other:?}"),
    }
}

#[test]
fn write_note_creates_file() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    let result = tree::write_note_inner(state, "new.md".into(), "fresh".into()).expect("ok");
    assert_eq!(result.path, "new.md");
    let on_disk = std::fs::read_to_string(vault.join("new.md")).expect("read");
    assert_eq!(on_disk, "fresh");
}

#[test]
fn write_note_overwrites_existing() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    std::fs::write(vault.join("edit.md"), b"old").expect("seed");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    let result = tree::write_note_inner(state, "edit.md".into(), "new".into()).expect("ok");
    assert_eq!(result.path, "edit.md");
    let on_disk = std::fs::read_to_string(vault.join("edit.md")).expect("read");
    assert_eq!(on_disk, "new");
}

#[test]
fn write_note_rejects_missing_parent() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    match tree::write_note_inner(state, "nope/new.md".into(), "x".into()) {
        Err(AppError::NotFound { .. }) => {}
        other => panic!("expected NotFound, got {other:?}"),
    }
}

#[test]
fn write_note_rejects_dotdot_path() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    match tree::write_note_inner(state, "../escape.md".into(), "x".into()) {
        Err(AppError::InvalidArgument { .. }) => {}
        other => panic!("expected InvalidArgument, got {other:?}"),
    }
}

#[test]
fn write_note_rejects_non_note_extension() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    match tree::write_note_inner(state, "bad.txt".into(), "x".into()) {
        Err(AppError::InvalidArgument { .. }) => {}
        other => panic!("expected InvalidArgument, got {other:?}"),
    }
}

#[test]
fn write_note_with_no_vault_open_returns_invalid_argument() {
    let app = build_app_without_vault();
    let state = app.state::<AppState>();
    match tree::write_note_inner(state, "any.md".into(), "x".into()) {
        Err(AppError::InvalidArgument { .. }) => {}
        other => panic!("expected InvalidArgument, got {other:?}"),
    }
}
