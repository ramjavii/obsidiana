use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", content = "data")]
pub enum AppError {
    #[error("internal error: {message}")]
    Internal { message: String },

    #[error("not found: {what}")]
    NotFound { what: String },

    #[error("invalid argument: {message}")]
    InvalidArgument { message: String },

    #[error("io error on {path}: {message}")]
    Io {
        path: String,
        #[serde(rename = "source")]
        message: String,
    },

    #[error("busy: {what}")]
    Busy { what: String },
}

impl AppError {
    pub fn internal(message: impl Into<String>) -> Self {
        Self::Internal {
            message: message.into(),
        }
    }

    pub fn not_found(what: impl Into<String>) -> Self {
        Self::NotFound { what: what.into() }
    }

    pub fn invalid(message: impl Into<String>) -> Self {
        Self::InvalidArgument {
            message: message.into(),
        }
    }

    pub fn from_io(path: impl Into<String>, err: &std::io::Error) -> Self {
        Self::Io {
            path: path.into(),
            message: err.to_string(),
        }
    }

    pub fn busy(what: impl Into<String>) -> Self {
        Self::Busy { what: what.into() }
    }
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn internal_serializes_as_kind_data_shape() {
        let err = AppError::internal("boom");
        let value = serde_json::to_value(&err).expect("serialize");
        assert_eq!(value, json!({"kind": "Internal", "data": {"message": "boom"}}));
    }

    #[test]
    fn internal_display_includes_message() {
        let err = AppError::internal("boom");
        assert_eq!(err.to_string(), "internal error: boom");
    }

    #[test]
    fn not_found_has_what_field() {
        let err = AppError::NotFound {
            what: "vault".to_string(),
        };
        let value = serde_json::to_value(&err).expect("serialize");
        assert_eq!(
            value,
            json!({"kind": "NotFound", "data": {"what": "vault"}})
        );
    }

    #[test]
    fn invalid_argument_has_message_field() {
        let err = AppError::InvalidArgument {
            message: "path contains ..".to_string(),
        };
        let value = serde_json::to_value(&err).expect("serialize");
        assert_eq!(
            value,
            json!({"kind": "InvalidArgument", "data": {"message": "path contains .."}})
        );
    }

    #[test]
    fn io_has_path_and_source_fields() {
        let err = AppError::Io {
            path: "/tmp/missing.md".to_string(),
            message: "No such file or directory".to_string(),
        };
        let value = serde_json::to_value(&err).expect("serialize");
        assert_eq!(
            value,
            json!({
                "kind": "Io",
                "data": {
                    "path": "/tmp/missing.md",
                    "source": "No such file or directory"
                }
            })
        );
    }

    #[test]
    fn from_io_captures_path_and_message() {
        let io = std::io::Error::new(std::io::ErrorKind::NotFound, "nope");
        let err = AppError::from_io("/tmp/x.md", &io);
        match err {
            AppError::Io { path, message } => {
                assert_eq!(path, "/tmp/x.md");
                assert_eq!(message, "nope");
            }
            other => panic!("expected Io, got {other:?}"),
        }
    }

    #[test]
    fn busy_serializes_as_kind_data_shape() {
        let err = AppError::busy("open_vault");
        let value = serde_json::to_value(&err).expect("serialize");
        assert_eq!(
            value,
            json!({"kind": "Busy", "data": {"what": "open_vault"}})
        );
    }

    #[test]
    fn busy_display_includes_what() {
        let err = AppError::busy("git_pull");
        assert_eq!(err.to_string(), "busy: git_pull");
    }
}

