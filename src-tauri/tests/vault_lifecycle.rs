use obsidiana_lib::commands::vault;
use obsidiana_lib::error::AppError;
use obsidiana_lib::state::AppState;
use std::path::PathBuf;
use tauri::test::{mock_builder, mock_context, noop_assets};
use tauri::Manager;

fn build_app_with_state(settings_path: PathBuf) -> tauri::App<tauri::test::MockRuntime> {
    let app = mock_builder()
        .plugin(tauri_plugin_dialog::init())
        .build(mock_context(noop_assets()))
        .expect("mock app should build");
    app.manage(AppState::new(settings_path));
    app
}

#[test]
fn pick_vault_returns_none_when_picker_returns_none() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let settings_path = tmp.path().join("settings.json");
    let app = build_app_with_state(settings_path.clone());
    let handle = app.handle().clone();
    let state = app.state::<AppState>();
    let result = vault::pick_vault_inner(handle, state, |_app| Ok(None)).expect("ok");
    assert_eq!(result, None);
    let loaded = vault::list_settings_for_test(&settings_path).expect("load");
    assert!(loaded.recent_vaults.is_empty());
    assert!(loaded.last_vault.is_none());
}

#[test]
fn pick_vault_records_open_and_returns_vault_info_on_success() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault_dir = tmp.path().join("my-vault");
    std::fs::create_dir(&vault_dir).expect("mkdir");
    let settings_path = tmp.path().join("settings.json");
    let app = build_app_with_state(settings_path.clone());
    let handle = app.handle().clone();
    let state = app.state::<AppState>();
    let picked = vault_dir.clone();
    let result = vault::pick_vault_inner(handle, state, move |_app| Ok(Some(picked)))
        .expect("ok")
        .expect("Some");
    assert_eq!(result.name, "my-vault");
    let canonical = std::fs::canonicalize(&vault_dir).unwrap();
    assert_eq!(result.path, canonical.display().to_string());
    let loaded = vault::list_settings_for_test(&settings_path).expect("load");
    assert_eq!(loaded.recent_vaults.len(), 1);
    assert_eq!(loaded.last_vault, Some(canonical.clone()));
    let state = app.state::<AppState>();
    let guard = state.vault.lock().expect("lock");
    assert_eq!(guard.as_ref().map(|h| h.path.clone()), Some(canonical));
}

#[test]
fn pick_vault_propagates_picker_error_as_internal() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let settings_path = tmp.path().join("settings.json");
    let app = build_app_with_state(settings_path);
    let handle = app.handle().clone();
    let state = app.state::<AppState>();
    let result = vault::pick_vault_inner(handle, state, |_app| {
        Err(AppError::internal("dialog crashed"))
    });
    assert!(matches!(result, Err(AppError::Internal { .. })));
}

#[test]
fn pick_vault_rejects_non_directory() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let file = tmp.path().join("not-a-dir");
    std::fs::write(&file, "x").expect("write");
    let settings_path = tmp.path().join("settings.json");
    let app = build_app_with_state(settings_path);
    let handle = app.handle().clone();
    let state = app.state::<AppState>();
    let picked = file.clone();
    let result =
        vault::pick_vault_inner(handle, state, move |_app| Ok(Some(picked)));
    assert!(matches!(result, Err(AppError::NotFound { .. })));
}

#[test]
fn open_vault_succeeds_for_existing_directory() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault_dir = tmp.path().join("vault-open");
    std::fs::create_dir(&vault_dir).expect("mkdir");
    let settings_path = tmp.path().join("settings.json");
    let app = build_app_with_state(settings_path.clone());
    let state = app.state::<AppState>();
    let result = vault::open_vault_inner(state, vault_dir.display().to_string(), false).expect("ok");
    assert_eq!(result.name, "vault-open");
    let canonical = std::fs::canonicalize(&vault_dir).unwrap();
    let loaded = vault::list_settings_for_test(&settings_path).expect("load");
    assert_eq!(loaded.recent_vaults.len(), 1);
    assert_eq!(loaded.last_vault, Some(canonical));
}

#[test]
fn open_vault_rejects_nonexistent_path_with_io_error() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let missing = tmp.path().join("does-not-exist");
    let settings_path = tmp.path().join("settings.json");
    let app = build_app_with_state(settings_path);
    let state = app.state::<AppState>();
    let result = vault::open_vault_inner(state, missing.display().to_string(), false);
    assert!(matches!(result, Err(AppError::Io { .. })));
}

#[test]
fn open_vault_rejects_file_path_with_not_found() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let file = tmp.path().join("a.md");
    std::fs::write(&file, "x").expect("write");
    let settings_path = tmp.path().join("settings.json");
    let app = build_app_with_state(settings_path);
    let state = app.state::<AppState>();
    let result = vault::open_vault_inner(state, file.display().to_string(), false);
    assert!(matches!(result, Err(AppError::NotFound { .. })));
}

#[test]
fn open_vault_rejects_empty_path_with_invalid_argument() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let settings_path = tmp.path().join("settings.json");
    let app = build_app_with_state(settings_path);
    let state = app.state::<AppState>();
    let result = vault::open_vault_inner(state, String::new(), false);
    assert!(matches!(result, Err(AppError::InvalidArgument { .. })));
}

