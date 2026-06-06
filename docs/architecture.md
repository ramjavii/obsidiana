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
├── .devcontainer/
│   └── devcontainer.json                # VS Code Dev Containers, builds via docker-compose
├── .dockerignore
├── .env.example                         # placeholders for deferred integrations
├── .gitignore
├── .nvmrc                               # Node 20 LTS
├── .npmrc                               # node-linker=hoisted (Tauri 2 compat)
├── .obsidiana/                          # gitignored — runtime cache, never committed
├── AGENTS.md                            # AI agent rules (loaded every session)
├── Dockerfile                           # rust:1.88-bookworm + node 20 + pnpm + tauri-cli (git-installed)
├── docker-compose.yml                   # 'dev' service, mount project + persistent caches
├── docs/
│   ├── architecture.md                  # this file
│   └── toolchain.md                     # per-OS host install instructions
├── eslint.config.js                     # ESLint 9 flat config
├── index.html                           # Vite entry, <title>OBSIDIANA</title>
├── MVP.md                               # MVP plan & feature checkboxes
├── opencode.json                        # project-level AI agent config
├── package.json                         # pnpm scripts + deps
├── postcss.config.js
├── spec.md                              # technical spec
├── src/                                 # frontend (React 18 + TS strict + Tailwind)
│   ├── App.tsx                          # vault state router: <EmptyState> | <Shell> with <VaultSwitcher>
│   ├── components/
│   │   ├── Editor.tsx                   # CodeMirror 6 wrapper: autosave 500ms, Ctrl/Cmd+S, status chip, close (1.5)
│   │   ├── EmptyState.tsx               # "Open vault…" full-window view (first launch)
│   │   ├── FileTree.tsx                 # recursive tree: expand dirs, right-click menu, select files
│   │   ├── ToastHost.tsx                # global error/success/info toasts
│   │   └── VaultSwitcher.tsx            # header pill: current vault + recents + close
│   ├── extensions/
│   │   └── wikilinkHighlight.ts     # CodeMirror MatchDecorator + ViewPlugin; cm-wikilink / cm-wikilink-unresolved (2.3)
│   ├── env.d.ts
│   ├── errors.ts                        # AppError TS discriminated union (5 variants, mirrors Rust)
│   ├── hooks/
│   │   ├── useFileTree.ts               # useTreeChildren + create/delete/rename mutations
│   │   ├── useMarkdown.ts               # useExtractWikilinks + useResolveWikilink (2.1, 2.2)
│   │   ├── useNote.ts                   # useReadNote + useWriteNoteMutation (optimistic, rollback, tree invalidation) (1.5)
│   │   ├── useToastStore.ts             # Zustand store + reportAppError() / reportError()
│   │   └── useVault.ts                  # useVaultStatus + pick/open/close/force mutations
│   ├── ipc.ts                           # typed invoke() wrapper → IpcResult<T>
│   ├── ipc/
│   │   ├── markdown.ts                  # typed wrappers for extract_wikilinks (2.1) + resolve_wikilink (2.2)
│   │   ├── note.ts                      # typed wrappers for read_note / write_note (1.5)
│   │   ├── tree.ts                      # typed wrappers for list_tree / create_note / delete_note / rename_note
│   │   └── vault.ts                     # typed wrappers for pick/open/close/list_recent
│   ├── main.tsx                         # React 18 createRoot + QueryClient + ToastHost
│   ├── styles.css                       # @tailwind base/components/utilities
│   ├── types/
│   │   ├── markdown.ts                  # WikilinkRef + ResolvedLink (tagged union) + ResolveWikilinkInput (2.1, 2.2)
│   │   ├── note.ts                      # WriteResult (1.5)
│   │   ├── tree.ts                      # TreeNode / TreeNodeKind / NoteContent / RenameReport
│   │   └── vault.ts                     # VaultInfo / RecentVault / VaultStatus shapes
│   └── __tests__/
│       ├── App.test.tsx                 # EmptyState + Shell + sidebar + dev panel + ?dev=1 trigger + editor integration
│       ├── Editor.test.tsx              # render, autosave gate, error chip + toast, close, path-change destroys view (1.5)
│       ├── EmptyState.test.tsx          # renders, click triggers pick_vault, surfaces error
│       ├── FileTree.test.tsx            # expand/collapse, select, right-click menu, mutations
│       ├── ToastHost.test.tsx           # push, dismiss, auto-TTL, stacking
│       ├── VaultSwitcher.test.tsx       # toggle, recents, close-vault click
│       ├── errors.test.ts               # isAppError, parseAppError, appErrorMessage (5 variants)
│       ├── ipc.test.ts                  # ok / AppError rejection / wrapped Internal
│       ├── useMarkdown.test.tsx         # useExtractWikilinks + useResolveWikilink: IPC call, key, enabled=false, error surface (2.1, 2.2)
│       ├── wikilinkHighlight.test.ts    # regex match/alias/embed-exclusion/empty/newline cases (2.3)
│       ├── useNote.test.tsx             # read cmd match, enabled skip, optimistic update, rollback on AppError (1.5)
│       ├── useVault.test.tsx            # auto-open last vault, mutations reflect in status
│       └── setup.tsx                    # mocks @tauri-apps/api/core + codemirror modules + renderWithProviders()
├── src-tauri/                           # backend (Rust 2021, Tauri 2)
│   ├── .gitignore                       # gen/, target/, WixTools/
│   ├── Cargo.toml                       # + tauri-plugin-dialog, dirs, chrono, regex, tempfile
│   ├── build.rs
│   ├── capabilities/
│   │   └── default.json                 # core:default + dialog:default
│   ├── icons/                           # placeholder PNG/ICO; real icons come in polish pass
│   │   ├── 128x128.png
│   │   ├── 128x128@2x.png
│   │   ├── 32x32.png
│   │   ├── icon.ico
│   │   └── icon.png
│   ├── rust-toolchain.toml              # channel = "stable", rustfmt + clippy
│   ├── src/
│   │   ├── commands/
│   │   │   ├── error_demo.rs           # ping_or_fail: dev-only error-surface fixture
│   │   │   ├── markdown.rs              # extract_wikilinks (2.1) + resolve_wikilink (2.2)
│   │   │   ├── mod.rs
│   │   │   ├── ping.rs                  # smoke IPC command, returns "pong"
│   │   │   ├── tree.rs                  # list_tree / create_note / delete_note / rename_note / read_note / write_note
│   │   │   └── vault.rs                 # pick_vault / open_vault[/_force] / close_vault / list_recent_vaults
│   │   ├── error.rs                     # AppError enum (5 variants) + helpers + unit tests
│   │   ├── fs/
│   │   │   ├── mod.rs
│   │   │   ├── note.rs                  # create_note_in / delete_note_in / rename_note_in + NoteContent / RenameReport
│   │   │   └── tree.rs                  # list_children + TreeNode / TreeNodeKind
│   │   ├── lib.rs                       # tauri::Builder, registers plugin + AppState + 14 handlers
│   │   ├── main.rs                      # windows_subsystem = "windows" in release
│   │   ├── markdown/
│   │   │   ├── mod.rs
│   │   │   ├── resolve.rs               # resolve_wikilink + 19 unit tests (2.2)
│   │   │   ├── types.rs                 # WikilinkRef + ResolvedLink enum
│   │   │   └── wikilink.rs              # extract_wikilinks(&str) + 12 unit tests
│   │   ├── paths.rs                     # app_data_dir, settings_path, canonicalize_dir, validate_relative_path
│   │   ├── settings.rs                  # Settings + RecentVaultEntry + Theme, JSON, atomic write
│   │   └── state.rs                     # AppState { vault: Mutex<Option<VaultHandle>>, settings_path }
│   ├── tauri.conf.json                  # identifier = "com.obsidiana.app"
│   └── tests/
│       ├── ipc_smoke.rs                 # tauri::test::mock_app() + direct-call tests
│       ├── markdown_extract.rs          # 8 mock_app() tests for extract_wikilinks (2.1)
│       ├── markdown_resolve.rs          # 6 mock_app() tests for resolve_wikilink (2.2)
│       ├── note_io.rs                   # 10 mock_app() tests for read_note / write_note (1.5)
│       ├── tree_crud.rs                 # 20 mock_app() tests for all 4 tree commands + AppError paths
│       └── vault_lifecycle.rs           # 16 mock_app() tests for all 4 vault commands + AppError paths
├── tailwind.config.ts
├── tsconfig.json                        # strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes
├── tsconfig.node.json                   # for vite/vitest/tailwind/eslint configs
├── vite.config.ts                       # @/ alias, port 1420, hmr 1421
└── vitest.config.ts                     # jsdom env, @/ alias, setupFiles
```

## Architectural Decisions

| Date       | Decision                                                                                                          | Rationale                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 2026-06-02 | Tauri v2 (not Electron) for the desktop shell.                                                                    | Minimal binary, low idle RAM, native WebView, Rust backend. See spec.md §2.1.                   |
| 2026-06-02 | SQLite (`rusqlite`) for the link/tag index; **no `sqlite-vec` in MVP**.                                            | Vector search is only useful once local AI lands. Defer until stage 6.                          |
| 2026-06-02 | Markdown source of truth; SQLite is a regenerable cache at `<vault>/.obsidiana/index.db`.                         | Vault remains portable, plain-text, readable in any editor. The index is disposable.             |
| 2026-06-02 | Git sync via CLI child process with explicit args array; `--ff-only` only.                                        | Avoids shell-injection; refuses destructive auto-merges. See spec.md §7.3.                       |
| 2026-06-02 | CodeMirror 6 in MVP — Source mode only. Live Preview and read-only Preview deferred.                              | Live Preview is a non-trivial renderer; ship Source first, add modes after the editor is solid. |
| 2026-06-02 | Local AI (Ollama, Whisper, MCP) and plugin runtime deferred past MVP.                                            | They need a hardened sandbox and a content model. Ship the core workspace first.                  |
| 2026-06-02 | Hand-rolled Tauri scaffold (no `pnpm create tauri-app`).                                                          | Interactive scaffolder ships opinionated templates that conflict with our stack rules.          |
| 2026-06-02 | Docker-based toolchain (`Dockerfile` + `docker-compose.yml` + `.devcontainer`).                                    | Host stays toolchain-less; CI and the agent use the same image; no "works on my machine" drift. |
| 2026-06-02 | pnpm 9 + Node 20 LTS + Rust 1.79 stable + Tauri CLI 2.x as the locked versions.                                    | Tauri 2 requires Node 20+ and Rust 1.75+; pnpm 9 is the current LTS line.                        |
| 2026-06-02 | App identifier `com.obsidiana.app`.                                                                                | Reverse-domain; used for macOS bundle ID, Windows AUMID, Linux desktop entry, OS app-data path. |
| 2026-06-02 | Minimal `AppError` enum in 1.1 (single `Internal` variant). Full enum in micro-feature 1.2.                        | Keeps 1.1 a pure scaffold; full error taxonomy is a focused next step.                          |
| 2026-06-02 | `ping` IPC command is a direct-call unit test in 1.1. Full `tauri::test::mock_app()` IPC test in 1.2+.            | The first IPC integration test with mock_app lands when we have meaningful state to test.        |
| 2026-06-02 | **AppError taxonomy in 1.2:** 4 variants — `Internal`, `NotFound`, `InvalidArgument`, `Io`. Full 12+ taxonomy grows incrementally. | Subset is enough for micro-features 1.3-1.5; each new IPC command adds its own variant.       |
| 2026-06-02 | **Frontend ↔ Rust error contract:** Rust `AppError` serializes as `{"kind": "Variant", "data": {...}}`. TS `AppError` is a discriminated union with `isAppError` / `parseAppError` / `appErrorMessage` helpers. | Single source of truth for both sides; drift is caught by `src/__tests__/errors.test.ts`.       |
| 2026-06-02 | **Typed IPC wrapper:** `ipcInvoke<T>(cmd, args) → IpcResult<T>` returns `{ok, value}` or `{ok: false, error, raw}` instead of throwing. | The TanStack Query layer can branch on `result.ok` without try/catch noise; toast hook is the only place that translates `AppError` → user-visible message. |
| 2026-06-02 | **Global toast surface:** single `<ToastHost>` mounted once in `main.tsx`, backed by a Zustand store. `useToastStore.push(kind, msg)` and `reportAppError(err)` are the only entry points. | No scattered toast components. The mutation `onError` in `QueryClient` is the default catch-all. |
| 2026-06-02 | **Dev-only error trigger:** `?dev=1` URL param reveals a "trigger AppError toast" button in `App.tsx` that invokes the Rust `ping_or_fail` command. The command is always registered (so the test path is real), but the frontend never calls it outside dev mode. | Lets us manually verify the toast path in the running app without waiting for a real error to happen. |
| 2026-06-02 | **First real `tauri::test::mock_app()` IPC test** in 1.2 (`src-tauri/tests/ipc_smoke.rs`): builds a mock app with the command registered, plus a direct-call round-trip and a JSON-shape assertion for the error path. | Establishes the test pattern every later `#[tauri::command]` will copy. |
| 2026-06-03 | **`tauri-cli` installed from git, not crates.io**, in the Docker image. Cloned at `--tag tauri-cli-v2.0.0` and `cargo install --path crates/tauri-cli`. The `.dockerignore` excludes `.git/`, so a crates.io install fails: `vergen-gitcl` (used by tauri-cli 2.x build.rs) runs `git rev-parse --is-inside-work-tree` and exits 1. | vergen needs a real `.git/` tree. The git-clone install puts the build inside a real working tree, so the build SHA can be resolved. |
| 2026-06-03 | **`tauri-cli` binary is `cargo-tauri`, not `tauri`.** | Tauri 2's CLI crate installs the executable as `cargo-tauri`. `pnpm tauri dev` and `cargo tauri` work because they shell out to `cargo-tauri`. Plain `tauri --version` does not. |
| 2026-06-03 | **Settings file format: JSON.** Lives at `<os-app-data>/com.obsidiana.app/settings.json`. Atomic write via `.tmp` + rename. Schema version 1; unknown or corrupt files are quarantined as `settings.json.broken-<unix-ts>` and replaced with defaults. | JSON is the simplest portable format and matches the spec's mention of `settings.json`. No new dep. Quarantine + defaults per spec §6.2 ("never crash on bad index" / settings). |
| 2026-06-03 | **Vault root is the one absolute path the frontend may see.** All other paths returned by IPC are relative to the active vault and pass through `paths::validate_relative_path` (rejects `..`, null bytes, backslashes, absolute paths). | Spec §7.1 bans absolute paths from the frontend except for the picked vault root (needed for `list_recent_vaults` to be re-opened later). The exception is documented and the rule is enforced by lint-style comment in `commands/vault.rs`. |
| 2026-06-03 | **`open_vault` refuses to switch active vaults without `force: true`.** Emits `AppError::Busy`. The frontend uses `open_vault` (non-force) by default and `open_vault_force` only from the recents dropdown where the user explicitly chose to switch. | Prevents accidental vault loss from a stray double-click on Pick. Matches the spirit of spec §6.3 ("never destructive"). |
| 2026-06-03 | **1.4 scope split: `list_tree` + `create_note` + `delete_note` + `rename_note` ship in micro-feature 1.4; `read_note` and `write_note` are deferred to 1.5 with CodeMirror.** | Bundling `read_note`/`write_note` without an editor means a placeholder textarea that gets thrown away in 1.5. The tree CRUD is self-contained and testable on its own. |
| 2026-06-03 | **File tree filter: hide dotfiles + dot-dirs (`.obsidian/`, `.trash/`, `.git/`, etc.); for files, show only `.md` and `.markdown` (case-insensitive).** | Matches Obsidian convention. `.obsidian/` is where Obsidian stores its config — we don't want to compete. Other extensions (images, PDFs) are stage 2 territory (embeds). |
| 2026-06-03 | **Lazy-load subtrees via per-directory `list_tree(path)` calls.** Frontend maintains an `expanded: Set<path>` and the `useTreeChildren(path)` hook fires one query per expanded dir, cached by path. | Spec §5.1: "virtualized for thousands of files, lazy load subtrees". One query per expand keeps payload small and matches the `<details>`-style UX. Cache (5s staleTime) absorbs back-and-forth toggling. |
| 2026-06-04 | **1.5 scope split: single editor (no tabs), Source mode only, no wikilink jump-to, no Live Preview, no custom key bindings beyond Ctrl/Cmd+S, no file-changed-on-disk detection.** Tabs land in 1.5.1+; Live Preview in stage 2 alongside the markdown engine decision. | Bundling all of that into 1.5 would balloon the diff past the 1.5 loop budget. Source mode + autosave + error surface is the minimum that lets us dogfood editing. |
| 2026-06-04 | **Autosave on close is silent and best-effort.** No "you have unsaved changes" prompt, no discard option in 1.5. The close button awaits the in-flight write, then calls `onClose`. | Spec §5.1 says "never destructive" but the simplest non-destructive path is to save. A modal prompt is a UX decision that can wait for a polish pass after we have real users. |
| 2026-06-05 | **2.1 micro-feature: wikilink extraction is a regex on raw text, not an AST walk.** `[[...]]` is matched; embed exclusion is a post-match byte test (`!` immediately before). | `pulldown-cmark` would be more correct (it knows about code fences, inline code, link syntax) but is overkill for a 2.1 slice whose only consumer is the eventual `resolve_wikilink` IPC. The regex covers all real-world wikilink shapes; the only thing it over-matches is wikilinks inside code fences, which 2.1 is allowed to ship. The fence-aware variant is a 2.4 follow-up. |
| 2026-06-05 | **`require_vault_root` is `pub(crate)` and shared across command modules.** Previously private to `tree.rs`; the new `commands::markdown.rs` reuses the exact same gate. | Avoids copy-pasting the `state.vault.lock()` dance into every new command module. The helper is trivial and the rule it enforces (a vault must be open) is the same for every command. |
| 2026-06-05 | **Markdown engine decision (Rust `markdown-rs` vs JS `remark-parse` Web Worker) is intentionally deferred past 2.1.** | 2.1 extracts wikilinks from raw text — no Markdown parser needed. The engine decision only matters once we ship Live Preview or another rendering surface. Picking now would be premature; the spec leaves it as an open question, and the AGENTS.md lets us pick either. We'll record the decision in an ADR right before the first feature that needs it. |
| 2026-06-05 | **Live Preview / Obsidian-like WYSIWYG editor is wanted in MVP (micro-features 2.5–2.7).** Markdown engine pick (2.5) → inline render pipeline for bold/italic/headings/code/links/resolved-wikilinks (2.6) → Source/Live Preview/Reading-view mode toggle (2.7). | The user reconsidered the original "Source mode only" deferral after dogfooding 1.5: rendered inline previews (with the cursor staying in source positions) are the core feel of an Obsidian-like workspace. The 3-mode toggle stays in MVP but ships last, after the render pipeline is solid. |
| 2026-06-05 | **Editor focus is preserved across autosave.** The mount effect's dependency on `read.data` was over-eager: any data ref change (e.g., refetch on window focus, or the autosave cycle's own re-render) destroyed the CodeMirror `EditorView`, which lost focus. The fix: (a) `useReadNote` now sets `refetchOnWindowFocus: false` to stop the data ref from churning on focus, and (b) the editor's effect only destroys the view when the `path` actually changes — `viewPathRef` gates recreation, and external content updates flow through `view.dispatch({changes})` instead of a full teardown. | Refocusing after every 500ms autosave debounce was the most-felt UX regression in 1.5. Both fixes are independent and complementary: the first stops the trigger, the second is defense in depth in case `useReadNote` is invalidated for any other reason (manual `invalidateQueries`, an external watcher invalidation in stage 3, etc.). |
| 2026-06-05 | **Embedded opencode terminal panel is deferred past MVP** (not part of the Local AI stack). | The user wants a dockable terminal inside the app shell that runs the `opencode` CLI with the vault as CWD and can read the active note + the file tree. Useful for in-app AI assistance and ad-hoc vault scripting. It is a developer-ergonomics feature, not an AI feature, so it lives in a separate deferred bucket from the Local AI stack. |
| 2026-06-05 | **2.2 wikilink resolution: "shortest path" = fewest combined `..` + named-segment steps between the source dir and the candidate dir.** Distance is `up + down` from the longest common prefix. Ties broken by alphabetical order of the resolved path. | The spec says "shortest relative path from the source" (spec §6.2). Counting both upward and downward moves captures "how many directory hops" intuitively: a sibling is 2 (1 up + 1 down), a same-dir candidate is 0, and the source's own dir is the same as itself. Alphabetical tiebreak is deterministic and stable across re-orders. |
| 2026-06-05 | **2.2 wikilink target shape: bare-name vs path-style split.** A target is path-style if it contains `/` (exact relative-path match; `.md`/`.markdown` appended when no extension is present). Otherwise it is a bare-name stem search (case-insensitive) across the whole vault. | Mirrors the Obsidian convention. The split is enforced at the top of `resolve::resolve_wikilink` and the `..`/absolute rejections are layered on top of `validate_relative_path` so a bad target string cannot escape the vault even via the resolver. |
| 2026-06-05 | **2.2 `ResolvedLink` is a tagged enum (`resolved` \| `broken`)** instead of a flat struct with `Option<resolvedPath>`. | The TS discriminated union lets the consumer narrow on `kind` before reading `resolvedPath`, which is more idiomatic than a flat `Option` and keeps the JSON shape stable when we add more variants later (e.g. `Resolved` with a `sectionNotFound` flag in 2.4). |
| 2026-06-05 | **2.3 wikilink highlighter is a `MatchDecorator` + `ViewPlugin`**, not a custom CodeMirror `Language` extension. The regex uses JavaScript lookbehind (`(?<!!)`) to exclude `![[embed]]` matches directly, instead of the Rust 2.1 style post-match byte test. | `MatchDecorator` is the canonical CodeMirror pattern for regex-based syntax decoration; it auto-tracks viewport changes and re-decorates only the affected ranges. A full `Language` extension is overkill for one regex and would duplicate the Markdown parser's work. The regex itself is a JS lookbehind because V8/SpiderMonkey (Node 20) support it; the Rust extractor has no lookbehind in the `regex` crate and uses a post-check, so the two implementations differ in mechanism but agree on behavior — both exclude `![[…]]`. |
| 2026-06-05 | **2.3 decoration has two CSS classes (`cm-wikilink cm-wikilink-unresolved`)** instead of one, as a forward-compat hook for 2.4. | 2.4 will swap `cm-wikilink-unresolved` for `cm-wikilink-resolved` or `cm-wikilink-broken` as the link index (stage 3) fills in. The base class is stable; the second class is the "state" slot. This is the same idiom as `oneDark`'s `cm-activeLine` / `cm-activeLineGutter` pair. |

