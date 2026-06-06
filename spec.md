# OBSIDIANA — Technical Spec

> Living document. Date each amendment at the top of the change log below.
> Implementation-agnostic where possible. The "how" lives in `AGENTS.md` and the code.

## Change Log

- 2026-06-05 — §2.7 mode toggle shipped. Editor chrome now ships a 3-mode Source / Live Preview / Reading view toggle backed by a session-only Zustand store (`useEditorModeStore`). The `?lp=0` URL flag from 2.6 is removed. Reading view renders the Rust-sanitized `render_markdown` html via `dangerouslySetInnerHTML` inside a new `<ReadingView>` component. Per-note mode persistence deferred to 2.7.x.
- 2026-06-05 — §2.6 inline render pipeline shipped (ADR-001 followed: Rust `markdown-rs`, char-range source map, sanitized HTML, Live Preview on by default with `?lp=0` shim until 2.7 ships the real mode toggle).
- 2026-06-05 — ADR-001: Markdown engine pinned to Rust `markdown-rs` (resolves the open question in §2.1).
- 2026-06-02 — Initial draft (Block 2 of project-kickoff). Refined for edge cases, race conditions, and security.

## 1. Product Layer

### 1.1 User journey

1. **First launch.** App opens to an empty state with a "Open vault" button. User picks a local folder via the OS-native dialog. Folder path is stored in `settings.json` under the OS application data directory (not in the vault itself, to keep the vault portable and not pollute it with app metadata).
2. **Subsequent launches.** App remembers the most recently used vault and reopens it. A "Switch vault" action in the sidebar header lets the user pick another folder or open a different recent vault.
3. **Daily use.**
   - Sidebar shows the vault's folder tree, a search box (tag/link search only in MVP — no full-text), and a "Backlinks" panel.
   - Center pane is a tabbed editor; each tab is one open note. Tabs persist across sessions.
   - Right pane is contextual: backlinks for the active note, or a graph view, or Git status.
4. **Sync.** A footer indicator shows Git state. User clicks it to pull / commit / push. Conflicts halt the auto-flow and surface a manual resolution prompt.

### 1.2 Choice points (explicit)

| Choice                         | MVP decision                                                         |
| ------------------------------ | -------------------------------------------------------------------- |
| Vault location                 | User-chosen local folder (no default, no cloud vault)                |
| Single vault vs. multi-vault   | Single active vault at a time; recent-vault list supports switching   |
| Sync mechanism                 | Local Git (manual trigger + status indicator)                        |
| Sync conflict handling         | Auto-halt on conflict; manual resolution UI; never destructive       |
| Editor mode                    | CodeMirror 6, Source mode only (Live Preview / Preview deferred)     |
| Search scope                   | Link + tag metadata only (no full-text in MVP)                       |
| Plugin / AI support            | Out of MVP                                                            |

## 2. Technical Layer

### 2.1 Hard constraints

- **Shell:** Tauri v2. The app is a single desktop binary, no separate server.
- **Frontend:** React 18 + TypeScript + Vite. Tailwind CSS for styling. No external UI kits.
- **Editor:** CodeMirror 6 with the basic Setup, Markdown language, and a wikilink syntax extension.
- **Backend:** Rust. All filesystem, indexing, and Git operations go through Rust commands invoked via Tauri IPC.
- **Markdown engine:** Rust `markdown-rs` (CommonMark + GFM). Decision recorded as ADR-001 in `docs/architecture.md`. Preprocessor and renderer both run in Rust on `tokio::task::spawn_blocking` worker threads.
- **Database:** SQLite via `rusqlite`, bundled, FTS5 disabled in MVP. Single file at `<vault>/.obsidiana/index.db` (gitignored, regenerable).
- **Filesystem watcher:** `notify` crate, debounced 200 ms.
- **Graph rendering:** `react-force-graph` with Canvas/WebGL backend.
- **Deployment target:** Tauri builds for macOS, Windows, Linux. No auto-update server in MVP — distribution is manual download / package manager.

### 2.2 State management

