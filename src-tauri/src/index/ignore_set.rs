use std::path::Path;
use std::time::{Duration, Instant};

const TTL: Duration = Duration::from_millis(1_000);

#[derive(Default)]
pub struct IgnoreSet {
    inner: std::sync::Mutex<std::collections::HashMap<std::path::PathBuf, Instant>>,
}

impl IgnoreSet {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn record(&self, path: &Path) {
        let canonical = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        if let Ok(mut g) = self.inner.lock() {
            g.insert(canonical, Instant::now());
        }
    }

    pub fn consume(&self, path: &Path) -> bool {
        let canonical = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        let now = Instant::now();
        if let Ok(mut g) = self.inner.lock() {
            g.retain(|_, t| now.duration_since(*t) < TTL);
            g.remove(&canonical).is_some()
        } else {
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::thread;

    #[test]
    fn record_then_consume_within_ttl_returns_true() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let file = tmp.path().join("note.md");
        fs::write(&file, b"# x\n").expect("write");
        let set = IgnoreSet::new();
        set.record(&file);
        assert!(set.consume(&file), "consume should return true within TTL");
    }

    #[test]
    fn consume_after_ttl_returns_false() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let file = tmp.path().join("note.md");
        fs::write(&file, b"# x\n").expect("write");
        let set = IgnoreSet::new();
        set.record(&file);
        thread::sleep(Duration::from_millis(1_100));
        assert!(!set.consume(&file), "consume should return false after TTL");
    }

    #[test]
    fn record_twice_for_same_path_refreshes_ttl() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let file = tmp.path().join("note.md");
        fs::write(&file, b"# x\n").expect("write");
        let set = IgnoreSet::new();
        set.record(&file);
        thread::sleep(Duration::from_millis(700));
        set.record(&file);
        thread::sleep(Duration::from_millis(500));
        assert!(
            set.consume(&file),
            "second record should refresh the TTL past 1.2s elapsed"
        );
    }
}