## Toolchain

Three equivalent workflows. Pick the one that matches your machine:

| Workflow       | Best for                                | How                                                                                                       |
| -------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Container**  | CI, the AI agent, any host with Docker. | `docker compose build dev && docker compose run --rm dev <cmd>`                                           |
| **Devcontainer** | VS Code users on any host.             | Install the Dev Containers extension, "Reopen in Container".                                              |
| **Host-native** | Iterative GUI dev with `pnpm tauri dev`. | Install Node 20 + pnpm + Rust 1.75+ + Linux Tauri deps (or macOS / Windows variants). See `docs/toolchain.md`. |

The Dockerfile is the source of truth. Devcontainer and host-native installs must produce the same tool versions. If they drift, fix the Dockerfile first.

## IPC Commands

See `spec.md` §4 for the full contract. Implemented so far:

- `ping` — smoke test. Returns `Ok("pong")`. No args. (micro-feature 1.1)
- `ping_or_fail` — dev-only error-surface fixture. Returns `Err(AppError::NotFound)`. Frontend must NOT call this unless `?dev=1` is in the URL. (micro-feature 1.2)
- `pick_vault` — opens the native folder picker via `tauri-plugin-dialog`. Returns `Ok(None)` if the user cancels; `Ok(Some(VaultInfo))` on pick (which also auto-opens the vault and persists it to settings). No args. (micro-feature 1.3)
- `open_vault(path)` — canonicalizes and validates the path; opens it as the active vault; refuses with `AppError::Busy` if another vault is already open. (micro-feature 1.3)
- `open_vault_force(path)` — same as `open_vault` but switches active vault even if one is already open. Called only from the recents dropdown. (micro-feature 1.3)
- `close_vault` — clears the active vault; idempotent (no-op if none open). Persists `last_vault = None`. (micro-feature 1.3)
- `list_recent_vaults` — reconciles (marks missing entries `available: false`) and returns the recents list. Persists after reconcile. (micro-feature 1.3)
- `list_tree(path)` — returns the immediate children of `path` (or root when `None`), filtered to dirs + `.md`/`.markdown` files and sorted dirs-first then alpha. `path` is validated via `validate_relative_path`. (micro-feature 1.4)
- `create_note(path, template)` — creates a new `.md`/`.markdown` file at `path` (relative, validated) with `template` as content (empty if `None`). Returns the new `NoteContent` (`{path, content, modified_at}`). Rejects collisions, non-`.md` extensions, and missing parents. (micro-feature 1.4)
- `delete_note(path)` — removes the file at `path`. Refuses to delete directories. (micro-feature 1.4)
- `rename_note(from, to)` — moves/renames a note within the vault. Both paths validated. Refuses collisions and missing source. (micro-feature 1.4)
- `read_note(path)` — returns `NoteContent` (`{path, content, modified_at}`) for a single note. UTF-8 validated; rejects missing files, directories, and non-`.md`/`.markdown` extensions. (micro-feature 1.5)
- `write_note(path, content)` — overwrites (or creates) the note at `path` with `content`. Returns `WriteResult` (`{path, modified_at}`). Rejects missing parents, directory targets, and non-note extensions. (micro-feature 1.5)
- `extract_wikilinks(path)` — reads the note at `path` and returns `Vec<WikilinkRef>` (`{target, alias, line}`) for every `[[note]]` / `[[note|alias]]` occurrence. Excludes embeds (`![[...]]`), skips empty targets, trims whitespace. Line numbers are 1-indexed. (micro-feature 2.1)
- `resolve_wikilink(source_path, target, alias)` — returns a `ResolvedLink` tagged union (`resolved` or `broken`). The target is split on the first `#` to separate the note name from the section. The name is path-style (contains `/`) or bare-name (stem search, case-insensitive). When multiple notes share the same stem, the resolver picks the candidate with the shortest relative path from `source_path` (fewest combined `..` + down steps). Ties broken by alphabetical order of the resolved path. `resolved_path` is the candidate's relative path; `section` and `alias` are echoed back unmodified. Section existence is not validated in 2.2 — that lands in 2.4. (micro-feature 2.2)
- *no new IPC in 2.3* — the wikilink syntax highlighter is purely a frontend `CodeMirror` `MatchDecorator` + `ViewPlugin` extension (`src/extensions/wikilinkHighlight.ts`). It decorates `[[note]]` and `[[note|alias]]` ranges with a `cm-wikilink cm-wikilink-unresolved` CSS class. Embeds (`![[…]]`) are excluded via a JavaScript lookbehind. No IPC call is made per keystroke; resolve-time styling lands in 2.4 when the link index from stage 3 is available. (micro-feature 2.3)

