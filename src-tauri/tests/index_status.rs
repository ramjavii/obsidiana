use obsidiana_lib::commands::index;
use obsidiana_lib::error::AppError;
use obsidiana_lib::index::status::IndexStateKind;
use obsidiana_lib::state::AppState;
use std::path::PathBuf;
use tauri::test::{mock_builder, mock_context, noop_assets};
use tauri::Manager;

fn build_app_with_state(settings_path: PathBuf) -> tauri::App<tauri::test::MockRuntime> {
    let app = mock_builder()
        .build(mock_context(noop_assets()))
        .expect("mock app should build");
    app.manage(AppState::new(settings_path));
    app
}

#[test]
fn index_status_returns_missing_on_fresh_state() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let settings_path = tmp.path().join("settings.json");
    let app = build_app_with_state(settings_path);
    let state = app.state::<AppState>();
    let status = index::index_status_inner(state).expect("ok");
    assert_eq!(status.state.state, IndexStateKind::Missing);
    assert_eq!(status.schema_ver, 0);
    assert_eq!(status.document_count, 0);
}

#[test]
fn rebuild_index_rejects_when_no_vault_open() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let settings_path = tmp.path().join("settings.json");
    let app = build_app_with_state(settings_path);
    let handle = app.handle().clone();
    let state = app.state::<AppState>();
    let err = index::rebuild_index_inner(handle, state).expect_err("should fail");
    assert!(matches!(err, AppError::InvalidArgument { .. }));
}

#[test]
fn index_status_serialization_uses_state_discriminator() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let settings_path = tmp.path().join("settings.json");
    let app = build_app_with_state(settings_path);
    let state = app.state::<AppState>();
    let status = index::index_status_inner(state).expect("ok");
    let value = serde_json::to_value(&status).expect("serialize");
    assert_eq!(value["state"], "missing");
    assert_eq!(value["schemaVer"], 0);
    assert_eq!(value["documentCount"], 0);
    assert!(value.get("quarantinedTo").is_none() || value["quarantinedTo"].is_null());
    assert!(value.get("message").is_none() || value["message"].is_null());
}

#[test]
fn index_status_indexing_state_serializes_correctly() {
    use obsidiana_lib::index::status::IndexStatus;
    let s = IndexStatus::indexing(3, 10);
    let value = serde_json::to_value(&s).expect("serialize");
    assert_eq!(value["state"], "indexing");
    assert_eq!(value["indexed"], 3);
    assert_eq!(value["total"], 10);
}

#[test]
fn index_status_ready_state_serializes_with_count() {
    use obsidiana_lib::index::status::IndexStatus;
    let s = IndexStatus::ready(1, 42);
    let value = serde_json::to_value(&s).expect("serialize");
    assert_eq!(value["state"], "ready");
    assert_eq!(value["schemaVer"], 1);
    assert_eq!(value["documentCount"], 42);
    assert!(value["lastRebuiltAt"].is_string());
}

#[test]
fn index_status_broken_state_serializes_with_quarantine_path() {
    use obsidiana_lib::index::status::IndexStatus;
    let s = IndexStatus::broken("/vault/.obsidiana/index.db.broken-1700000000");
    let value = serde_json::to_value(&s).expect("serialize");
    assert_eq!(value["state"], "broken");
    assert_eq!(
        value["quarantinedTo"],
        "/vault/.obsidiana/index.db.broken-1700000000"
    );
}

#[test]
fn index_status_failed_state_serializes_with_message() {
    use obsidiana_lib::index::status::IndexStatus;
    let s = IndexStatus::failed("permission denied");
    let value = serde_json::to_value(&s).expect("serialize");
    assert_eq!(value["state"], "failed");
    assert_eq!(value["message"], "permission denied");
}
