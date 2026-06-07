use crate::error::{AppError, AppResult};
use crate::index::ignore_set::IgnoreSet;
use crate::index::ingest::relative_posix;
use crate::index::ingest_incremental::{apply_change, apply_deletion};
use crate::index::watcher_event::WatcherEvent;
use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, DebouncedEvent, Debouncer};
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Manager, Runtime};

const DEBOUNCE: Duration = Duration::from_millis(200);
const STOP_POLL: Duration = Duration::from_millis(500);

pub struct WatcherHandle {
    debouncer: Option<Debouncer<notify::RecommendedWatcher>>,
    join: Option<thread::JoinHandle<()>>,
    stop_tx: Option<mpsc::Sender<()>>,
}

impl WatcherHandle {
    fn drop_pieces(&mut self) {
        if let Some(tx) = self.stop_tx.take() {
            let _ = tx.send(());
        }
        drop(self.debouncer.take());
        if let Some(j) = self.join.take() {
            let _ = j.join();
        }
    }
}

impl Drop for WatcherHandle {
    fn drop(&mut self) {
        self.drop_pieces();
    }
}

pub fn start<R: Runtime>(
    app: AppHandle<R>,
    root: &Path,
    index_db_path: Arc<Mutex<Option<PathBuf>>>,
    ignore: Arc<IgnoreSet>,
) -> AppResult<WatcherHandle> {
    let (event_tx, event_rx) = mpsc::channel::<DebounceEventResult>();
    let mut debouncer = new_debouncer(DEBOUNCE, move |res| {
        let _ = event_tx.send(res);
    })
    .map_err(|e| AppError::internal(format!("create debouncer: {e}")))?;
    debouncer
        .watcher()
        .watch(root, RecursiveMode::Recursive)
        .map_err(|e| AppError::internal(format!("watch {}: {e}", root.display())))?;
    let (stop_tx, stop_rx) = mpsc::channel();
    let root_buf = root.to_path_buf();
    let join = thread::Builder::new()
        .name("obsidiana-fs-watcher".into())
        .spawn(move || run_loop(event_rx, stop_rx, root_buf, index_db_path, ignore, app))
        .map_err(|e| AppError::internal(format!("spawn watcher thread: {e}")))?;
    Ok(WatcherHandle {
        debouncer: Some(debouncer),
        join: Some(join),
        stop_tx: Some(stop_tx),
    })
}

pub fn stop(mut handle: WatcherHandle) {
    handle.drop_pieces();
}

fn run_loop<R: Runtime>(
    rx: mpsc::Receiver<DebounceEventResult>,
    stop_rx: mpsc::Receiver<()>,
    root: PathBuf,
    index_db_path: Arc<Mutex<Option<PathBuf>>>,
    ignore: Arc<IgnoreSet>,
    app: AppHandle<R>,
) {
    loop {
        if stop_rx.try_recv().is_ok() {
            return;
        }
        match rx.recv_timeout(STOP_POLL) {
            Ok(Ok(events)) => {
                for ev in events {
                    handle_event(&ev, &root, &index_db_path, &ignore, &app);
                }
            }
            Ok(Err(err)) => {
                log::warn!("watcher: {err}");
            }
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => return,
        }
    }
}