To be implemented (stages 1-5): all others from `spec.md` §4.

## Error surface

`AppError` is the single error type for every IPC command. It is
defined in `src-tauri/src/error.rs` as a `thiserror`-derived enum
with `#[serde(tag = "kind", content = "data")]` and serializes to:

```json
{ "kind": "Variant", "data": { ... } }
```

### Variants (current)

| Variant          | Data                              | Used by                                                  |
| ---------------- | --------------------------------- | -------------------------------------------------------- |
| `Internal`       | `{ message: string }`             | Catch-all for unexpected errors. Wraps `Error` toString. |
| `NotFound`       | `{ what: string }`                | File / vault / note not found.                            |
| `InvalidArgument`| `{ message: string }`             | Path validation failures (`..`, null bytes, escapes).    |
| `Io`             | `{ path: string, source: string }`| Wraps `std::io::Error` (the source message is sanitized).|
| `Busy`           | `{ what: string }`                | A second conflicting action is already in flight. (micro-feature 1.3: `open_vault` when another vault is open.) |

### Frontend contract

The TS mirror in `src/errors.ts` is a discriminated union of the
same shape. Three helpers:

- `isAppError(value)` — type guard, narrows `unknown` to `AppError`.
- `parseAppError(value)` — same but returns `AppError | null`.
- `appErrorMessage(err)` — human-readable message for the toast.

