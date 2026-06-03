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
- CodeMirror 6 (editor — basic Source view; Live Preview / Preview deferred)
- Tailwind CSS (styling)
- `remark-parse` + `unified` (Markdown → AST → HTML)
- SQLite via `rusqlite` (link / tag / metadata index; no `sqlite-vec` for now)
- `notify` crate (debounced filesystem watcher)
- `react-force-graph` (graph visualization)
- Git CLI (sync, invoked from Rust)
- Quartz (static-site publishing, invoked from Rust)

## Features

Core editor & linking:

- [x] Open a local folder as a vault; persist recent vaults in `settings.json` (micro-feature 1.3)
- [ ] File tree navigation (folders + Markdown files)
- [ ] Open, edit, save Markdown files in a CodeMirror 6 editor (Source mode)
- [ ] Wikilinks `[[note]]` with shortest-path resolution and broken-link styling
- [ ] Tags `#parent/child` extracted and listed per note
- [ ] Backlinks panel showing incoming links to the active note
- [ ] Custom callouts / admonitions via Rust regex preprocessor
- [ ] Note embeds `![[note#section]]` with recursion limit (3 levels)
- [ ] Block references `^block-id` registered as linkable targets

Indexing & graph:

- [ ] SQLite index of documents, connections, and tags
- [ ] Debounced filesystem watcher (200 ms) keeping the index in sync
- [ ] Real-time link refactor on file rename/move
- [ ] Force-directed graph view (repulsion + link tension + gravity)
- [ ] Local graph filter (N-hop neighborhood of the active note)
- [ ] Label opacity fading on zoom

Sync & publishing:

- [ ] Git sync UI: pull, commit, push with conflict detection
- [ ] Quartz publishing pipeline (build + deploy to GitHub Pages)

Explicitly out of MVP (deferred to a later stage):

- Full-text search (only link/tag metadata is indexed in MVP)
- CodeMirror Live Preview and read-only Preview modes
- Local AI (Ollama chat, Whisper transcription, MCP server)
- Sandboxed plugin runtime (iframe / WASM)

## Implementation Stages

1. **Tauri shell + filesystem core** — vault picker, recent vaults, file tree, open/save Markdown in CodeMirror.
2. **Markdown engine + linking** — Rust preprocessor + remark-parse pipeline; wikilinks, tags, callouts, embeds, block refs; backlinks panel.
3. **SQLite index + watcher** — schema migrations, debounced `notify` watcher, real-time link refactor on rename/move.
4. **Graph view** — react-force-graph rendering indexed connections; local filter, zoom-fade, click-to-open.
5. **Git sync + Quartz publishing** — in-app pull/commit/push with conflict halt; Quartz build + GitHub Pages deploy.
6. **(Deferred)** Local AI stack and sandboxed plugin runtime — not part of MVP.

## Current Stage

`Current Stage: 1 — Tauri shell + filesystem core`

## Notes & Decisions

- All note content lives in plain Markdown on disk. SQLite is a cache, not the source of truth.
- The user opted **out** of `sqlite-vec` for MVP. Vector search arrives with the AI stage.
- The user opted **out** of the 3-mode CodeMirror toggle for MVP. Source mode is the only editor state in MVP; Live Preview and read-only Preview are deferred.
- Full-text search is deferred — only link and tag metadata is indexed in MVP.
- Local AI (Ollama, Whisper, MCP server) and the plugin runtime are deferred past MVP, since they require heavier infra (local model hosting, sandboxing).
- Sandbox boundary: Rust uses absolute paths; the frontend only sees sanitized relative paths inside the active vault.
- Reference blueprint: see `spec.md` (Block 2) and the original kickoff brief in this conversation.