- Frontend holds transient UI state in Zustand (or React context — pick one in `AGENTS.md`).
- All persistent state lives in either the vault's Markdown files (truth) or `<vault>/.obsidiana/index.db` (cache).
- App-level settings live in `<os-app-data>/com.obsidiana.app/settings.json` (paths, recent vaults, window geometry, theme).

## 3. Database Schema (SQLite)

```sql
-- Core document index
CREATE TABLE documents (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path       TEXT    UNIQUE NOT NULL,   -- relative to vault root
    title           TEXT    NOT NULL,          -- filename without .md, or H1 if present
    last_modified   DATETIME DEFAULT CURRENT_TIMESTAMP,
    frontmatter_json TEXT   NULL
);

CREATE INDEX idx_documents_title   ON documents(title);
CREATE INDEX idx_documents_path    ON documents(file_path);

-- Note connections (links from source → target)
CREATE TABLE connections (
    source_id          INTEGER NOT NULL,
    target_path        TEXT    NOT NULL,        -- raw link text, normalized
    resolved_target_id INTEGER NULL,            -- NULL if target file does not exist
    kind               TEXT    NOT NULL,        -- 'wikilink' | 'embed' | 'block-ref'
    block_id           TEXT    NULL,            -- only set for block-ref
    PRIMARY KEY (source_id, target_path, block_id),
    FOREIGN KEY (source_id)          REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (resolved_target_id) REFERENCES documents(id) ON DELETE SET NULL
);

CREATE INDEX idx_connections_target ON connections(resolved_target_id);

-- Tag taxonomy
CREATE TABLE tags (
    document_id  INTEGER NOT NULL,
    tag_name     TEXT    NOT NULL,              -- e.g. 'parent/child'
    PRIMARY KEY (document_id, tag_name),
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX idx_tags_name ON tags(tag_name);

-- Vault metadata (single-row table, vault_path stored for sanity checks)
CREATE TABLE vault_meta (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    schema_ver  INTEGER NOT NULL,
    opened_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Schema migrations are versioned: on startup, the Rust backend reads `schema_ver` and runs any pending migrations. The index is regenerable: deleting `index.db` and reopening the vault rebuilds it from scratch.

## 4. API Routes (Tauri IPC commands)

All commands return `Result<T, AppError>` where `AppError` is a serializable enum surfaced to the frontend.

### 4.1 Vault lifecycle

| Command                       | Args                                    | Returns                          |
| ----------------------------- | --------------------------------------- | -------------------------------- |
| `pick_vault`                  | —                                       | `Option<VaultInfo>`              |
| `open_vault`                  | `path: String`                          | `VaultInfo`                      |
| `close_vault`                 | —                                       | `()`                             |
| `list_recent_vaults`          | —                                       | `Vec<RecentVault>`               |

### 4.2 Filesystem & tree

| Command                       | Args                                    | Returns                          |
| ----------------------------- | --------------------------------------- | -------------------------------- |
| `list_tree`                   | `path: Option<String>`                  | `Vec<TreeNode>`                  |
| `read_note`                   | `path: String`                          | `NoteContent`                    |
| `write_note`                  | `path: String, content: String`         | `WriteResult`                    |
| `create_note`                 | `path: String, template: Option<String>`| `NoteContent`                    |
| `delete_note`                 | `path: String`                          | `()`                             |
| `rename_note`                 | `from: String, to: String`              | `RenameReport`                   |

### 4.3 Index & search

| Command                       | Args                                    | Returns                          |
| ----------------------------- | --------------------------------------- | -------------------------------- |
| `index_status`                | —                                       | `IndexStatus`                    |
| `rebuild_index`               | —                                       | `()`                             |
| `get_backlinks`               | `path: String`                          | `Vec<BacklinkRef>`               |
| `get_tags_for_note`           | `path: String`                          | `Vec<String>`                    |
| `resolve_wikilink`            | `target: String, source_path: String`   | `ResolvedLink`                   |

### 4.4 Graph

| Command                       | Args                                    | Returns                          |
| ----------------------------- | --------------------------------------- | -------------------------------- |
| `graph_snapshot`              | `filter: GraphFilter`                   | `GraphData` (nodes + edges)      |

### 4.5 Git sync

| Command                       | Args                                    | Returns                          |
| ----------------------------- | --------------------------------------- | -------------------------------- |
| `git_status`                  | —                                       | `GitStatus`                      |
| `git_pull`                    | —                                       | `GitOutcome`                     |
| `git_commit`                  | `message: String`                       | `GitOutcome`                     |
| `git_push`                    | —                                       | `GitOutcome`                     |
| `git_init_if_needed`          | —                                       | `()`                             |

### 4.6 Quartz publishing

| Command                       | Args                                    | Returns                          |
| ----------------------------- | --------------------------------------- | -------------------------------- |
| `quartz_publish`              | `target: PublishTarget`                 | `PublishReport`                  |

## 5. UI/UX Component Hierarchy

```
<App>
├── <TitleBar>                       # native, OS-drawn by Tauri
├── <Layout>
│   ├── <Sidebar>
│   │   ├── <VaultSwitcher>          # current vault name + "Switch vault" + recents
│   │   ├── <SearchBox>              # tag/link only in MVP
│   │   ├── <FileTree>               # virtualized folder tree, right-click menu
│   │   └── <BacklinksPanel>         # hidden when not on a note
│   ├── <EditorPane>
│   │   ├── <TabBar>                 # open notes, drag-to-reorder
│   │   ├── <CodeMirrorEditor>       # Source mode only
│   │   └── <OutlinePane>            # H1/H2/H3 derived from AST
│   └── <RightPane>                  # tabs: Backlinks | Graph | Git
│       ├── <GraphView>              # react-force-graph canvas
│       └── <GitPanel>               # status, diff stat, pull/commit/push
└── <StatusBar>                      # sync state, index health, vault path
```

### 5.1 Component rules

- `<FileTree>` is virtualized for vaults with thousands of files. Lazy load subtrees.
- `<GraphView>` enforces a hard cap (1,000 nodes by default) and a "Show more" pagination step. Orphan notes can be hidden via a toggle.
- `<CodeMirrorEditor>` debounces saves (500 ms) and writes through `write_note` IPC.
- `<BacklinksPanel>` re-fetches on `active-note-changed` and on `index-updated` events emitted by Rust.

## 6. Edge Cases & Race Conditions

This section is filled in after the AI refinement pass.

### 6.1 Filesystem

- **External edits.** A user may edit a file in another editor while OBSIDIANA has it open in a tab. The watcher must detect the change, re-read the file, and update the in-memory buffer **only if** the buffer is not dirty. If the buffer is dirty, surface a "file changed on disk" banner with reload/discard options. **Never** silently overwrite a dirty buffer.
- **Rename during edit.** If a file is renamed on disk while it has a dirty tab, the tab stays on the old path; on save, the Rust backend writes to the new path (and re-indexes) but reports a "saved to <new path>" notice.
- **Delete during edit.** If a file is deleted on disk, the tab shows a "file missing" banner; save attempts fail with `AppError::FileMissing`.
- **Watch loop feedback.** The watcher must ignore its own writes. All writes from `write_note` go through a function that records the path in a short-lived ignore set (TTL ~1 s) so the watcher does not re-trigger itself into a parse → re-write loop.
- **Rapid bursts.** Editor autosave can fire faster than the watcher's 200 ms debounce. The watcher must coalesce events and the parser must be idempotent on identical content.
- **Symlinks and case-insensitive filesystems (macOS HFS+/APFS default).** Use canonical, real paths internally; never compare paths by string equality alone. Normalize via `dunce` (Windows) and `std::fs::canonicalize` plus case-fold for matching.
- **Vault moved or renamed.** Detected on startup by comparing `settings.json` recent path to the on-disk path. If missing, mark the recent entry as `unavailable`; do not auto-purge.

### 6.2 Indexing

- **Index corruption.** On startup, run `PRAGMA integrity_check`. If it fails, rename the bad DB to `index.db.broken-<timestamp>` and rebuild from scratch. Never crash on a bad index.
- **Index missing or older than schema.** Run pending migrations or rebuild. Never block UI on this; do it in the background and surface a "Indexing…" status.
- **Two files with the same title (different folders).** Wikilink resolution must use **shortest path** matching: pick the file with the shortest relative path from the source. Ties broken by alphabetical order. Document this rule in `AGENTS.md`.
- **Wikilink to non-existent file.** `resolved_target_id = NULL`; frontend renders a broken-link style and offers "Create note" on click.
- **Embed recursion.** `![[note#section]]` embeds must enforce a 3-level recursion limit. Cycles are detected and broken with an error placeholder.
- **Block references.** Multiple `^block-id` in the same file are an error; the parser uses the first occurrence and logs a warning surfaced in the editor's gutter.

### 6.3 Git sync

- **No remote configured.** `git_pull` and `git_push` must fail with a clear, actionable `AppError::NoRemote`. Never fall back to a default remote.
- **Merge conflicts.** `git_pull --ff-only` is the only fast path. If fast-forward is impossible, halt auto-sync, surface the conflicting files in the Git panel, and require manual resolution outside the app (or a future in-app merge tool).
- **Detached HEAD / shallow clone / no commits yet.** All cases handled: a vault with no commits gets an initial `git_init_if_needed` flow that creates a `main` branch and an empty initial commit on first commit.
- **Auth failure.** SSH / HTTPS credential failures are reported as `AppError::GitAuth`; the user is told to configure credentials outside the app. We never store or proxy credentials.
- **Concurrent sync.** Sync is guarded by a single in-process mutex; a second click while sync is running is a no-op with a toast "Sync already in progress".
- **Sync while a file is dirty.** Block sync if any tab is dirty; prompt to save or discard first.

### 6.4 Editor & UI

- **Large file (≥ 1 MB).** CodeMirror's viewport virtualizes rendering; the Markdown parser runs on a worker thread and the result is cached by content hash. Never parse the whole file on every keystroke.
- **Tab explosion.** Cap open tabs at 50; oldest untouched tab is closed on overflow (with a "reopen" entry in the recent-tabs menu).
- **Unsaved changes on quit.** Block the close event, show a save/discard/cancel prompt per dirty tab.
- **Theme and OS appearance.** Follow OS light/dark mode by default; expose a manual override in settings.

## 7. Security Notes

### 7.1 Sandbox boundary

- The Tauri WebView runs the frontend. The frontend **never** receives absolute filesystem paths. All paths in IPC responses are relative to the vault root, with `..` segments stripped and `\` normalized to `/` on Windows.
- The Rust backend is the only component that calls `std::fs` operations. The frontend cannot escape the vault.

### 7.2 Filesystem capabilities

- Tauri v2 capabilities must whitelist only the IPC commands the frontend needs; no blanket `fs:allow-all`.
- The vault path is set at runtime; no command accepts an arbitrary absolute path from the frontend. `pick_vault` is the only way to obtain a new vault root.

### 7.3 Git safety

- `git` is invoked as a child process with arguments passed as an array (never via a shell). Working directory is the vault root, set explicitly per call.
- `--force` flags are never used. No `git reset --hard` is exposed.
- Pull is always `--ff-only`; the app refuses to merge or rebase automatically.

### 7.4 Renderer safety

- Markdown rendered to HTML must be sanitized. The HTML transformer (Rust) strips `<script>`, `<iframe>`, `on*` attributes, and `javascript:` URLs. `href` values inside rendered notes are restricted to:
  - Relative paths inside the vault (resolved and validated)
  - `http://` and `https://` (allowed)
  - `mailto:` (allowed)
- Wikilinks and embeds are reconstructed server-side from the AST, not from raw HTML in the Markdown.

### 7.5 Settings & secrets

- `settings.json` holds no secrets. It contains paths, recents, window geometry, theme.
- The app does not store Git credentials. Users configure SSH keys or HTTPS credential helpers via their normal Git setup.

### 7.6 Update channel

- Tauri auto-updater is **not** enabled in MVP. Updates are manual downloads from the project's release page. This avoids a remote-code-execution update channel before the security model is hardened.

### 7.7 Input validation

- Every IPC command validates its inputs. File paths are rejected if they contain `..`, null bytes, or escape the vault root after normalization. `rename_note` and `create_note` both check for path collisions before touching the filesystem.

### 7.8 Logging

- Logs are written to the OS application data directory and rotated. Logs **never** contain note content — only paths, operation names, error codes, and durations.