The typed wrapper in `src/ipc.ts` catches invoke rejections, parses
them through `isAppError`, and returns `IpcResult<T>`:

```ts
type IpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: AppError; raw: unknown };
```

The TanStack Query mutation default `onError` (in `src/main.tsx`)
calls `reportError(message)`, which dispatches a toast. The
`ping_or_fail` command exercised through `?dev=1` is the manual
smoke test for this whole path.

## Vault lifecycle (micro-feature 1.3)

Stage 1 of MVP now has its first user-visible feature: the app
opens to an empty state, the user picks a folder, the folder is
persisted in `settings.json` as the active vault, and the app
remembers it on subsequent launches. The header shows a vault
switcher with a recents list (entries missing on disk are marked
`available: false`, never auto-purged).

### Backend layout

- `src-tauri/src/paths.rs` — `app_data_dir`, `settings_path`,
  `canonicalize_dir`, `validate_relative_path`. The last one
  rejects empty / null / `..` / absolute / backslash paths and
  is the single chokepoint enforcing spec §7.7.
- `src-tauri/src/settings.rs` — JSON `Settings` struct
  (`schema_ver`, `last_vault`, `recent_vaults`, `theme`,
  `window`) with `load` / `save` / `record_open` / `record_close`
  / `reconcile`. Atomic write via `.tmp` + rename. Corrupt or
  unknown-schema files are quarantined to
  `settings.json.broken-<unix-ts>` and replaced with defaults
  (spec §6.2 spirit).
- `src-tauri/src/state.rs` — `AppState { vault: Mutex<Option<VaultHandle>>, settings_path }`.
  `VaultHandle` carries the canonical path and the `opened_at`
  timestamp. Tauri-managed via `app.manage(...)` in `setup`.
- `src-tauri/src/commands/vault.rs` — the four spec §4.1 commands
  plus `open_vault_force`. Every command has a public `*_inner`
  helper that takes `tauri::State` directly so integration tests
  can call them without going through the IPC router (which
  requires the `AppHandle` `CommandArg` injection). The picker
  call is injected via a `FnOnce` closure so the dialog plugin is
  exercised in production and stubbed in tests.
- `src-tauri/tests/vault_lifecycle.rs` — 16 `tauri::test::mock_app()`
  tests covering the success and error path of every command:
  pick returns `None`, pick records open, pick propagates picker
  errors, pick rejects non-directories; open succeeds, open
  rejects nonexistent / file / empty / null-byte paths, open
  refuses without `force`, open force switches; close is
  idempotent, close persists; list returns empty, list marks
  missing entries unavailable; and a smoke test that the dialog
  plugin registers in a mock app.

### Frontend layout

- `src/ipc/vault.ts` — typed wrappers over `ipcInvoke` that throw
  on error (callers consume the rejection or the toast via
  `useVaultMutation`).
- `src/hooks/useVault.ts` — `useVaultStatus` runs on mount,
  calls `list_recent_vaults`, auto-opens the first available
  recent. `usePickVaultMutation`, `useOpenVaultMutation`,
  `useOpenVaultForceMutation`, `useCloseVaultMutation` all
  invalidate `["vault","status"]` on success and surface
  `AppError` rejections via `reportAppError`.
- `src/components/EmptyState.tsx` — full-window "No vault open"
  view with a single "Open vault…" button.
- `src/components/VaultSwitcher.tsx` — header pill: current
  vault name, click to open a dropdown with recents, "Switch
  vault…", and "Close vault". Recents marked unavailable are
  disabled.
- `src/App.tsx` — routes between `<EmptyState />` and `<Shell>`.
  The dev-only `?dev=1` panel is mounted only inside `<Shell>`,
  so it only appears once a vault is open.

### Sandbox boundary exception

`spec.md` §7.1 says the frontend never sees absolute paths.
The one exception is the **vault root**, returned by `pick_vault`
/ `open_vault` as `VaultInfo.path` so the recents list can be
re-opened on subsequent launches. Every other path returned by
IPC is relative to the active vault and goes through
`validate_relative_path`. The exception is enforced by a
`// SAFETY: vault root is the one absolute path...` comment on
`vault_info_from` so a future grep finds it.

## File tree (micro-feature 1.4)

Stage 1 of MVP now has its second user-visible feature: once a
vault is open, the sidebar shows a tree of folders and Markdown
files. Click a folder to expand/collapse, click a file to select
it, right-click for New / Rename / Delete. Selecting a file
highlights it in the tree and shows a placeholder pane on the
right ("Editor lands in 1.5").

### Backend layout

- `src-tauri/src/fs/tree.rs` — `list_children(vault_root, relative)`
  pure function (no AppState). Filters dotfiles, restricts files
  to `.md`/`.markdown` (case-insensitive), sorts dirs-first then
  alpha. Returns `Vec<TreeNode>` with `name`, relative `path`,
  `kind` (`"file"` | `"dir"`), and `extension`.
- `src-tauri/src/fs/note.rs` — `create_note_in`, `delete_note_in`,
  `rename_note_in` pure functions. `create_note_in` rejects
  collisions, non-`.md` extensions, and missing parents.
  `delete_note_in` refuses to delete directories. `rename_note_in`
  refuses collisions and missing source; allows cross-folder moves
  when the destination parent exists.
- `src-tauri/src/commands/tree.rs` — IPC wrappers plus `*_inner`
  helpers. Each `*_inner` calls `require_vault_root` (returns
  `InvalidArgument("no vault is open")` if `AppState.vault` is
  `None`), then `validate_relative_path`, then dispatches to the
  pure function in `fs::`. This is the same pattern the vault
  commands established in 1.3.
- `src-tauri/tests/tree_crud.rs` — 20 `tauri::test::mock_app()`
  tests. Each command has success + error-path coverage:
  `list_tree` root, subfolder, hidden files filtered, missing
  folder (`NotFound`), `..` path (`InvalidArgument`), absolute
  path (`InvalidArgument`), no-vault-open (`InvalidArgument`);
  `create_note` write, empty template, collision, `..` path, null
  byte; `delete_note` remove, missing (`NotFound`), `..` path;
  `rename_note` in-place, cross-folder, collision, missing source,
  `..` destination.

### Frontend layout

- `src/types/tree.ts` — `TreeNode`, `TreeNodeKind`, `NoteContent`,
  `RenameReport`. Mirrors the Rust serde shapes (camelCase where
  Rust uses snake_case for `modifiedAt`).
- `src/ipc/tree.ts` — typed wrappers that throw on `AppError`
  rejection, so the hook layer can use the `useTreeMutation`
  helper uniformly with the vault mutations.
- `src/hooks/useFileTree.ts` — `useTreeChildren(path, {enabled})`
  query keyed by `["tree","children",path]`. Three mutations
  (`useCreateNoteMutation`, `useDeleteNoteMutation`,
  `useRenameNoteMutation`) that invalidate the **parent**
  directory's children on success. `parentOf` is the only place
  the "what is a note's parent dir" logic lives.
- `src/components/FileTree.tsx` — main `<FileTree>` (toolbar
  with `+ New`, list of root children, fixed-position context
  menu) plus a recursive `<FileTreeNode>` that calls
  `useTreeChildren` only when its dir is expanded. Right-click
  menu items are: `New note here` (dirs only), `Rename`, `Delete`.
  `New` and `Rename` use `window.prompt`; `Delete` uses
  `window.confirm`. The selected file path is lifted to `App.tsx`
  for the placeholder pane.
- `src/App.tsx` — `<Shell>` now has a 288px sidebar
  (`<FileTree>`) and a flexible main pane. The placeholder pane
  shows the selected file's relative path and the "Editor lands
  in 1.5" notice. The `?dev=1` panel is unchanged.

### What's NOT in 1.4 (deferred to 1.5)

- `read_note` / `write_note` IPC commands — they only make sense
  with the CodeMirror editor. _(shipped in 1.5)_
- Folder creation via UI — `create_note` can write into an
  existing folder, but there's no `create_folder` IPC. Users can
  create folders out-of-band for now.
- Drag-and-drop to move notes — `rename_note` already supports
  cross-folder moves; D&D is a polish layer.
- The notify watcher (stage 3) — the design supports it
  (mutations already invalidate the right cache keys), but
  external edits don't auto-refresh the tree yet.

## Editor (micro-feature 1.5)

CodeMirror 6 wrapper, Source mode only, single editor (no tabs yet).
Editing a Markdown file from the tree mounts `<Editor path={…} />` in
the right pane; the close button flushes the in-flight autosave
silently and clears the selection.

### Backend layout

- `src-tauri/src/fs/note.rs` — `read_note_in(vault_root, relative) -> AppResult<NoteContent>` and
  `write_note_in(vault_root, relative, content) -> AppResult<WriteResult>`. UTF-8 guard, parent-exists
  check, non-`.md`/`.markdown` extension rejection, directory-target rejection, `modified_at` from mtime.
- `src-tauri/src/commands/tree.rs` — `read_note` / `write_note` IPC wrappers (registered alongside
  the tree CRUD). Both run on `tokio::task::spawn_blocking` so the IPC thread is never blocked on
  filesystem I/O.
- `src-tauri/src/lib.rs` — registers the two new handlers (12 total now).
- `src-tauri/tests/note_io.rs` — 10 `tauri::test::mock_app()` tests: read returns content, read
  rejects missing/directory/non-UTF8, write creates/overwrites/empty, write rejects missing parent
  / directory target / non-note extension, write advances mtime.

### Frontend layout

