use obsidiana_lib::commands::markdown;
use obsidiana_lib::error::AppError;
use obsidiana_lib::markdown::types::WikilinkRef;
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

fn write_note(root: &Path, rel: &str, content: &str) {
    let p = root.join(rel);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).expect("create parents");
    }
    std::fs::write(&p, content).expect("write");
}

#[test]
fn extract_wikilinks_on_empty_note_returns_empty_vec() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    write_note(&vault, "empty.md", "");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    let result = markdown::extract_wikilinks_inner(state, "empty.md".to_string())
        .expect("ok");
    assert_eq!(result, vec![]);
}

#[test]
fn extract_wikilinks_returns_target_and_alias() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    write_note(
        &vault,
        "note.md",
        "Hello [[other]] and [[friend|Best Friend]] world",
    );
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    let result = markdown::extract_wikilinks_inner(state, "note.md".to_string())
        .expect("ok");
    assert_eq!(
        result,
        vec![
            WikilinkRef {
                target: "other".to_string(),
                alias: None,
                line: 1,
            },
            WikilinkRef {
                target: "friend".to_string(),
                alias: Some("Best Friend".to_string()),
                line: 1,
            },
        ]
    );
}

#[test]
fn extract_wikilinks_excludes_embeds() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    write_note(
        &vault,
        "note.md",
        "![[embed]] but [[real]] is a wikilink",
    );
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    let result = markdown::extract_wikilinks_inner(state, "note.md".to_string())
        .expect("ok");
    assert_eq!(
        result,
        vec![WikilinkRef {
            target: "real".to_string(),
            alias: None,
            line: 1,
        }]
    );
}

#[test]
fn extract_wikilinks_tracks_line_numbers_across_newlines() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    write_note(
        &vault,
        "note.md",
        "line1 [[a]]\nline2 [[b]]\n\nline4 [[c]]",
    );
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    let result = markdown::extract_wikilinks_inner(state, "note.md".to_string())
        .expect("ok");
    assert_eq!(
        result,
        vec![
            WikilinkRef { target: "a".to_string(), alias: None, line: 1 },
            WikilinkRef { target: "b".to_string(), alias: None, line: 2 },
            WikilinkRef { target: "c".to_string(), alias: None, line: 4 },
        ]
    );
}

#[test]
fn extract_wikilinks_rejects_dotdot_path() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    let err = markdown::extract_wikilinks_inner(state, "../outside.md".to_string())
        .expect_err("should reject ..");
    assert!(matches!(err, AppError::InvalidArgument { .. }));
}

#[test]
fn extract_wikilinks_rejects_missing_file() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    let err = markdown::extract_wikilinks_inner(state, "missing.md".to_string())
        .expect_err("should error on missing");
    assert!(matches!(err, AppError::NotFound { .. }));
}

#[test]
fn extract_wikilinks_rejects_when_no_vault_open() {
    let app = mock_builder()
        .build(mock_context(noop_assets()))
        .expect("mock app should build");
    let state = AppState::new(PathBuf::from("/tmp/settings.json"));
    app.manage(state);
    let state_ref = app.state::<AppState>();
    let err =
        markdown::extract_wikilinks_inner(state_ref, "note.md".to_string())
            .expect_err("should require vault");
    assert!(matches!(err, AppError::InvalidArgument { .. }));
}

#[test]
fn extract_wikilinks_rejects_directory_target() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    std::fs::create_dir(vault.join("subdir")).expect("mkdir subdir");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    let err =
        markdown::extract_wikilinks_inner(state, "subdir".to_string())
            .expect_err("should reject directory");
    assert!(matches!(err, AppError::InvalidArgument { .. }));
}
