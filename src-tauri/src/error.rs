use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", content = "data")]
pub enum AppError {
    #[error("internal error: {message}")]
    Internal { message: String },
}

impl AppError {
    pub fn internal(message: impl Into<String>) -> Self {
        Self::Internal {
            message: message.into(),
        }
    }
}

pub type AppResult<T> = Result<T, AppError>;