fn handle_event<R: Runtime>(
    ev: &DebouncedEvent,
    root: &Path,
    index_db_path: &Arc<Mutex<Option<PathBuf>>>,
    ignore: &Arc<IgnoreSet>,
    app: &AppHandle<R>,
) {
    let path = ev.path.as_path();
    if !path.starts_with(root) {
        return;
    }
    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
        if name.starts_with('.') {
            return;
        }
    }
    // Skip files inside any hidden directory RELATIVE to root
    // (e.g. `.obsidiana/...`). The root itself may live inside a hidden
    // tempdir on the test runner; we only care about hidden segments
    // inside the vault.
    if let Ok(rel) = path.strip_prefix(root) {
        for component in rel.components() {
            if let std::path::Component::Normal(os) = component {
                if os.to_string_lossy().starts_with('.') {
                    return;
                }
            }
        }
    }
    if matches!(path.extension().and_then(|s| s.to_str()), Some("db") | Some("db-wal") | Some("db-shm"))
    {
        return;
    }
    if ignore.consume(path) {
        return;
    }
    let Some(db_path) = index_db_path.lock().ok().and_then(|g| g.clone()) else {
        return;
    };
    let conn = match open_conn(&db_path) {
        Ok(c) => c,
        Err(e) => {
            log::warn!("watcher: open conn: {e}");
            return;
        }
    };
    let rel = relative_posix(root, path);
    let path_exists = path.exists();
    let res = if path_exists {
        apply_change(&conn, root, path)
    } else {
        apply_deletion(&conn, &rel)
    };
    if let Err(e) = res {
        log::warn!("watcher: {rel}: {e}");
        return;
    }
    let event = if path_exists {
        let mtime = std::fs::metadata(path)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        WatcherEvent::Changed {
            rel_path: rel.clone(),
            mtime,
        }
    } else {
        WatcherEvent::Deleted {
            rel_path: rel.clone(),
        }
    };
    event.emit(app);
    if let Some(state) = app.try_state::<crate::state::AppState>() {
        if let Ok(mut snap) = state.index.lock() {
            let new_count: i64 = conn
                .query_row("SELECT COUNT(*) FROM documents", [], |r| r.get(0))
                .unwrap_or(-1);
            if new_count >= 0 {
                snap.document_count = new_count as u64;
            }
            // The watcher can be the first thing to bring the index to
            // life in a test (or in a recovery scenario where the
            // kick_off never finished). Treat any event that successfully
            // mutated the DB as proof the index is alive; flip Missing
            // or Indexing to Ready.
            if matches!(
                snap.state.state,
                crate::index::status::IndexStateKind::Missing
                    | crate::index::status::IndexStateKind::Indexing
            ) {
                let schema_ver: i64 = conn
                    .query_row("PRAGMA user_version", [], |r| r.get(0))
                    .unwrap_or(0);
                *snap = crate::index::status::IndexStatus::ready(
                    u32::try_from(schema_ver).unwrap_or(0),
                    snap.document_count,
                );
            }
        }
    }
}

