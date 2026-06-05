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
- Markdown engine: TBD — choose Rust `markdown-rs` (richer CommonMark, single-process) vs JS `remark-parse` + `unified` in a Web Worker (more plugins, more JS bundle). Pick in micro-feature 2.5 with an ADR.
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
- [ ] Wikilinks `[[note]]` with shortest-path resolution and broken-link styling
  - [x] 2.1: extract wikilinks via Rust preprocessor (IPC: `extract_wikilinks`)
  - [x] 2.2: resolve wikilinks with shortest-path matching (IPC: `resolve_wikilink`)
  - [x] 2.3: CodeMirror syntax highlighting for `[[note]]`
  - [ ] 2.4: click-to-jump on resolved wikilinks; broken-link styling + "Create note" affordance
- [ ] Live Preview / Obsidian-like WYSIWYG editor
  - [ ] 2.5: pick markdown engine (Rust `markdown-rs` vs JS `remark-parse` in a Web Worker); ADR in `docs/architecture.md`
  - [ ] 2.6: inline render pipeline — bold, italic, headings, inline code, fenced code, links, and resolved wikilinks render visually while the cursor stays in source positions
  - [ ] 2.7: mode toggle in the editor chrome (Source / Live Preview / Reading view)
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

`Current Stage: 2 — Markdown engine + linking`

## Notes & Decisions

- All note content lives in plain Markdown on disk. SQLite is a cache, not the source of truth.
- The user opted **out** of `sqlite-vec` for MVP. Vector search arrives with the AI stage.
- The user has reconsidered the 3-mode editor. Obsidian-like Live Preview (inline render of bold, italic, headings, code, links, wikilinks) is wanted in MVP; a Source / Live Preview / Reading view toggle ships in micro-feature 2.7. Source mode is the only state in 1.5 and stays as a default fallback.
- The markdown engine is still undecided. Live Preview (2.5–2.6) is the first feature that actually needs the engine; the decision is forced there.
- Full-text search is deferred — only link and tag metadata is indexed in MVP.
- Local AI (Ollama, Whisper, MCP server) and the plugin runtime are deferred past MVP, since they require heavier infra (local model hosting, sandboxing).
- Embedded opencode terminal panel is deferred to a later stage (see "Explicitly out of MVP"). It is NOT a part of the Local AI stack — it is a developer-ergonomics feature for using opencode from inside the app against the user's vault.
- Sandbox boundary: Rust uses absolute paths; the frontend only sees sanitized relative paths inside the active vault.
- Reference blueprint: see `spec.md` (Block 2) and the original kickoff brief in this conversation.
