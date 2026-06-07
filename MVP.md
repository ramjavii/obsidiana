# OBSIDIANA — MVP Plan

## Overview

A local-first, single-user, cross-platform desktop Markdown knowledge
workspace. Users pick a local folder as their vault, write Markdown
files in a fast editor, link notes with `[[wikilinks]]`, organize
with tags, explore connections in a force-directed graph, and
synchronize via Git. No proprietary cloud, no telemetry, no required
accounts.

## Tech Stack

- Tauri v2 (desktop shell — minimal binary, OS WebView)
- Rust (backend, IPC commands, background workers)
- React + TypeScript + Vite (frontend)
- CodeMirror 6 (editor — basic Source view; Live Preview / Preview planned in micro-features 2.5–2.7)
- Tailwind CSS (styling)
- Markdown engine: Rust `markdown-rs` (CommonMark + GFM) running in `src-tauri/src/markdown/`. See ADR-001 in `docs/architecture.md`.
- SQLite via `rusqlite` (link / tag / metadata index; no `sqlite-vec` for now)
- `notify` crate (debounced filesystem watcher)
- `react-force-graph` (graph visualization)
- Git CLI (sync, invoked from Rust)
- Quartz (static-site publishing, invoked from Rust)

## Features

Core editor & linking:

- [x] Open a local folder as a vault; persist recent vaults in `settings.json` (micro-feature 1.3)
- [x] File tree navigation (folders + Markdown files) (micro-feature 1.4)
- [x] Open, edit, save Markdown files in a CodeMirror 6 editor (Source mode) (micro-feature 1.5)
- [x] Wikilinks `[[note]]` with shortest-path resolution and broken-link styling
  - [x] 2.1: extract wikilinks via Rust preprocessor (IPC: `extract_wikilinks`)
  - [x] 2.2: resolve wikilinks with shortest-path matching (IPC: `resolve_wikilink`)
  - [x] 2.3: CodeMirror syntax highlighting for `[[note]]`
  - [x] 2.4: click-to-jump on resolved wikilinks; broken-link styling + "Create note" affordance
  - [ ] Live Preview / Obsidian-like WYSIWYG editor
    - [x] 2.5: pick markdown engine (ADR-001: Rust `markdown-rs`); ADR in `docs/architecture.md`
    - [x] 2.6: inline render pipeline — bold, italic, headings, inline code, fenced code, links, and resolved wikilinks render visually while the cursor stays in source positions
    - [x] 2.7: mode toggle in the editor chrome (Source / Live Preview / Reading view)
- [x] Tags `#parent/child` extracted and listed per note
  - [x] 2.8: extract tags via Rust preprocessor (IPC: `get_tags_for_note`)
  - [x] 2.8: tags displayed in the right-pane TagsPanel (chip strip with count, error, empty states)
- [ ] Backlinks panel showing incoming links to the active note
- [ ] Custom callouts / admonitions via Rust regex preprocessor
- [ ] Note embeds `![[note#section]]` with recursion limit (3 levels)
- [ ] Block references `^block-id` registered as linkable targets

Indexing & graph:

- [x] SQLite index of documents, connections, and tags
  - [x] 3.1: schema migrations + handle + integrity check; `index_status` and `rebuild_index` IPC; status chip in the header (see `docs/architecture.md` for ADR notes)
  - [x] 3.1.x: document/connection/tag ingestion from the existing preprocessor pipeline; indexer task kept in sync with vault opens
  - [x] 3.2: debounced filesystem watcher (200 ms) keeping the index in sync
    - 200 ms `notify` + `notify-debouncer-mini` debouncer over the vault root; ignores dotfiles, hidden-dir components, `.obsidiana/`, `.db`/`.db-wal`/`.db-shm`, paths outside the vault, and self-writes recorded into a 1 s TTL `IgnoreSet` (see `docs/architecture.md` 3.2 section)
    - Tauri event bus: `obsidiana://fs-change` with `WatcherChange = { kind: "changed", path } | { kind: "deleted", path }`; emitted from the worker thread, consumed in the Editor via `useWatcher` (silent re-read on clean buffer, `data-testid="fs-change-reload-needed"` placeholder banner on dirty buffer; visible Reload/Discard banner is a 3.2.1 follow-up)
  - [x] 3.3: real-time link refactor on file rename/move
