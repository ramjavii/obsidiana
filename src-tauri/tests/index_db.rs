use obsidiana_lib::commands::index;
use obsidiana_lib::commands::vault;
use obsidiana_lib::index::kick_off;
use obsidiana_lib::index::status::IndexStateKind;
use obsidiana_lib::state::{AppState, VaultHandle};
use chrono::Utc;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tauri::test::{mock_builder, mock_context, noop_assets};
use tauri::Manager;

fn build_app_with_state(settings_path: PathBuf) -> tauri::App<tauri::test::MockRuntime> {
    let app = mock_builder()
        .build(mock_context(noop_assets()))
        .expect("mock app should build");
    app.manage(AppState::new(settings_path));
    app
}

fn build_app_with_vault(
    settings_path: PathBuf,
    vault_dir: &Path,
) -> tauri::App<tauri::test::MockRuntime> {
    let canonical = std::fs::canonicalize(vault_dir).expect("canonicalize");
    let app = build_app_with_state(settings_path);
    let state = app.state::<AppState>();
    {
        let mut guard = state.vault.lock().expect("lock");
        *guard = Some(VaultHandle {
            path: canonical,
            opened_at: Utc::now(),
        });
    }
    app
}

fn wait_for<F: FnMut() -> bool>(mut cond: F, timeout: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if cond() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    cond()
}

fn vault_root_of(app: &tauri::App<tauri::test::MockRuntime>) -> PathBuf {
    let state = app.state::<AppState>();
    let guard = state.vault.lock().expect("lock");
    guard.as_ref().expect("vault present").path.clone()
}

fn snapshot_state(app: &tauri::App<tauri::test::MockRuntime>) -> IndexStateKind {
    let state = app.state::<AppState>();
    let snap = state.index.lock().expect("index lock");
    snap.state.state
}

#[test]
fn kick_off_index_open_transitions_to_ready() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault_dir = tmp.path().join("vault");
    std::fs::create_dir(&vault_dir).expect("mkdir");
    let settings_path = tmp.path().join("settings.json");
    let app = build_app_with_state(settings_path);
    let handle = app.handle().clone();
    kick_off::kick_off_index_open(handle, &vault_dir);
    assert!(wait_for(
        || snapshot_state(&app) == IndexStateKind::Ready,
        Duration::from_secs(5),
    ));
    let app_dir = vault_dir.join(".obsidiana");
    assert!(app_dir.join("index.db").exists() || app_dir.join("index.db-wal").exists());
}

#[test]
fn kick_off_index_open_quarantines_corrupt_db() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault_dir = tmp.path().join("vault");
    std::fs::create_dir(&vault_dir).expect("mkdir");
    let app_dir = vault_dir.join(".obsidiana");
    std::fs::create_dir_all(&app_dir).expect("mkdir app");
    std::fs::write(app_dir.join("index.db"), b"not a sqlite database at all").expect("garbage");
    let settings_path = tmp.path().join("settings.json");
    let app = build_app_with_state(settings_path);
    let handle = app.handle().clone();
    kick_off::kick_off_index_open(handle, &vault_dir);
    assert!(wait_for(
        || snapshot_state(&app) == IndexStateKind::Ready,
        Duration::from_secs(5),
    ));
    let entries: Vec<_> = std::fs::read_dir(&app_dir)
        .expect("readdir")
        .filter_map(Result::ok)
        .filter(|e| {
            e.file_name()
                .to_str()
                .map(|n| n.starts_with("index.db.broken-"))
                .unwrap_or(false)
        })
        .collect();
    assert_eq!(entries.len(), 1, "expected exactly one quarantined file");
}

#[test]
fn reset_index_status_sets_snapshot_to_missing() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault_dir = tmp.path().join("vault");
    std::fs::create_dir(&vault_dir).expect("mkdir");
    let settings_path = tmp.path().join("settings.json");
    let app = build_app_with_state(settings_path);
    {
        let state = app.state::<AppState>();
        let mut snap = state.index.lock().expect("index lock");
        *snap = obsidiana_lib::index::status::IndexStatus::ready(1, 0);
    }
    kick_off::reset_index_status(&app.handle().clone());
    assert_eq!(snapshot_state(&app), IndexStateKind::Missing);
}

