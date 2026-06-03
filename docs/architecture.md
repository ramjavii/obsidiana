# OBSIDIANA — Architecture

> Living document. Updated on every feature commit (see AGENTS.md
> "Auto-Updating Docs Rule"). Read this alongside `MVP.md` and `spec.md`.

## Overview

OBSIDIANA is a local-first, single-user, cross-platform desktop Markdown
knowledge workspace built on Tauri v2 + Rust + React. Flat Markdown files
are the single source of truth; a SQLite index is a regenerable cache.

## Project Tree

```
obsidiana/
├── .gitignore
├── .obsidiana/                  # gitignored — generated index & runtime cache
├── AGENTS.md                    # AI agent rules (loaded every session)
├── MVP.md                       # MVP plan & feature checkboxes
├── docs/
│   └── architecture.md          # this file
├── opencode.json                # project-level AI agent config
└── spec.md                      # technical spec
```

> The tree is updated on every commit that adds, removes, or renames
> files. Do not commit the actual code tree until the first micro-feature
> is scaffolded — this is the placeholder state.

## Architectural Decisions

| Date       | Decision                                                                                                          | Rationale                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 2026-06-02 | Tauri v2 (not Electron) for the desktop shell.                                                                    | Minimal binary, low idle RAM, native WebView, Rust backend. See spec.md §2.1.                   |
| 2026-06-02 | SQLite (`rusqlite`) for the link/tag index; **no `sqlite-vec` in MVP**.                                            | Vector search is only useful once local AI lands. Defer until stage 6.                          |
| 2026-06-02 | Markdown source of truth; SQLite is a regenerable cache at `<vault>/.obsidiana/index.db`.                         | Vault remains portable, plain-text, readable in any editor. The index is disposable.             |
| 2026-06-02 | Git sync via CLI child process with explicit args array; `--ff-only` only.                                        | Avoids shell-injection; refuses destructive auto-merges. See spec.md §7.3.                       |
| 2026-06-02 | CodeMirror 6 in MVP — Source mode only. Live Preview and read-only Preview deferred.                              | Live Preview is a non-trivial renderer; ship Source first, add modes after the editor is solid. |
| 2026-06-02 | Local AI (Ollama, Whisper, MCP) and plugin runtime deferred past MVP.                                            | They need a hardened sandbox and a content model. Ship the core workspace first.                  |

## IPC Commands

See `spec.md` §4 for the full contract. Summary by group:

- **Vault lifecycle:** `pick_vault`, `open_vault`, `close_vault`, `list_recent_vaults`
- **Filesystem & tree:** `list_tree`, `read_note`, `write_note`, `create_note`, `delete_note`, `rename_note`
- **Index & search:** `index_status`, `rebuild_index`, `get_backlinks`, `get_tags_for_note`, `resolve_wikilink`
- **Graph:** `graph_snapshot`
- **Git sync:** `git_status`, `git_pull`, `git_commit`, `git_push`, `git_init_if_needed`
- **Quartz publishing:** `quartz_publish`

## Database Schema

See `spec.md` §3. Tables: `documents`, `connections`, `tags`, `vault_meta`.
Index lives at `<vault>/.obsidiana/index.db` and is gitignored.

## Open Questions / Backlog

- Pick the Markdown engine: Rust `markdown-rs` crate vs. JS `remark-parse` in
  a Web Worker. Decide in the editor stage (MVP stage 2).
- Decide on `react-force-graph` 2D vs 3D mode at implementation time.
- Pick a settings file format: JSON is fine for MVP; TOML is also viable.
