use chrono::Utc;
use obsidiana_lib::commands::markdown;
use obsidiana_lib::error::AppError;
use obsidiana_lib::markdown::types::ResolvedLink;
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

fn write_note(root: &Path, rel: &str) {
    let p = root.join(rel);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).expect("create parents");
    }
    std::fs::write(&p, b"# test\n").expect("write");
}

#[test]
fn resolve_wikilink_resolves_existing_target() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    write_note(&vault, "idea.md");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    let result = markdown::resolve_wikilink_inner(
        state,
        "source.md".to_string(),
        "idea".to_string(),
        None,
    )
    .expect("ok");
    match result {
        ResolvedLink::Resolved { resolved_path, .. } => {
            assert_eq!(resolved_path, "idea.md");
        }
        other => panic!("expected Resolved, got {other:?}"),
    }
}

#[test]
fn resolve_wikilink_returns_broken_when_target_missing() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    let result = markdown::resolve_wikilink_inner(
        state,
        "source.md".to_string(),
        "ghost".to_string(),
        None,
    )
    .expect("ok");
    assert!(matches!(result, ResolvedLink::Broken { .. }));
}

#[test]
fn resolve_wikilink_rejects_when_no_vault_open() {
    let app = mock_builder()
        .build(mock_context(noop_assets()))
        .expect("mock app should build");
    let state = AppState::new(PathBuf::from("/tmp/settings.json"));
    app.manage(state);
    let state_ref = app.state::<AppState>();
    let err = markdown::resolve_wikilink_inner(
        state_ref,
        "source.md".to_string(),
        "idea".to_string(),
        None,
    )
    .expect_err("should require vault");
    assert!(matches!(err, AppError::InvalidArgument { .. }));
}

#[test]
fn resolve_wikilink_rejects_dotdot_source_path() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    let err = markdown::resolve_wikilink_inner(
        state,
        "../outside.md".to_string(),
        "idea".to_string(),
        None,
    )
    .expect_err("should reject ..");
    assert!(matches!(err, AppError::InvalidArgument { .. }));
}

#[test]
fn resolve_wikilink_rejects_absolute_source_path() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    let err = markdown::resolve_wikilink_inner(
        state,
        "/etc/passwd".to_string(),
        "idea".to_string(),
        None,
    )
    .expect_err("should reject absolute path");
    assert!(matches!(err, AppError::InvalidArgument { .. }));
}

#[test]
fn resolve_wikilink_echoes_alias() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    write_note(&vault, "idea.md");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();
    let result = markdown::resolve_wikilink_inner(
        state,
        "source.md".to_string(),
        "idea".to_string(),
        Some("My Idea".to_string()),
    )
    .expect("ok");
    match result {
        ResolvedLink::Resolved { alias, .. } => {
            assert_eq!(alias.as_deref(), Some("My Idea"));
        }
        other => panic!("expected Resolved, got {other:?}"),
    }
}