- `src/types/note.ts` — `WriteResult` (`{path, modified_at}`).
- `src/ipc/note.ts` — typed `readNote(path)` / `writeNote(path, content)` wrappers.
- `src/hooks/useNote.ts` — `useReadNote(path, {enabled})` (5s staleTime, same shape as
  `useTreeChildren`) and `useWriteNoteMutation()` with optimistic `setQueryData` on `onMutate`,
  rollback in `onError`, and `treeChildrenKey(parentOf(path))` invalidation in `onSuccess`.
- `src/components/Editor.tsx` — CodeMirror 6 view (`lineNumbers`, `history`, `highlightActiveLine`,
  `lineWrapping`, `markdown()` lang, `oneDark` theme, `Mod-s` keymap) inside a flex column. An
  `updateListener` debounces writes by 500ms; a separate `flushSave` ref-based function is invoked
  by the close button and the `Mod-s` keymap. The view is destroyed and recreated when `path` or
  `read.data` changes (effect deps are minimal: `[path, read.data]`); the status chip only auto-
  resets to "Saved" on initial load, never after a save error or in-flight save.
- `src/__tests__/Editor.test.tsx` — 6 tests: renders path + close, saving-gated-promise → Saved,
  error chip + toast on `AppError`, close calls `onClose`, old view destroyed on path change.
- `src/__tests__/setup.tsx` — codemirror modules mocked globally (`EditorState.create`,
  `EditorView`, `keymap`, `lineNumbers`, `highlightActiveLine`, `lineWrapping`, `markdown`,
  `oneDark`, commands). Exports `cmUpdateListeners`, `setCmSharedDoc`, `fireCmUpdate` for tests
  to simulate user typing without rendering a real CodeMirror in jsdom.
- `src/__tests__/App.test.tsx` — new test: clicking a file in the tree mounts `<Editor>`; clicking
  the close button unmounts it and returns to the empty-main placeholder.

### What 1.5 deliberately does NOT include

- **Tabs** — single editor instance. The plan in 1.5.1+ adds a tab bar with dirty markers.
- **Live Preview** — Source mode only. Live Preview is a stage-2 item that depends on the
  markdown engine decision. _(Re-prioritized: planned in micro-features 2.5–2.7; see the
  decision row dated 2026-06-05.)_
- **Wikilink jump-to** — `[[note]]` is rendered as plain text by `markdown()`. Click-to-jump
  needs the link index, which is stage 3.
- **File-changed-on-disk detection** — `notify` watcher lands in stage 3. For now, the editor
  trusts its own write; if the file changes externally, the editor won't notice. When the
  watcher lands, the editor will apply external content via `view.dispatch({changes})` (the
  same code path the focus-preservation fix added) so the cursor isn't kicked on a remote
  edit.
- **Discard-changes prompt** — the close button awaits the in-flight autosave, then closes.
  No "unsaved changes" modal. This is a deliberate UX deferral.

### Follow-up: editor focus preservation (commit on `feature/2.1-wikilink-extraction`)

A 1.5 regression that surfaced in dogfooding: focus is lost 500ms after stopping typing
(the autosave debounce fires). Root cause: the mount effect's `[path, read.data]` deps
destroyed the CodeMirror `EditorView` whenever the data reference changed — and
`useReadNote`'s default `refetchOnWindowFocus: true` re-fetched on every window focus,
churning the data reference.

Two complementary fixes (see the decision row dated 2026-06-05):

- `src/hooks/useNote.ts` — `useReadNote` now sets `refetchOnWindowFocus: false`.
- `src/components/Editor.tsx` — the mount effect now keeps a `viewPathRef` and only
  destroys the view when the path actually mismatches. External content changes (from a
  refetch that returns new content) flow through `view.dispatch({changes})` so the
  cursor stays put. The same dispatch path is what stage 3's notify watcher will use
  for external-edit detection, so this fix is forward-compatible.

New regression test in `src/__tests__/Editor.test.tsx` —
`preserves the view when read.data ref changes without a path change (regression for
focus loss)`. The test forces a `client.invalidateQueries({queryKey: ["note","read",
"hello.md"]})` and asserts that `cmUpdateListeners.length` does not increase (i.e., the
view was NOT destroyed and recreated).

## Wikilink extraction (micro-feature 2.1)

Stage 2's first user-visible building block: a Rust preprocessor that scans a
note's raw Markdown and returns its wikilinks. No resolution, no UI rendering,
no SQLite — that follows in 2.2, 2.3, 2.4. This is the regex/text-scan slice
that all later stage-2 features (resolve, render, click-to-jump) build on, and
the same module layout will host tag, embed, block-ref, and callout extractors.

### Backend layout

- `src-tauri/Cargo.toml` — adds `regex = "1"`.
- `src-tauri/src/markdown/mod.rs` — module root; re-exports `types` and
  `wikilink`. Other link-type extractors (tags, embeds, block refs, callouts)
  land as siblings in 2.5+.
- `src-tauri/src/markdown/types.rs` — `WikilinkRef { target: String, alias:
  Option<String>, line: usize }` with `#[serde(rename_all = "camelCase")]`
  so the TS mirror sees identical key names.
- `src-tauri/src/markdown/wikilink.rs` —
  `pub fn extract_wikilinks(content: &str) -> Vec<WikilinkRef>`. Regex
  `\[\[([^\[\]]+)\]\]` (the `regex` crate does not support lookbehind, so
  the embed check is a post-match byte test: if the char immediately before
  the match start is `!`, the match is an embed and is skipped). The inner
  text is split on the first `|` for target vs alias. Whitespace is trimmed;
  empty targets are dropped; empty aliases are coerced to `None`. Line
  numbers are 1-indexed and computed by counting newlines in the byte
  prefix. 12 unit tests cover the realistic cases (single, aliased, embed
  exclusion, multiple, multi-line line tracking, whitespace, chained alias
  `[[a|b|c]]`, empty alias, empty target, section `[[note#section]]` as a
  single target, unbalanced brackets).
- `src-tauri/src/commands/tree.rs` — `require_vault_root` is now
  `pub(crate)` so the new `commands::markdown` module can reuse the same
  gate pattern.
- `src-tauri/src/commands/markdown.rs` — `extract_wikilinks_inner` and the
  `#[tauri::command] extract_wikilinks` async wrapper. Inner takes
  `tauri::State<'_, AppState>` so `tauri::test::mock_app()` tests can call
  it without going through the IPC router. Inner calls `require_vault_root`
  → `validate_relative_path` → `read_note_in` → `extract_wikilinks`. All
  error paths (no vault, `..`, missing, directory) surface as `AppError`
  variants exactly like the tree commands.
- `src-tauri/src/commands/mod.rs` and `src-tauri/src/lib.rs` — register the
  new module and add `extract_wikilinks` to the `invoke_handler!` macro.
  Total handler count is now 13.
- `src-tauri/tests/markdown_extract.rs` — 8 `tauri::test::mock_app()`
  integration tests: empty note, target+alias, embed exclusion, multi-line
  line tracking, `..` path rejected, missing file rejected, no-vault-open
  rejected, directory target rejected.

### Frontend layout

- `src/types/markdown.ts` — `WikilinkRef = { target: string; alias: string | null; line: number }`.
- `src/ipc/markdown.ts` — `extractWikilinks(path)` typed wrapper over
  `ipcInvoke<WikilinkRef[]>("extract_wikilinks", { path })` that throws on
  `AppError` rejection.
- `src/hooks/useMarkdown.ts` — `useExtractWikilinks(path, { enabled })`
  query keyed `["markdown", "wikilinks", path]`, 5s staleTime, mirrors
  `useTreeChildren` and `useReadNote`. `wikilinksKey(path)` is exported
  for invalidation by future mutations.
- `src/__tests__/useMarkdown.test.tsx` — 4 tests: happy path (IPC called
  with the right arg, returns the data), key derivation, `enabled: false`
  skips the IPC, `AppError` rejection surfaces in `result.current.error`.

### Known limitations (deferred)

- **Wikilinks inside fenced code blocks are extracted as if live.** The
  regex is paragraph-level; it does not respect triple-backtick fences or
  inline-code backticks. The 2.1 contract is "extract everything"; a
  polished pass that walks Markdown structure (either via
  `pulldown-cmark` events or a fence-aware line scanner) lands with 2.4
  (the click-to-jump render path), which is the first feature that would
  visibly misbehave on a code-block match.
- **Section refs `[[note#section]]` are kept as a single target string**
  for 2.1. Splitting into `{name, section}` is a 2.2 (resolution) concern
  because the spec rules around "missing section → broken link" depend on
  resolution happening first.
- **No debouncing.** `useExtractWikilinks` runs on demand. The watcher
  (stage 3) will be the trigger that fires it on disk changes. Per spec
  §6.4, the editor's 500ms autosave debounce is the only per-keystroke
  gate.

## Wikilink resolution (micro-feature 2.2)

Stage 2's second building block: a pure Rust resolver that maps a
`[[note]]` (or `[[note|alias]]` / `[[note#Section]]`) to the
file the link should open. Builds on the 2.1 extractor; no UI yet —
the click-to-jump / broken-link styling surfaces in 2.4.

### Resolution rules (matches `AGENTS.md` and spec §6.2)

1. **Parse the target.** Trim. Split on the first `#` to separate
   the note name from the section. Empty section is dropped; empty
   name is rejected.
