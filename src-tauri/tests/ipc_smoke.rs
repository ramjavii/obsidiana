use obsidiana_lib::commands::{error_demo, ping};
use obsidiana_lib::error::AppError;
use tauri::test::{mock_builder, mock_context, noop_assets};

#[test]
fn mock_app_builds_with_ping_and_ping_or_fail_registered() {
    let _app = mock_builder()
        .invoke_handler(tauri::generate_handler![ping::ping, error_demo::ping_or_fail])
        .build(mock_context(noop_assets()))
        .expect("mock app should build");
}

#[test]
fn ping_command_returns_pong_when_invoked_directly() {
    let result = tauri::async_runtime::block_on(ping::ping());
    assert!(matches!(result, Ok(ref s) if s == "pong"));
}

#[test]
fn ping_or_fail_command_returns_not_found_when_invoked_directly() {
    let result = tauri::async_runtime::block_on(error_demo::ping_or_fail());
    assert!(result.is_err());
    let err = result.expect_err("err");
    assert!(
        matches!(err, AppError::NotFound { ref what } if what.contains("ping_or_fail")),
        "expected NotFound, got {err:?}"
    );
}

#[test]
fn ping_or_fail_serializes_to_frontend_shape() {
    let result = tauri::async_runtime::block_on(error_demo::ping_or_fail());
    let err = result.expect_err("err");
    let value = serde_json::to_value(&err).expect("serialize");
    assert_eq!(value["kind"], "NotFound");
    assert!(value["data"]["what"]
        .as_str()
        .expect("what is string")
        .contains("ping_or_fail"));
}
