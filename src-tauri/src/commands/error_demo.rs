use crate::error::AppResult;

#[tauri::command]
pub async fn ping_or_fail() -> AppResult<String> {
    Err(crate::error::AppError::not_found(
        "ping_or_fail: demonstrates the AppError surface to the frontend",
    ))
}