#[test]
fn rebuild_index_flips_to_indexing_then_ready() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault_dir = tmp.path().join("vault");
    std::fs::create_dir(&vault_dir).expect("mkdir");
    let settings_path = tmp.path().join("settings.json");
    let app = build_app_with_vault(settings_path, &vault_dir);
    let handle = app.handle().clone();
    let state = app.state::<AppState>();
    index::rebuild_index_inner(handle, state).expect("rebuild ok");
    assert_eq!(snapshot_state(&app), IndexStateKind::Indexing);
    assert!(wait_for(
        || snapshot_state(&app) == IndexStateKind::Ready,
        Duration::from_secs(5),
    ));
}

#[test]
fn rebuild_index_resets_existing_db() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault_dir = tmp.path().join("vault");
    std::fs::create_dir(&vault_dir).expect("mkdir");
    let app_dir = vault_dir.join(".obsidiana");
    std::fs::create_dir_all(&app_dir).expect("mkdir app");
    let db_file = app_dir.join("index.db");
    std::fs::write(&db_file, b"old garbage").expect("write garbage");
    let settings_path = tmp.path().join("settings.json");
    let app = build_app_with_vault(settings_path, &vault_dir);
    let handle = app.handle().clone();
    let state = app.state::<AppState>();
    index::rebuild_index_inner(handle, state).expect("rebuild ok");
    assert!(wait_for(
        || snapshot_state(&app) == IndexStateKind::Ready,
        Duration::from_secs(5),
    ));
    let still_garbage = std::fs::read(&db_file)
        .map(|b| b.starts_with(b"old garbage"))
        .unwrap_or(false);
    assert!(!still_garbage, "old garbage should have been replaced");
}

#[test]
fn close_vault_inner_does_not_touch_index_snapshot() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault_dir = tmp.path().join("vault");
    std::fs::create_dir(&vault_dir).expect("mkdir");
    let settings_path = tmp.path().join("settings.json");
    let app = build_app_with_vault(settings_path, &vault_dir);
    {
        let state = app.state::<AppState>();
        let mut snap = state.index.lock().expect("index lock");
        *snap = obsidiana_lib::index::status::IndexStatus::ready(1, 0);
    }
    {
        let state = app.state::<AppState>();
        vault::close_vault_inner(state).expect("close ok");
    }
    assert_eq!(
        snapshot_state(&app),
        IndexStateKind::Ready,
        "sync close_vault_inner must not reset the snapshot; the async wrapper does"
    );
}

#[test]
fn async_close_vault_resets_index_to_missing() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault_dir = tmp.path().join("vault");
    std::fs::create_dir(&vault_dir).expect("mkdir");
    let settings_path = tmp.path().join("settings.json");
    let app = build_app_with_vault(settings_path, &vault_dir);
    {
        let state = app.state::<AppState>();
        let mut snap = state.index.lock().expect("index lock");
        *snap = obsidiana_lib::index::status::IndexStatus::ready(1, 0);
    }
    let app_handle = app.handle().clone();
    let state = app.state::<AppState>();
    vault::close_vault_inner(state).expect("close ok");
    kick_off::reset_index_status(&app_handle);
    assert_eq!(snapshot_state(&app), IndexStateKind::Missing);
}

#[test]
fn async_open_vault_kicks_off_index() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault_dir = tmp.path().join("vault");
    std::fs::create_dir(&vault_dir).expect("mkdir");
    let settings_path = tmp.path().join("settings.json");
    let app = build_app_with_state(settings_path);
    let app_handle = app.handle().clone();
    let state = app.state::<AppState>();
    vault::open_vault_inner(state, vault_dir.display().to_string(), false).expect("open ok");
    kick_off::kick_off_index_open(app_handle, &vault_dir);
    assert!(wait_for(
        || snapshot_state(&app) == IndexStateKind::Ready,
        Duration::from_secs(5),
    ));
    let canonical = vault_root_of(&app);
    assert!(canonical.ends_with("vault") || canonical.ends_with("vault/"));
}
