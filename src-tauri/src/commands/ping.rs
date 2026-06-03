use crate::error::AppResult;

#[tauri::command]
pub async fn ping() -> AppResult<String> {
    Ok("pong".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::async_runtime;

    #[test]
    fn ping_returns_pong() {
        let result = async_runtime::block_on(ping());
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "pong");
    }
}