2. **Reject escape attempts.** Targets containing `..`, starting with
   `/`, or starting with `\` are rejected with `InvalidArgument`. The
   same `validate_relative_path` gate used by the rest of the IPC
   commands is re-applied so a malformed target cannot escape the
   vault.
3. **Classify the name.** Contains `/` → path-style. Otherwise →
   bare-name stem search.
4. **Find candidates.** Path-style: try the literal, the literal with
   `.md`, the literal with `.markdown` (case-insensitive), each
   validated to be a file inside the vault. Bare-name: enumerate every
   `.md` / `.markdown` file under the vault (skipping hidden files
   and dot-dirs); keep the ones whose stem matches
   (case-insensitive).
5. **Pick the shortest.** Distance between the source's directory
   and the candidate's directory is the sum of `..` and named
   segments in the relative path. Fewest hops wins. Ties broken by
   alphabetical order of the candidate's full relative path.
6. **Return** `ResolvedLink::Resolved` with the chosen path, or
   `ResolvedLink::Broken` if no candidate matched. The section
   and alias fields are echoed back from the input regardless of
   resolved / broken. The section is not validated in 2.2.

### Backend layout

- `src-tauri/src/markdown/types.rs` — adds `ResolvedLink`
  (`#[serde(tag = "kind", rename_all = "camelCase")]`) with
  `Resolved { target, sourcePath, resolvedPath, section, alias }`
  and `Broken { target, sourcePath, section, alias }`. camelCase
  rename matches the 2.1 convention.
- `src-tauri/src/markdown/resolve.rs` —
  `pub fn resolve_wikilink(vault_root: &Path, source_path: &Path, target: &str, alias: Option<&str>) -> AppResult<ResolvedLink>`.
  The function is a pure call into the filesystem: it walks the
  vault tree, computes the shortest-path, and returns. Helpers
  (`parent_dir_of`, `path_distance`, `is_candidate_visible`,
  `try_path_style`, `try_bare_name`, `pick_shortest`) are
  module-private and individually unit-tested. 19 unit tests
  cover: helpers (extension, stem, distance, parent, visibility),
  single-candidate resolution, zero-candidate broken, nearest-of-many
  selection, alphabetical tiebreak, case-insensitive stem match,
  path-style with auto `.md` extension, path-style with explicit
  `.md`, path-style with `.markdown`, missing path-style target
  → broken, section echoing on both Resolved and Broken, alias
  echoing, empty target rejection, section-only `#Section`
  rejection, `..` rejection, absolute path rejection, hidden
  files ignored, and source-in-subfolder picking the closer sibling.
- `src-tauri/src/commands/markdown.rs` — `resolve_wikilink_inner`
  + `#[tauri::command] resolve_wikilink`. Inner takes
  `tauri::State<'_, AppState>` so `mock_app()` tests can call it
  without the IPC router. Validates `source_path` via
  `validate_relative_path` before dispatching to the pure resolver.
- `src-tauri/src/lib.rs` — registers `resolve_wikilink` in
  `invoke_handler!`. Total handler count is now 14.
- `src-tauri/tests/markdown_resolve.rs` — 6 `tauri::test::mock_app()`
  integration tests: resolves existing target, broken for missing
  target, no-vault-open → `InvalidArgument`, `..` source path →
  `InvalidArgument`, absolute source path → `InvalidArgument`,
  alias echoed back.

### Frontend layout

- `src/types/markdown.ts` — adds `ResolvedLink` (TS discriminated
  union mirroring the Rust enum) and `ResolveWikilinkInput` (the
  hook argument shape).
- `src/ipc/markdown.ts` — adds `resolveWikilink(sourcePath, target, alias)`
  typed wrapper over `ipcInvoke<ResolvedLink>("resolve_wikilink", { sourcePath, target, alias })`.
  Throws on `AppError` rejection.
- `src/hooks/useMarkdown.ts` — adds `useResolveWikilink(input, { enabled })`
  query keyed `["markdown", "resolve", sourcePath, target, alias ?? null]`
  and exports `resolveWikilinkKey(input)` for invalidation. 5s
  staleTime; mirrors `useExtractWikilinks`.
- `src/__tests__/useMarkdown.test.tsx` — adds a `useResolveWikilink`
  describe block: 4 tests covering the happy path (IPC called with
  the right args, returns the data), key derivation (target +
  sourcePath + alias), `AppError` rejection surfaces in
  `result.current.error`, and `enabled: false` skipping the IPC.

### Known limitations (deferred)

- **No SQLite cache.** Every `resolve_wikilink` re-walks the vault
  tree. The link index arrives with stage 3 (and `useResolveWikilink`
  is the natural caller to read from it). For 2.2 we keep the
  contract simple: stateless, no concurrency, no cache. Acceptable
  perf up to a few thousand notes per vault; 2.4 will set the
  cache contract.
- **No batch variant.** A `resolve_wikilinks` (plural) IPC that
  resolves all targets of a single note in one round-trip is the
  natural fit for 2.4's render path. 2.2 ships the singular; the
  batch can land as an additive IPC without breaking the singular.
- **No section existence check.** `ResolvedLink::Resolved { section: Some("Sec") }`
  does not assert the resolved file actually has a `## Sec`
  heading. That's a 2.4 concern (the click-to-jump surface is
  the first place a wrong section visibly misbehaves).
- **No codemirror / rendering integration.** The hook exists and
  is tested; 2.3 (syntax highlighting) and 2.4 (click-to-jump,
  broken-link styling) are the first callers.

## Wikilink syntax highlighting (micro-feature 2.3)

Stage 2's first visual "this is a wikilink" affordance: every
`[[note]]` and `[[note|alias]]` in the editor gets a distinct
purple+underline decoration. `![[embed]]` is not decorated
(matches the 2.1 extractor rule). No click handler, no resolve
lookup, no broken-link styling — those are 2.4.

### Frontend layout

- `src/extensions/wikilinkHighlight.ts` (new) — exports
  `WIKILINK_PATTERN` and `wikilinkHighlight`. The pattern is
  `/(?<!!)\[\[(\S[^[\]\n|]*)(?:\|([^[\]\n]+))?\]\]/g`:
  - `(?<!!)` — JavaScript lookbehind excludes `![[…]]` embeds
    directly in the regex (the Rust 2.1 extractor uses a post-match
    byte test because the `regex` crate has no lookbehind; same
    observable behavior, two different mechanisms).
  - The target is captured as group 1, requires a non-whitespace
    first char (`\S`) so `[[ ]]` and `[[\n…]]` are not matched.
    The alias is group 2, optional, no newlines.
  - The decoration is `Decoration.mark({ class: "cm-wikilink
    cm-wikilink-unresolved" })`. Two classes on purpose: 2.4 will
    swap `cm-wikilink-unresolved` for `cm-wikilink-resolved` or
    `cm-wikilink-broken` as the link index (stage 3) fills in.
- The extension is a `ViewPlugin.fromClass(WikilinkHighlightPlugin)`
  wrapping a `MatchDecorator`. On `docChanged` or `viewportChanged`
  the plugin calls `decorator.updateDeco(update, this.decorations)`.
  No IPC calls in 2.3.
- `src/components/Editor.tsx` — `wikilinkHighlight` is added to
  the `extensions` array (right after `oneDark`).
- `src/styles.css` — one rule, `.cm-wikilink { color:
  rgb(167, 139, 250); text-decoration: underline;
  text-decoration-color: rgba(167, 139, 250, 0.4);
  text-underline-offset: 2px; }`. Purple + underline is
  high-contrast on `oneDark` (cyan/blue palette) and matches
  Obsidian's own wikilink styling.
- `src/__tests__/wikilinkHighlight.test.ts` (new) — 6 unit tests
  covering: bare `[[note]]`, aliased `[[note|alias]]`, embed
  exclusion via lookbehind, mixed bare/aliased/embed in one line,
  empty target rejected, target containing a newline rejected.
- `src/__tests__/setup.tsx` — `EditorState.create` mock now
  captures the `extensions` argument into a `cmLastExtensions`
  array; the `@codemirror/view` mock gains stubs for `Decoration`,
  `MatchDecorator`, and `ViewPlugin.fromClass` so `wikilinkHighlight`
  can be imported by tests without hitting real CodeMirror.
