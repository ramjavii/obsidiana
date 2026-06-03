use crate::error::AppError;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub const SETTINGS_SCHEMA_VER: u32 = 1;
const MAX_RECENT_VAULTS: usize = 10;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    #[default]
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq)]
pub struct WindowGeometry {
    pub width: Option<u32>,
    pub height: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RecentVaultEntry {
    pub path: PathBuf,
    pub last_opened: DateTime<Utc>,
    pub available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Settings {
    pub schema_ver: u32,
    pub last_vault: Option<PathBuf>,
    pub recent_vaults: Vec<RecentVaultEntry>,
    pub theme: Theme,
    pub window: WindowGeometry,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            schema_ver: SETTINGS_SCHEMA_VER,
            last_vault: None,
            recent_vaults: Vec::new(),
            theme: Theme::default(),
            window: WindowGeometry::default(),
        }
    }
}

impl Settings {
    pub fn load(path: &Path) -> Result<Self, AppError> {
        if !path.exists() {
            return Ok(Self::default());
        }
        let raw = match std::fs::read_to_string(path) {
            Ok(s) => s,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Self::default()),
            Err(e) => return Err(AppError::from_io(path.display().to_string(), &e)),
        };
        match serde_json::from_str::<Settings>(&raw) {
            Ok(s) if s.schema_ver == SETTINGS_SCHEMA_VER => Ok(s),
            Ok(s) => {
                let backup = path.with_extension(format!(
                    "json.broken-{}.schema-{}",
                    Utc::now().timestamp(),
                    s.schema_ver
                ));
                let _ = std::fs::rename(path, &backup);
                Ok(Self::default())
            }
            Err(_) => {
                let backup = path.with_extension(format!(
                    "json.broken-{}",
                    Utc::now().timestamp()
                ));
                let _ = std::fs::rename(path, &backup);
                Ok(Self::default())
            }
        }
    }

    pub fn save(&self, path: &Path) -> Result<(), AppError> {
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| AppError::from_io(parent.display().to_string(), &e))?;
            }
        }
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| AppError::internal(format!("serialize settings: {e}")))?;
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, json)
            .map_err(|e| AppError::from_io(tmp.display().to_string(), &e))?;
        std::fs::rename(&tmp, path)
            .map_err(|e| AppError::from_io(path.display().to_string(), &e))?;
        Ok(())
    }

    pub fn record_open(&mut self, path: &Path) {
        let canonical = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        self.last_vault = Some(canonical.clone());
        let now = Utc::now();
        self.recent_vaults.retain(|e| e.path != canonical);
        self.recent_vaults.insert(
            0,
            RecentVaultEntry {
                path: canonical,
                last_opened: now,
                available: true,
            },
        );
        if self.recent_vaults.len() > MAX_RECENT_VAULTS {
            self.recent_vaults.truncate(MAX_RECENT_VAULTS);
        }
    }

    pub fn record_close(&mut self) {
        self.last_vault = None;
    }

    pub fn reconcile(&mut self) {
        for entry in self.recent_vaults.iter_mut() {
            entry.available = entry.path.is_dir();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_have_schema_ver_one_and_no_recents() {
        let s = Settings::default();
        assert_eq!(s.schema_ver, SETTINGS_SCHEMA_VER);
        assert!(s.last_vault.is_none());
        assert!(s.recent_vaults.is_empty());
        assert_eq!(s.theme, Theme::System);
    }

    #[test]
    fn load_missing_file_returns_default() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let path = tmp.path().join("settings.json");
        let s = Settings::load(&path).expect("ok");
        assert_eq!(s, Settings::default());
    }

    #[test]
    fn save_then_load_round_trips() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let path = tmp.path().join("settings.json");
        let mut s = Settings::default();
        s.record_open(Path::new("/tmp/vault-a"));
        s.theme = Theme::Dark;
        s.save(&path).expect("save");
        let loaded = Settings::load(&path).expect("load");
        assert_eq!(loaded, s);
    }

    #[test]
    fn load_corrupt_file_quarantines_and_returns_default() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let path = tmp.path().join("settings.json");
        std::fs::write(&path, "{not json").expect("write");
        let s = Settings::load(&path).expect("ok");
        assert_eq!(s, Settings::default());
        let entries: Vec<_> = std::fs::read_dir(tmp.path())
            .unwrap()
            .filter_map(Result::ok)
            .filter(|e| e.file_name().to_string_lossy().contains("broken"))
            .collect();
        assert_eq!(entries.len(), 1);
    }

    #[test]
    fn load_unknown_schema_quarantines_and_returns_default() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let path = tmp.path().join("settings.json");
        std::fs::write(
            &path,
            r#"{"schema_ver":99,"last_vault":null,"recent_vaults":[],"theme":"system","window":{}}"#,
        )
        .expect("write");
        let s = Settings::load(&path).expect("ok");
        assert_eq!(s, Settings::default());
    }

    #[test]
    fn record_open_dedups_and_moves_to_front() {
        let mut s = Settings::default();
        let a = PathBuf::from("/tmp/a");
        let b = PathBuf::from("/tmp/b");
        s.record_open(&a);
        s.record_open(&b);
        s.record_open(&a);
        assert_eq!(s.recent_vaults.len(), 2);
        assert_eq!(s.recent_vaults[0].path, std::fs::canonicalize(&a).unwrap_or(a.clone()));
        assert_eq!(s.recent_vaults[1].path, std::fs::canonicalize(&b).unwrap_or(b.clone()));
        assert_eq!(s.last_vault, Some(std::fs::canonicalize(&a).unwrap_or(a)));
    }

    #[test]
    fn record_open_caps_at_ten() {
        let mut s = Settings::default();
        for i in 0..15 {
            let p = std::env::temp_dir().join(format!("vault-{i}"));
            std::fs::create_dir_all(&p).expect("mkdir");
            s.record_open(&p);
        }
        assert_eq!(s.recent_vaults.len(), MAX_RECENT_VAULTS);
    }

    #[test]
    fn record_close_clears_last_vault_but_keeps_recents() {
        let mut s = Settings::default();
        let p = std::env::temp_dir();
        std::fs::create_dir_all(&p).expect("mkdir");
        s.record_open(&p);
        assert!(s.last_vault.is_some());
        s.record_close();
        assert!(s.last_vault.is_none());
        assert!(!s.recent_vaults.is_empty());
    }

    #[test]
    fn reconcile_marks_missing_entries_unavailable() {
        let mut s = Settings::default();
        let existing = std::env::temp_dir();
        std::fs::create_dir_all(&existing).expect("mkdir");
        s.record_open(&existing);
        let missing = std::env::temp_dir().join("obsidiana-reconcile-missing");
        let _ = std::fs::remove_dir_all(&missing);
        s.recent_vaults.push(RecentVaultEntry {
            path: missing,
            last_opened: Utc::now(),
            available: true,
        });
        s.reconcile();
        let existing_canonical = std::fs::canonicalize(&existing).unwrap();
        let by_path = |p: &Path| -> bool {
            s.recent_vaults
                .iter()
                .find(|e| e.path == std::fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf()))
                .map(|e| e.available)
                .unwrap_or(false)
        };
        assert!(by_path(&existing_canonical));
        let missing_entry = s
            .recent_vaults
            .iter()
            .find(|e| {
                e.path
                    .file_name()
                    .map(|n| n == "obsidiana-reconcile-missing")
                    .unwrap_or(false)
            })
            .expect("missing entry should still be in the list");
        assert!(!missing_entry.available);
    }
}
