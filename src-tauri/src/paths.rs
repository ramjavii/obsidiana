use crate::error::AppError;
use std::path::{Component, Path, PathBuf};

const APP_DIR_NAME: &str = "com.obsidiana.app";
const SETTINGS_FILE: &str = "settings.json";

pub fn app_data_dir() -> AppResult<PathBuf> {
    let base = dirs::data_dir().ok_or_else(|| {
        AppError::internal("could not resolve OS data directory (dirs::data_dir returned None)")
    })?;
    ensure_app_dir(&base)
}

pub fn settings_path() -> AppResult<PathBuf> {
    Ok(app_data_dir()?.join(SETTINGS_FILE))
}

pub fn canonicalize_dir(path: &Path) -> AppResult<PathBuf> {
    let canonical = std::fs::canonicalize(path)
        .map_err(|e| AppError::from_io(path.display().to_string(), &e))?;
    let meta = std::fs::metadata(&canonical)
        .map_err(|e| AppError::from_io(canonical.display().to_string(), &e))?;
    if !meta.is_dir() {
        return Err(AppError::not_found(format!(
            "directory: {}",
            canonical.display()
        )));
    }
    Ok(canonical)
}

pub fn validate_relative_path(raw: &str) -> AppResult<PathBuf> {
    if raw.is_empty() {
        return Err(AppError::invalid("path is empty"));
    }
    if raw.contains('\0') {
        return Err(AppError::invalid("path contains a null byte"));
    }
    if raw.contains('\\') {
        return Err(AppError::invalid(
            "path uses backslashes; use forward slashes",
        ));
    }
    let path = PathBuf::from(raw);
    if path.is_absolute() {
        return Err(AppError::invalid("path is absolute"));
    }
    for component in path.components() {
        match component {
            Component::Prefix(_) | Component::RootDir | Component::ParentDir => {
                return Err(AppError::invalid(
                    "path escapes the vault root (contains .. or root segment)",
                ));
            }
            _ => {}
        }
    }
    Ok(path)
}

pub type AppResult<T> = Result<T, AppError>;

fn ensure_app_dir(base: &Path) -> AppResult<PathBuf> {
    let dir = base.join(APP_DIR_NAME);
    if !dir.exists() {
        std::fs::create_dir_all(&dir)
            .map_err(|e| AppError::from_io(dir.display().to_string(), &e))?;
    }
    Ok(dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ensure_app_dir_creates_missing_directory() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let result = ensure_app_dir(tmp.path()).expect("ok");
        assert_eq!(result, tmp.path().join(APP_DIR_NAME));
        assert!(result.is_dir());
    }

    #[test]
    fn ensure_app_dir_is_idempotent() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let first = ensure_app_dir(tmp.path()).expect("ok");
        let second = ensure_app_dir(tmp.path()).expect("ok");
        assert_eq!(first, second);
        assert!(first.is_dir());
    }

    #[test]
    fn settings_path_helper_sits_under_app_dir() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let app_dir = ensure_app_dir(tmp.path()).expect("ok");
        let settings = app_dir.join(SETTINGS_FILE);
        assert!(settings.ends_with(SETTINGS_FILE));
        assert!(settings.parent().unwrap().ends_with(APP_DIR_NAME));
    }

    #[test]
    fn canonicalize_dir_resolves_existing_directory() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let resolved = canonicalize_dir(tmp.path()).expect("canonicalize");
        assert_eq!(resolved, std::fs::canonicalize(tmp.path()).unwrap());
    }

    #[test]
    fn canonicalize_dir_rejects_missing_path() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let missing = tmp.path().join("nope");
        let err = canonicalize_dir(&missing).expect_err("should fail");
        assert!(matches!(err, AppError::Io { .. }));
    }

    #[test]
    fn canonicalize_dir_rejects_files() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let file = tmp.path().join("a.md");
        std::fs::write(&file, "x").expect("write");
        let err = canonicalize_dir(&file).expect_err("should fail");
        assert!(matches!(err, AppError::NotFound { .. }));
    }

    #[test]
    fn validate_relative_accepts_clean_relative_path() {
        let p = validate_relative_path("folder/note.md").expect("ok");
        assert_eq!(p, PathBuf::from("folder/note.md"));
    }

    #[test]
    fn validate_relative_rejects_empty() {
        assert!(matches!(
            validate_relative_path(""),
            Err(AppError::InvalidArgument { .. })
        ));
    }

    #[test]
    fn validate_relative_rejects_null_byte() {
        assert!(matches!(
            validate_relative_path("foo\0bar"),
            Err(AppError::InvalidArgument { .. })
        ));
    }

    #[test]
    fn validate_relative_rejects_backslash() {
        assert!(matches!(
            validate_relative_path("foo\\bar"),
            Err(AppError::InvalidArgument { .. })
        ));
    }

    #[test]
    fn validate_relative_rejects_absolute() {
        assert!(matches!(
            validate_relative_path("/etc/passwd"),
            Err(AppError::InvalidArgument { .. })
        ));
    }

    #[test]
    fn validate_relative_rejects_parent_traversal() {
        assert!(matches!(
            validate_relative_path("../escape"),
            Err(AppError::InvalidArgument { .. })
        ));
        assert!(matches!(
            validate_relative_path("a/../../b"),
            Err(AppError::InvalidArgument { .. })
        ));
    }
}