- [ ] Force-directed graph view (repulsion + link tension + gravity)
- [ ] Local graph filter (N-hop neighborhood of the active note)
- [ ] Label opacity fading on zoom

Sync & publishing:

- [ ] Git sync UI: pull, commit, push with conflict detection
- [ ] Quartz publishing pipeline (build + deploy to GitHub Pages)

Explicitly out of MVP (deferred to a later stage):

- Full-text search (only link/tag metadata is indexed in MVP)
- Local AI stack:
  - Ollama chat with vault context
  - Whisper transcription
  - MCP server exposing vault tools
- Embedded opencode terminal panel — dockable terminal inside the app shell that runs the opencode CLI with the active vault as CWD; can read the active note, the file tree, and the index. Useful for in-app AI assistance and ad-hoc vault scripting.
- Sandboxed plugin runtime (iframe / WASM)

## Implementation Stages

1. **Tauri shell + filesystem core** — vault picker, recent vaults, file tree, open/save Markdown in CodeMirror.
2. **Markdown engine + linking** — Rust preprocessor + remark-parse pipeline; wikilinks, tags, callouts, embeds, block refs; backlinks panel.
3. **SQLite index + watcher** — schema migrations, debounced `notify` watcher, real-time link refactor on rename/move.
4. **Graph view** — react-force-graph rendering indexed connections; local filter, zoom-fade, click-to-open.
5. **Git sync + Quartz publishing** — in-app pull/commit/push with conflict halt; Quartz build + GitHub Pages deploy.
6. **(Deferred)** Local AI stack and sandboxed plugin runtime — not part of MVP.

## Current Stage

`Current Stage: 3 — SQLite index + watcher`

The 3.1 micro-feature (schema + handle + status IPC + rebuild IPC) and
3.1.x (ingestion engine wiring) are both shipped; 3.2 watcher and 3.3
rename refactor are the remaining sub-features in this stage. The
header status chip and the `index-rebuild` slash command are the
user-visible surfaces of 3.1.

## Notes & Decisions

- All note content lives in plain Markdown on disk. SQLite is a cache, not the source of truth.
- The user opted **out** of `sqlite-vec` for MVP. Vector search arrives with the AI stage.
- The user has reconsidered the 3-mode editor. Obsidian-like Live Preview (inline render of bold, italic, headings, code, links, wikilinks) is wanted in MVP; a Source / Live Preview / Reading view toggle ships in micro-feature 2.7. Source mode is the only state in 1.5 and stays as a default fallback.
- The markdown engine is still undecided. Live Preview (2.5–2.6) is the first feature that actually needs the engine; the decision is forced there.
- Editor mode (2.7) is a single global session-only setting (Zustand in-memory, no persistence). Per-note mode persistence is a 2.7.x follow-up; the SQLite index is stage 3 work, so per-note mode is deferred alongside it. The `?lp=0` URL flag that was the temporary shim during 2.6 is gone as of 2.7 — the toggle in the editor chrome is the canonical control.
- Indexer architecture (3.1): the snapshot the frontend polls is an in-memory `Arc<Mutex<IndexStatus>>` on `AppState`; the `rusqlite::Connection` is created and consumed only inside `tauri::async_runtime::spawn_blocking` so the IPC thread is never blocked on I/O. The handle is owned by the spawned task and dropped on completion, re-opening the DB on the next rebuild. The 2 s status poll is the chosen alternative to a Tauri event bus for 3.1; the watcher (3.2) is the first candidate to graduate to a real event stream.
- Full-text search is deferred — only link and tag metadata is indexed in MVP.
- Local AI (Ollama, Whisper, MCP server) and the plugin runtime are deferred past MVP, since they require heavier infra (local model hosting, sandboxing).
- Embedded opencode terminal panel is deferred to a later stage (see "Explicitly out of MVP"). It is NOT a part of the Local AI stack — it is a developer-ergonomics feature for using opencode from inside the app against the user's vault.
- Sandbox boundary: Rust uses absolute paths; the frontend only sees sanitized relative paths inside the active vault.
- Reference blueprint: see `spec.md` (Block 2) and the original kickoff brief in this conversation.