#[test]
fn open_vault_rejects_null_byte_with_invalid_argument() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let settings_path = tmp.path().join("settings.json");
    let app = build_app_with_state(settings_path);
    let state = app.state::<AppState>();
    let result = vault::open_vault_inner(state, "/tmp/has\0null".to_string(), false);
    assert!(matches!(result, Err(AppError::InvalidArgument { .. })));
}

#[test]
fn open_vault_refuses_when_already_open_without_force() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let a = tmp.path().join("a");
    let b = tmp.path().join("b");
    std::fs::create_dir(&a).expect("mkdir");
    std::fs::create_dir(&b).expect("mkdir");
    let settings_path = tmp.path().join("settings.json");
    let app = build_app_with_state(settings_path);
    {
        let state = app.state::<AppState>();
        vault::open_vault_inner(state, a.display().to_string(), false).expect("first open ok");
    }
    let state = app.state::<AppState>();
    let result = vault::open_vault_inner(state, b.display().to_string(), false);
    assert!(matches!(result, Err(AppError::Busy { .. })));
}

#[test]
fn open_vault_force_switches_active_vault() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let a = tmp.path().join("a");
    let b = tmp.path().join("b");
    std::fs::create_dir(&a).expect("mkdir");
    std::fs::create_dir(&b).expect("mkdir");
    let settings_path = tmp.path().join("settings.json");
    let app = build_app_with_state(settings_path);
    {
        let state = app.state::<AppState>();
        vault::open_vault_inner(state, a.display().to_string(), false).expect("first open ok");
    }
    {
        let state = app.state::<AppState>();
        let result = vault::open_vault_inner(state, b.display().to_string(), true).expect("forced");
        let canonical_b = std::fs::canonicalize(&b).unwrap();
        assert_eq!(result.name, "b");
        let state = app.state::<AppState>();
        let guard = state.vault.lock().expect("lock");
        assert_eq!(guard.as_ref().map(|h| h.path.clone()), Some(canonical_b));
    }
}

#[test]
fn close_vault_is_idempotent_when_no_vault_open() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let settings_path = tmp.path().join("settings.json");
    let app = build_app_with_state(settings_path);
    {
        let state = app.state::<AppState>();
        vault::close_vault_inner(state).expect("first close ok");
    }
    {
        let state = app.state::<AppState>();
        vault::close_vault_inner(state).expect("second close ok");
    }
}

#[test]
fn close_vault_clears_active_vault_and_persists() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault_dir = tmp.path().join("to-close");
    std::fs::create_dir(&vault_dir).expect("mkdir");
    let settings_path = tmp.path().join("settings.json");
    let app = build_app_with_state(settings_path.clone());
    {
        let state = app.state::<AppState>();
        vault::open_vault_inner(state, vault_dir.display().to_string(), false).expect("open ok");
    }
    {
        let state = app.state::<AppState>();
        vault::close_vault_inner(state).expect("close ok");
    }
    {
        let state = app.state::<AppState>();
        let guard = state.vault.lock().expect("lock");
        assert!(guard.is_none());
    }
    let loaded = vault::list_settings_for_test(&settings_path).expect("load");
    assert!(loaded.last_vault.is_none());
    assert_eq!(loaded.recent_vaults.len(), 1);
}

#[test]
fn list_recent_vaults_returns_empty_for_fresh_settings() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let settings_path = tmp.path().join("settings.json");
    let app = build_app_with_state(settings_path);
    let state = app.state::<AppState>();
    let result = vault::list_recent_vaults_inner(state).expect("ok");
    assert!(result.is_empty());
}

#[test]
fn list_recent_vaults_marks_missing_entries_unavailable() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let existing = tmp.path().join("real");
    let missing = tmp.path().join("vanished");
    std::fs::create_dir(&existing).expect("mkdir");
    std::fs::create_dir(&missing).expect("mkdir");
    let settings_path = tmp.path().join("settings.json");
    let app = build_app_with_state(settings_path);
    {
        let state = app.state::<AppState>();
        vault::open_vault_inner(state, existing.display().to_string(), false).expect("open ok");
    }
    {
        let state = app.state::<AppState>();
        vault::open_vault_inner(state, missing.display().to_string(), true).expect("forced open ok");
    }
    {
        let state = app.state::<AppState>();
        vault::close_vault_inner(state).expect("close ok");
    }
    std::fs::remove_dir_all(&missing).expect("rmdir");
    let recents = {
        let state = app.state::<AppState>();
        vault::list_recent_vaults_inner(state).expect("ok")
    };
    assert_eq!(recents.len(), 2);
    let real_canonical = std::fs::canonicalize(&existing).unwrap();
    let real = recents
        .iter()
        .find(|r| PathBuf::from(&r.path) == real_canonical)
        .expect("real present");
    assert!(real.available);
    let gone = recents
        .iter()
        .find(|r| r.name == "vanished")
        .expect("gone present");
    assert!(!gone.available);
}

#[test]
fn mock_app_with_dialog_plugin_builds() {
    let _app = mock_builder()
        .plugin(tauri_plugin_dialog::init())
        .build(mock_context(noop_assets()))
        .expect("mock app with dialog plugin should build");
}