- `src/__tests__/Editor.test.tsx` — one new test ("mounts the
  editor with wikilink content without errors (2.3)") verifies
  the editor mounts with a note containing `[[note]]`,
  `[[other|alias]]`, and `![[embed]]`, the status reaches
  "Saved", and `cmLastExtensions` contains the `wikilinkHighlight`
  reference. The structural assertion is what catches "someone
  removed the extension from the editor's extension list" in
  a future refactor.

### Known limitations (deferred)

- **Wikilinks inside fenced code blocks or inline-code spans are
  highlighted as if live.** The regex does not know about Markdown
  structure. Same limitation as the 2.1 extractor; a fence-aware
  highlighter is a 2.4 follow-up.
- **No resolve lookup, no broken-link styling.** 2.3 is purely a
  visual highlight. 2.4 layers the resolved/broken distinction on
  top of the same `cm-wikilink` decoration by reading the link
  index from stage 3 and swapping the second CSS class.

## Wikilink click-to-jump (micro-feature 2.4)

Clicking a highlighted wikilink in the editor now does something:
resolved links jump to the target note; broken links open a
`window.confirm` "Create note?" prompt that calls the existing
`create_note` IPC and selects the new file in the file tree. The
distinction is layered on the same 2.3 decoration by adding a
second CSS class (`cm-wikilink-resolved` or `cm-wikilink-broken`).

Key wiring:
- `src/extensions/wikilinkHighlight.ts` is now a factory
  `wikilinkHighlight(getState)` plus a separate
  `WIKILINK_CLICK_HANDLER(actions)` extension. The factory is
  reconfigured (via `Compartment`) every time the resolution map
  changes, so the `MatchDecorator` re-reads each span's state and
  swaps the class. The click handler is **not** reconfigured; it
  holds a ref to the latest resolution map and reads it on click.
- `src/hooks/useMarkdown.ts` exports a new `useWikilinkResolutionMap`
  hook that batch-resolves every wikilink in the current note via
  `resolve_wikilink` (TanStack `useQueries`), keyed by
  `wikilinkMapKey(target, alias)`.
- `src/components/Editor.tsx` now takes `onJump` and `onBrokenClick`
  callbacks. The broken-link handler in `App.tsx` runs the
  `window.confirm` flow, calls `useCreateNoteMutation`, and selects
  the new path. The reconfigure effect fires on every
  `resolutionMap` change.
- `src/hooks/useFileTree.ts` exports `brokenWikilinkPath` (the path
  the resolver would create) and `withNoteExtension` (`.md` if no
  extension) so the "Create note" affordance targets the right
  file.

Limitations (deliberate, MVP-scope):
- Section jumps (`[[note#Section]]`) are recorded but ignored. A
  2.4.1 follow-up will dispatch a cursor-move into the rendered
  preview once it exists (2.4.2).
- The Create note path is fixed to the vault root. Moving it into
  the same folder as the source note is a 2.4.1 follow-up.
- No Live Preview re-render of the broken link after creation; the
  user must close and reopen the source note for the
  `resolve_wikilink` cache to refresh. This is acceptable for MVP
  and will be revisited when stage 3's connection cache lands.
  - `window.confirm` matches the FileTree delete-confirm UX for now;
  a proper modal is a 2.4.1 polish item.

## Markdown render scaffold (micro-feature 2.6, slice A)

Scaffolding for the inline render pipeline (full feature ships in
2.6 slices B–E). The function exists, the IPC contract types
exist, the engine crate is not yet on the build graph — that
lands in slice B. This slice is intentionally pure data shape +
a `RenderedNote::default()` stub so the rest of slice B's diff
stays focused on engine wiring and the new types are reviewed in
isolation.

### Backend layout

- `src-tauri/src/markdown/types.rs` — adds `RenderedKind` (tagged
  enum: `Strong | Emphasis | Strikethrough | Heading(u8) |
  CodeInline | CodeBlock | Link | WikilinkResolved`), `RenderedSpan
  { start, end, kind }`, `RenderedBlockSpan { startLine, endLine,
  kind }`, `RenderedNote { html, inlineSpans, blockSpans }`. The
  enum uses `#[serde(tag = "kind", content = "level",
  rename_all = "camelCase")]` so variants serialize as
  `{"kind":"heading","level":1}` for headings and `{"kind":"strong"}`
  for the rest. camelCase rename matches the 2.1/2.2 convention.
- `src-tauri/src/markdown/render.rs` (new) — `pub fn
  render_markdown(_content: &str) -> AppResult<RenderedNote>` stub
  that returns `RenderedNote::default()`. Real engine wiring
  (markdown-rs event walk + sanitizer + source-map assembly)
  lands in slice B.
- `src-tauri/src/markdown/mod.rs` — declares `pub mod render;`.

### Tests

3 unit tests in `render.rs` cover the shape (empty input, plain
text, span types reachable). They are forward-looking: the
"plain text renders to non-empty html" assertion is deferred to
slice B when the engine is wired. No frontend changes in this
slice (no new IPC, no new hooks, no new types in `types/markdown.ts`).

### What's NOT in slice A (deferred)

- The `markdown` crate is not yet in `Cargo.toml`. The stub does
  not parse. Adding the dep + the event walker is slice B.
- No sanitizer, no wikilink post-processing, no real spans. All
  are slice B.
- No `render_markdown` IPC command, no `useRenderMarkdown` hook.
  Both are slice C.
- No `inlineRender` CodeMirror extension, no `Editor.tsx` wiring,
  no `?lp=0` flag. All are slices D and E.

## Inline render pipeline (micro-feature 2.6)

Live Preview is now the editor's default rendering mode. When a
note is opened, the Rust `markdown-rs` engine (ADR-001) parses
the source into an mdast, walks the relevant node kinds, and
returns a `RenderedNote` containing (a) the sanitized HTML and
(b) a char-range source map of inline spans + line-range block
spans. The frontend `inlineRender` CodeMirror extension
translates the source map into `Decoration.mark` (for inline
formatting) and `Decoration.line` (for block-level backgrounds
on fenced code, headings) ranges, with the cursor staying at
its source byte offset throughout. Live Preview is on by
default; an `?lp=0` URL flag is the temporary off-switch until
2.7 ships the real Source / Live Preview / Reading view toggle.

### Render contract

- `render_markdown(path: String) -> AppResult<RenderedNote>` IPC
  (15th handler). Validates the path through the same
  `require_vault_root` + `validate_relative_path` + `read_note_in`
  gate as 2.1/2.2, then composes a wikilink resolver closure
  (re-using `markdown::resolve::resolve_wikilink`) and dispatches
  to `markdown::render::render_markdown`.
- `RenderedNote { html, inlineSpans, blockSpans }`.
  `RenderedKind` is a tagged enum (`strong | emphasis |
  strikethrough | heading{1..6} | codeInline | codeBlock | link |
  wikilinkResolved`); the serde shape uses
  `#[serde(tag = "kind", content = "level", rename_all =
  "camelCase")]` so headings serialize as
  `{"kind":"heading","level":1}` and tag-only variants as
  `{"kind":"strong"}`. `RenderedSpan` carries byte offsets
  (`start`, `end`); `RenderedBlockSpan` carries 1-indexed line
  ranges (`startLine`, `endLine`).
- Sanitization: `markdown-rs` is safe-by-default — raw `<script>`
  is escaped, `javascript:` hrefs are stripped, dangerous
  protocols are dropped — so no separate sanitizer pass is
  needed in 2.6.
- Wikilink post-processing: the IPC closure resolves every
  unique `(target, alias)` pair via the existing 2.2 resolver.
  `Resolved` produces a `WikilinkResolved` span at the right
  byte range; `Broken` produces no span (per the 2.6 product
  decision: broken wikilinks render as plain source text, the
  2.4 `cm-wikilink-broken` decoration still signals state).
  Resolved wikilinks are NOT rendered as `<a>` in the HTML; the
  source map is the decoration contract.

### Backend layout

- `src-tauri/Cargo.toml` — adds `markdown = "1"` (the maintained
  `markdown-rs` crate, ADR-001's pick).
- `src-tauri/src/markdown/types.rs` — adds `RenderedKind`,
  `RenderedSpan`, `RenderedBlockSpan`, `RenderedNote`. See
  slice A.
- `src-tauri/src/markdown/wikilink.rs` — refactored to expose
  `wikilink_ranges()` (a positional helper that returns
  `start`, `end`, `target`, `alias`). `extract_wikilinks()` now
  reuses it. The 2.1 public `WikilinkRef` shape is unchanged;
  the helper is internal.
- `src-tauri/src/markdown/render.rs` — new
  `render_markdown(content, resolve_wikilink) -> AppResult<RenderedNote>`.
  Walks the mdast (Strong / Emphasis / Delete / InlineCode /
  Code / Heading / Link produce inline marks; Code / Heading
  also produce block line spans). Then post-processes
  `[[wikilinks]]` against the resolver closure. HTML comes from
  `markdown::to_html`. 17 unit tests cover the empty / plain /
  bold / italic / heading / inline-code / fenced-code / link /
  resolved-wikilink / broken-wikilink / nested / script-escape
  / javascript-href-strip / span-sorting / line-range / dedup
  cases.
- `src-tauri/src/commands/markdown.rs` — adds
  `render_markdown_inner` + `#[tauri::command] render_markdown`.
- `src-tauri/src/lib.rs` — registers the 15th handler.
- `src-tauri/tests/markdown_render.rs` — 7 `tauri::test::mock_app()`
  tests: success, `..` rejected, missing file rejected, no
  vault rejected, dangerous html sanitized, resolved wikilink
  produces a `WikilinkResolved` span, broken wikilink produces
  no span.

### Frontend layout

- `src/types/markdown.ts` — adds `RenderedKind` (discriminated
  union mirroring the Rust enum), `RenderedSpan`,
  `RenderedBlockSpan`, `RenderedNote`. camelCase keys; the
  `heading` variant carries `{ level: number }`.
- `src/ipc/markdown.ts` — adds `renderMarkdown(path)` wrapper.
- `src/hooks/useMarkdown.ts` — adds `useRenderMarkdown(path,
  {enabled})` query keyed `["markdown", "render", path]`, 5s
  staleTime, mirrors `useExtractWikilinks` / `useResolveWikilink`.
- `src/extensions/inlineRender.ts` (new) — exports pure helpers
  (`cssClassForKind`, `spanToMark`, `blockSpanToLineAttributes`,
  `buildInlineDecorations`) and the `inlineRender(getRendered)`
  CodeMirror `ViewPlugin`. The plugin rebuilds the
  `DecorationSet` on `docChanged` / `viewportChanged` by
  reading the current `getRendered()` closure. A
  `__isInlineRender` marker is set on the extension for test
  introspection.
- `src/components/Editor.tsx` — adds a second `Compartment`
  (`livePreviewCompRef`) wrapping the `inlineRender` extension.
  `useRenderMarkdown` is enabled when
  `read.data !== undefined && livePreviewOn`. A reconfigure
  effect fires on `[renderedQuery.data, livePreviewOn]` and
  swaps the extension between `inlineRender(() => rendered)`
  (Live Preview on) and `inlineRender(() => null)` (Source
  mode, no-op). The new `livePreviewOn` prop defaults to `true`.
- `src/App.tsx` — reads `?lp=0` from `window.location.search`
  via `isLivePreviewOn()` (default true) and passes
  `livePreviewOn={livePreviewOn}` to `<Editor>`. This flag is
  the temporary shim until 2.7 ships the real Source / Live
  Preview / Reading view toggle.
- `src/styles.css` — adds `.cm-md-strong`, `.cm-md-em`,
  `.cm-md-strikethrough`, `.cm-md-heading` + `.cm-md-heading-1..6`,
  `.cm-md-code-inline`, `.cm-md-block-code-block`, `.cm-md-link`,
  `.cm-md-wikilink-resolved`. Colors tuned for `oneDark`.
- `src/__tests__/setup.tsx` — extends the CodeMirror mock with
  `Decoration.line` and `RangeSetBuilder` so `inlineRender` can
  be imported in tests without a real CM environment.
- `src/__tests__/useRenderMarkdown.test.tsx` (new) — 4 tests:
  happy path, key derivation, AppError surface, `enabled:false`
  skip.
- `src/__tests__/inlineRender.test.ts` (new) — 19 tests
  covering the pure helpers and the factory shape.
- `src/__tests__/App.test.tsx` — adds an end-to-end test that
  `?lp=0` suppresses the `render_markdown` IPC call.
- `src/__tests__/Editor.test.tsx` — adds tests for
  `livePreviewOn=true` mounting the `inlineRender` extension
  and `livePreviewOn=false` omitting it.

### What's NOT in 2.6 (deferred)

- **Mode toggle UI** (2.7) — the `?lp=0` flag is a temporary
  shim. 2.7 ships a real Source / Live Preview / Reading view
  toggle in the editor chrome and removes the URL flag.
- **Fenced code inside list items** — markdown-rs produces
  CodeBlock + ListItem nesting; 2.6 only emits block spans for
  the CodeBlock, which means the background styling may not
  extend correctly into the list-item continuation. Cosmetic;
  2.6.1 follow-up if it bothers users.
- **GFM tables, strikethrough CSS is shipped but the engine
  walk for `Delete` is not gated by GFM** — plain CommonMark
  does not produce `Delete` nodes, so the `Strikethrough`
  variant is wired but never produced in 2.6. GFM tables and
  strikethrough come with 2.7 when the engine option flips.
- **Section jumps** (`[[note#Section]]`) are highlighted as a
  plain `WikilinkResolved` span; clicking does not scroll the
  cursor into the section. 2.4.1 follow-up.
- **Per-keystroke debouncing of `render_markdown`** — the 500ms
  autosave debounce is the natural gate. React Query's
  `staleTime: 5_000` absorbs subsequent keystrokes within the
  debounce window. A second debounce is premature.

### Risk areas (cross-slice)

- The 2.3 / 2.4 / 2.6 extensions all coexist in the same
  `extensions: Extension[]` array. Order: `[lineNumbers,
  history, highlightActiveLine, lineWrapping, markdown(),
  oneDark, compartment.of(wikilinkHighlight(...)),
  livePreviewComp.of(inlineRender(...)),
  WIKILINK_CLICK_HANDLER(clickActions), saveKeymap, keymap.of(
  [defaultKeymap, historyKeymap, indentWithTab]), updateListener]`.
  The `inlineRender` extension comes after `wikilinkHighlight`
  so its CSS classes can compose / override without conflict.
  Verified by the 2.6 Editor tests.
- `markdown-rs` 1.0.0 was current at the time of the ADR; if
  the crate shape changes in a future bump, the
  `markdown::to_mdast` + `markdown::to_html` call sites are
  isolated to `src-tauri/src/markdown/render.rs`. No frontend
  coupling.
- `RenderedKind` is internally tagged with `tag = "kind"`. The
  TS side reads it as a discriminated union on `kind`. Any new
  variant added later (e.g. `codeBlock` per-line styling) is
  additive on both sides.

## ADR-001: Markdown engine for Live Preview and Reading view

- **Status:** Accepted, 2026-06-05.
- **Context.** Micro-features 2.6 (inline render pipeline) and 2.7
  (3-mode editor: Source / Live Preview / Reading view) need a
  Markdown → HTML + source-position mapping. Two candidate stacks
  are on the table:
  - **Rust `markdown-rs`** (the maintained `pulldown-cmark`-derived
    crate, CommonMark + GFM). Runs in the existing Rust process on
    a `tokio::task::spawn_blocking` worker. No JS bundle bloat. One
    IPC command (`render_markdown`) returns sanitized HTML + a
    positional token map that maps 1-to-1 to source positions.
  - **JS `remark-parse` + `unified` in a Web Worker.** Runs in the
    WebView, off-main-thread by construction. Adds
    `unified` + `remark-parse` + `remark-gfm` + `mdast-util-to-hast`
    + `rehype-sanitize` (≈ 150–200 KB gz) to the bundle. No IPC
    round-trip for rendering. Easy to extend with `remark` /
    `rehype` plugins.
- **Decision drivers.**
  1. The Rust backend already owns every Markdown concern in this
     project — wikilink extraction (2.1), wikilink resolution
     (2.2), and the future tag / callout / embed / block-ref
     preprocessor all live in `src-tauri/src/markdown/`. A second
     Markdown parser in JS duplicates grammar knowledge and forces
     a second preprocessor for wikilinks / tags / callouts.
  2. The spec calls out a 1 MB worst-case file (spec §6.4). On a
     50 KB note, a render round-trip through the Tauri IPC
     loopback is sub-millisecond; the worst-case IPC payload is
     bounded by the spec.
  3. `spec.md` §2.1 already references "Rust crate `markdown-rs`"
     as an acceptable choice; the existing Rust markdown module is
     the natural home.
  4. Tauri 2 Web Workers are a second moving part: Vite worker
     bundling, a `postMessage` protocol, structured-clone
     serialization of `mdast` ASTs on every keystroke, and a
     parallel `AppError`-shaped error envelope to maintain on the
     worker boundary. The 1 MB worst-case is small enough that
     this overhead is hard to justify.
  5. Spec §7.4 says sanitization happens on the rendered HTML
     output and explicitly bans `<script>`, `on*` attributes, and
     `javascript:` URLs. Keeping sanitization on the Rust side
     means the surface area for accidental HTML injection is one
     crate, not a pipeline split across an IPC hop.
- **Decision.** **Rust `markdown-rs`** is the engine for
  Live Preview (2.6) and Reading view (2.7). All Markdown parsing,
  rendering, and sanitization happens in `src-tauri/src/markdown/`.
  The frontend never parses Markdown directly. The IPC contract
  (forward-compat for 2.6) is `render_markdown(path) → RenderedNote
  { html, sourceMap }` where `sourceMap` lets the editor position
  decorations on the source view.
- **Consequences.**
  - **Positive.** Single source of truth for Markdown grammar.
    Sanitization stays in Rust per spec §7.4. No Vite worker
    plumbing. No ~150–200 KB gz of `unified` + `remark` / `rehype`
    in the JS bundle. The Rust error contract (`AppError` with
    `#[serde(tag = "kind", content = "data")]`) carries the
    renderer's failures into the toast pipeline unchanged.
  - **Negative.** The Rust Markdown ecosystem is smaller than the
    JS one. Future plugins (e.g. a `rehype-mermaid`-style
    extension) are Rust ports, not `pnpm add`. `markdown-rs` is
    the maintained `pulldown-cmark` fork; some readers will only
    know the upstream crate and may misread the ADR.
  - **Reversibility: moderate.** The IPC shape (`render_markdown`)
    is the contract. To switch engines later, rewrite
    `src-tauri/src/markdown/` (Rust → JS pipeline behind a Worker,
    or a different Rust crate) and keep the same IPC. The
    frontend and the wikilink preprocessor do not need to change.
- **Alternatives considered.**
  - **`pulldown-cmark` upstream** — equivalent functionality;
    `markdown-rs` is its maintained fork. We take the fork per the
    spec's hint.
  - **`comrak`** — full GFM, larger dependency tree, no advantage
    over `markdown-rs` for our needs.
  - **`markdown-it` (Rust port)** — older, smaller plugin
    ecosystem, no reason to pick it.
  - **JS `remark-parse` + `unified` in a Web Worker** — rejected;
    see Decision drivers (1), (4), (5).

## Database Schema

See `spec.md` §3. Tables: `documents`, `connections`, `tags`, `vault_meta`.
Index lives at `<vault>/.obsidiana/index.db` and is gitignored.

Schema migrations land with stage 3.

## Open Questions / Backlog

- ~~Pick the Markdown engine: Rust `markdown-rs` crate vs. JS `remark-parse` in a
  Web Worker. Decide in micro-feature 2.5 (Live Preview / WYSIWYG editor).~~ Resolved 2026-06-05 — ADR-001: Rust `markdown-rs`. See the ADR section above.
  No longer a "sometime in stage 2" question; it's the first thing 2.5 blocks on.
- Decide on `react-force-graph` 2D vs 3D mode at implementation time.
- Embedded opencode terminal panel: implementation surface is a
  `tauri-plugin-shell` child process (`opencode` CLI) with the vault as CWD,
  embedded as a xterm.js panel in a dockable sidebar. Needs an ADR before
  the first slice ships.
- ~~Pick a settings file format: JSON is fine for MVP; TOML is also viable.~~ Resolved 2026-06-03 — JSON.
- Real icon set (designer assets). Current icons are placeholders generated
  by a Python script; a polish pass will replace them.
- Code signing, notarization, auto-update channel. Post-MVP.
- Cross-platform CI workflows (GitHub Actions) using the same Dockerfile.
