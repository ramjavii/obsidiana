use chrono::Utc;
use obsidiana_lib::commands::markdown;
use obsidiana_lib::error::AppError;
use obsidiana_lib::markdown::types::TagRef;
use obsidiana_lib::state::{AppState, VaultHandle};
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

fn write_note(root: &Path, rel: &str, content: &str) {
    let p = root.join(rel);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).expect("create parents");
    }
    std::fs::write(&p, content).expect("write");
}

#[test]
fn get_tags_for_note_returns_empty_for_note_with_no_tags() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    write_note(&vault, "plain.md", "Hello world, no tags here.");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    let result = markdown::get_tags_for_note_inner(state, "plain.md".to_string())
        .expect("ok");
    assert_eq!(result, vec![]);
}

#[test]
fn get_tags_for_note_extracts_single_tag() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    write_note(&vault, "note.md", "I love #obsidiana");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    let result = markdown::get_tags_for_note_inner(state, "note.md".to_string())
        .expect("ok");
    assert_eq!(
        result,
        vec![TagRef {
            name: "obsidiana".to_string(),
            line: 1,
        }]
    );
}

#[test]
fn get_tags_for_note_extracts_nested_parent_child_tag() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    write_note(&vault, "note.md", "topic: #project/2-8-tags");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    let result = markdown::get_tags_for_note_inner(state, "note.md".to_string())
        .expect("ok");
    assert_eq!(
        result,
        vec![TagRef {
            name: "project/2-8-tags".to_string(),
            line: 1,
        }]
    );
}

#[test]
fn get_tags_for_note_tracks_line_numbers() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    write_note(
        &vault,
        "note.md",
        "line1 #a\nline2 #b\n\nline4 #c",
    );
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    let result = markdown::get_tags_for_note_inner(state, "note.md".to_string())
        .expect("ok");
    assert_eq!(
        result,
        vec![
            TagRef { name: "a".to_string(), line: 1 },
            TagRef { name: "b".to_string(), line: 2 },
            TagRef { name: "c".to_string(), line: 4 },
        ]
    );
}

#[test]
fn get_tags_for_note_dedupes_within_a_single_note() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    write_note(&vault, "note.md", "#idea and #idea again on the same line");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    let result = markdown::get_tags_for_note_inner(state, "note.md".to_string())
        .expect("ok");
    assert_eq!(result.len(), 2);
    assert_eq!(result[0].name, "idea");
    assert_eq!(result[1].name, "idea");
}

#[test]
fn get_tags_for_note_rejects_dotdot_path() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    let err = markdown::get_tags_for_note_inner(state, "../outside.md".to_string())
        .expect_err("should reject ..");
    assert!(matches!(err, AppError::InvalidArgument { .. }));
}

#[test]
fn get_tags_for_note_rejects_missing_file() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    let err = markdown::get_tags_for_note_inner(state, "missing.md".to_string())
        .expect_err("should error on missing");
    assert!(matches!(err, AppError::NotFound { .. }));
}

#[test]
fn get_tags_for_note_rejects_when_no_vault_open() {
    let app = mock_builder()
        .build(mock_context(noop_assets()))
        .expect("mock app should build");
    let state = AppState::new(PathBuf::from("/tmp/settings.json"));
    app.manage(state);
    let state_ref = app.state::<AppState>();
    let err =
        markdown::get_tags_for_note_inner(state_ref, "note.md".to_string())
            .expect_err("should require vault");
    assert!(matches!(err, AppError::InvalidArgument { .. }));
}