fn open_conn(path: &Path) -> AppResult<rusqlite::Connection> {
    let conn = rusqlite::Connection::open(path)
        .map_err(|e| AppError::internal(format!("open {}: {e}", path.display())))?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| AppError::internal(format!("set foreign_keys: {e}")))?;
    Ok(conn)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::Instant;
    use tauri::test::{mock_builder, mock_context, noop_assets};
    use tauri::Manager;

    fn build_mock_app() -> tauri::App<tauri::test::MockRuntime> {
        let app = mock_builder()
            .build(mock_context(noop_assets()))
            .expect("mock app");
        let state = crate::state::AppState::new(std::path::PathBuf::from("/tmp/x.json"));
        app.manage(state);
        app
    }

    fn seed_state_for_watch(
        app: &tauri::App<tauri::test::MockRuntime>,
        vault: &Path,
    ) -> Arc<IgnoreSet> {
        let _ = crate::index::db::IndexDb::open(vault).expect("open");
        let s = app.state::<crate::state::AppState>();
        let mut g = s.index_db_path.lock().expect("lock");
        *g = Some(vault.join(".obsidiana").join("index.db"));
        Arc::new(IgnoreSet::new())
    }

    fn write_vault_note(root: &Path, rel: &str, body: &str) -> std::path::PathBuf {
        let p = root.join(rel);
        if let Some(parent) = p.parent() {
            fs::create_dir_all(parent).expect("mkdir parents");
        }
        fs::write(&p, body).expect("write");
        p
    }

    fn wait_for<F: FnMut() -> bool>(mut cond: F, timeout: Duration) -> bool {
        let start = Instant::now();
        while start.elapsed() < timeout {
            if cond() {
                return true;
            }
            thread::sleep(Duration::from_millis(40));
        }
        cond()
    }

    fn doc_count(app: &tauri::App<tauri::test::MockRuntime>) -> i64 {
        let s = app.state::<crate::state::AppState>();
        let snap = s.index.lock().expect("lock");
        i64::try_from(snap.document_count).unwrap_or(-1)
    }

    #[test]
    fn start_emits_event_on_external_write() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let vault = tmp.path().join("v");
        fs::create_dir(&vault).expect("mkdir");
        let app = build_mock_app();
        let ignore = seed_state_for_watch(&app, &vault);
        let s = app.state::<crate::state::AppState>();
        let watcher = start(app.handle().clone(), &vault, s.index_db_path.clone(), ignore).expect("start");
        thread::sleep(Duration::from_millis(50));
        let _file = write_vault_note(&vault, "external.md", "# ext\n");
        let gained = wait_for(|| doc_count(&app) == 1, Duration::from_secs(2));
        assert!(gained, "watcher should have indexed the new file within 2s");
        stop(watcher);
    }

    #[test]
    fn start_ignores_self_writes_via_ignore_set() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let vault = tmp.path().join("v");
        fs::create_dir(&vault).expect("mkdir");
        let app = build_mock_app();
        let ignore = seed_state_for_watch(&app, &vault);
        let s = app.state::<crate::state::AppState>();
        let watcher = start(app.handle().clone(), &vault, s.index_db_path.clone(), ignore.clone()).expect("start");
        thread::sleep(Duration::from_millis(50));
        let file = vault.join("self.md");
        ignore.record(&file);
        fs::write(&file, b"# self\n").expect("write");
        thread::sleep(Duration::from_millis(1_200));
        assert_eq!(doc_count(&app), 0, "self-write should be ignored by the watcher");
        stop(watcher);
    }

    #[test]
    fn start_ignores_dotfiles_and_obsidiana_dir() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let vault = tmp.path().join("v");
        fs::create_dir(&vault).expect("mkdir");
        let app = build_mock_app();
        let ignore = seed_state_for_watch(&app, &vault);
        let s = app.state::<crate::state::AppState>();
        let watcher = start(app.handle().clone(), &vault, s.index_db_path.clone(), ignore).expect("start");
        thread::sleep(Duration::from_millis(50));
        write_vault_note(&vault, ".hidden.md", "# h\n");
        write_vault_note(&vault, ".obsidiana/wal-file", "x");
        thread::sleep(Duration::from_millis(1_200));
        assert_eq!(doc_count(&app), 0, "dotfiles and .obsidiana/ entries must be skipped");
        stop(watcher);
    }

    #[test]
    fn start_emits_deletion_event_on_file_remove() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let vault = tmp.path().join("v");
        fs::create_dir(&vault).expect("mkdir");
        let app = build_mock_app();
        let ignore = seed_state_for_watch(&app, &vault);
        let s = app.state::<crate::state::AppState>();
        let watcher = start(app.handle().clone(), &vault, s.index_db_path.clone(), ignore).expect("start");
        thread::sleep(Duration::from_millis(50));
        let file = write_vault_note(&vault, "to-delete.md", "# x\n");
        let gained = wait_for(|| doc_count(&app) == 1, Duration::from_secs(2));
        assert!(gained, "watcher should have indexed the file first");
        fs::remove_file(&file).expect("delete");
        let removed = wait_for(|| doc_count(&app) == 0, Duration::from_secs(2));
        assert!(removed, "watcher should have removed the file from the index");
        stop(watcher);
    }

    #[test]
    fn start_then_stop_then_start_works() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let vault = tmp.path().join("v");
        fs::create_dir(&vault).expect("mkdir");
        let app = build_mock_app();
        let ignore = seed_state_for_watch(&app, &vault);
        let s = app.state::<crate::state::AppState>();
        let w1 = start(app.handle().clone(), &vault, s.index_db_path.clone(), ignore.clone()).expect("start1");
        thread::sleep(Duration::from_millis(30));
        stop(w1);
        let w2 = start(app.handle().clone(), &vault, s.index_db_path.clone(), ignore.clone()).expect("start2");
        thread::sleep(Duration::from_millis(30));
        stop(w2);
    }

    #[test]
    fn handle_event_skips_db_wal_shm() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let vault = tmp.path().join("v");
        fs::create_dir(&vault).expect("mkdir");
        let index_db_path: Arc<Mutex<Option<PathBuf>>> = Arc::new(Mutex::new(None));
        let ignore: Arc<IgnoreSet> = Arc::new(IgnoreSet::new());
        let ev = DebouncedEvent {
            path: vault.join(".obsidiana").join("index.db-wal"),
            kind: notify_debouncer_mini::DebouncedEventKind::Any,
        };
        let app = build_mock_app();
        // Should be a no-op (hidden dir + db extension); no panic, no return value to assert.
        handle_event(&ev, &vault, &index_db_path, &ignore, app.handle());
    }
}
